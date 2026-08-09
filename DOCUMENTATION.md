# AgriVerse Rover — System Documentation

A field rover controlled from a phone, a browser, or a handheld tilt controller.

Everything talks through one relay, so no control surface knows or cares which
others exist. The drive board cannot tell whether a stick vector came from a
thumb on a phone, a gamepad on a laptop, or a tilted handset — which is why
adding a new way to drive has so far never required a firmware change.

---

## 1. The shape of the system

```
   ┌──────────────┐   ┌──────────────┐   ┌───────────────────┐
   │  Expo app    │   │  Web console │   │ Handheld          │
   │  (phone)     │   │  (browser)   │   │ controller (ESP32)│
   └──────┬───────┘   └──────┬───────┘   └─────────┬─────────┘
          │  socket.io       │  socket.io          │  raw WebSocket
          └──────────────────┴──────────┬──────────┘
                                        │
                            ┌───────────▼───────────┐
                            │        RELAY          │
                            │  Node + Express       │
                            │  socket.io  :/        │
                            │  WebSocket  /ws/esp32 │
                            └───────────┬───────────┘
                                        │ raw WebSocket
          ┌──────────────┬──────────────┼──────────────┐
          │              │              │              │
    ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼──────┐
    │  rover    │  │  camera   │  │  sensor   │  │ controller │
    │  (drive)  │  │ ESP32-CAM │  │   hub     │  │  handheld  │
    └───────────┘  └───────────┘  └───────────┘  └────────────┘
                        one rover = several boards
```

**A rover is not one ESP32.** Drive, camera, sensor hub and any paired handset
each hold their own connection and can reboot without the others noticing. They
are grouped by the *drive board's MAC address*, which is the rover's identity
everywhere in the system.

### Repository layout

| Path | What it is |
|---|---|
| `server/` | The relay. Node, Express, socket.io, `ws`. |
| `web/` | Browser console. React 19, Vite, Tailwind 4, R3F. |
| `mobile/` | Expo app. React Native, Clerk auth. |
| `esp32-firmware/` | Drive board, sensor hub, handheld, bench tests. |
| `esp32-cam-firmware/` | ESP32-CAM streaming firmware. |

---

## 2. The relay

`server/src/index.ts` runs two servers on one port:

- **socket.io** for apps (phone, browser)
- **a raw WebSocket at `/ws/esp32`** for boards

Boards get a raw socket rather than socket.io because the ESP32 WebSocket
library speaks plain frames, and putting a protocol negotiation in front of it
would cost RAM the board does not have.

The relay is **stateless**. It holds live connections and nothing else — no
history, no readings, no positions. Anything worth keeping has to be written
down as it goes past, which is what the database in §6 is for.

### REST

| Route | Purpose |
|---|---|
| `GET /api/health` | Liveness. |
| `GET /api/version` | Latest app version and APK URL. |
| `/api/users` | Register a user. |
| `/api/devices` | List, add, delete rovers for a user. |
| `/api/clusters` | Named groups of rovers. |
| `/downloads` | Static APK hosting. |

### Identity — and its limit

The relay takes **the connection's token as the user id**. There is no password
check, no signature, no expiry.

> **This is the weakest link in the system.** Anyone who knows a rover's MAC
> address can drive it. Supabase now issues signed JWTs for the web console
> (§6), and having `server/src/websocket.ts` verify one during the handshake
> would close this. It is the single most valuable change outstanding.

---

## 3. Wire protocol

### Boards → relay (`/ws/esp32`, JSON)

| `type` | Fields | Meaning |
|---|---|---|
| `register` | `macAddress`, `role`, `roverMac`, `ip` | I am a board of this role, belonging to this rover. |
| `input` | `x`, `y` | Drive input from a handheld controller. Clamped to ±1 by the relay. |
| `command` | `command`, `value` | A button on a handheld. **Only accepted from `role: controller`.** |
| `telemetry` | `readings` | An open key→number map of sensor values. |

### Relay → boards

| `type` | Fields | Meaning |
|---|---|---|
| `registered` | — | Registration accepted. |
| `joystick` | `x`, `y` | Drive vector, from any source. |
| `command` | `command`, `value` | `stop`, `light`, `forward`, `backward`, `left`, `right`. |
| `stream` | `on` | Camera: start or stop sending frames. |
| `telemetry` | `readings` | Readings from a sibling board, so a handset can display them. |

