/* ============================================================================
   RoverAPP WebSocket relay
   ----------------------------------------------------------------------------
   Browsers authenticate with a Supabase access token; rovers with a shared
   device secret. Rooms are keyed by the rover's MAC address, which is how the
   rest of RoverAPP already identifies a machine.

   Wire formats
     browser  <-> relay   JSON      (see relay.ts on the web side)
     rover    <-> relay   plain text, one line per frame:

       relay -> rover     C,<throttle>,<steer>,<aux1>,<aux2>,<seq>
                          P,<id>                            ping
       rover -> relay     T,<armed>,<L>,<R>,<vbat>,<amps>,<hz>,<link>
                          Q,<id>                            pong

   Text rather than JSON on the rover leg so the ESP32 needs no JSON library and
   the parse is a single sscanf.

   Run:
     SUPABASE_URL=... SUPABASE_ANON_KEY=... ROVER_SECRET=... node server.js
   ============================================================================ */

'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');
const { verifyAccessToken, ALLOW_ANONYMOUS } = require('./auth');

const PORT = parseInt(process.env.PORT || '8080', 10);
const ROVER_SECRET = process.env.ROVER_SECRET || 'CHANGE_ME_ROVER_SECRET';

// Two independent stops: the rover halts on its own after 400 ms without a
// frame, and this halts it if the operator goes quiet. Neither relies on the
// other being correct.
const OPERATOR_DEADMAN_MS = 400;
const DEADMAN_TICK_MS = 100;

/* ------------------------------------------------------------------ state - */
/** mac -> { rover, operators:Set, driver, lastControl, lastTelemetry } */
const rooms = new Map();

const normMac = (m) => String(m || '').toUpperCase().replace(/[^0-9A-F]/g, '');

function room(mac) {
  if (!rooms.has(mac)) {
    rooms.set(mac, {
      rover: null,
      operators: new Set(),
      driver: null,
      lastControl: 0,
      lastTelemetry: null
    });
  }
  return rooms.get(mac);
}

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function broadcast(r, obj) {
  for (const op of r.operators) send(op, obj);
}

function presence(mac, r) {
  broadcast(r, {
    t: 'presence',
    mac,
    online: !!(r.rover && r.rover.readyState === 1),
    operators: r.operators.size
  });
  for (const op of r.operators) {
    send(op, { t: 'role', mac, driving: r.driver === op });
  }
}

/* ------------------------------------------------------------------ http - */
const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end('ok');
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('rover relay');
});

/* --------------------------------------------------------------- upgrade -- */
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    return socket.destroy();
  }
  if (url.pathname !== '/ws') return socket.destroy();

  const role = url.searchParams.get('role');

  const reject = (why) => {
    console.warn(`[auth] rejected ${role || 'unknown'}: ${why}`);
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
  };

  /* ---- rover: shared device secret ---- */
  if (role === 'rover') {
    const mac = normMac(url.searchParams.get('mac'));
    if (mac.length !== 12) return reject('missing or malformed mac');
    if (url.searchParams.get('secret') !== ROVER_SECRET) return reject('bad rover secret');

    return wss.handleUpgrade(req, socket, head, (ws) => {
      ws.role = 'rover';
      ws.mac = mac;
      ws.isAlive = true;
      wss.emit('connection', ws, req);
    });
  }

  /* ---- operator: verified Supabase access token ---- */
  if (role === 'operator') {
    const token = url.searchParams.get('token') || '';
    verifyAccessToken(token).then((v) => {
      if (!v.ok) return reject(v.reason);
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.role = 'operator';
        ws.user = v.user;
        ws.subs = new Set();
        ws.isAlive = true;
        wss.emit('connection', ws, req);
      });
    }).catch((e) => reject(e.message));
    return;
  }

  reject('unknown role');
});

