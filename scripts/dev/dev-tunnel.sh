#!/usr/bin/env bash
# Starts Cloudflare quick tunnel to the local backend and updates the iOS app API URL.
# Requires: cloudflared, backend running on PORT (default 3000).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ZANZAR_ROOT="$(cd "$ROOT_DIR/.." && pwd)/Zanzar"
PORT="${PORT:-3000}"
LOG_FILE="$(mktemp -t zanzar-cloudflared.XXXXXX.log)"

cleanup() {
  if [[ -n "${TUNNEL_PID:-}" ]]; then
    kill "$TUNNEL_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if ! curl -sf --max-time 2 "http://127.0.0.1:${PORT}/health" >/dev/null; then
  echo "Backend is not listening on http://127.0.0.1:${PORT} — start it first: npm run dev" >&2
  exit 1
fi

echo "Starting Cloudflare Tunnel (HTTP/2) -> http://127.0.0.1:${PORT}"
# Line-buffered via script(1) so the URL appears in the log file before we parse it.
script -q "$LOG_FILE" cloudflared tunnel --protocol http2 --url "http://127.0.0.1:${PORT}" &
TUNNEL_PID=$!

extract_tunnel_url() {
  rg -o 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$LOG_FILE" 2>/dev/null | head -1 \
    || grep -Eo 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$LOG_FILE" 2>/dev/null | head -1 \
    || true
}

TUNNEL_URL=""
for _ in $(seq 1 90); do
  TUNNEL_URL="$(extract_tunnel_url)"
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
