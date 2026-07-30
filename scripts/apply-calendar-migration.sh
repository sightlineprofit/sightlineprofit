#!/usr/bin/env bash
# Apply calendar overlay migration to Supabase project nizjqvbxrmxkkmnnqzpy.
#
# Usage (pick one):
#   SUPABASE_ACCESS_TOKEN=... npm run db:apply-calendar-migration
#   DATABASE_URL='postgresql://postgres.nizjqvbxrmxkkmnnqzpy:...@aws-0-....pooler.supabase.com:6543/postgres' npm run db:apply-calendar-migration
#
# Get SUPABASE_ACCESS_TOKEN: https://supabase.com/dashboard/account/tokens
# Get DATABASE_URL: Supabase → Project Settings → Database → Connection string (Transaction pooler)

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATION="$ROOT/supabase/migrations/20260720150000_calendar_connections.sql"
PROJECT_REF="nizjqvbxrmxkkmnnqzpy"

if [[ ! -f "$MIGRATION" ]]; then
  echo "Missing migration: $MIGRATION" >&2
  exit 1
fi

apply_via_management_api() {
  local token="$1"
  echo "Applying migration via Supabase Management API..."
  local body
  body=$(node -e "
    const fs = require('fs');
    const sql = fs.readFileSync(process.argv[1], 'utf8');
    process.stdout.write(JSON.stringify({ query: sql }));
  " "$MIGRATION")

  local http_code
  http_code=$(curl -sS -o /tmp/supabase-migration-response.json -w '%{http_code}' \
    -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    -d "$body")

  if [[ "$http_code" != "201" && "$http_code" != "200" ]]; then
    echo "Management API failed (HTTP $http_code):" >&2
    cat /tmp/supabase-migration-response.json >&2
    echo >&2
    return 1
  fi
  echo "Migration applied successfully."
  cat /tmp/supabase-migration-response.json
  echo
}

apply_via_psql() {
  local url="$1"
  echo "Applying migration via psql..."
  psql "$url" -v ON_ERROR_STOP=1 -f "$MIGRATION"
  echo "Migration applied successfully."
}

verify_tables() {
  echo "Verifying tables..."
  if [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
    local body='{"query":"select table_name from information_schema.tables where table_schema = '\''public'\'' and table_name in ('\''calendar_connections'\'', '\''calendar_events'\'', '\''calendar_oauth_states'\'') order by 1;"}'
    curl -sS -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
      -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$body" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(JSON.stringify(d,null,2));"
  elif [[ -n "${DATABASE_URL:-}" ]] && command -v psql >/dev/null 2>&1; then
    psql "$DATABASE_URL" -c "select table_name from information_schema.tables where table_schema = 'public' and table_name in ('calendar_connections','calendar_events','calendar_oauth_states') order by 1;"
  else
    echo "(Skip verify — no SUPABASE_ACCESS_TOKEN or DATABASE_URL)"
  fi
}

if [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  apply_via_management_api "$SUPABASE_ACCESS_TOKEN"
  verify_tables
  exit 0
fi

if [[ -n "${DATABASE_URL:-}" ]]; then
  if ! command -v psql >/dev/null 2>&1; then
    echo "psql not found. Install PostgreSQL client or use SUPABASE_ACCESS_TOKEN instead." >&2
    exit 1
  fi
  apply_via_psql "$DATABASE_URL"
  verify_tables
  exit 0
fi

echo "Set one of:" >&2
echo "  SUPABASE_ACCESS_TOKEN  (from https://supabase.com/dashboard/account/tokens)" >&2
echo "  DATABASE_URL           (Transaction pooler connection string)" >&2
exit 1
