#!/usr/bin/env bash
# Load .env.local and apply Prompt 4 retainer + productive hours migrations (drops capacity_basis).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env.local ]]; then
  echo "Missing .env.local with PGHOST/PGUSER/PGPASSWORD" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env.local
set +a

python3 scripts/apply-capacity-basis-retainer-migration.py
