import { io, Socket } from 'socket.io-client';
import { WS_URL } from '../config';

let socket: Socket | null = null;

export async function connectSocket(token?: string): Promise<Socket> {
  if (socket?.connected) return socket;
  socket = io(WS_URL, {
    auth: { token: token ?? '' },
    transports: ['websocket'],
    timeout: 5000,
  });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Connection timeout')), 5000);
    socket!.on('connect', () => { clearTimeout(t); resolve(socket!); });
    socket!.on('connect_error', (e) => { clearTimeout(t); reject(e); });
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
  socket?.emit('register-device', macAddress);
  if (onIp) {
    socket?.once('device-ip', (data: { macAddress: string; ip: string }) => {
      if (data.macAddress === macAddress) onIp(data.ip);
    });
  }
}

export function sendJoystick(macAddress: string, x: number, y: number) {
  socket?.emit('joystick', { macAddress, x, y });
}

export function sendCommand(macAddress: string, command: string, value: number) {
  socket?.emit('control', { macAddress, command, value });
}
