#!/usr/bin/env node
/**
 * Enable Supabase Auth leaked-password (HaveIBeenPwned) check via Management API.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... npm run setup:auth-leaked-passwords
 *
 * Token: https://supabase.com/dashboard/account/tokens
 */
const PROJECT_REF = "nizjqvbxrmxkkmnnqzpy";

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!token) {
  console.error("Set SUPABASE_ACCESS_TOKEN (Supabase dashboard → Account → Access Tokens).");
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
  await getRes.json();

  const patch = { password_hibp_enabled: true };

  const putRes = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(patch),
  });

  const body = await putRes.text();
  if (!putRes.ok) {
    console.error("PATCH auth config failed:", putRes.status, body);
    console.error(
      "\nIf the API rejects this field, enable manually: Authentication → Providers → Email → Prevent use of leaked passwords.",
    );
    process.exit(1);
  }

  console.log("Auth config updated. password_hibp_enabled should be on.");
  console.log("Re-run Supabase Database Linter in a few minutes.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
