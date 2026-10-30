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
  uri="$(python3 "$root_dir/scripts/lib/resolve-mongo-uri.py" "$raw_uri")"

  if [[ "$raw_uri" == mongodb+srv://* ]]; then
    echo "Usando URI standard (evita querySrv EBADRESP no DNS local)." >&2
  fi

  local mongosh_out
  mongosh_out="$(mktemp)"
  if ! mongosh "$uri" "$@" --file "$js_file" 2>&1 | tee "$mongosh_out"; then
    echo "" >&2
    if grep -q "Document failed validation" "$mongosh_out"; then
      echo "Documento rejeitado pelo \$jsonSchema do Atlas (validador desatualizado)." >&2
      echo "Rode: npm run db:validate   # atualiza validators a partir dos models Mongoose" >&2
      echo "Depois: npm run seed" >&2
    else
      local ip=""
      ip="$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null || true)"
      echo "Falha ao conectar no Atlas." >&2
      if [[ -n "$ip" ]]; then
        echo "Seu IP público agora: $ip" >&2
        echo "Adicione em Atlas → Network Access → Add IP Address." >&2
      fi
      echo "Se collections já existem, rode só: npm run seed" >&2
    fi
    rm -f "$mongosh_out"
    return 1
  fi
  rm -f "$mongosh_out"
}
