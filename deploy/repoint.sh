#!/usr/bin/env bash
#
# Point every client at a new relay host.
#
#   ./repoint.sh relay.example.com
#
# The host appears in eight places across three codebases, and missing one
# produces a board that silently talks to the old server — which looks exactly
# like a board that is not working at all. This changes them together.
#
# Prints a diff and asks before writing.

set -euo pipefail

NEW_HOST="${1:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

die() { echo "error: $*" >&2; exit 1; }

[ -n "$NEW_HOST" ] || die "usage: ./repoint.sh <hostname>   (no scheme, no path)"
case "$NEW_HOST" in
  *://*) die "hostname only — drop the https:// prefix" ;;
  */*)   die "hostname only — drop the path" ;;
esac

echo "==> new relay host: $NEW_HOST"
echo

# ── firmware: WS_HOST is a bare hostname, port and path are separate ──
FIRMWARE=$(grep -rl 'WS_HOST *= *"' "$ROOT/esp32-firmware" "$ROOT/esp32-cam-firmware" --include=*.ino || true)

# ── apps: full origins ──
MOBILE="$ROOT/mobile/src/config.ts"
WEB="$ROOT/web/src/lib/config.ts"

echo "would change:"
for f in $FIRMWARE; do
  printf '  %-64s %s\n' "${f#$ROOT/}" "$(grep -o 'WS_HOST *= *"[^"]*"' "$f")"
done
[ -f "$MOBILE" ] && printf '  %-64s %s\n' "mobile/src/config.ts" "$(grep -o "PROD_API_URL = '[^']*'" "$MOBILE" || true)"
[ -f "$WEB" ] && printf '  %-64s %s\n' "web/src/lib/config.ts" "$(grep -o "DEFAULT_RELAY = '[^']*'" "$WEB" || true)"

echo
read -r -p "apply? [y/N] " reply
[ "$reply" = "y" ] || [ "$reply" = "Y" ] || { echo "aborted"; exit 0; }

for f in $FIRMWARE; do
  sed -i "s|WS_HOST *= *\"[^\"]*\"|WS_HOST = \"$NEW_HOST\"|" "$f"
done

[ -f "$MOBILE" ] && sed -i "s|PROD_API_URL = '[^']*'|PROD_API_URL = 'https://$NEW_HOST'|" "$MOBILE"
[ -f "$WEB" ] && sed -i "s|DEFAULT_RELAY = '[^']*'|DEFAULT_RELAY = 'https://$NEW_HOST'|" "$WEB"

echo
echo "done. remaining references to the old host, if any:"
grep -rn "onrender.com" "$ROOT/esp32-firmware" "$ROOT/esp32-cam-firmware" "$ROOT/mobile/src" "$ROOT/web/src" 2>/dev/null || echo "  none"

echo
echo "Next:"
echo "  - re-flash every board (they cache nothing, but they do hold the old host)"
echo "  - redeploy the web app so the new origin is baked into the bundle"
echo "  - rebuild the mobile app if you ship it"
