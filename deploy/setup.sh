#!/usr/bin/env bash
#
# Provision the relay on a fresh Ubuntu instance.
#
#   sudo ./setup.sh relay.example.com "mongodb+srv://user:pass@host/db"
#
# Idempotent: safe to re-run after pulling new code. That is the intended way
# to deploy an update — re-run it and the service restarts on the new build.

set -euo pipefail

DOMAIN="${1:-}"
MONGO_URI="${2:-}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/server"
SERVICE=roverapp
# The Node process listens only on loopback; Caddy is the only thing exposed.
# Without this, the port is reachable directly and bypasses TLS entirely.
PORT=3000

die() { echo "error: $*" >&2; exit 1; }

[ -n "$DOMAIN" ] || die "usage: sudo ./setup.sh <domain> <mongodb-uri>"
[ "$EUID" -eq 0 ] || die "run with sudo"
[ -d "$APP_DIR" ] || die "server directory not found at $APP_DIR"

echo "==> relay: $DOMAIN"
echo "==> app:   $APP_DIR"

# ── swap ────────────────────────────────────────────────────

# On a 512MB instance the OOM killer takes out `npm install` partway through,
# and the failure it leaves behind looks like a corrupt package rather than a
# memory problem. Cheap insurance, and harmless on a larger box.
MEM_MB=$(free -m | awk '/^Mem:/{print $2}')
if [ "$MEM_MB" -lt 900 ] && [ ! -f /swapfile ]; then
  echo "==> ${MEM_MB}MB RAM — adding 2G swap so the build survives"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ── packages ────────────────────────────────────────────────

if ! command -v node >/dev/null; then
  echo "==> installing Node 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

if ! command -v caddy >/dev/null; then
  echo "==> installing Caddy"
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

# ── build ───────────────────────────────────────────────────

echo "==> building the relay"
cd "$APP_DIR"
npm install
npm run build

# ── environment ─────────────────────────────────────────────

# Kept out of the unit file so a redeploy does not overwrite the secret, and
# root-only because it holds the database URI.
ENV_FILE=/etc/roverapp.env
if [ -n "$MONGO_URI" ]; then
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=$PORT
MONGODB_URI=$MONGO_URI
EOF
  chmod 600 "$ENV_FILE"
  echo "==> wrote $ENV_FILE"
elif [ ! -f "$ENV_FILE" ]; then
  die "no MONGODB_URI given and $ENV_FILE does not exist"
else
  echo "==> keeping existing $ENV_FILE"
fi

# ── service ─────────────────────────────────────────────────

cat > /etc/systemd/system/$SERVICE.service <<EOF
[Unit]
Description=AgriVerse Rover relay
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node dist/index.js
Restart=always
# A relay that dies under load should come back fast; five seconds is long
# enough to avoid a hot loop and short enough that nobody reaches for the
# console first.
RestartSec=5
User=root
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable $SERVICE
systemctl restart $SERVICE

# ── reverse proxy ───────────────────────────────────────────

# Caddy obtains and renews the certificate itself. WebSocket upgrades need no
# special handling here — it proxies them transparently, which is the main
# reason to prefer it over a hand-written nginx config for this job.
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:$PORT
}
EOF

systemctl reload caddy || systemctl restart caddy

# ── report ──────────────────────────────────────────────────

sleep 2
echo
echo "==> service:"
systemctl is-active $SERVICE || true
echo "==> health:"
curl -fsS "http://127.0.0.1:$PORT/api/health" || echo "  (not answering yet - check: journalctl -u $SERVICE -n 50)"
echo
echo "Done. Next:"
echo "  1. point $DOMAIN at this instance's public IP"
echo "  2. open 80 and 443 in the security group (80 is needed for the cert)"
echo "  3. curl https://$DOMAIN/api/health"
echo "  4. ./repoint.sh $DOMAIN   then re-flash the boards"