### Apps → relay (socket.io)

`register-device` · `joystick` · `control` · `camera-start` · `camera-stop`

### Relay → apps (socket.io)

`boards` · `telemetry` · `camera-frame` · `camera-available` · `camera-error` ·
`device-ip` · `controller-input` · `joystick` · `command`

### Why telemetry is an open map

Readings are `{ "tempC": 24.6, "soil": 38 }` — an untyped key→number map, all
the way from the sensor firmware through the relay to the database's `jsonb`
column and the UI.

Add a sensor to the hub and its value appears in the app, the charts and the
handheld **with no change to the server, the client or the schema.** That
property is the reason board-health and battery telemetry (§10) are a
firmware-only job.

---

## 4. Drive path

This is the part with real-time constraints, and every number in it is load-bearing.

| Property | Value | Why |
|---|---|---|
| Stick emit rate | **25 Hz** (40 ms) | Smooth without flooding the radio. |
| Dead zone | **6%** | A resting hand on a drifted stick is not a crawl. |
| Failsafe repeat | **250 ms** | Keeps the rover's timeout fed while a direction is held. |
| Rover motor timeout | **1 s** | No input for a second → motors cut. |
| Firmware dead-band | **0.08** | Below this the stick is centred. |
| Minimum duty | **60/255** | Gearmotors buzz instead of turning below ~¼ duty. |
| Soft-start slew | **0.05 per 10 ms** | ~200 ms to full. Limits inrush; see §9. |

**Directions are sent as vectors, not as `forward`/`left` commands.** The rover
already treats a vector as a continuous instruction, so holding a direction is
"keep sending this vector" — no firmware change, no new message type. Every
control surface benefits.

**The 1 s failsafe is the backstop for everything.** A closed tab, a dropped
network, a flat phone — all end the same way. Clients additionally send an
explicit stop, because belt and braces cost one small message.

**Browsers stop on tab-hide.** `requestAnimationFrame` suspends in a background
tab, so gamepad polling halts — but the 250 ms repeat keeps firing. Without an
explicit `visibilitychange` / `pagehide` stop, a backgrounded tab would go on
driving.

---

## 5. Firmware

All sketches live in `esp32-firmware/` unless noted.

### `rover_controller.ino` — the drive board

The rover's identity. Its MAC is what everything else groups by.

**Motor wiring is configurable** and must match the board:

| Style | ENA/ENB jumpers | Speed control |
|---|---|---|
| `DRIVE_IN_PWM` *(default)* | **fitted**, nothing wired to them | PWM on IN pins |
| `DRIVE_EN_PWM` | **removed**, wired to GPIO 25/33 | PWM on EN pins |

Getting this backwards is the usual reason motors stay still while the serial
log looks perfectly healthy.

Pins (classic ESP32): `IN1 26 · IN2 27 · IN3 32 · IN4 14 · ENA 25 · ENB 33`

PWM is **5 kHz** for the bipolar L298N (above ~10 kHz it wastes the battery as
heat) and 20 kHz for MOSFET bridges.

It prints the **reset reason** on every boot, which turns a brownout from
unreadable garbage into one plain line.

### `sensor_hub.ino`

DHT temperature and humidity, published as `tempC`, `humidity`, `heatIndexC`.
Registers as `role: sensor` against the drive board's MAC.

### `esp32_cam_relay.ino` *(in `esp32-cam-firmware/`)*

QVGA 320×240, JPEG quality 22, **5 fps**, 10 kB frame cap. Streams only while
somebody is watching — the relay tells it when to start and stop, so it is not
burning battery streaming to an empty room.

### `handheld_controller.ino` — the handset

An ESP32 with a 1.8" TFT, a five-way pad and a self-locking headlight switch.
Registers as `role: controller`.

**Pins**

| Function | GPIO |
|---|---|
| TFT — SCK / SDA / CS / A0 / RESET | 18 / 23 / 5 / 4 / 25 |
| MPU6050 — SDA / SCL | 22 / 27 |
| Pad — front / back / left / right / centre | 13 / 14 / 32 / 33 / 26 |
| Headlight switch | 21 |

Avoided deliberately: **16, 17** (PSRAM on WROVER, often not broken out);
**15** (strapping — held at reset it suppresses the boot log); **2, 12**
(strapping — 12 held high stops the board booting); **34–39** (input-only, no
internal pull-up).

**Controls**

