/**
 * Removes partial Meridian demo firm/users so seed can run again.
 * Usage: load .env.local then npx tsx scripts/reset-meridian-demo-for-reseed.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { MERIDIAN_DEMO_FIRM_ID } from "../src/lib/meridian-demo.constants.ts";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.DEMO_ACCOUNT_EMAIL?.toLowerCase();
const teamEmail =
  process.env.DEMO_TEAM_EMAIL?.toLowerCase() ?? "amanda@meridianinteriors.demo";

if (!url || !key || !email) {
  console.error("Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_ACCOUNT_EMAIL");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

async function findUserId(em) {
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === em);
    if (u) return u.id;
    if (data.users.length < 200) break;
    page++;
  }
  return null;
}

const firmId = MERIDIAN_DEMO_FIRM_ID;
await admin.from("time_entries").delete().eq("firm_id", firmId);
await admin.from("owner_draws").delete().eq("firm_id", firmId);
await admin.from("projects").delete().eq("firm_id", firmId);
await admin.from("expenses").delete().eq("firm_id", firmId);
await admin.from("firm_members").delete().eq("firm_id", firmId);
await admin.from("owner_compensation").delete().eq("firm_id", firmId);
await admin.from("firm_preferences").delete().eq("firm_id", firmId);
await admin.from("firm_config").delete().eq("firm_id", firmId);
await admin.from("firm_life_events").delete().eq("firm_id", firmId);
await admin.from("firm_resources").delete().eq("firm_id", firmId);
await admin.from("sop_templates").delete().eq("firm_id", firmId);
await admin.from("firms").delete().eq("id", firmId);

for (const em of [email, teamEmail]) {
  const id = await findUserId(em);
  if (id) {
    await admin.auth.admin.deleteUser(id);
    console.log("deleted auth user", em);
  }
}

console.log("Meridian demo reset complete — run seed-meridian-demo.mjs");
