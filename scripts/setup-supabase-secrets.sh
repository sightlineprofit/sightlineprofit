#!/usr/bin/env bash
# Set Supabase service-role secret on the production Cloudflare Worker.
# Public URL + anon key are injected as plain vars by patch-wrangler-production.mjs.
#
# Usage:
#   SUPABASE_SERVICE_ROLE_KEY=eyJ... npm run setup:supabase-secrets
#
# Or load from .env.local:
#   set -a && source .env.local && set +a && npm run setup:supabase-secrets

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .output/server/wrangler.json ]]; then
  echo "Building first so wrangler.json exists..."
  npm run build
  node scripts/patch-wrangler-production.mjs
fi

WRANGLER_CONFIG=".output/server/wrangler.json"

if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  if [[ -f .env.local ]]; then
    set -a
    # shellcheck disable=SC1091
    source .env.local
    set +a
  fi
fi

if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  read -r -s -p "Supabase service role key (eyJ…): " SUPABASE_SERVICE_ROLE_KEY
  echo
fi

if [[ -z "$SUPABASE_SERVICE_ROLE_KEY" ]]; then
  echo "SUPABASE_SERVICE_ROLE_KEY is required." >&2
  exit 1
fi

echo "Setting Cloudflare Worker secret (sightlineprofit-sightlineprofit)..."
printf '%s' "$SUPABASE_SERVICE_ROLE_KEY" | npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config "$WRANGLER_CONFIG"

echo
echo "Done. Redeploy so plain vars are refreshed:"
echo "  npm run deploy"
echo
echo "Then verify auth + dashboard load on https://sightlineprofit.com"
