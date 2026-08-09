import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';

const ESP32_PATH = '/ws/esp32';

/**
 * `controller` is the only role that *sends* drive input rather than
 * receiving it — a handheld board with a tilt sensor, steering the rover it
 * is paired to.
 */
export type Role = 'rover' | 'camera' | 'sensor' | 'controller';

interface Board {
  ws: WebSocket;
  /** This board's own MAC. Every board on a rover has a different one. */
  mac: string;
  role: Role;
  /** The rover this board belongs to — the MAC the app knows. */
  roverMac: string;
  /** LAN address the board reported. The only one usable for a direct stream. */
  ip: string;
  /** Public address as seen from here. Diagnostics only. */
  remote: string;
}

/**
 * Every connected board, keyed by its own MAC, plus an index from a rover to
 * the boards that make it up.
 *
 * A rover is not one ESP32 — it's a drive board, maybe a camera, maybe a
 * sensor hub, each with its own MAC and its own WiFi connection. They are
 * linked here rather than to each other: no board needs to know another
 * board's address, and one can reboot without disturbing the rest.
 */
const boards = new Map<string, Board>();
const byRover = new Map<string, Set<string>>();

function normMac(mac: string): string {
  return mac.toUpperCase();
}

function boardsOf(roverMac: string): Board[] {
  const macs = byRover.get(normMac(roverMac));
  if (!macs) return [];
  return [...macs].map((m) => boards.get(m)).filter((b): b is Board => !!b);
}

function boardOf(roverMac: string, role: Role): Board | undefined {
  return boardsOf(roverMac).find((b) => b.role === role);
}

function open(board: Board | undefined): board is Board {
  return !!board && board.ws.readyState === WebSocket.OPEN;
}

/* ── lookups used by the socket.io layer ──────────────────────── */

export function getESP32Ip(roverMac: string): string | null {
  const drive = boardOf(roverMac, 'rover');
  return (drive ?? boardsOf(roverMac)[0])?.ip ?? null;
}

export function getCameraIp(roverMac: string): string | null {
  return boardOf(roverMac, 'camera')?.ip ?? null;
}

export function hasCamera(roverMac: string): boolean {
  return open(boardOf(roverMac, 'camera'));
}

/** Roster for the app: what this rover is actually made of right now. */
export function getBoards(roverMac: string) {
  return boardsOf(roverMac).map((b) => ({ mac: b.mac, role: b.role, ip: b.ip }));
}

/* ── hooks ────────────────────────────────────────────────────── */

type BoardListener = (info: { roverMac: string; mac: string; ip: string; role: Role }) => void;
type FrameListener = (roverMac: string, frame: Buffer) => void;
type TelemetryListener = (roverMac: string, readings: Record<string, number>, from: string) => void;
type InputListener = (roverMac: string, x: number, y: number) => void;
type CommandListener = (roverMac: string, command: string, value: number) => void;

const boardListeners = new Set<BoardListener>();
const frameListeners = new Set<FrameListener>();
const telemetryListeners = new Set<TelemetryListener>();
const inputListeners = new Set<InputListener>();
const commandListeners = new Set<CommandListener>();

/**
 * A command raised by a handheld controller rather than by an app.
 *
 * Mirrored to the app so a headlight switched on the handset does not leave
 * every other screen showing it as off.
 */
export function onControllerCommand(listener: CommandListener): () => void {
  commandListeners.add(listener);
  return () => { commandListeners.delete(listener); };
}

/** Drive input from a physical controller, mirrored to the app. */
export function onControllerInput(listener: InputListener): () => void {
  inputListeners.add(listener);
  return () => { inputListeners.delete(listener); };
}

/**
 * Fires whenever a board registers or drops. Without it the app could only
 * learn what a rover is made of at the moment it happened to ask.
 */
export function onBoardChanged(listener: BoardListener): () => void {
  boardListeners.add(listener);
  return () => { boardListeners.delete(listener); };
}

export function onCameraFrame(listener: FrameListener): () => void {
  frameListeners.add(listener);
  return () => { frameListeners.delete(listener); };
}

export function onTelemetry(listener: TelemetryListener): () => void {
  telemetryListeners.add(listener);
  return () => { telemetryListeners.delete(listener); };
}

/* ── outbound ─────────────────────────────────────────────────── */

/**
 * Fan a message out to every board on a rover. Each board answers only for
 * the commands it knows and logs the rest, so the drive board ignoring a
 * display update costs one line on its serial monitor and nothing else.
 */
export function sendToESP32(roverMac: string, data: object, exceptMac?: string): boolean {
  const targets = boardsOf(roverMac)
    .filter(open)
    // A controller's own input must not be echoed back to it. Without this a
    // board that both sends and receives would process its own messages.
    .filter((b) => !exceptMac || b.mac !== exceptMac.toUpperCase());
  if (targets.length === 0) {
    console.warn(
      `[esp32] no boards registered for ${normMac(roverMac)} — known: ` +
      `[${[...byRover.keys()].join(', ') || 'none'}]`
    );
    return false;
  }
  const payload = JSON.stringify(data);
  targets.forEach((b) => b.ws.send(payload));
  return true;
}

/** Ask a camera to start or stop pushing frames. */
export function setCameraStreaming(roverMac: string, on: boolean): boolean {
  const cam = boardOf(roverMac, 'camera');
  if (!open(cam)) {
    console.warn(`[cam] no camera registered for ${normMac(roverMac)}`);
    return false;
  }
  cam.ws.send(JSON.stringify({ type: 'stream', on }));
  console.log(`[cam] stream ${on ? 'START' : 'STOP'} -> ${normMac(roverMac)}`);
  return true;
}

