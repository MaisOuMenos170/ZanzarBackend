#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/lib/mongosh-run.sh"

export SEED_ROOT_DIR="$ROOT_DIR"
export LUGARES_LIB_PATH="$ROOT_DIR/scripts/seed/lugares-lib.js"
mongosh_run "$ROOT_DIR" "$ROOT_DIR/scripts/seed/seed-zanzardb.js"
