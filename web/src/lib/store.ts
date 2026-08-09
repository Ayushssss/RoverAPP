import { DEFAULT_RELAY } from './config';

/**
 * Local persistence.
 *
 * Identity is no longer stored here — it comes from the Supabase session and is
 * pushed in by `AuthContext` through `setIdentity`. What remains local are
 * preferences (relay address, scheme) and a rover cache, so the fleet list
 * survives a relay that is still cold-starting.
 */

const KEY = {
  prefs: 'rover.prefs',
  rovers: 'rover.fleet',
  scheme: 'rover.scheme',
} as const;

export interface Session {
  /** The authenticated user. Doubles as the relay's connection token. */
  userId: string;
  label: string;
  relay: string;
}

interface Prefs {
  relay: string;
  /**
   * A different identity to hand the *relay* only.
   *
   * The phone app authenticates through Clerk, so its user id is not this
   * Supabase one, and a fleet paired there is invisible to a relay connection
   * opened with a Supabase id. Setting this points the socket at that identity
   * while the database stays scoped to the real account. Empty means "use the
   * signed-in user", which is what almost everyone wants.
   */
  relayIdentity?: string;
}

export interface Rover {
  id: string;
  name: string;
  macAddress: string;
  addedAt: string;
}

export type SchemeId = 'terracotta' | 'midnight' | 'meadow' | 'ember' | 'slate';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private browsing, quota — the app still works, it just forgets. */
  }
}

/* ── identity & preferences ───────────────────────────────────────── */

/**
 * The signed-in user, held in memory only.
 *
 * Deliberately not persisted: the Supabase session in localStorage is the one
 * source of truth for who is signed in, and a second copy here would be the one
 * that goes stale after a sign-out in another tab.
 */
let identity: { userId: string; label: string } | null = null;

export function setIdentity(next: { userId: string; label: string } | null) {
  identity = next;
}

export function getPrefs(): Prefs {
  return read<Prefs>(KEY.prefs, { relay: DEFAULT_RELAY });
}

export function setPrefs(patch: Partial<Prefs>) {
  write(KEY.prefs, { ...getPrefs(), ...patch });
}

export function getSession(): Session | null {
  if (!identity) return null;
  const prefs = getPrefs();
  return {
    userId: identity.userId,
    label: identity.label,
    relay: prefs.relay || DEFAULT_RELAY,
  };
}

/** The token handed to the relay — the override when set, otherwise the user. */
export function relayIdentity(): string {
  return getPrefs().relayIdentity?.trim() || identity?.userId || '';
}

export function relayUrl(): string {
  return getPrefs().relay || DEFAULT_RELAY;
}

/** Drop cached rovers on sign-out so the next account starts clean. */
export function clearLocalFleet() {
  localStorage.removeItem(KEY.rovers);
}

/* ── scheme ───────────────────────────────────────────────────────── */

export function getScheme(): SchemeId {
  return read<SchemeId>(KEY.scheme, 'terracotta');
}

export function setScheme(id: SchemeId) {
  write(KEY.scheme, id);
  document.documentElement.setAttribute('data-scheme', id);
}

/* ── fleet ────────────────────────────────────────────────────────── */

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** MACs are compared case-insensitively everywhere; store them one way. */
export function normalizeMac(mac: string): string {
  const hex = mac.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hex.length !== 12) return mac.trim().toUpperCase();
  return hex.match(/.{2}/g)!.join(':');
}

export function isValidMac(mac: string): boolean {
  return /^[0-9a-fA-F]{12}$/.test(mac.replace(/[^0-9a-fA-F]/g, ''));
}

export function listRovers(): Rover[] {
  return read<Rover[]>(KEY.rovers, []);
}

export function saveRover(rover: Rover) {
  const all = listRovers();
  const at = all.findIndex((r) => r.id === rover.id || r.macAddress === rover.macAddress);
  if (at >= 0) all[at] = rover;
  else all.unshift(rover);
  write(KEY.rovers, all);
}

export function addRover(name: string, mac: string): Rover {
  const rover: Rover = {
    id: genId(),
    name: name.trim(),
    macAddress: normalizeMac(mac),
    addedAt: new Date().toISOString(),
  };
  saveRover(rover);

  // Pushed to the server too, so a rover paired on the laptop shows up on the
  // phone. Fire-and-forget: the local copy is the one the UI reads, and a relay
  // that is still waking up must not block pairing.
  const relayUser = relayIdentity();
  if (relayUser) {
    fetch(`${relayUrl()}/api/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: relayUser,
        name: rover.name,
        macAddress: rover.macAddress,
        clusterId: null,
      }),
    }).catch(() => {});
  }
  return rover;
}

export function removeRover(id: string) {
  write(
    KEY.rovers,
    listRovers().filter((r) => r.id !== id)
  );
  const relayUser = relayIdentity();
  if (relayUser) {
    fetch(`${relayUrl()}/api/devices/${id}?userId=${encodeURIComponent(relayUser)}`, {
      method: 'DELETE',
    }).catch(() => {});
  }
}

export function getRover(id: string): Rover | undefined {
  return listRovers().find((r) => r.id === id);
}

/**
 * Merge the server's fleet into the local one.
 *
 * Local wins on name collisions by MAC — whoever is sitting in front of this
 * browser renamed it more recently than the copy that was fetched.
 */
export async function syncRovers(): Promise<Rover[]> {
  const relayUser = relayIdentity();
  if (!relayUser) return listRovers();

  const res = await fetch(
    `${relayUrl()}/api/devices?userId=${encodeURIComponent(relayUser)}`
  );
  if (!res.ok) throw new Error(`Relay answered ${res.status}`);

  const remote = (await res.json()) as Array<{
    id: string;
    name: string;
    mac_address: string;
    created_at: string;
  }>;

  const local = listRovers();
  const known = new Set(local.map((r) => r.macAddress));
  const merged = [...local];

  for (const d of remote) {
    const mac = normalizeMac(d.mac_address);
    if (known.has(mac)) continue;
    merged.push({ id: d.id, name: d.name, macAddress: mac, addedAt: d.created_at });
  }

  write(KEY.rovers, merged);
  return merged;
}
