#!/usr/bin/env node
/**
 * Verify Supabase Google sign-in config (no secrets printed).
 *
 * Usage: node --env-file=.env.local scripts/verify-google-signin.mjs
 */
const PROJECT_REF = "nizjqvbxrmxkkmnnqzpy";
const EXPECTED_CALLBACK = `https://${PROJECT_REF}.supabase.co/auth/v1/callback`;
const CALENDAR_CLIENT_HINT = "vp0ski";

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!token) {
  console.error("Set SUPABASE_ACCESS_TOKEN in .env.local");
  process.exit(1);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
  headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
});
if (!res.ok) {
  console.error("GET auth config failed:", res.status, await res.text());
  process.exit(1);
}

const auth = await res.json();
const clientId = auth.external_google_client_id ?? "";
const secret = auth.external_google_secret ?? "";
let ok = true;

console.log("Supabase Google sign-in check\n");

if (!auth.external_google_enabled) {
  console.log("✗ Google provider is disabled");
  ok = false;
} else {
  console.log("✓ Google provider enabled");
}

if (!clientId) {
  console.log("✗ No Google client ID configured");
  ok = false;
} else {
  console.log(`✓ Client ID: ${clientId}`);
  if (clientId.includes(CALENDAR_CLIENT_HINT)) {
    console.log("  ⚠ This looks like the Calendar OAuth client — use the Sign-in Web client (ke4…)");
    ok = false;
  }
}

if (!secret || secret.length < 10) {
  console.log("✗ No Google client secret (or too short)");
  ok = false;
} else {
  console.log(`✓ Client secret is set (${secret.length} chars)`);
  if (/\s/.test(secret)) {
    console.log("  ⚠ Secret contains whitespace — re-paste without spaces");
    ok = false;
  }
  if (!secret.startsWith("GOCSPX-") || secret.length < 30 || secret.length > 45) {
    console.log(
      "  ⚠ Unusual secret length/format — Google Web client secrets are usually ~35 chars starting with GOCSPX-",
    );
    console.log("    Regenerate in Google Cloud → paste fresh into Supabase → Auth → Google → Save");
    ok = false;
  }
}

console.log(`\nSite URL: ${auth.site_url ?? "(unset)"}`);
console.log(`Redirect allow list: ${(auth.uri_allow_list ?? "").slice(0, 120)}…`);
console.log(`\nGoogle Cloud must have this redirect URI on the SAME OAuth client:\n  ${EXPECTED_CALLBACK}`);

process.exit(ok ? 0 : 1);
