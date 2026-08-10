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
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$HERE/.." && pwd)/server"
SERVICE=roverapp

# The relay binds port 3000, and only ports below 1024 need privilege, so it
# has no reason to run as root. Use whoever invoked sudo — they own the working
# tree, which keeps `git pull` working. A dedicated service account would take
# ownership of the repo and break exactly that.
RUN_USER="${SUDO_USER:-ubuntu}"
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
  echo "==> wrote $ENV_FILE"
elif [ ! -f "$ENV_FILE" ]; then
  die "no MONGODB_URI given and $ENV_FILE does not exist"
else
  echo "==> keeping existing $ENV_FILE"
fi

# Readable by the service account and nobody else. It was root-only, which was
# correct while the service ran as root; now that it does not, root-only would
# mean the relay starts and immediately fails to read its own database URI.
chown "$RUN_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"

# ── service ─────────────────────────────────────────────────

# The unit lives in deploy/roverapp.service rather than in a heredoc here, so
# it is reviewable on its own and a change to it shows up as a diff to a unit
# file instead of a diff to a shell script that happens to print one.
echo "==> installing systemd units (running as $RUN_USER)"
sed -e "s|__APP_DIR__|$APP_DIR|g" \
    -e "s|__RUN_USER__|$RUN_USER|g" \
    "$HERE/roverapp.service" > /etc/systemd/system/$SERVICE.service

# The watchdog: systemd restarts the relay when the process exits, and this
# catches the other case — still running, no longer answering.
install -m 755 "$HERE/roverapp-health.sh" /usr/local/bin/roverapp-health
install -m 644 "$HERE/roverapp-health.service" /etc/systemd/system/
install -m 644 "$HERE/roverapp-health.timer"   /etc/systemd/system/

systemctl daemon-reload
systemctl enable $SERVICE
systemctl restart $SERVICE
systemctl enable --now $SERVICE-health.timer

# `enable` is what survives a reboot; `restart` only covers right now. Assert it
# rather than assume it, because the difference is invisible until the instance
# reboots and the relay silently does not come back.
systemctl is-enabled --quiet $SERVICE \
  || die "$SERVICE did not enable - it would not survive a reboot"

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
echo "==> service:      $(systemctl is-active $SERVICE) / $(systemctl is-enabled $SERVICE)"
echo "==> watchdog:     $(systemctl is-active $SERVICE-health.timer)"
echo "==> running as:   $(systemctl show -p User --value $SERVICE)"
echo "==> health:"
curl -fsS "http://127.0.0.1:$PORT/api/health" || echo "  (not answering yet - check: journalctl -u $SERVICE -n 50)"
echo
echo "Done. Next:"
echo "  1. point $DOMAIN at this instance's public IP"
echo "  2. open 80 and 443 in the security group (80 is needed for the cert)"
echo "  3. curl https://$DOMAIN/api/health"
echo "  4. ./repoint.sh $DOMAIN   then re-flash the boards"
