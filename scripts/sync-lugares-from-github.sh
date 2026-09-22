#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/mongosh-run.sh"

LUGARES_URL="${LUGARES_URL:-https://raw.githubusercontent.com/MaisOuMenos170/CacheGoogleMaps/main/data/lugares.json}"
LOCAL_CACHE="${ROOT_DIR}/data/lugares.json"
TMP_JSON="$(mktemp "${TMPDIR:-/tmp}/lugares-sync.XXXXXX.json")"

cleanup() {
  rm -f "$TMP_JSON"
}
trap cleanup EXIT

echo "Baixando lugares.json de:" >&2
echo "  $LUGARES_URL" >&2

if ! curl -fsSL "$LUGARES_URL" -o "$TMP_JSON"; then
  echo "Falha ao baixar lugares.json. Verifique a URL e sua conexão." >&2
  exit 1
fi

if ! python3 -c "import json; json.load(open('$TMP_JSON'))" 2>/dev/null; then
  echo "Arquivo baixado não é JSON válido." >&2
  exit 1
fi

cp "$TMP_JSON" "$LOCAL_CACHE"
echo "Cache local atualizado: data/lugares.json" >&2

export LUGARES_JSON_PATH="$TMP_JSON"
export LUGARES_LIB_PATH="$ROOT_DIR/scripts/lugares-lib.js"
export LUGARES_SOURCE_URL="$LUGARES_URL"

mongosh_run "$ROOT_DIR" "$ROOT_DIR/scripts/sync-lugares-from-github.js"
