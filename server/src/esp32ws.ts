import { WebSocketServer, WebSocket } from 'ws';

const ESP32_PORT = parseInt(process.env.ESP32_WS_PORT || '3001', 10);
const espClients = new Map<string, { ws: WebSocket; ip: string }>();

export function getESP32Ip(macAddress: string): string | null {
  return espClients.get(macAddress)?.ip ?? null;
}

export function startESP32WebSocket() {
  const wss = new WebSocketServer({ port: ESP32_PORT });
  console.log(`ESP32 WebSocket server on port ${ESP32_PORT}`);

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
