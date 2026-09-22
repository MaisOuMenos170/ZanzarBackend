#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/mongosh-run.sh"

export SEED_ROOT_DIR="$ROOT_DIR"
mongosh_run "$ROOT_DIR" "$ROOT_DIR/scripts/seed-zanzardb.js"
