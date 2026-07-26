import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';

const ESP32_PATH = '/ws/esp32';
const espClients = new Map<string, { ws: WebSocket; ip: string }>();

export function getESP32Ip(macAddress: string): string | null {
  return espClients.get(macAddress)?.ip ?? null;
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

  console.log(`ESP32 WebSocket ready on ${ESP32_PATH}`);

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress?.replace(/^::ffff:/, '') || '0.0.0.0';
    console.log(`ESP32 connected from ${ip}`);
    let macAddress = '';

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'register' && msg.macAddress) {
          macAddress = msg.macAddress;
          espClients.set(macAddress, { ws, ip });
          console.log(`ESP32 registered: ${macAddress} (IP: ${ip})`);
          ws.send(JSON.stringify({ type: 'registered', macAddress, ip }));
        }
      } catch { }
    });

    ws.on('close', () => {
      if (macAddress) {
        espClients.delete(macAddress);
        console.log(`ESP32 disconnected: ${macAddress}`);
      }
    });

    ws.on('error', () => {
      if (macAddress) espClients.delete(macAddress);
    });
  });

  return wss;
}

export function sendToESP32(macAddress: string, data: object) {
  const entry = espClients.get(macAddress);
  if (entry && entry.ws.readyState === WebSocket.OPEN) {
    entry.ws.send(JSON.stringify(data));
    return true;
  }
  return false;
}
