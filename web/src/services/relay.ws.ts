import { db } from './supabase';
import { relayUrl } from '../lib/store';

/**
 * The relay connection.
 *
 * One socket for the whole tab, reference-counted: every page that needs the
 * relay takes a hold and releases it on unmount. Without the count the first
 * page to unmount would tear the socket out from under one still driving, and
 * commands would then drop silently — which looks identical to a rover that is
 * ignoring you.
 *
 * ── Authentication ────────────────────────────────────────────────
 * The socket carries the Supabase **access token**, not the user id. The relay
 * verifies that signature against Supabase before accepting the connection.
 * The previous version sent the raw uuid, which the server took on trust — a
 * user id is not a secret, so anyone who learned yours could drive your rovers.
 *
 * Access tokens expire roughly hourly. A fresh one is read on *every* connect
 * attempt rather than captured once, so a reconnect after a refresh cannot
 * present a stale credential.
 *
 * ── Wire format ───────────────────────────────────────────────────
 * JSON to the relay, which translates to the compact text the ESP32 speaks.
 * Rooms are keyed by MAC, matching the rest of the app.
 */

export type LinkState = 'idle' | 'connecting' | 'up' | 'down';

let socket: WebSocket | null = null;
let holders = 0;
let wantOpen = false;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;

const stateListeners = new Set<(s: LinkState) => void>();
let state: LinkState = 'idle';

function setState(next: LinkState) {
  if (state === next) return;
  state = next;
  stateListeners.forEach((l) => l(next));
}

export function getLinkState(): LinkState {
  return state;
}

export function onLinkState(listener: (s: LinkState) => void): () => void {
  stateListeners.add(listener);
  listener(state);
  return () => stateListeners.delete(listener);
}

/* ── listener registries ──────────────────────────────────────────── */

type Fn = (...args: never[]) => void;
const listeners: Record<string, Set<{ mac: string | null; fn: Fn }>> = {};

function on<T extends Fn>(event: string, mac: string | null, fn: T): () => void {
  (listeners[event] ??= new Set()).add({ mac: mac ? normalize(mac) : null, fn });
  const set = listeners[event];
  return () => {
    for (const e of set) if (e.fn === fn) set.delete(e);
  };
}

function emit(event: string, mac: string | null, ...args: unknown[]) {
  const set = listeners[event];
  if (!set) return;
  for (const e of set) {
    if (e.mac && mac && e.mac !== normalize(mac)) continue;
    (e.fn as (...a: unknown[]) => void)(...args);
  }
}

const normalize = (m: string) => m.toUpperCase().replace(/[^0-9A-F]/g, '');

/** MACs we want subscribed; re-sent after every reconnect. */
const subscriptions = new Set<string>();

/* ── connection ───────────────────────────────────────────────────── */

function wsUrl(token: string): string {
  const base = relayUrl().replace(/\/$/, '');
  const proto = base.startsWith('https') ? 'wss' : base.startsWith('http') ? 'ws' : 'ws';
  const host = base.replace(/^https?:\/\//, '');
  return `${proto}://${host}/ws?role=operator&token=${encodeURIComponent(token)}`;
}

async function accessToken(): Promise<string> {
  const c = db();
  if (!c) return '';
  // getSession() returns the current token and refreshes it if it is close to
  // expiry, so this is always the live one.
  const { data } = await c.auth.getSession();
  return data.session?.access_token ?? '';
}

async function open(): Promise<void> {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

  const token = await accessToken();
  if (!token) {
    console.warn('[relay] no Supabase session — not connecting');
    setState('idle');
    return;
  }

  setState('connecting');
  const next = new WebSocket(wsUrl(token));
  socket = next;

  next.onopen = () => {
    retry = 0;
    setState('up');
    for (const mac of subscriptions) next.send(JSON.stringify({ t: 'sub', mac }));
  };

  next.onclose = () => {
    if (socket === next) socket = null;
    setState(wantOpen ? 'down' : 'idle');
    if (wantOpen) scheduleRetry();
  };

  // The browser gives no detail here for security reasons; onclose follows and
  // drives the retry, so this only needs to not be silent.
  next.onerror = () => console.warn('[relay] socket error');

  next.onmessage = (ev) => {
    let m: Record<string, unknown>;
    try { m = JSON.parse(String(ev.data)); } catch { return; }
    const mac = typeof m.mac === 'string' ? m.mac : null;

    switch (m.t) {
      case 'telemetry':
        emit('telemetry', mac, m.readings);
        emit('link', mac, m.link);
        break;
      case 'presence':
        emit('presence', mac, !!m.online, Number(m.operators) || 0);
        break;
      case 'role':
        emit('role', mac, !!m.driving);
        break;
      case 'estop':
        emit('estop', mac);
        break;
      case 'pong':
        emit('pong', null, String(m.id));
        break;
      default:
        break;
    }
  };
}

function scheduleRetry() {
  if (retryTimer) return;
  // A free-tier host that has spun down takes the better part of a minute to
  // wake, so back off but keep trying rather than giving up.
  const delay = Math.min(1000 * 2 ** retry, 15000);
  retry += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (wantOpen) void open();
  }, delay);
}

