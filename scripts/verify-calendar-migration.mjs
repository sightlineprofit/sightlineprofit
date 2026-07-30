/**
 * Check whether calendar overlay tables exist (uses SUPABASE_SERVICE_ROLE_KEY from env).
 * Run: node --env-file=.env.local scripts/verify-calendar-migration.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. --env-file=.env.local)");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
const tables = ["calendar_oauth_states", "calendar_connections", "calendar_events"];

for (const table of tables) {
  const col = table === "calendar_oauth_states" ? "token" : "id";
  const { error } = await admin.from(table).select(col).limit(1);
  if (error) {
    console.log(`${table}: MISSING (${error.message})`);
  } else {
    console.log(`${table}: ok`);
  }
}
