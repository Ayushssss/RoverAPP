/* ============================================================================
   Fake rover — speaks the ESP32 side of the wire protocol.
   Lets you exercise the relay and console without flashing hardware.

     node fake-rover.js ws://localhost:8080 AA:BB:CC:DD:EE:FF devsecret
   ============================================================================ */
'use strict';
const WebSocket = require('ws');

const base   = process.argv[2] || 'ws://localhost:8080';
const mac    = (process.argv[3] || 'AA:BB:CC:DD:EE:FF').toUpperCase().replace(/[^0-9A-F]/g, '');
const secret = process.argv[4] || 'devsecret';

const ws = new WebSocket(`${base}/ws?role=rover&mac=${mac}&secret=${secret}`);

let armed = false, l = 0, r = 0, frames = 0;

ws.on('open', () => {
  console.log(`fake rover ${mac} connected`);
  setInterval(() => {
    const duty = (Math.abs(l) + Math.abs(r)) / 2046;
    const vbat = 12.4 - duty * 0.9;
    const amps = 0.4 + duty * 7.5;
    ws.send(`T,${armed ? 1 : 0},${l},${r},${vbat.toFixed(2)},${amps.toFixed(2)},91,WIFI`);
  }, 200);
});

ws.on('message', (d) => {
  const m = d.toString();
  if (m[0] === 'C') {
    const p = m.split(',');
    const th = parseInt(p[1], 10) || 0;
    const st = parseInt(p[2], 10) || 0;
    armed = (parseInt(p[3], 10) || 0) > 300;
    let li = th + st * 0.85, ri = th - st * 0.85;
    const mx = Math.max(Math.abs(li), Math.abs(ri));
    if (mx > 1000) { li = li * 1000 / mx; ri = ri * 1000 / mx; }
    l = armed ? Math.round(li * 1023 / 1000) : 0;
    r = armed ? Math.round(ri * 1023 / 1000) : 0;
    if (++frames % 50 === 0) console.log(`C  arm:${armed} L:${l} R:${r}`);
  } else if (m[0] === 'P') {
    ws.send(`Q${m.slice(1)}`);
  }
});

ws.on('close', (c) => { console.log('disconnected', c); process.exit(0); });
ws.on('error', (e) => { console.error('error:', e.message); process.exit(1); });
