#!/usr/bin/env bash
# Shared mongosh runner: resolve URI + helpful Atlas network hint on failure.

mongosh_run() {
  local root_dir="$1"
  local js_file="$2"
  shift 2

  local env_file="${ENV_FILE:-$HOME/.mcp-env}"
  if [[ -f "$env_file" ]]; then
    # shellcheck disable=SC1090
    source "$env_file"
  fi

  local raw_uri="${MONGODB_URI:-${MDB_MCP_CONNECTION_STRING:-}}"
  if [[ -z "$raw_uri" ]]; then
    echo "Defina MONGODB_URI ou MDB_MCP_CONNECTION_STRING (ou ENV_FILE=$env_file)." >&2
    return 1
  fi

  if ! command -v mongosh >/dev/null 2>&1; then
    echo "mongosh não encontrado. Instale: https://www.mongodb.com/docs/mongodb-shell/" >&2
    return 1
  fi

  local uri
  uri="$(python3 "$root_dir/scripts/resolve-mongo-uri.py" "$raw_uri")"

  if [[ "$raw_uri" == mongodb+srv://* ]]; then
    echo "Usando URI standard (evita querySrv EBADRESP no DNS local)." >&2
  fi

  if ! mongosh "$uri" "$@" --file "$js_file"; then
    local ip=""
    ip="$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null || true)"
    echo "" >&2
    echo "Falha ao conectar no Atlas." >&2
    if [[ -n "$ip" ]]; then
      echo "Seu IP público agora: $ip" >&2
      echo "Adicione em Atlas → Network Access → Add IP Address." >&2
    fi
    echo "Se collections já existem, rode só: npm run seed" >&2
    return 1
  fi
}
