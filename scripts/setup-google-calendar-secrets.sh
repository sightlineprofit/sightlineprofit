#!/usr/bin/env bash
# Configure Google Calendar OAuth secrets on the Cloudflare Worker.
#
# Prerequisite: create a Google OAuth Web client (see deploy/google-calendar-setup.md).
#
# Usage:
#   GOOGLE_CALENDAR_CLIENT_ID=... GOOGLE_CALENDAR_CLIENT_SECRET=... npm run setup:google-calendar-secrets
#
# Or interactively:
#   npm run setup:google-calendar-secrets

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .output/server/wrangler.json ]]; then
  echo "Building first so wrangler.json exists..."
  npm run build
  node scripts/patch-wrangler-production.mjs
fi

WRANGLER_CONFIG=".output/server/wrangler.json"

if [[ -z "${GOOGLE_CALENDAR_CLIENT_ID:-}" ]]; then
  read -r -p "Google OAuth Client ID: " GOOGLE_CALENDAR_CLIENT_ID
fi
if [[ -z "${GOOGLE_CALENDAR_CLIENT_SECRET:-}" ]]; then
  read -r -s -p "Google OAuth Client Secret: " GOOGLE_CALENDAR_CLIENT_SECRET
  echo
fi

if [[ -z "$GOOGLE_CALENDAR_CLIENT_ID" || -z "$GOOGLE_CALENDAR_CLIENT_SECRET" ]]; then
  echo "Both GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET are required." >&2
  exit 1
fi

echo "Setting Cloudflare Worker secrets..."
printf '%s' "$GOOGLE_CALENDAR_CLIENT_ID" | npx wrangler secret put GOOGLE_CALENDAR_CLIENT_ID --config "$WRANGLER_CONFIG"
printf '%s' "$GOOGLE_CALENDAR_CLIENT_SECRET" | npx wrangler secret put GOOGLE_CALENDAR_CLIENT_SECRET --config "$WRANGLER_CONFIG"

echo
echo "Done. PUBLIC_APP_URL is set on the Worker via patch-wrangler-production.mjs (.env.production)."
echo
echo "Verify on production: open https://sightlineprofit.com/time-calendar — Connect Google banner should appear."
