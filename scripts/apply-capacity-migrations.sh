#!/usr/bin/env bash
# Apply Capacity Planner migrations to Supabase project nizjqvbxrmxkkmnnqzpy.
#
# Usage (pick one):
#   SUPABASE_ACCESS_TOKEN=... npm run db:apply-capacity-migrations
#   DATABASE_URL='postgresql://postgres.nizjqvbxrmxkkmnnqzpy:...@aws-0-....pooler.supabase.com:6543/postgres' npm run db:apply-capacity-migrations
#
# Get SUPABASE_ACCESS_TOKEN: https://supabase.com/dashboard/account/tokens
# Get DATABASE_URL: Supabase → Project Settings → Database → Connection string (Transaction pooler)

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_REF="nizjqvbxrmxkkmnnqzpy"

MIGRATIONS=(
  "$ROOT/supabase/migrations/20260721180000_capacity_planner_phase_a.sql"
  "$ROOT/supabase/migrations/20260722120000_schedule_blocks.sql"
)

apply_sql_file() {
  local file="$1"
  local token="$2"
  echo "Applying $(basename "$file")..."
  local body
  body=$(node -e "
    const fs = require('fs');
    const sql = fs.readFileSync(process.argv[1], 'utf8');
    process.stdout.write(JSON.stringify({ query: sql }));
  " "$file")

  local http_code
  http_code=$(curl -sS -o /tmp/supabase-capacity-migration.json -w '%{http_code}' \
    -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    -d "$body")

  if [[ "$http_code" != "201" && "$http_code" != "200" ]]; then
    echo "Management API failed (HTTP $http_code) for $(basename "$file"):" >&2
    cat /tmp/supabase-capacity-migration.json >&2
    echo >&2
    return 1
  fi
}

apply_via_management_api() {
  local token="$1"
  echo "Applying capacity migrations via Supabase Management API..."
  for file in "${MIGRATIONS[@]}"; do
    apply_sql_file "$file" "$token"
  done
  echo "Reloading PostgREST schema cache..."
  curl -sS -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    -d '{"query":"select pg_notify('"'"'pgrst'"'"', '"'"'reload schema'"'"');"}' >/dev/null
  echo "Migration applied successfully."
}

apply_via_psql() {
  local url="$1"
  echo "Applying capacity migrations via psql..."
  for file in "${MIGRATIONS[@]}"; do
    psql "$url" -v ON_ERROR_STOP=1 -f "$file"
  done
  psql "$url" -c "select pg_notify('pgrst', 'reload schema');"
  echo "Migration applied successfully."
}

if [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  apply_via_management_api "$SUPABASE_ACCESS_TOKEN"
  exit 0
fi

if [[ -n "${DATABASE_URL:-}" ]]; then
  if ! command -v psql >/dev/null 2>&1; then
    echo "psql not found. Install PostgreSQL client or use SUPABASE_ACCESS_TOKEN instead." >&2
    exit 1
  fi
  apply_via_psql "$DATABASE_URL"
  exit 0
fi

echo "Set one of:" >&2
echo "  SUPABASE_ACCESS_TOKEN  (from https://supabase.com/dashboard/account/tokens)" >&2
echo "  DATABASE_URL           (Transaction pooler connection string)" >&2
exit 1
