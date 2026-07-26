import { io, Socket } from 'socket.io-client';
import { WS_URL } from '../config';

let socket: Socket | null = null;

export async function connectSocket(token?: string): Promise<Socket> {
  if (socket?.connected) return socket;
  socket = io(WS_URL, {
    auth: { token: token ?? '' },
    transports: ['polling', 'websocket'],
    timeout: 10000,
  });
  return new Promise((resolve, reject) => {
    socket!.on('connect_error', (e) => {
      console.warn('Socket connect_error:', e.message);
      reject(e);
    });
    socket!.on('connect', () => resolve(socket!));
    setTimeout(() => {
      if (!socket?.connected) reject(new Error('Connection timeout'));
    }, 10000);
  });
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function registerDevice(macAddress: string, onIp?: (ip: string) => void) {
  if (!socket?.connected) return;
  socket.emit('register-device', macAddress);
  if (onIp) {
    socket.once('device-ip', (data: { macAddress: string; ip: string }) => {
      if (data.macAddress === macAddress) onIp(data.ip);
    });
  }
}

export function sendJoystick(macAddress: string, x: number, y: number) {
  if (socket?.connected) socket.emit('joystick', { macAddress, x, y });
}

export function sendCommand(macAddress: string, command: string, value: number) {
  if (socket?.connected) socket.emit('control', { macAddress, command, value });
}
