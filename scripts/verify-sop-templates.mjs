import { supabaseAdmin } from "../src/integrations/supabase/client.server.ts";

const firmId =
  process.argv[2] ?? "02c91eff-364f-4ae7-b11a-4b72f371572c";

const { data } = await supabaseAdmin
  .from("sop_templates")
  .select("name, workflow_type, is_active, is_default")
  .eq("firm_id", firmId)
  .is("deleted_at", null)
  .order("name");

const projectEligible = (data ?? []).filter(
  (r) =>
    (r.workflow_type === "project" || r.workflow_type === "firm_operation") &&
    r.is_active,
);

console.log(`${data?.length ?? 0} templates total, ${projectEligible.length} visible in project picker`);
for (const r of data ?? []) {
  const ok =
    (r.workflow_type === "project" || r.workflow_type === "firm_operation") &&
    r.is_active;
  console.log(`${ok ? "✓" : "✗"} ${r.name} (${r.workflow_type ?? "null"}, active=${r.is_active})`);
}