export function startESP32WebSocket(server: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (req.url === ESP32_PATH) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  console.log(`[esp32] WebSocket ready on ${ESP32_PATH}`);

  wss.on('connection', (ws, req) => {
    const remote = req.socket.remoteAddress?.replace(/^::ffff:/, '') || '0.0.0.0';
    console.log(`[esp32] socket opened from ${remote} — awaiting register`);

    let self: Board | null = null;

    ws.on('message', (raw, isBinary) => {
      // Camera frames arrive as binary and must skip JSON parsing entirely —
      // a 20KB JPEG would be shredded by it.
      if (isBinary) {
        if (self?.role === 'camera') {
          const frame = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
          frameListeners.forEach((l) => l(self!.roverMac, frame));
        }
        return;
      }

      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.type === 'register' && msg.macAddress) {
        const mac = normMac(msg.macAddress);
        const role: Role =
          msg.role === 'camera' ? 'camera'
          : msg.role === 'sensor' ? 'sensor'
          : msg.role === 'controller' ? 'controller'
          : 'rover';
        // A board that doesn't name a rover is one — the original single-board
        // setup, where the drive board's MAC *is* the rover's.
        const roverMac = msg.roverMac ? normMac(msg.roverMac) : mac;
        const ip = typeof msg.ip === 'string' && msg.ip ? msg.ip : remote;

        self = { ws, mac, role, roverMac, ip, remote };
        boards.set(mac, self);
        const set = byRover.get(roverMac) ?? new Set<string>();
        set.add(mac);
        byRover.set(roverMac, set);

        console.log(
          `[esp32] REGISTERED ${role} ${mac} at ${ip} — part of ${roverMac} ` +
          `(${set.size} board${set.size === 1 ? '' : 's'} on this rover)`
        );
        ws.send(JSON.stringify({ type: 'registered', macAddress: mac, ip, role, roverMac }));
        boardListeners.forEach((l) => l({ roverMac, mac, ip, role }));
        return;
      }

      /*
        Drive input arriving *from* a board — the handheld tilt controller.

        Forwarded to the rest of the rover as a normal joystick message, so
        the drive board cannot tell whether the phone or a physical controller
        is steering, and needs no code for it. Clamped here rather than trusted:
        a miscalibrated sensor sending 5.0 would otherwise ask for five times
        full power.
      */
      if (msg.type === 'input' && self?.role === 'controller') {
        const clamp = (v: unknown) =>
          typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
        const x = clamp(msg.x);
        const y = clamp(msg.y);

        sendToESP32(self.roverMac, { type: 'joystick', x, y }, self.mac);
        // Mirrored to the app so the on-screen readout follows the physical
        // controller instead of going stale while someone else drives.
        inputListeners.forEach((l) => l(self!.roverMac, x, y));
        return;
      }

      /*
        A command raised *by* a board — the handheld controller's buttons.

        Treated exactly like one from the app: fanned to every other board on
        the rover and announced to the app, so a headlight switched from the
        handset shows as on everywhere rather than only where it was pressed.

        Only a controller may do this. A sensor hub or camera has no business
        issuing drive commands, and accepting them from any board would make
        one compromised board able to drive the rover.
      */
      if (msg.type === 'command' && self?.role === 'controller') {
        const command = typeof msg.command === 'string' ? msg.command : '';
        if (!command) return;
        const value = typeof msg.value === 'number' ? msg.value : 1;

        // `camera` is handled here rather than forwarded: streaming is the
        // relay's decision, since it is the relay that knows whether anybody
        // else is still watching.
        if (command === 'camera') {
          setCameraStreaming(self.roverMac, value !== 0);
          return;
        }

        sendToESP32(self.roverMac, { type: 'command', command, value }, self.mac);
        commandListeners.forEach((l) => l(self!.roverMac, command, value));
        return;
      }

      if (msg.type === 'telemetry' && self) {
        // Readings are an open key->number map on purpose: adding a sensor to
        // a board must not require a server change to carry its value.
        const readings: Record<string, number> = {};
        for (const [key, value] of Object.entries(msg.readings ?? {})) {
          if (typeof value === 'number' && Number.isFinite(value)) readings[key] = value;
        }
        if (Object.keys(readings).length === 0) return;
        telemetryListeners.forEach((l) => l(self!.roverMac, readings, self!.mac));

        // Also handed back to the rover's other boards, so a handheld
        // controller with a screen can show the same readings the app does.
        // Excludes the sender, which would otherwise receive its own report.
        sendToESP32(self.roverMac, { type: 'telemetry', readings }, self.mac);
      }
    });

    const drop = () => {
      if (!self) return;
      boards.delete(self.mac);
      const set = byRover.get(self.roverMac);
      if (set) {
        set.delete(self.mac);
        if (set.size === 0) byRover.delete(self.roverMac);
      }
      console.log(`[esp32] disconnected ${self.role} ${self.mac} (rover ${self.roverMac})`);
      boardListeners.forEach((l) =>
        l({ roverMac: self!.roverMac, mac: self!.mac, ip: self!.ip, role: self!.role })
      );
      self = null;
    };

    ws.on('close', drop);
    ws.on('error', drop);
  });

  return wss;
}