export function connect(): Promise<void> {
  wantOpen = true;
  return open();
}

export async function acquire(): Promise<void> {
  holders += 1;
  await connect();
}

export function release() {
  holders = Math.max(0, holders - 1);
  if (holders === 0) disconnect();
}

export function disconnect() {
  holders = 0;
  wantOpen = false;
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  subscriptions.clear();
  socket?.close();
  socket = null;
  setState('idle');
}

/** Re-dial after the relay address or the signed-in account changed. */
export function reconnect() {
  const had = holders;
  const subs = [...subscriptions];
  disconnect();
  holders = had;
  subs.forEach((m) => subscriptions.add(m));
  if (had > 0) { wantOpen = true; void open(); }
}

function send(obj: Record<string, unknown>): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(obj));
  return true;
}

/* ── subscriptions ────────────────────────────────────────────────── */

export function registerRover(mac: string) {
  const m = normalize(mac);
  subscriptions.add(m);
  send({ t: 'sub', mac: m });
}

export type BoardRole = 'rover' | 'camera' | 'sensor' | 'controller';
export interface BoardInfo {
  mac: string;
  role: BoardRole;
  ip: string;
}

export function onTelemetry(mac: string, listener: (readings: Record<string, number>) => void) {
  return on('telemetry', mac, listener as Fn);
}

/** Which control link the rover is actually driving from (SBUS, nRF24, WiFi…). */
export function onActiveLink(mac: string, listener: (link: string) => void) {
  return on('link', mac, listener as Fn);
}

/** Whether the rover currently holds a connection to the relay. */
export function onPresence(mac: string, listener: (online: boolean, operators: number) => void) {
  return on('presence', mac, listener as Fn);
}

/** Whether this browser is the one allowed to drive, versus watching. */
export function onDriving(mac: string, listener: (driving: boolean) => void) {
  return on('role', mac, listener as Fn);
}

export function takeControl(mac: string): boolean {
  return send({ t: 'takeover', mac: normalize(mac) });
}

/*
  Below: capabilities this relay does not carry.

  It moves drive commands and telemetry only. Camera streaming, the LCD, the
  board roster and paired tilt controllers all live in the socket.io relay under
  ../../server. Rather than throw — which would take down whichever page mounted
  the component — these report "not available" so the UI hides the feature, the
  same path it takes when a rover simply has no camera fitted.
*/

export function onDeviceIp(_mac: string, _listener: (ip: string) => void) {
  return () => {};
}

export function onBoards(mac: string, listener: (boards: BoardInfo[]) => void) {
  // Report the drive board as the only known member, so the roster shows the
  // rover as present instead of appearing empty and broken.
  const off = on('presence', mac, ((online: boolean) => {
    listener(online ? [{ mac: normalize(mac), role: 'rover', ip: '' }] : []);
  }) as Fn);
  return off;
}

export function onControllerInput(_mac: string, _listener: (x: number, y: number) => void) {
  return () => {};
}

export interface CameraStatus {
  available: boolean;
  /** LAN address, when this browser is on the same network as the rover. */
  ip: string | null;
}

export function onCameraAvailable(_mac: string, listener: (status: CameraStatus) => void) {
  // Announced once so the view renders its "no camera" state rather than
  // sitting on a spinner forever.
  queueMicrotask(() => listener({ available: false, ip: null }));
  return () => {};
}

export function onCameraFrame(_listener: (jpegBase64: string) => void) {
  return () => {};
}

export function onCameraError(_listener: (message: string) => void) {
  return () => {};
}

export function startCamera(_mac: string): boolean {
  return false;
}

export function stopCamera(_mac: string) {
  /* nothing to stop */
}

export function sendDisplay(_mac: string, _line1: string, _line2 = ''): Promise<boolean> {
  // False, not a throw: the composer already treats false as "no board took it"
  // and says so, which is the truth here.
  return Promise.resolve(false);
}

/* ── outbound ─────────────────────────────────────────────────────── */

export function sendJoystick(mac: string, x: number, y: number): boolean {
  return send({ t: 'joy', mac: normalize(mac), x, y, sq: (seq = (seq + 1) & 0xffff) });
}

export function sendCommand(mac: string, command: string, value = 1): boolean {
  const ok = send({ t: 'cmd', mac: normalize(mac), command, value });
  if (!ok) {
    // Worth a line: a dropped command looks exactly like a rover ignoring it,
    // and that ambiguity is expensive to debug from the ESP32 end.
    console.warn(`[relay] dropped "${command}" — not connected`);
  }
  return ok;
}

/** Round-trip time to the rover and back, in ms. Null if it never answers. */
export function ping(mac: string, timeoutMs = 3000): Promise<number | null> {
  const id = String(++seq);
  const started = performance.now();
  if (!send({ t: 'ping', mac: normalize(mac), id })) return Promise.resolve(null);

  return new Promise((resolve) => {
    const off = on('pong', null, ((got: string) => {
      if (got !== id) return;
      off();
      resolve(Math.round(performance.now() - started));
    }) as Fn);
    setTimeout(() => { off(); resolve(null); }, timeoutMs);
  });
}
