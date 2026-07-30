#!/usr/bin/env bash
# Load .env.local and apply firm resource file storage migrations.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env.local ]]; then
  echo "Missing .env.local with PGHOST/PGUSER/PGPASSWORD and SUPABASE_* vars" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env.local
set +a

python3 scripts/apply-firm-resource-files-migration.py
