import { io, type Socket } from 'socket.io-client';
import { relayIdentity, relayUrl } from '../lib/store';

/**
 * The relay connection.
 *
 * One socket for the whole tab, reference-counted: every page that needs the
 * relay takes a hold and releases it on unmount. Without the count the first
 * page to unmount would tear the socket out from under one still driving, and
 * commands would then drop silently — which looks identical to a rover that is
 * ignoring you.
 *
 * Wire format is the same one the phone speaks (mobile/src/services/websocket.ts):
 * `joystick`, `control`, `display` out; `telemetry`, `boards`, `camera-frame`,
 * `controller-input` back.
 */

let socket: Socket | null = null;
let connecting: Promise<Socket> | null = null;
let holders = 0;

export type LinkState = 'idle' | 'connecting' | 'up' | 'down';

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

export function connect(): Promise<Socket> {
  if (socket?.connected) return Promise.resolve(socket);
  if (connecting) return connecting;

  // The relay refuses a connection with no token, so this is the signed-in
  // user — or the override, for reaching a fleet paired from the phone.
  const token = relayIdentity();
  setState('connecting');

  connecting = new Promise<Socket>((resolve, reject) => {
    const next = io(relayUrl(), {
      auth: { token },
      transports: ['polling', 'websocket'],
      // Per attempt. A free-tier host that has spun down takes the better part
      // of a minute to wake, and the first attempt lands mid-boot.
      timeout: 20000,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socket = next;

    next.on('connect', () => {
      setState('up');
      resolve(next);
    });
    next.on('disconnect', () => setState('down'));
    next.on('connect_error', (e) => {
      // Not a rejection: socket.io keeps retrying and a cold start is expected
      // to fail the first attempt or two. Giving up here is what leaves a
      // screen stuck on "Reconnecting…" after the server has actually woken.
      console.warn('[relay] connect_error (will retry):', e.message);
      setState('connecting');
    });

    // Long stop so a cold start still resolves; pages track live state through
    // `onLinkState`, so a late connection still lights them up.
    setTimeout(() => {
      if (!next.connected) reject(new Error('Could not reach the relay'));
    }, 75000);
  });

  try {
    return connecting;
  } finally {
    connecting = null;
  }
}

export async function acquire(): Promise<Socket> {
  holders += 1;
  try {
    return await connect();
  } catch (e) {
    holders = Math.max(0, holders - 1);
    throw e;
  }
}

export function release() {
  holders = Math.max(0, holders - 1);
  if (holders === 0) disconnect();
}

export function disconnect() {
  holders = 0;
  socket?.disconnect();
  socket = null;
  setState('idle');
}

export function getSocket(): Socket | null {
  return socket;
}

/** Re-dial after the relay address or identity changed. */
export function reconnect() {
  const had = holders;
  disconnect();
  holders = had;
  if (had > 0) void connect();
}

/* ── subscriptions ────────────────────────────────────────────────── */

const sameMac = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

/** Attach a handler that survives a reconnect and detaches cleanly. */
function subscribe<T>(event: string, handler: (payload: T) => void): () => void {
  const s = socket;
  s?.on(event, handler as never);
  return () => {
    s?.off(event, handler as never);
  };
}

export function registerRover(mac: string) {
  socket?.emit('register-device', mac);
}

export function onDeviceIp(mac: string, listener: (ip: string) => void) {
  return subscribe<{ macAddress: string; ip: string }>('device-ip', (d) => {
    // `on`, not `once`: a board may register long after the console did, and a
    // one-shot listener leaves the address unknown forever.
    if (sameMac(d.macAddress, mac)) listener(d.ip);
  });
}

export type BoardRole = 'rover' | 'camera' | 'sensor' | 'controller';
export interface BoardInfo {
  mac: string;
  role: BoardRole;
  ip: string;
}

/**
 * The boards making up a rover, as they come and go. A rover is not one ESP32 —
 * drive, camera and sensor hub each hold their own connection and can restart
 * without the others noticing.
 */
export function onBoards(mac: string, listener: (boards: BoardInfo[]) => void) {
  return subscribe<{ macAddress: string; boards: BoardInfo[] }>('boards', (d) => {
    if (sameMac(d.macAddress, mac)) listener(d.boards);
  });
}

export function onTelemetry(mac: string, listener: (readings: Record<string, number>) => void) {
  return subscribe<{ macAddress: string; readings: Record<string, number> }>('telemetry', (d) => {
    if (sameMac(d.macAddress, mac)) listener(d.readings);
  });
}

/** Drive input from a paired physical tilt controller, mirrored back to us. */
export function onControllerInput(mac: string, listener: (x: number, y: number) => void) {
  return subscribe<{ macAddress: string; x: number; y: number }>('controller-input', (d) => {
    if (sameMac(d.macAddress, mac)) listener(d.x, d.y);
  });
}

export interface CameraStatus {
  available: boolean;
  /** LAN address, when this browser is on the same network as the rover. */
  ip: string | null;
}

export function onCameraAvailable(mac: string, listener: (status: CameraStatus) => void) {
  return subscribe<{ macAddress: string; available: boolean; ip: string | null }>(
    'camera-available',
    (d) => {
      if (sameMac(d.macAddress, mac)) listener({ available: d.available, ip: d.ip });
    }
  );
}

/** Relayed JPEG frames, base64. Each frame stands alone — a drop costs one frame. */
export function onCameraFrame(listener: (jpegBase64: string) => void) {
  return subscribe<string>('camera-frame', listener);
}

export function onCameraError(listener: (message: string) => void) {
  return subscribe<{ error: string }>('camera-error', (d) => listener(d.error));
}

/* ── outbound ─────────────────────────────────────────────────────── */

export function startCamera(mac: string): boolean {
  if (!socket?.connected) return false;
  socket.emit('camera-start', mac);
  return true;
}

export function stopCamera(mac: string) {
  socket?.connected && socket.emit('camera-stop', mac);
}

export function sendJoystick(mac: string, x: number, y: number): boolean {
  if (!socket?.connected) return false;
  socket.emit('joystick', { macAddress: mac, x, y });
  return true;
}

export function sendCommand(mac: string, command: string, value = 1): boolean {
  if (!socket?.connected) {
    // Worth a line: a dropped command looks exactly like a rover ignoring it,
    // and that ambiguity is expensive to debug from the ESP32 end.
    console.warn(`[relay] dropped "${command}" — not connected`);
    return false;
  }
  socket.emit('control', { macAddress: mac, command, value });
  return true;
}

/**
 * Write two lines to the rover's 16x2 LCD.
 *
 * Resolves to whether a board actually received it, not merely whether the
 * message left the browser — the difference between those two is exactly where
 * this goes wrong. A relay too old to acknowledge resolves false rather than
 * hanging.
 */
export function sendDisplay(mac: string, line1: string, line2 = ''): Promise<boolean> {
  if (!socket?.connected) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    socket!.emit('display', { macAddress: mac, line1, line2 }, (r: { delivered: boolean }) =>
      finish(!!r?.delivered)
    );

    setTimeout(() => {
      if (!settled) console.warn('[relay] display was not acknowledged — is the server current?');
      finish(false);
    }, 4000);
  });
}
