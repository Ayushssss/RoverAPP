#!/usr/bin/env bash
#
# Restart the relay if it has stopped answering.
#
# Run every two minutes by roverapp-health.timer. Installed to
# /usr/local/bin/roverapp-health by setup.sh.
#
# ── What this catches that systemd cannot ─────────────────────
#
# Restart=always reacts to the process EXITING. It is blind to a process that
# is still alive and no longer working — a blocked event loop, exhausted file
# descriptors, a wedged socket. systemd sees a healthy PID and does nothing,
# forever, while every board reports the relay as down.
#
# That failure looks identical from the outside to a crash, which is why it is
# worth catching automatically rather than diagnosing at the time.

set -uo pipefail

PORT="${ROVERAPP_PORT:-3000}"
URL="http://127.0.0.1:${PORT}/api/health"

# Three tries before acting. A single failed probe is not evidence of much —
# the relay may be mid-restart from a deploy, or briefly busy — and restarting
# on one bad sample would drop every live connection for no reason.
for attempt in 1 2 3; do
  if curl -fsS --max-time 5 "$URL" >/dev/null 2>&1; then
    exit 0
  fi
  [ "$attempt" -lt 3 ] && sleep 5
done

logger -t roverapp-health "health check failed 3x on ${URL} - restarting relay"
systemctl restart roverapp
