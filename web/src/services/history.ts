import { db, supabaseConfigured, type DbRover, type TelemetrySample } from './supabase';
import { getSession, normalizeMac } from '../lib/store';
import type { Rover } from '../lib/store';

/**
 * Persistence for the things the relay forgets.
 *
 * Nothing here is on the drive path. Commands and stick vectors go straight out
 * over the socket, and this module only ever runs behind them — a database
 * round trip inside the control loop would add latency to the one part of the
 * system that cannot afford any.
 */

/* ── rovers ─────────────────────────────────────────────────────────── */

/**
 * Push a locally-paired rover up, returning its database id.
 *
 * Upsert on (owner, MAC) rather than insert: pairing the same board twice is a
 * normal thing to do — a second browser, a reinstall — and it should be
 * idempotent rather than an error the user has to read.
 */
export async function upsertRover(rover: Rover): Promise<string | null> {
  const client = db();
  const session = getSession();
  if (!client || !session) return null;

  const { data, error } = await client
    .from('rovers')
    .upsert(
      {
        owner_id: session.userId,
        name: rover.name,
        mac_address: normalizeMac(rover.macAddress),
      },
      { onConflict: 'owner_id,mac_address' }
    )
    .select('id')
    .single();

  if (error) {
    console.warn('[db] upsertRover:', error.message);
    return null;
  }
  return data.id as string;
}

export async function fetchRovers(): Promise<Rover[]> {
  const client = db();
  const session = getSession();
  if (!client || !session) return [];

  const { data, error } = await client
    .from('rovers')
    .select('id, name, mac_address, created_at')
    .eq('owner_id', session.userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[db] fetchRovers:', error.message);
    return [];
  }

  return (data as Array<Pick<DbRover, 'id' | 'name' | 'mac_address' | 'created_at'>>).map((r) => ({
    id: r.id,
    name: r.name,
    macAddress: normalizeMac(r.mac_address),
    addedAt: r.created_at,
  }));
}

export async function deleteRover(macAddress: string): Promise<void> {
  const client = db();
  const session = getSession();
  if (!client || !session) return;

  const { error } = await client
    .from('rovers')
    .delete()
    .eq('owner_id', session.userId)
    .eq('mac_address', normalizeMac(macAddress));

  // Cascades to telemetry and drive sessions by foreign key, so there is
  // nothing else to clean up here.
  if (error) console.warn('[db] deleteRover:', error.message);
}

/* ── telemetry ──────────────────────────────────────────────────────── */

/**
 * A buffered writer for one rover's readings.
 *
 * Samples arrive about once a second per sensor board. Writing each one as it
 * lands would mean a request per second per open tab, so they accumulate and go
 * up in one insert every 20 seconds — and again on `close()`, because the
 * interesting minute is usually the one right before somebody navigates away.
 *
 * Every write is best-effort. A telemetry log that can break the live console
 * by failing is a worse trade than a log with a gap in it.
 */
export class TelemetryRecorder {
  private buffer: Array<{ readings: Record<string, number>; recorded_at: string }> = [];
  private timer: number | null = null;
  private roverId: string | null = null;
  private closed = false;

  constructor(private readonly rover: Rover) {}

  async start(): Promise<boolean> {
    if (!supabaseConfigured) return false;
    this.roverId = await upsertRover(this.rover);
    if (!this.roverId || this.closed) return false;

    this.timer = window.setInterval(() => void this.flush(), 20_000);
    return true;
  }

  /** Record one reading set. Cheap — this only appends to an array. */
  push(readings: Record<string, number>) {
    if (!this.roverId || Object.keys(readings).length === 0) return;
    this.buffer.push({ readings, recorded_at: new Date().toISOString() });
    // A hard cap, in case a tab is left open for days on a fast hub. Dropping
    // the oldest is right: recent history is what anybody actually looks at.
    if (this.buffer.length > 600) this.buffer.splice(0, this.buffer.length - 600);
  }

  private async flush(): Promise<void> {
    const client = db();
    const session = getSession();
    if (!client || !session || !this.roverId || this.buffer.length === 0) return;

    // Taken before the await, so samples arriving mid-request are not lost to
    // a clear that happens after them.
    const batch = this.buffer;
    this.buffer = [];

    const { error } = await client.from('telemetry_samples').insert(
      batch.map((s) => ({
        rover_id: this.roverId,
        owner_id: session.userId,
        readings: s.readings,
        recorded_at: s.recorded_at,
      }))
    );

    if (error) console.warn('[db] telemetry flush:', error.message);
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    await this.flush();
  }
}

/**
 * Recent readings for one rover, oldest first.
 *
 * Ordered descending in the query so the index does the work, then reversed
 * here — charts want time running left to right.
 */
export async function fetchHistory(
  macAddress: string,
  limit = 240
): Promise<TelemetrySample[]> {
  const client = db();
  const session = getSession();
  if (!client || !session) return [];

  const { data: rover } = await client
    .from('rovers')
    .select('id')
    .eq('owner_id', session.userId)
    .eq('mac_address', normalizeMac(macAddress))
    .maybeSingle();

  if (!rover) return [];

  const { data, error } = await client
    .from('telemetry_samples')
    .select('id, rover_id, readings, source_mac, recorded_at')
    .eq('rover_id', rover.id)
    .order('recorded_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[db] fetchHistory:', error.message);
    return [];
  }
  return (data as TelemetrySample[]).reverse();
}

/* ── drive sessions ─────────────────────────────────────────────────── */

/**
 * Records that somebody drove, and how hard.
 *
 * Counted in memory and written once at the end — a row per command would put
 * a network request inside the drive loop, which is exactly what this module
 * exists to stay out of.
 */
export class DriveSessionLog {
  private commands = 0;
  private peak = 0;
  private startedAt = new Date().toISOString();
  private roverId: string | null = null;

  constructor(private readonly rover: Rover) {}

  async start(): Promise<void> {
    if (!supabaseConfigured) return;
    this.roverId = await upsertRover(this.rover);
  }

  note(x: number, y: number) {
    this.commands += 1;
    this.peak = Math.max(this.peak, Math.min(Math.hypot(x, y), 1.5));
  }

  async close(): Promise<void> {
    const client = db();
    const session = getSession();
    // A session in which nothing moved is not worth a row.
    if (!client || !session || !this.roverId || this.commands === 0) return;

    const { error } = await client.from('drive_sessions').insert({
      rover_id: this.roverId,
      owner_id: session.userId,
      started_at: this.startedAt,
      ended_at: new Date().toISOString(),
      command_count: this.commands,
      peak_throttle: Math.round(this.peak * 1000) / 1000,
    });

    if (error) console.warn('[db] driveSession:', error.message);
  }
}
