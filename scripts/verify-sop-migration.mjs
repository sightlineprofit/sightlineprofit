/**
 * Verify SOP library rebuild migration (20260722194500) against live Supabase.
 * Run: node --env-file=.env.local scripts/verify-sop-migration.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. --env-file=.env.local)");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

const REQUIRED_TABLES = ["firm_resources", "sop_step_resources", "project_step_resources"];

const COLUMN_CHECKS = [
  { table: "firm_resources", columns: ["file_path", "file_name"] },
  { table: "sop_templates", columns: ["workflow_type", "icon", "is_active", "estimated_total_hrs", "updated_at", "sort_order"] },
  { table: "sop_phases", columns: ["estimated_hrs"] },
  {
    table: "sop_steps",
    columns: [
      "name",
      "assigned_role",
      "trigger_description",
      "completion_criteria",
      "steps",
      "notes",
      "is_billable",
      "created_at",
      "updated_at",
    ],
  },
  { table: "project_phases", columns: ["firm_id", "description", "estimated_hrs"] },
  {
    table: "project_steps",
    columns: [
      "project_id",
      "firm_id",
      "name",
      "assigned_role",
      "trigger_description",
      "completion_criteria",
      "steps",
      "notes",
      "is_billable",
      "completed_by",
      "updated_at",
    ],
  },
];

const RPC_CHECKS = ["refresh_sop_phase_estimated_hrs", "refresh_sop_template_estimated_hrs"];

let failed = 0;

async function tableExists(table) {
  const { error } = await admin.from(table).select("id").limit(1);
  if (error) {
    console.log(`✗ ${table}: MISSING or inaccessible (${error.message})`);
    failed++;
    return false;
  }
  console.log(`✓ ${table}: exists`);
  return true;
}

async function columnsExist(table, columns) {
  const { data, error } = await admin.from(table).select(columns.join(",")).limit(1);
  if (error) {
    console.log(`✗ ${table} columns [${columns.join(", ")}]: ${error.message}`);
    failed++;
    return;
  }
  console.log(`✓ ${table}: columns ok (${columns.length})`);
  if (data?.[0]) {
    const missing = columns.filter((c) => !(c in data[0]));
    if (missing.length) {
      console.log(`  ⚠ sample row missing keys: ${missing.join(", ")} (may be empty table)`);
    }
  }
}

async function rpcExists(fn) {
  const { error } = await admin.rpc(fn, fn.includes("phase") ? { p_phase_id: "00000000-0000-0000-0000-000000000000" } : { p_template_id: "00000000-0000-0000-0000-000000000000" });
  if (error && /Could not find the function|schema cache/i.test(error.message)) {
    console.log(`✗ rpc ${fn}: MISSING (${error.message})`);
    failed++;
    return;
  }
  console.log(`✓ rpc ${fn}: exists`);
}

console.log("SOP migration verification\n");

for (const t of REQUIRED_TABLES) {
  await tableExists(t);
}

for (const { table, columns } of COLUMN_CHECKS) {
  await columnsExist(table, columns);
}

for (const fn of RPC_CHECKS) {
  await rpcExists(fn);
}

// Backfill sanity: project_steps.project_id should be populated when steps exist
const { data: orphanSteps, error: orphanErr } = await admin
  .from("project_steps")
  .select("id")
  .is("project_id", null)
  .limit(5);
if (orphanErr) {
  console.log(`⚠ project_steps backfill check skipped: ${orphanErr.message}`);
} else if ((orphanSteps ?? []).length > 0) {
  console.log(`⚠ ${orphanSteps.length}+ project_steps rows still missing project_id (re-run migration UPDATE)`);
} else {
  console.log("✓ project_steps.project_id backfill: no nulls in sample");
}

console.log(failed ? `\n${failed} check(s) failed — apply 20260722194500_sop_library_rebuild_schema.sql` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
