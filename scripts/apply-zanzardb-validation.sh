#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/mongosh-run.sh"

export ZANZAR_VALIDATORS_PATH="$ROOT_DIR/scripts/zanzardb-validators.js"
mongosh_run "$ROOT_DIR" "$ROOT_DIR/scripts/apply-zanzardb-validation.js"
