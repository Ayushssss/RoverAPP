# Rover WebSocket relay

Drive-command and telemetry relay between the RoverAPP console and ESP32 rovers.
Rooms are keyed by MAC address, matching how the rest of the app identifies a
machine.

This sits alongside `../server` (the socket.io relay), it does not replace it.
The mobile app, the camera boards and the sensor hubs all still speak socket.io
to that one.

---

## Why this exists

The socket.io relay authenticates like this:

```ts
const token = socket.handshake.auth.token;
(socket as any).userId = token;          // believed on sight
```

The browser sends a Supabase **user id**, which is not a secret — it appears in
URLs, logs and shared links. Anyone who learned yours could open a socket as you
and drive your rovers.

Here the browser sends its Supabase **access token** and the relay verifies that
signature against Supabase before accepting the connection. One HTTPS call per
connection, cached until shortly before the token expires, so nothing is added
to the control path.

---

## Configuration

| Variable | Required | Meaning |
|---|---|---|
| `PORT` | no (8080) | listen port |
| `SUPABASE_URL` | yes | same project as the web app |
| `SUPABASE_ANON_KEY` | yes | the publishable key, not the service role key |
| `ROVER_SECRET` | yes | shared secret the ESP32 presents |
| `ALLOW_ANONYMOUS` | no | `1` accepts every operator unverified — local only |

```bash
cd relay
npm install
PORT=8080 \
SUPABASE_URL=https://your-ref.supabase.co \
SUPABASE_ANON_KEY=sb_publishable_xxx \
ROVER_SECRET=$(openssl rand -hex 24) \
npm start
```

Point the console at it with `VITE_RELAY_URL` in `web/.env.local`, or at runtime
from **Settings → relay address**. `http://` and `https://` are both accepted
and mapped to `ws://` / `wss://`. With neither set the console defaults to
`http://localhost:8080`.

> Do **not** point it at `roverapp.duckdns.org` — that is the socket.io relay in
> `../server`. It will accept the connection and then ignore it, which looks
> exactly like a rover that is switched off.

### The rover side

Rovers identify themselves by their **WiFi MAC**, which is the same identifier
the Fleet page pairs against. The firmware prints it at boot; paste that into
Fleet to adopt the rover. `ROVER_SECRET` here must match `WS_ROVER_SECRET` in
`rover6wd/Config.h`.

---

## Testing without hardware

```bash
node fake-rover.js ws://localhost:8080 AA:BB:CC:DD:EE:FF <your ROVER_SECRET>
```

It runs the same skid-steer mix as the firmware and reports plausible battery
sag under load, so the console shows live numbers.

---

## Wire format

**Browser ↔ relay** — JSON. See `web/src/services/relay.ts`.

| Out | Meaning |
|---|---|
| `{t:'sub', mac}` | join a rover's room |
| `{t:'joy', mac, x, y, sq}` | stick, each axis −1…1 |
| `{t:'cmd', mac, command, value}` | `arm`, `disarm`, `stop`, `speed` |
| `{t:'takeover', mac}` | claim the controls |
| `{t:'ping', mac, id}` | round trip through the rover |

| In | Meaning |
|---|---|
| `{t:'telemetry', mac, readings, link}` | 5 Hz from the rover |
| `{t:'presence', mac, online, operators}` | rover attached, viewer count |
| `{t:'role', mac, driving}` | whether you hold the controls |
| `{t:'estop', mac}` | somebody hit stop |
| `{t:'pong', id}` | ping answer |

**Rover ↔ relay** — plain text, so the ESP32 needs no JSON library and the parse
is one `sscanf`.

```
relay -> rover   C,<throttle>,<steer>,<aux1>,<aux2>,<seq>
                 P,<id>
rover -> relay   T,<armed>,<L>,<R>,<vbat>,<amps>,<hz>,<link>
                 Q,<id>
```

Connect as `/ws?role=rover&mac=AABBCCDDEEFF&secret=...`.

---

## Safety

Two independent stops, neither relying on the other:

- the relay sends a zero-throttle frame after **400 ms** of operator silence
- the rover halts on its own after **400 ms** without a valid frame

One driver at a time. Additional operators join as viewers and must call
`takeover` to claim the controls, so two people cannot fight over the sticks.

---

## What this relay does not carry

Camera streaming, the 16×2 LCD, the board roster and paired tilt controllers
live in the socket.io relay. `relay.ts` reports those as unavailable rather than
throwing, so the console hides them the same way it does for a rover with no
camera fitted. Run both relays if you need those features.
