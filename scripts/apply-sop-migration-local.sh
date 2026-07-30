#!/usr/bin/env bash
# Load .env.local and apply SOP library rebuild migration + wait for PostgREST schema reload.
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

python3 scripts/apply-sop-migration.py
node --env-file=.env.local scripts/verify-sop-migration.mjs