| Input | Action |
|---|---|
| Front / back / left / right | Hold to drive that way at full deflection |
| Centre — hold | Drive by tilt (MPU6050) |
| Centre — tap (<350 ms) | Next page |
| Headlight switch | Follows the lever: down on, up off |

**There is no stop button, deliberately.** Every pad button is a dead-man — the
rover only moves while something is physically held, so letting go *is* the
stop. A dedicated button would only duplicate that.

**Pages:** DRIVE · CAMERA · SENSORS · LINK · WIFI

The WiFi page scans **asynchronously** and only while open — a blocking scan
would stall the relay long enough to trip the rover's failsafe, and background
scanning would stutter the drive stream for a page nobody is looking at.

**Tilt:** pitch and roll from gravity alone. No gyro fusion, because a handset
is moved slowly and held still; a complementary filter would only buy accuracy
during fast shakes, which is not when anyone is steering. Rest attitude is
captured at boot, so "level" means however you hold it.

The MPU is read over raw I2C. Adafruit's library rejects any module whose
`WHO_AM_I` is not exactly `0x68`, which rules out most clones.

### `wifi_provision.h` — credentials without reflashing

Header-only, no external library. Try stored credentials → on failure, raise an
access point (`AgriVerse-Setup`) with a captive portal → pick a network from a
live scan on your phone → saved to NVS.

**Hold CENTRE through reset** to wipe and re-provision. Without it, a handset
carried to a site whose WiFi changed would need a cable and a laptop.

The HTTP response is sent *before* the join is attempted — joining drops the AP
and with it the phone's connection, so answering afterwards shows a failed
request even on success.

### Bench tests

| Sketch | Isolates |
|---|---|
| `motor_test` | Motors. No WiFi, ramps 25→100%, per-channel selectable. |
| `tft_test` | Display via TFT_eSPI. Prints the compiled config. |
| `tft_raw` | Display with **no library at all** — hand-written init, SPI speed sweep. |
| `i2c_scan` | The I2C bus. |
| `camera_only_test` | The camera, no radio. |

---

## 6. Data

### Supabase — used by the web console

| Table | Holds |
|---|---|
| `profiles` | Display name, avatar. Created by a trigger on `auth.users`. |
| `rovers` | Name, MAC, cluster. Unique per `(owner, mac)`. |
| `telemetry_samples` | `jsonb` readings + timestamp. |
| `drive_sessions` | Start, end, command count, peak throttle. |

**RLS is scoped to `auth.uid()`** — read from a signed JWT the client cannot
forge. Migration `0001` used a client-supplied header, which isolated users but
authenticated none of them; `0002` replaced it. Run both, in order.

Readings are `jsonb`, so a new sensor needs no migration.

Telemetry is written in **20-second batches** plus a final flush on unmount —
the interesting minute is usually the one right before you navigate away.
`trim_telemetry(keep_days)` exists because roughly 86k rows per rover per day
accumulate otherwise.

### The mobile app uses Clerk, not Supabase

So the phone's user id is **not** the web console's. A socket opened with a
Supabase id will not see rovers paired on the phone. Settings has a **relay
identity override** that points the socket (and only the socket) at the Clerk
id; the database stays scoped to the real account.

---

## 7. Web console

React 19 · Vite 7 · Tailwind 4 · framer-motion · react-three-fiber ·
socket.io-client · Supabase.

| Route | Auth | Purpose |
|---|---|---|
| `/` | public | Landing |
| `/login` | public | Email/password + Google |
| `/auth/callback` | public | OAuth return |
| `/fleet` | required | Rover list with live board presence |
| `/rover/:id` | required | The console |
| `/profile`, `/settings` | required | Account, scheme, relay |
| `/diagnostics/gamepad` | public | Raw pad readout |

**Control page:** analogue stick, hold-to-drive pad, WASD, gamepad, live camera,
sensors, history charts, board roster, 16×2 LCD composer, and a 3D attitude rig.

**Gamepad:** R2 forward, L2 reverse, left stick steer, D-pad override.
Stop is bound to **both** bottom face buttons — "X" is Cross (index 0) on
PlayStation and the west button (index 2) on Xbox, and a safety control is the
right place to accept both. Six distinct haptic events, including a
double-strength pulse when the relay drops, because whoever holds the pad is
watching the rover rather than the screen.

