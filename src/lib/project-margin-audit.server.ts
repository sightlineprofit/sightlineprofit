import {
  breakEvenResultFromSnapshot,
  getProjectFinancials,
  type ProjectCostSnapshot,
} from "@/lib/finance";
import { fetchProjectStepAssigneeRows } from "@/lib/project-cost-snapshot.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type SupabaseClient = { from: (table: string) => any };

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

function fmtHrs(n: number): string {
  const r = Math.round(n * 10) / 10;
  return r % 1 === 0 ? String(r) : r.toFixed(1);
}

async function sumProjectHours(supabase: SupabaseClient, projectId: string): Promise<number> {
  const { data: phases } = await supabase
    .from("project_phases")
    .select("id")
    .eq("project_id", projectId);
  const phaseIds = (phases ?? []).map((p: { id: string }) => p.id);

  const seen = new Set<string>();
  let total = 0;

  const addRows = (rows: { id: string; hrs: number | null }[] | null) => {
    for (const r of rows ?? []) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      total += Number(r.hrs) || 0;
    }
  };

  const { data: direct } = await supabase
    .from("time_entries")
    .select("id, hrs")
    .eq("project_id", projectId);
  addRows(direct);

  if (phaseIds.length) {
    const { data: viaPhase } = await supabase
      .from("time_entries")
      .select("id, hrs")
      .in("project_phase_id", phaseIds);
    addRows(viaPhase);
  }

  return total;
}

async function computeMarginSnapshot(
  supabase: SupabaseClient,
  projectId: string,
  firmId: string,
  hoursLogged: number,
) {
  const [{ data: project }, { data: snapshot }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).eq("firm_id", firmId).maybeSingle(),
    supabase.from("project_cost_snapshots").select("*").eq("project_id", projectId).maybeSingle(),
  ]);
  if (!project || !snapshot) return null;

  let breakEvenResult = breakEvenResultFromSnapshot(snapshot as ProjectCostSnapshot);
  try {
    const { liveResult } = await fetchProjectStepAssigneeRows(
      supabase,
      projectId,
      snapshot as ProjectCostSnapshot,
      firmId,
    );
    const snapshotResult = breakEvenResultFromSnapshot(snapshot as ProjectCostSnapshot);
    const assigneesNewerThanSnapshot =
      liveResult.hasAssigneeData &&
      (!snapshotResult ||
        (snapshot as { cost_basis_method?: string }).cost_basis_method === "firm_average");
    breakEvenResult =
      liveResult.hasAssigneeData && !assigneesNewerThanSnapshot ? liveResult : snapshotResult;
  } catch {
    // Assignee tables optional — firm-average snapshot still works.
  }

  return getProjectFinancials({
    project: project as Parameters<typeof getProjectFinancials>[0]["project"],
    snapshot: snapshot as ProjectCostSnapshot,
    hoursLogged,
    breakEvenResult,
  });
}

export async function logProjectMarginImpact(params: {
  supabase: SupabaseClient;
  projectId: string;
  firmId: string;
  userId: string;
  hoursBefore: number;
  hoursAfter: number;
  note?: string | null;
}) {
  const { supabase, projectId, firmId, userId, hoursBefore, hoursAfter, note } = params;
  if (hoursBefore === hoursAfter) return;

  const [before, after] = await Promise.all([
    computeMarginSnapshot(supabase, projectId, firmId, hoursBefore),
    computeMarginSnapshot(supabase, projectId, firmId, hoursAfter),
  ]);
  if (!before || !after) return;

  const audits: Array<{
    field_changed: string;
    old_value: string | null;
    new_value: string | null;
  }> = [
    {
      field_changed: "hours_logged",
      old_value: fmtHrs(hoursBefore),
      new_value: fmtHrs(hoursAfter),
    },
  ];

  if (Math.round(before.marginRemaining) !== Math.round(after.marginRemaining)) {
    audits.push({
      field_changed: "remaining_profit",
      old_value: fmtUsd(before.marginRemaining),
      new_value: fmtUsd(after.marginRemaining),
    });
  }

  if (Math.round(before.actualCostAllocation) !== Math.round(after.actualCostAllocation)) {
    audits.push({
      field_changed: "actual_labor_cost",
      old_value: fmtUsd(before.actualCostAllocation),
      new_value: fmtUsd(after.actualCostAllocation),
    });
  }

  if (before.overHours !== after.overHours) {
    audits.push({
      field_changed: "hours_over_scope",
      old_value: before.overHours > 0 ? fmtHrs(before.overHours) : "0",
      new_value: after.overHours > 0 ? fmtHrs(after.overHours) : "0",
    });
  }

  const reason =
    note ??
    (hoursAfter > hoursBefore
      ? `Time logged — ${fmtHrs(hoursAfter - hoursBefore)} hr added`
      : `Time removed — ${fmtHrs(hoursBefore - hoursAfter)} hr deleted`);

  await supabaseAdmin.from("project_financial_audit").insert(
    audits.map((a) => ({
      ...a,
      project_id: projectId,
      firm_id: firmId,
      changed_by: userId,
      reason,
    })),
  );
}

export async function resolveEntryProjectId(
  supabase: SupabaseClient,
  entry: { project_id?: string | null; project_phase_id?: string | null },
): Promise<string | null> {
  if (entry.project_id) return entry.project_id;
  if (!entry.project_phase_id) return null;
  const { data: phase } = await supabase
    .from("project_phases")
    .select("project_id")
    .eq("id", entry.project_phase_id)
    .maybeSingle();
  return (phase?.project_id as string | null) ?? null;
}

export async function logMarginImpactForProjectHoursChange(params: {
  supabase: SupabaseClient;
  projectId: string;
  firmId: string;
  userId: string;
  hoursBefore: number;
  note?: string | null;
}) {
  const hoursAfter = await sumProjectHours(params.supabase, params.projectId);
  await logProjectMarginImpact({
    ...params,
    hoursAfter,
  });
}

export { sumProjectHours };

export const BACKFILL_MARGIN_AUDIT_REASON = "Backfill: historical time over scope";

export async function backfillMarginAuditForProject(params: {
  supabase: SupabaseClient;
  projectId: string;
  firmId: string;
  userId: string;
  dryRun?: boolean;
}): Promise<"skipped" | "inserted" | "no_snapshot"> {
  const { supabase, projectId, firmId, userId, dryRun } = params;

  const { data: existing } = await supabase
    .from("project_financial_audit")
    .select("id")
    .eq("project_id", projectId)
    .eq("reason", BACKFILL_MARGIN_AUDIT_REASON)
    .limit(1);
  if (existing?.length) return "skipped";

  const hoursLogged = await sumProjectHours(supabase, projectId);
  const fin = await computeMarginSnapshot(supabase, projectId, firmId, hoursLogged);
  if (!fin) return "no_snapshot";

  const scopedHours = fin.scopedHours;
  if (hoursLogged <= scopedHours) return "skipped";

  if (dryRun) return "inserted";

  await logProjectMarginImpact({
    supabase,
    projectId,
    firmId,
    userId,
    hoursBefore: scopedHours,
    hoursAfter: hoursLogged,
    note: BACKFILL_MARGIN_AUDIT_REASON,
  });
  return "inserted";
}
