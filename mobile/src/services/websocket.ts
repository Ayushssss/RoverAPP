import { io, Socket } from 'socket.io-client';
import { WS_URL } from '../config';

let socket: Socket | null = null;
/** In-flight connect, so two screens opening at once share one socket. */
let connecting: Promise<Socket> | null = null;
/**
 * How many screens currently need the relay. The socket is a singleton, so
 * without this the first screen to blur would tear it out from under every
 * other one still using it — commands would then drop silently.
 */
let holders = 0;

type StatusListener = (connected: boolean) => void;
const listeners = new Set<StatusListener>();

function broadcast() {
  const up = !!socket?.connected;
  listeners.forEach((l) => l(up));
}

/** Live connection state, so a screen's badge can't go stale. */
export function onConnectionChange(listener: StatusListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function connectSocket(token?: string): Promise<Socket> {
  if (socket?.connected) return socket;
  if (connecting) return connecting;

  connecting = new Promise<Socket>((resolve, reject) => {
    const next = io(WS_URL, {
      auth: { token: token ?? '' },
      transports: ['polling', 'websocket'],
      // Per attempt. A free-tier host that has spun down takes the better part
      // of a minute to wake, and the first attempt lands while it is still
      // booting.
      timeout: 20000,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socket = next;

    next.on('connect', () => { broadcast(); resolve(next); });
    next.on('disconnect', broadcast);
    next.on('connect_error', (e) => {
      // Deliberately not rejecting: socket.io keeps retrying, and a cold start
      // fails the first attempt or two by design. Giving up here is what left
      // the screen stuck on "Reconnecting…" even after the server woke.
      console.warn('Socket connect_error (will retry):', e.message);
      broadcast();
    });

    // Long stop so a cold start still resolves. Screens track the live state
    // through `onConnectionChange`, so a late connection still lights them up.
    setTimeout(() => {
      if (!next.connected) reject(new Error('Could not reach the relay'));
    }, 75000);
  });

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

/**
 * Take a hold on the relay for as long as a screen is on it. Every
 * `acquireSocket` must be balanced by a `releaseSocket`, and the socket only
 * closes once the last holder lets go.
 */
export async function acquireSocket(token?: string): Promise<Socket> {
  holders += 1;
  try {
    return await connectSocket(token);
  } catch (e) {
    holders = Math.max(0, holders - 1);
    throw e;
  }
}

export function releaseSocket() {
  holders = Math.max(0, holders - 1);
  if (holders === 0) disconnectSocket();
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  holders = 0;
  if (socket) {
    socket.disconnect();
    socket = null;
    broadcast();
  }
}

export function registerDevice(macAddress: string, onIp?: (ip: string) => void) {
  if (!socket?.connected) return;
  socket.emit('register-device', macAddress);
  if (onIp) {
    // `on`, not `once`: the board may register long after the app did, and a
    // one-shot listener meant opening the app first left the address unknown
    // forever — which is what kept the camera button disabled.
    socket.on('device-ip', (data: { macAddress: string; ip: string }) => {
      if (data.macAddress.toUpperCase() === macAddress.toUpperCase()) onIp(data.ip);
    });
  }
}

/* ────────────────────────────── camera ────────────────────────────── */

export interface CameraStatus {
  available: boolean;
  /** LAN address, when the phone is on the same network as the rover. */
  ip: string | null;
}

/** Whether this rover has a camera on the relay, now and whenever it changes. */
export function onCameraAvailable(
  macAddress: string,
  listener: (status: CameraStatus) => void
): () => void {
  const handler = (data: { macAddress: string; available: boolean; ip: string | null }) => {
    if (data.macAddress.toUpperCase() === macAddress.toUpperCase()) {
      listener({ available: data.available, ip: data.ip });
    }
  };
  socket?.on('camera-available', handler);
  return () => { socket?.off('camera-available', handler); };
}

/**
 * Subscribe to relayed frames, base64-encoded JPEG. Each frame is complete in
 * itself, so nothing has to be reassembled — a dropped frame costs one frame.
 */
export function onCameraFrame(listener: (jpegBase64: string) => void): () => void {
  const handler = (frame: string) => listener(frame);
  socket?.on('camera-frame', handler);
  return () => { socket?.off('camera-frame', handler); };
}

export function onCameraError(listener: (message: string) => void): () => void {
  const handler = (data: { error: string }) => listener(data.error);
  socket?.on('camera-error', handler);
  return () => { socket?.off('camera-error', handler); };
}

export function startCamera(macAddress: string): boolean {
  if (!socket?.connected) return false;
  socket.emit('camera-start', macAddress);
  return true;
}

export function stopCamera(macAddress: string) {
  if (socket?.connected) socket.emit('camera-stop', macAddress);
}

/* ────────────────────────── boards & sensors ────────────────────────── */

export type BoardRole = 'rover' | 'camera' | 'sensor' | 'controller';

export interface BoardInfo {
  mac: string;
  role: BoardRole;
  ip: string;
}

/**
 * The boards making up a rover, as they come and go. A rover is not one
 * ESP32 — drive, camera and sensor hub each hold their own connection and
 * can restart without the others noticing.
 */
export function onBoards(
  macAddress: string,
  listener: (boards: BoardInfo[]) => void
): () => void {
  const handler = (data: { macAddress: string; boards: BoardInfo[] }) => {
    if (data.macAddress.toUpperCase() === macAddress.toUpperCase()) listener(data.boards);
  };
  socket?.on('boards', handler);
  return () => { socket?.off('boards', handler); };
}

/**
 * Sensor readings. An open key->number map, so a new sensor on the hub shows
 * up here without anything in the app or server having to know its name.
 */
export function onTelemetry(
  macAddress: string,
  listener: (readings: Record<string, number>) => void
): () => void {
  const handler = (data: { macAddress: string; readings: Record<string, number> }) => {
    if (data.macAddress.toUpperCase() === macAddress.toUpperCase()) listener(data.readings);
  };
  socket?.on('telemetry', handler);
  return () => { socket?.off('telemetry', handler); };
}

/**
 * Drive input from a physical tilt controller, if one is paired.
 *
 * Mirrored so the on-screen readout follows whoever is actually steering —
 * otherwise the X/Y figures sit at zero while the rover visibly moves.
 */
export function onControllerInput(
  macAddress: string,
  listener: (x: number, y: number) => void
): () => void {
  const handler = (data: { macAddress: string; x: number; y: number }) => {
    if (data.macAddress.toUpperCase() === macAddress.toUpperCase()) listener(data.x, data.y);
  };
  socket?.on('controller-input', handler);
  return () => { socket?.off('controller-input', handler); };
}

/**
 * Write two lines to the rover's 16x2 LCD.
 *
 * Resolves to whether a board actually received it, not merely whether the
 * message left the phone — the difference between those two is exactly where
 * this kind of thing goes wrong. A server too old to acknowledge, or one that
 * never answers, resolves false rather than hanging.
 */
export function sendDisplay(macAddress: string, line1: string, line2 = ''): Promise<boolean> {
  if (!socket?.connected) {
    console.warn('[ws] dropped display update — relay not connected');
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    socket!.emit('display', { macAddress, line1, line2 }, (result: { delivered: boolean }) => {
      finish(!!result?.delivered);
    });

    // No acknowledgement means the relay is running a build without the
    // display handler — the event is dropped silently at the far end.
    setTimeout(() => {
      if (!settled) console.warn('[ws] display was not acknowledged — is the server up to date?');
      finish(false);
    }, 4000);
  });
}

export function sendJoystick(macAddress: string, x: number, y: number): boolean {
  if (!socket?.connected) return false;
  socket.emit('joystick', { macAddress, x, y });
  return true;
}

export function sendCommand(macAddress: string, command: string, value: number): boolean {
  if (!socket?.connected) {
    // Worth a line: a dropped command looks identical to a rover ignoring it,
    // and that ambiguity is expensive to debug from the ESP32 end.
    console.warn(`[ws] dropped "${command}" — relay not connected`);
    return false;
  }
  socket.emit('control', { macAddress, command, value });
  return true;
}
