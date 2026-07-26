import { Server as SocketIOServer, Socket } from 'socket.io';
import { sendToESP32, getESP32Ip } from './esp32ws';

interface DeviceMapping { userId: string; macAddress: string; socketId: string; }
const deviceMap = new Map<string, DeviceMapping>();

export function setupWebSocket(io: SocketIOServer) {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));
    (socket as any).userId = token;
    next();
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId;
    console.log(`User connected: ${userId}`);

    socket.on('register-device', (macAddress: string) => {
      deviceMap.set(`${userId}:${macAddress}`, { userId, macAddress, socketId: socket.id });
      socket.join(`device:${macAddress}`);
      const ip = getESP32Ip(macAddress);
      if (ip) {
        socket.emit('device-ip', { macAddress, ip });
      }
    });

    socket.on('control', (data: { macAddress: string; command: string; value: number }) => {
      console.log(`control event: ${data.command} -> ${data.macAddress}`);
      io.to(`device:${data.macAddress}`).emit('command', { command: data.command, value: data.value });
      sendToESP32(data.macAddress, { type: 'command', command: data.command, value: data.value });
    });

    socket.on('joystick', (data: { macAddress: string; x: number; y: number }) => {
      console.log(`joystick event: (${data.x},${data.y}) -> ${data.macAddress}`);
      const payload = { x: Math.round(data.x * 100) / 100, y: Math.round(data.y * 100) / 100 };
      io.to(`device:${data.macAddress}`).emit('joystick', payload);
      sendToESP32(data.macAddress, { type: 'joystick', ...payload });
    });

    socket.on('disconnect', () => {
      for (const [key, mapping] of deviceMap.entries()) {
        if (mapping.socketId === socket.id) { deviceMap.delete(key); break; }
      }
    });
  });
}
