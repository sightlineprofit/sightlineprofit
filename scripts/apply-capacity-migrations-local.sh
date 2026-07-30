#!/usr/bin/env bash
# Load .env.local and apply Capacity Planner migrations (phase A + schedule blocks).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env.local ]]; then
  echo "Missing .env.local with PGHOST/PGUSER/PGPASSWORD (Transaction pooler connection)" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env.local
set +a

python3 scripts/apply-capacity-migrations.py