/* ------------------------------------------------------------ connection -- */
wss.on('connection', (ws) => {
  ws.on('pong', () => { ws.isAlive = true; });

  if (ws.role === 'rover') {
    const r = room(ws.mac);
    if (r.rover && r.rover !== ws && r.rover.readyState === 1) {
      r.rover.close(4000, 'replaced by a newer connection');
    }
    r.rover = ws;
    console.log(`[rover] ${ws.mac} connected`);
    presence(ws.mac, r);
  } else {
    console.log(`[operator] ${ws.user.email || ws.user.id} connected`);
    send(ws, { t: 'hello', userId: ws.user.id, email: ws.user.email });
  }

  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    const msg = data.toString();

    /* ---------------- rover -> relay : plain text ---------------- */
    if (ws.role === 'rover') {
      const r = room(ws.mac);
      if (msg[0] === 'T') {
        const p = msg.split(',');
        if (p.length >= 8) {
          const readings = {
            armed: p[1] === '1' ? 1 : 0,
            left: parseInt(p[2], 10) || 0,
            right: parseInt(p[3], 10) || 0,
            battery: parseFloat(p[4]) || 0,
            current: parseFloat(p[5]) || 0,
            rate: parseInt(p[6], 10) || 0
          };
          const tele = { t: 'telemetry', mac: ws.mac, readings, link: (p[7] || '').trim() };
          r.lastTelemetry = tele;
          broadcast(r, tele);
        }
      } else if (msg[0] === 'Q') {
        broadcast(r, { t: 'pong', id: msg.slice(1).replace(/^,/, '') });
      }
      return;
    }

    /* ---------------- operator -> relay : JSON ------------------- */
    let m;
    try { m = JSON.parse(msg); } catch { return; }

    if (m.t === 'sub') {
      const mac = normMac(m.mac);
      if (mac.length !== 12) return;
      const r = room(mac);
      r.operators.add(ws);
      ws.subs.add(mac);
      if (!r.driver || r.driver.readyState !== 1) r.driver = ws;
      if (r.lastTelemetry) send(ws, r.lastTelemetry);
      presence(mac, r);
      return;
    }

    if (m.t === 'unsub') {
      const mac = normMac(m.mac);
      const r = rooms.get(mac);
      if (!r) return;
      r.operators.delete(ws);
      ws.subs.delete(mac);
      if (r.driver === ws) r.driver = r.operators.values().next().value || null;
      presence(mac, r);
      return;
    }

    if (m.t === 'takeover') {
      const r = rooms.get(normMac(m.mac));
      if (r && r.operators.has(ws)) { r.driver = ws; presence(normMac(m.mac), r); }
      return;
    }

    if (m.t === 'joy' || m.t === 'cmd') {
      const mac = normMac(m.mac);
      const r = rooms.get(mac);
      if (!r || r.driver !== ws) return;            // viewers cannot drive
      if (!r.rover || r.rover.readyState !== 1) return;

      if (m.t === 'joy') {
        // browser sends -1..1; the rover speaks -1000..1000
        const thr = clamp(Math.round((m.y || 0) * 1000));
        const str = clamp(Math.round((m.x || 0) * 1000));
        r.lastControl = Date.now();
        r.rover.send(`C,${thr},${str},1000,${speedAux(r.speed)},${(m.sq | 0)}`);
      } else {
        const cmd = String(m.command || '');
        if (cmd === 'stop' || cmd === 'estop') {
          r.lastControl = 0;
          r.rover.send('C,0,0,-1000,0,0');
          broadcast(r, { t: 'estop', mac });
        } else if (cmd === 'speed') {
          r.speed = Math.max(0, Math.min(2, Number(m.value) || 1));
        } else if (cmd === 'arm' || cmd === 'disarm') {
          r.lastControl = Date.now();
          r.rover.send(`C,0,0,${cmd === 'arm' ? 1000 : -1000},${speedAux(r.speed)},0`);
        }
      }
      return;
    }

    if (m.t === 'ping') {
      const r = rooms.get(normMac(m.mac));
      if (r && r.rover && r.rover.readyState === 1) r.rover.send(`P,${m.id}`);
      return;
    }
  });

  ws.on('close', () => {
    if (ws.role === 'rover') {
      const r = rooms.get(ws.mac);
      if (r && r.rover === ws) {
        r.rover = null;
        console.log(`[rover] ${ws.mac} disconnected`);
        presence(ws.mac, r);
      }
      return;
    }
    for (const mac of ws.subs || []) {
      const r = rooms.get(mac);
      if (!r) continue;
      r.operators.delete(ws);
      if (r.driver === ws) r.driver = r.operators.values().next().value || null;
      presence(mac, r);
      if (!r.rover && r.operators.size === 0) rooms.delete(mac);
    }
  });

  ws.on('error', () => { /* close handler cleans up */ });
});

function clamp(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-1000, Math.min(1000, v));
}
function speedAux(mode) {
  return mode === 0 ? -1000 : mode === 2 ? 1000 : 0;
}

/* -------------------------------------------------------------- deadman --- */
setInterval(() => {
  const now = Date.now();
  for (const r of rooms.values()) {
    if (!r.rover || r.rover.readyState !== 1) continue;
    if (r.lastControl && now - r.lastControl > OPERATOR_DEADMAN_MS) {
      r.rover.send('C,0,0,-1000,0,0');
      r.lastControl = 0;                            // once, then stay quiet
    }
  }
}, DEADMAN_TICK_MS);

/* ---------------------------------------------------- dead socket reaper -- */
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch { /* closing anyway */ }
  }
}, 10000);

server.listen(PORT, () => {
  console.log(`rover relay listening on :${PORT}`);
  if (ALLOW_ANONYMOUS) {
    console.warn('!! ALLOW_ANONYMOUS=1 — every operator is accepted unverified. Local use only.');
  } else if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.warn('!! SUPABASE_URL / SUPABASE_ANON_KEY not set — all operators will be refused');
  }
  if (ROVER_SECRET.startsWith('CHANGE_ME')) {
    console.warn('!! default ROVER_SECRET — set one before exposing this to a network');
  }
});