**3D:** a procedural low-poly rover, primitives only, coloured from the live
scheme. Behind a lazy boundary — ~900 kB of three.js is never in the initial
bundle. Falls back to a flat mark on no-WebGL or `prefers-reduced-motion`. In
attitude mode it is driven from a **ref**, so the 25 Hz stream never re-renders
the page. It shows the *commanded* vector; the rover has no IMU, and drawing a
measured attitude would be inventing data.

**Charts:** small multiples, one facet per sensor. Soil sits near 40 and lux
near 12,000 — on shared axes soil is a flat line, and a second y-axis is worse
still because it makes crossings look meaningful when they are an artifact of
axis placement. Each scheme carries a `--c-series` hue distinct from
`--c-primary-tint`, validated against that scheme's own surface.

**Camera:** frames are painted to a canvas, not swapped through `<img src>` —
data-URI churn at 15 fps has the browser decoding a fresh resource every frame.
Only the newest frame is held, so a burst never queues stale pictures.

---

## 8. Mobile app

Expo / React Native, Clerk auth. Screens: intro, login/signup/verify, home,
rovers, add device, clusters, rover hub, control, camera, sensors, display,
profile, settings.

Local-first: rovers cache to device storage and reconcile with the relay, so
the list survives a cold-starting server.

> `mobile/AGENTS.md` requires reading the **versioned** Expo docs for
> v57 before changing anything there.

---

## 9. Failure modes and what they look like

Collected because each of these cost real time to identify.

| Symptom | Cause |
|---|---|
| Commands logged, motors still | ENA/ENB style mismatch, or no supply on the L298N `+12V` terminal |
| Serial fills with garbage | The board reset. ROM bootloader prints at **74880 baud** — read it there for the reason |
| Board resets when motors engage | Brownout. Separate the motor supply, share grounds, add 470 µF+ |
| One motor fine, the other resets | Short or stall on that channel — not a supply problem |
| Display blank white | Powered, but no valid init: wrong driver, wrong pins, or corrupt SPI |
| Display works direct, fails on breadboard | Contact resistance corrupting the init. Drop `SPI_FREQUENCY` |
| `'FS' was not declared` | TFT_eSPI defines `FS_NO_GLOBALS`; add `using fs::FS;` before `WebServer.h` |
| `'X' does not name a type` in a `.ino` | Arduino inserts prototypes above the **first function** — declare structs/enums before it |
| Rover keeps driving with tab hidden | Missing `visibilitychange` stop (fixed) |

**Display configuration lives in `TFT_eSPI/User_Setup.h`, not in the sketch.**
The correct file is version-controlled at `esp32-firmware/TFT_eSPI_User_Setup.h`
— a library update silently reverts the installed copy, and the symptom is a
blank screen months later.

---

## 10. Outstanding

Roughly in the order I would do them.

1. **Authenticate the relay.** Verify the Supabase JWT in the handshake. Every
   other item makes the system more capable; this is the one that makes it safe.
2. **Board health as telemetry** — `esp_reset_reason`, uptime, RSSI, free heap.
   Firmware-only, because the wire format is open. You would get a chart of
   brownouts over time.
3. **Battery gauge** — a divider into an ADC, published as `battery`.
4. **Drive record and replay** — `drive_sessions` already exists and stores only
   a count; record the vector stream and a route becomes repeatable.
5. **Camera capture to storage** — clips and time-lapse. Would also give the
   landing page real footage instead of the concept render.
6. **Light mode** — the palettes exist in `mobile/src/theme/schemes.ts`; only
   the dark variants were ported to the web.

---

## 11. Getting it running

```bash
# Relay
cd server && npm install && npm run dev

# Web console
cd web && npm install && npm run dev      # http://localhost:5174

# Mobile
cd mobile && npm install && npx expo start
```

**Web** needs `.env.local` with `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`, and both migrations run in order. Use the
publishable key — a service-role key bypasses RLS and would be readable by
anyone loading the page.

**Firmware** needs: WebSockets (Markus Sattler), ArduinoJson, TFT_eSPI, DHT
sensor library. Copy `esp32-firmware/TFT_eSPI_User_Setup.h` over the library's
`User_Setup.h`.

**Bring a new rover up in this order** — each step rules out everything before
it:

1. `i2c_scan` — is the bus alive
2. `motor_test` — do the motors turn, on what supply
3. `tft_test` — does the display initialise
4. `rover_controller` — does it reach the relay
5. The console — does the whole path work
