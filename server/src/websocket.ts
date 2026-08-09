import { Server as SocketIOServer, Socket } from 'socket.io';
import {
  sendToESP32, getESP32Ip, getCameraIp, hasCamera, getBoards,
  setCameraStreaming, onBoardChanged, onCameraFrame, onTelemetry,
  onControllerInput, onControllerCommand,
} from './esp32ws';

interface DeviceMapping { userId: string; macAddress: string; socketId: string; }
const deviceMap = new Map<string, DeviceMapping>();

/**
 * Sockets currently watching each rover's camera. A camera only pushes frames
 * while somebody is looking — an ESP32-CAM streaming into an empty room would
 * burn the rover's battery and the host's bandwidth for nothing.
 */
const viewers = new Map<string, Set<string>>();

export function setupWebSocket(io: SocketIOServer) {
  // Frames arrive as binary from the camera and go straight out to whoever is
  // watching that rover. socket.io carries the Buffer as-is, so there is no
  // base64 inflation on the wire.
  onCameraFrame((roverMac, frame) => {
    // Encoded here rather than on the phone: this is one native call, whereas
    // doing it per frame in JS on the device would burn CPU that the live
    // view needs. Costs a third more bandwidth on this hop.
    io.to(`camera:${roverMac}`).emit('camera-frame', frame.toString('base64'));
  });

  // Sensor readings, straight through to whoever is looking at that rover.
  onTelemetry((roverMac, readings, from) => {
    io.to(`device:${roverMac}`).emit('telemetry', { macAddress: roverMac, readings, from });
  });

  // Physical controller input, mirrored to the app. Throttled to ~5/s: the
  // controller sends at 20Hz and the app only needs enough to keep a readout
  // honest, not every frame.
  let lastInputMirror = 0;
  onControllerInput((roverMac, x, y) => {
    const now = Date.now();
    if (now - lastInputMirror < 200) return;
    lastInputMirror = now;
    io.to(`device:${roverMac}`).emit('controller-input', { macAddress: roverMac, x, y });
  });

  // Buttons on a handheld controller, mirrored to every app watching this
  // rover — the same event shape the app emits itself, so the client needs no
  // new handler to keep its headlight toggle honest.
  onControllerCommand((roverMac, command, value) => {
    io.to(`device:${roverMac}`).emit('command', { command, value });
  });

  // A board that connects *after* the app did still needs to announce itself,
  // otherwise the camera button stays dead until the app is reopened.
  onBoardChanged(({ roverMac, ip, role }) => {
    const room = io.to(`device:${roverMac}`);
    if (role === 'rover') room.emit('device-ip', { macAddress: roverMac, ip, role });
    room.emit('camera-available', {
      macAddress: roverMac,
      available: hasCamera(roverMac),
      ip: getCameraIp(roverMac),
    });
    // The roster is what lets the app say "camera and sensor hub online"
    // rather than guessing from whether data happens to be flowing.
    room.emit('boards', { macAddress: roverMac, boards: getBoards(roverMac) });
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      // Silent rejection here looks identical to a phone that never tried to
      // connect, so say it out loud.
      console.warn('[app] REJECTED — connection carried no auth token');
      return next(new Error('Authentication required'));
    }
    (socket as any).userId = token;
    next();
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId;
    console.log(`[app] connected: user ${userId}`);

    socket.on('register-device', (macAddress: string) => {
      deviceMap.set(`${userId}:${macAddress}`, { userId, macAddress, socketId: socket.id });
      socket.join(`device:${macAddress}`);
      const ip = getESP32Ip(macAddress);
      // Whether the board is already on the relay is the single most useful
      // thing to know before wondering why a command went nowhere.
      console.log(
        `[app] watching ${macAddress} — board is ${ip ? `online at ${ip}` : 'NOT connected'}`
      );
      if (ip) {
        socket.emit('device-ip', { macAddress, ip });
      }
      // Sent unconditionally: the app needs to know a camera is *absent* just
      // as much as it needs to know it is there.
      socket.emit('camera-available', {
        macAddress,
        available: hasCamera(macAddress),
        ip: getCameraIp(macAddress),
      });
      socket.emit('boards', { macAddress, boards: getBoards(macAddress) });
    });

    /**
     * Push text to a rover's LCD. Fanned out to every board on the rover —
     * only the one with a display acts on it.
     */
    socket.on(
      'display',
      (
        data: { macAddress: string; line1?: string; line2?: string },
        ack?: (result: { delivered: boolean }) => void
      ) => {
        // Trimmed to the panel width here so the firmware never has to guess
        // what to do with an over-long line.
        const line1 = (data.line1 ?? '').slice(0, 16);
        const line2 = (data.line2 ?? '').slice(0, 16);
        const delivered = sendToESP32(data.macAddress, { type: 'display', line1, line2 });
        console.log(
          `[disp] "${line1}" / "${line2}" -> ${data.macAddress} : ` +
          (delivered ? 'delivered' : 'DROPPED (no boards connected)')
        );
        // Acknowledged so the app can report what actually happened rather
        // than that the message left the phone.
        ack?.({ delivered });
      }
    );

    /* ── camera relay ─────────────────────────────────────────── */

    const watch = (macAddress: string) => {
      const mac = macAddress.toUpperCase();
      socket.join(`camera:${mac}`);
      const set = viewers.get(mac) ?? new Set<string>();
      set.add(socket.id);
      viewers.set(mac, set);
      console.log(`[cam] viewer joined ${mac} (${set.size} watching)`);
      // First viewer switches the camera on; the rest just attach.
      if (set.size === 1) setCameraStreaming(mac, true);
    };

    const unwatch = (macAddress: string) => {
      const mac = macAddress.toUpperCase();
      socket.leave(`camera:${mac}`);
      const set = viewers.get(mac);
      if (!set) return;
      set.delete(socket.id);
      console.log(`[cam] viewer left ${mac} (${set.size} watching)`);
      if (set.size === 0) {
        viewers.delete(mac);
        setCameraStreaming(mac, false);
      }
    };

    socket.on('camera-start', (macAddress: string) => {
      if (!hasCamera(macAddress)) {
        console.warn(`[cam] start refused — no camera for ${macAddress}`);
        socket.emit('camera-error', { macAddress, error: 'Camera is not connected' });
        return;
      }
      watch(macAddress);
    });

    socket.on('camera-stop', (macAddress: string) => unwatch(macAddress));

    socket.on('control', (data: { macAddress: string; command: string; value: number }) => {
      io.to(`device:${data.macAddress}`).emit('command', { command: data.command, value: data.value });
      const delivered = sendToESP32(data.macAddress, {
        type: 'command', command: data.command, value: data.value,
      });
      // Logged after the send so the line states what actually happened,
      // rather than what was about to be attempted.
      console.log(
        `[cmd] ${data.command}=${data.value} -> ${data.macAddress} : ` +
        (delivered ? 'delivered' : 'DROPPED (board not connected)')
      );
    });

    // Joystick runs at ~25Hz, so logging every frame would bury everything
    // else. One line per second is enough to see the stream is alive.
    let lastStickLog = 0;
    socket.on('joystick', (data: { macAddress: string; x: number; y: number }) => {
      const payload = { x: Math.round(data.x * 100) / 100, y: Math.round(data.y * 100) / 100 };
      io.to(`device:${data.macAddress}`).emit('joystick', payload);
      const delivered = sendToESP32(data.macAddress, { type: 'joystick', ...payload });

      const now = Date.now();
      if (now - lastStickLog > 1000) {
        lastStickLog = now;
        console.log(
          `[stick] (${payload.x}, ${payload.y}) -> ${data.macAddress} : ` +
          (delivered ? 'delivered' : 'DROPPED (board not connected)')
        );
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`[app] disconnected: user ${userId} (${reason})`);
      // Leaving without a camera-stop is the normal case — the app is closed,
      // the phone sleeps, the network drops. The camera has to be released
      // here or it streams forever to nobody.
      for (const [mac, set] of viewers.entries()) {
        if (!set.delete(socket.id)) continue;
        console.log(`[cam] viewer dropped from ${mac} (${set.size} watching)`);
        if (set.size === 0) {
          viewers.delete(mac);
          setCameraStreaming(mac, false);
        }
      }
      for (const [key, mapping] of deviceMap.entries()) {
        if (mapping.socketId === socket.id) { deviceMap.delete(key); break; }
      }
    });
  });
}
