#!/usr/bin/env bash
# Set Resend secrets on the production Cloudflare Worker.
#
# Usage:
#   RESEND_API_KEY=re_... TRANSACTIONAL_EMAIL_FROM='Sightline <hello@sightlineprofit.com>' npm run setup:resend-secrets
#
# Or interactively:
#   npm run setup:resend-secrets

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEFAULT_FROM='Sightline <hello@sightlineprofit.com>'

if [[ ! -f .output/server/wrangler.json ]]; then
  echo "Building first so wrangler.json exists..."
  npm run build
  node scripts/patch-wrangler-production.mjs
fi

WRANGLER_CONFIG=".output/server/wrangler.json"

if [[ -z "${RESEND_API_KEY:-}" ]]; then
  read -r -s -p "Resend API key (re_…): " RESEND_API_KEY
  echo
fi
if [[ -z "${TRANSACTIONAL_EMAIL_FROM:-}" ]]; then
  read -r -p "From address [${DEFAULT_FROM}]: " TRANSACTIONAL_EMAIL_FROM
  TRANSACTIONAL_EMAIL_FROM="${TRANSACTIONAL_EMAIL_FROM:-$DEFAULT_FROM}"
fi

if [[ -z "$RESEND_API_KEY" ]]; then
  echo "RESEND_API_KEY is required." >&2
  exit 1
fi
if [[ "$RESEND_API_KEY" != re_* ]]; then
  echo "Warning: Resend keys usually start with re_" >&2
fi

DEFAULT_TEMPLATE_ID='sightline-team-invite'

if [[ -z "${RESEND_TEAM_INVITE_TEMPLATE_ID:-}" ]]; then
  read -r -p "Team invite template id/alias [${DEFAULT_TEMPLATE_ID}]: " RESEND_TEAM_INVITE_TEMPLATE_ID
  RESEND_TEAM_INVITE_TEMPLATE_ID="${RESEND_TEAM_INVITE_TEMPLATE_ID:-$DEFAULT_TEMPLATE_ID}"
fi

echo "Setting Cloudflare Worker secrets (sightlineprofit-sightlineprofit)..."
printf '%s' "$RESEND_API_KEY" | npx wrangler secret put RESEND_API_KEY --config "$WRANGLER_CONFIG"
printf '%s' "$TRANSACTIONAL_EMAIL_FROM" | npx wrangler secret put TRANSACTIONAL_EMAIL_FROM --config "$WRANGLER_CONFIG"
printf '%s' "$RESEND_TEAM_INVITE_TEMPLATE_ID" | npx wrangler secret put RESEND_TEAM_INVITE_TEMPLATE_ID --config "$WRANGLER_CONFIG"

echo
echo "Done. Verify with:"
echo "  npm run test:resend-team-invite   # template send"
echo "  TEST_EMAIL_TO=your@email.com RESEND_API_KEY=... npm run test:resend-email"
echo
echo "Then deploy: npm run deploy"
