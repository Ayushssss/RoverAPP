# Relay on AWS

Moving the relay off Render's free tier. Measured before the move:

```
GET /api/health -> 60, 144, 175, 175, 534 ms   (median 175)
```

That spread is the free tier throttling, and it is the larger half of the
problem — bigger than the distance to Singapore. An always-on instance removes
it entirely.

## What you get

| | Render free (Singapore) | EC2 (ap-south-1) |
|---|---|---|
| Server latency | 60–530 ms, unpredictable | 20–40 ms, steady |
| Cold start | up to 50 s | none |

Expect **200–400 ms → 60–150 ms** end to end on a mobile hotspot. Most of what
remains after that is the phone's own radio, which no server change reaches —
see the LAN direct mode note at the bottom.

## Region matters more than anything else here

Use the region closest to where the rover actually runs. `ap-south-1` (Mumbai)
from India; `ap-southeast-1` (Singapore) is what you have now. Putting this in
`us-east-1` would be **worse than Render**, so check before launching.

## TLS is not optional

The web console is served over HTTPS, and browsers refuse to open a `ws://`
socket from an HTTPS page. Without a certificate the browser console stops
working entirely, however well the firmware does.

Caddy handles this: point a domain at the instance and it obtains and renews a
Let's Encrypt certificate on its own, with no cron job and nothing to remember.

If you have no domain, a free dynamic one works — DuckDNS gives you
`something.duckdns.org`, and Let's Encrypt issues for it happily.

## Setup

On a fresh Ubuntu 22.04+ instance:

```bash
# 1. Security group: allow inbound 80 and 443 from anywhere, 22 from your IP.
#    80 is needed even though nothing serves on it — Let's Encrypt validates
#    over HTTP before it will issue.

# 2. Copy this repo across, then:
cd RoverAPP/deploy
sudo ./setup.sh relay.example.com "mongodb+srv://..."
```

`setup.sh` installs Node and Caddy, builds the server, registers it as a
systemd service, and writes the Caddy config. It is idempotent — safe to re-run
after a code change.

## Then repoint the clients

The host appears in eight places. `./repoint.sh relay.example.com` rewrites all
of them:

- five ESP32 sketches (`WS_HOST`)
- `mobile/src/config.ts`
- `web/src/lib/config.ts`
- this README's example

Re-flash the boards and redeploy the web app afterwards. Nothing else changes:
the wire protocol, the ports and the paths are all identical.

## Checking it worked

```bash
curl https://relay.example.com/api/health          # {"status":"ok"}
sudo systemctl status roverapp                     # active (running)
sudo journalctl -u roverapp -f                     # live logs
```

For the WebSocket path specifically, the useful test is the one that caught the
last bug — register as a controller and confirm the relay agrees:

```bash
npx wscat -c wss://relay.example.com/ws/esp32
> {"type":"register","macAddress":"AA:BB:CC:DD:EE:FF","role":"controller","roverMac":"8C:94:DF:72:0D:90"}
< {"type":"registered", ... "role":"controller" ...}
```

If `role` comes back as `rover`, the instance is running an old build.

## What this does not fix

The phone's radio. On a mobile hotspot that is 30–100 ms each way and it does
not care where the server is. If you want the rover to feel like a remote
control car, the answer is **LAN direct mode** — UDP straight to the rover when
both devices are on the same network, with the relay as the fallback. That is a
separate change and worth doing after this one.
