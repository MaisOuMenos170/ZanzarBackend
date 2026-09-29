#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/lib/mongosh-run.sh"

mongosh_run "$ROOT_DIR" "$ROOT_DIR/scripts/setup/setup-collections.js"
