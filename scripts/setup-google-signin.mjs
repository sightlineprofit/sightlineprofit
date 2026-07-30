#!/usr/bin/env node
/**
 * Configure Supabase Auth for production Google sign-in (steps 1–2).
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... npm run setup:google-signin
 *   # or add SUPABASE_ACCESS_TOKEN to .env.local and run:
 *   node --env-file=.env.local scripts/setup-google-signin.mjs
 *
 * Token: https://supabase.com/dashboard/account/tokens
 *
 * Step 3 (Google Cloud redirect URI) is verified separately — the script
 * prints the exact URI to confirm in Google Cloud Console.
 */
const PROJECT_REF = "nizjqvbxrmxkkmnnqzpy";
const SITE_URL = "https://sightlineprofit.com";
const REDIRECT_ALLOW_LIST = [
  "https://sightlineprofit.com/post-auth",
  "https://sightlineprofit.com/**",
  "https://www.sightlineprofit.com/post-auth",
  "https://www.sightlineprofit.com/**",
  "http://localhost:8080/post-auth",
  "http://localhost:8080/**",
].join(",");

const SUPABASE_CALLBACK = `https://${PROJECT_REF}.supabase.co/auth/v1/callback`;

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!token) {
  console.error(
    "Set SUPABASE_ACCESS_TOKEN in .env.local or env (Supabase dashboard → Account → Access Tokens).",
  );
  process.exit(1);
}

const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;

async function main() {
  const getRes = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!getRes.ok) {
    console.error("GET auth config failed:", getRes.status, await getRes.text());
    process.exit(1);
  }
  const before = await getRes.json();

  const patch = {
    site_url: SITE_URL,
    uri_allow_list: REDIRECT_ALLOW_LIST,
    external_google_enabled: true,
  };

  // Preserve existing Google OAuth client if already configured in dashboard.
  if (before.external_google_client_id) {
    patch.external_google_client_id = before.external_google_client_id;
  }
  if (before.external_google_secret) {
    patch.external_google_secret = before.external_google_secret;
  }

  // Optional overrides from env (only if you want to replace the dashboard client).
  if (process.env.GOOGLE_AUTH_CLIENT_ID?.trim()) {
    patch.external_google_client_id = process.env.GOOGLE_AUTH_CLIENT_ID.trim();
  }
  if (process.env.GOOGLE_AUTH_CLIENT_SECRET?.trim()) {
    patch.external_google_secret = process.env.GOOGLE_AUTH_CLIENT_SECRET.trim();
  }

  const putRes = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(patch),
  });

  const bodyText = await putRes.text();
  if (!putRes.ok) {
    console.error("PATCH auth config failed:", putRes.status, bodyText);
    process.exit(1);
  }

  const after = JSON.parse(bodyText);

  console.log("Supabase Auth configured:");
  console.log("  site_url:", after.site_url ?? SITE_URL);
  console.log("  uri_allow_list:", after.uri_allow_list ?? REDIRECT_ALLOW_LIST);
  console.log("  external_google_enabled:", after.external_google_enabled ?? true);
  console.log(
    "  external_google_client_id:",
    after.external_google_client_id ? `${String(after.external_google_client_id).slice(0, 20)}…` : "(none)",
  );

  console.log("\nStep 3 — confirm in Google Cloud Console (Credentials → OAuth client):");
  console.log("  Authorized redirect URI (required):");
  console.log(`    ${SUPABASE_CALLBACK}`);
  console.log("  Authorized JavaScript origins (recommended):");
  console.log("    https://sightlineprofit.com");
  console.log("    https://www.sightlineprofit.com");
  console.log("    http://localhost:8080");
  console.log("\nOpen:");
  console.log(
    "  https://console.cloud.google.com/apis/credentials?project=833440392444",
  );
  console.log("\nThen test: https://sightlineprofit.com/login → Continue with Google");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
