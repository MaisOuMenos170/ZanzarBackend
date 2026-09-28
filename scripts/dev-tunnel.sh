#!/usr/bin/env bash
# Starts Cloudflare quick tunnel to the local backend and updates the iOS app API URL.
# Requires: cloudflared, backend running on PORT (default 3000).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ZANZAR_ROOT="$(cd "$ROOT_DIR/.." && pwd)/Zanzar"
PORT="${PORT:-3000}"
LOG_FILE="$(mktemp -t zanzar-cloudflared.XXXXXX.log)"

cleanup() {
  if [[ -n "${TUNNEL_PID:-}" ]]; then
    kill "$TUNNEL_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "Starting Cloudflare Tunnel -> http://127.0.0.1:${PORT}"
cloudflared tunnel --url "http://127.0.0.1:${PORT}" >"$LOG_FILE" 2>&1 &
TUNNEL_PID=$!

TUNNEL_URL=""
for _ in $(seq 1 30); do
  TUNNEL_URL="$(rg -o 'https://[a-z0-9-]+\\.trycloudflare\\.com' "$LOG_FILE" | head -1 || true)"
  if [[ -n "$TUNNEL_URL" ]]; then
    break
  fi
  sleep 1
done

if [[ -z "$TUNNEL_URL" ]]; then
  echo "Failed to obtain tunnel URL. Log:" >&2
  cat "$LOG_FILE" >&2
  exit 1
fi

echo "Tunnel URL: $TUNNEL_URL"
bash "$ZANZAR_ROOT/scripts/update-api-tunnel-url.sh" "$TUNNEL_URL"

echo ""
echo "Tunnel is running (PID $TUNNEL_PID). Press Ctrl+C to stop."
echo "Test: curl $TUNNEL_URL/health"
wait "$TUNNEL_PID"
