#!/usr/bin/env node
/**
 * Grant is_super_admin on a profile by email (service role).
 * Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/grant-super-admin.mjs user@example.com
 */
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/grant-super-admin.mjs <email>");
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

const { data: profile, error: findErr } = await admin
  .from("profiles")
  .select("id, email, is_super_admin, role, firm_id")
  .ilike("email", email)
  .maybeSingle();

if (findErr || !profile) {
  console.error(findErr?.message ?? `No profile for ${email}`);
  process.exit(1);
}

if (profile.is_super_admin) {
  console.log(`Already super admin: ${profile.email} (${profile.id})`);
  process.exit(0);
}

const { error: updErr } = await admin
  .from("profiles")
  .update({ is_super_admin: true })
  .eq("id", profile.id);

if (updErr) {
  console.error(updErr.message);
  process.exit(1);
}

console.log(`Granted super admin: ${profile.email} (${profile.id})`);
