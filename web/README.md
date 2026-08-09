# Rover Console (web)

A browser control console for AgriVerse field rovers. Talks to the same
socket.io relay the Expo app talks to, so a rover driven from a laptop and a
rover driven from a phone are the same rover.

React 19 · Vite 7 · Tailwind 4 · framer-motion · react-three-fiber · socket.io.

```bash
npm install
npm run dev      # http://localhost:5174
npm run build
```

## How it fits the rest of the repo

| Piece | Where |
|---|---|
| Relay (socket.io + `/ws/esp32`) | `../server` |
| Wire format this client speaks | `../server/src/websocket.ts` |
| Board roles and roster | `../server/src/esp32ws.ts` |
| Command tokens the firmware answers to | `../esp32-firmware/rover_controller/rover_controller.ino` |
| Design language these tokens come from | `../mobile/DESIGN.md` |

Outbound: `joystick`, `control`, `display`, `camera-start/stop`.
Inbound: `telemetry`, `boards`, `device-ip`, `camera-frame`, `camera-available`,
`controller-input`.

## Accounts

Sign-in is Supabase Auth: email/password, or Google. The signed-in user's id is
the identity everywhere — it scopes the database through `auth.uid()` and is the
token handed to the relay.

`/`, `/login` and `/auth/callback` are public. `/fleet`, `/rover/:id`,
`/profile` and `/settings` require a session; the guard waits for the stored
session to load before deciding, so a refresh does not bounce you out, and it
remembers where you were headed.

**The relay itself still has no authentication.** It accepts whatever token a
socket presents and treats it as the user id (`server/src/websocket.ts`), so
possession of an id is all it checks. Supabase Auth secures the database half
properly; the relay half is unchanged and is the weaker link. Worth fixing by
having the relay verify the Supabase JWT.

### Reaching a fleet paired on the phone

The mobile app authenticates through Clerk, so its user id is not the Supabase
one, and a socket opened with a Supabase id joins rooms the phone's rovers never
registered in. Settings has a **relay identity override** that points the socket
(and only the socket) at that id. The database stays scoped to the real account
either way.

## Drive path

The stick emits at 25 Hz with a 6% dead zone. Directions — pad buttons and
`WASD` alike — go out as stick *vectors* rather than the discrete `forward`/
`left` commands, because the firmware already treats a vector as a continuous
instruction, so holding a direction is just "keep sending this vector".

The rover cuts its motors after **1 s** without input. The console re-sends the
held vector every **250 ms**, so a closed tab or a dropped network stops the
rover on its own. Hiding the tab stops it explicitly (`visibilitychange` /
`pagehide`) rather than relying on that timeout, because the repeat keeps firing
in a background tab after the input sources have stopped feeding it.

Nothing on this path touches the database.

### Controllers

A gamepad is a third source for the same vector, so the firmware needs nothing.

| Input | Does |
|---|---|
| R2 / RT | Forward, analogue |
| L2 / LT | Reverse, analogue |
| Left stick | Steer (and throttle, when the triggers are idle) |
| D-pad | Steer at full deflection, overrides everything |
| ✕ / A **and** ◻ / X | Emergency stop |
| ○ / B | Headlight |
| △ / Y | Next telemetry panel |
| L1 / LB held | Precision — 40% |
| R1 / RB held | Turbo — 100% (normal is 85%) |

Stop answers to **both** bottom face buttons on purpose: "X" is Cross (index 0)
on PlayStation and the west button (index 2) on Xbox, and a safety control is
the right place to accept both rather than be wrong for half of all pads.

Haptics: a tap on connect, a short pulse on headlight and panel, a firm 240ms on
emergency stop, a speed-mode blip, a faint speed-proportional hum while driving,
and a long double-strength pulse the moment the relay drops — that last one
matters because whoever is holding the pad is watching the rover, not the badge.

`/diagnostics/gamepad` is unguarded and shows raw axes, raw buttons, and the
mapped output. It is the first thing to open when a pad "does nothing" — plenty
of pads report `mapping: ""` and shuffle the axis order.

The dead zone is 6% — the same as the touch stick — and the remaining travel is
rescaled so full deflection still reaches 1.0 instead of losing the first 6%.
Diagonals are clamped to the unit circle rather than 1.41, and axes that report
past 1.0 are capped.

Browsers hide a gamepad until the user presses a button on it, so the UI says
"press any button" rather than claiming none is connected.

## Supabase

Required for accounts. Driving still works without it — the relay carries the
live path — but there is no sign-in, and therefore no fleet sync or history.

1. Run the migrations **in order** in the project's SQL editor:
   - `supabase/migrations/0001_rover_schema.sql`
   - `supabase/migrations/0002_supabase_auth.sql`
2. Copy `.env.example` to `.env.local` and fill in the two values.
3. For Google: enable the provider under **Authentication → Providers → Google**
   with a Google Cloud OAuth client, and add `<origin>/auth/callback` to
   **Authentication → URL Configuration → Redirect URLs** (both your dev origin
   and the deployed one). Until then the button reports that it is not enabled
   rather than failing silently.

> **0002 is not optional if 0001 has been run.** 0001 scoped rows by an
> `x-rover-owner` request header, which the client no longer sends — it
> authenticated nobody, since the client chose the value. Until 0002 re-points
> the policies at `auth.uid()`, every read returns empty and every write 401s.

`rovers`, `telemetry_samples`, `drive_sessions` and `profiles`, all under RLS
scoped to the authenticated user. Readings are `jsonb`, so adding a sensor to the
hub needs no migration — which is the point of the open key→number wire format.

A `profiles` row is created by a trigger on `auth.users` rather than by the
client, because a client-side insert races the redirect back from an OAuth
provider and loses often enough to matter.

Telemetry is written in 20-second batches while a console is open, plus a final
flush on unmount. `trim_telemetry(keep_days)` exists because roughly 86k rows per
rover per day accumulate otherwise.

Use the **publishable/anon** key. A service-role key bypasses RLS and would be
readable by anyone loading the page.

## 3D

`components/three/RoverScene.tsx` is a procedural low-poly rover — primitives
only, no model files, coloured from the live scheme. It is reached through a
lazy boundary in `Rover3D.tsx` so ~900 kB of three.js is never in the initial
bundle. Falls back to a flat SVG mark when WebGL is missing, when the chunk
fails to load, or under `prefers-reduced-motion`.

On the control page it runs in `attitude` mode, driven from the heading **ref**
so the 25 Hz stream never re-renders the page. It shows the *commanded* vector —
the rover carries no IMU, and drawing a measured attitude would be inventing
data.

## Charts

History uses small multiples, one facet per sensor. Soil sits around 40 and lux
around 12,000; on shared axes the soil trace is a flat line along the bottom, and
a second y-axis is worse still — it makes crossings look meaningful when they are
an artifact of axis placement.

Each scheme carries a `--c-series` hue distinct from `--c-primary-tint`. The tint
is a *text* colour and measures L 0.71–0.79, above the 0.48–0.67 band a
dark-surface data mark belongs in. All five series hues were validated per scheme
against that scheme's own surface.
