import {
  calculateProjectBreakEven,
  snapshotAssigneePayload,
  type ProjectCostSnapshot,
} from "@/lib/finance";
import {
  buildTaskAssigneeRows,
  type DbFirmMember,
  type DbStepAssignee,
} from "@/lib/project-assignee-cost";

type SupabaseClient = {
  from: (table: string) => any;
};

/** True when assignee tables/columns from 20260716120000 migration are not on the remote DB yet. */
export function isTaskAssigneeSchemaMissingError(err: unknown): boolean {
  const message =
    typeof err === "string"
      ? err
      : err instanceof Error
        ? err.message
        : typeof err === "object" && err && "message" in err
          ? String((err as { message: unknown }).message)
          : "";
  const m = message.toLowerCase();
  return (
    m.includes("schema cache") ||
    m.includes("project_step_assignees") ||
    m.includes("sop_step_assignees") ||
    m.includes("assignee_cost_breakdown") ||
    m.includes("cost_basis_method") ||
    m.includes("project_break_even_rate")
  );
}

export async function loadPrincipalContext(
  supabase: SupabaseClient,
  firmId: string,
): Promise<{ name: string; burdenedRate: number; snapshot: ProjectCostSnapshot | null }> {
  const { data: principal } = await supabase
    .from("profiles")
    .select("name, email")
    .eq("firm_id", firmId)
    .eq("role", "principal")
    .maybeSingle();

  const name =
    (principal?.name as string | null)?.trim() ||
    (principal?.email as string | null)?.trim() ||
    "Principal";

  return { name, burdenedRate: 0, snapshot: null };
}

export async function fetchProjectStepAssigneeRows(
  supabase: SupabaseClient,
  projectId: string,
  snapshot: ProjectCostSnapshot,
  firmId: string,
) {
  const { data: phases } = await supabase
    .from("project_phases")
    .select("id")
    .eq("project_id", projectId);
  const phaseIds = (phases ?? []).map((p: { id: string }) => p.id);
  if (!phaseIds.length) {
    return { assignees: [] as DbStepAssignee[], rows: [], liveResult: calculateProjectBreakEven(snapshot, []) };
  }

  const { data: steps } = await supabase
    .from("project_steps")
    .select("id")
    .in("project_phase_id", phaseIds);
  const stepIds = (steps ?? []).map((s: { id: string }) => s.id);
  if (!stepIds.length) {
    return { assignees: [] as DbStepAssignee[], rows: [], liveResult: calculateProjectBreakEven(snapshot, []) };
  }

  const { data: assignees, error: assigneeErr } = await supabase
    .from("project_step_assignees")
    .select("*")
    .in("project_step_id", stepIds);

  if (assigneeErr) {
    if (isTaskAssigneeSchemaMissingError(assigneeErr)) {
      return { assignees: [] as DbStepAssignee[], rows: [], liveResult: calculateProjectBreakEven(snapshot, []) };
    }
    throw new Error(assigneeErr.message);
  }

  const memberIds = [
    ...new Set(
      (assignees ?? [])
        .map((a: DbStepAssignee) => a.firm_member_id)
        .filter((id): id is string => !!id),
    ),
  ];

  const [{ data: members }, { data: principal }] = await Promise.all([
    memberIds.length
      ? supabase
          .from("firm_members")
          .select("id, name, burdened_hourly_rate, role_type")
          .in("id", memberIds)
      : Promise.resolve({ data: [] as DbFirmMember[] }),
    supabase
      .from("profiles")
      .select("name, email")
      .eq("firm_id", firmId)
      .eq("role", "principal")
      .maybeSingle(),
  ]);

  const membersById = new Map<string, DbFirmMember>(
    ((members ?? []) as DbFirmMember[]).map((m) => [m.id, m]),
  );
  const principalName =
    (principal?.name as string | null)?.trim() ||
    (principal?.email as string | null)?.trim() ||
    "Principal";
  const principalBurdenedRate = Number(snapshot.comp_per_hour) || 0;

  const rows = buildTaskAssigneeRows({
    assignees: (assignees ?? []) as DbStepAssignee[],
    membersById,
    principalName,
    principalBurdenedRate,
  });

  const liveResult = calculateProjectBreakEven(snapshot, rows);
  return { assignees: (assignees ?? []) as DbStepAssignee[], rows, liveResult };
}

export async function refreshProjectCostSnapshot(
  supabase: SupabaseClient,
  projectId: string,
  firmId: string,
) {
  const { data: snapshotRow } = await supabase
    .from("project_cost_snapshots")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (!snapshotRow) return null;

  const snapshot = snapshotRow as ProjectCostSnapshot;
  const { liveResult } = await fetchProjectStepAssigneeRows(
    supabase,
    projectId,
    snapshot,
    firmId,
  );
  const payload = snapshotAssigneePayload(liveResult);

  const { data: updated, error } = await supabase
    .from("project_cost_snapshots")
    .update(payload)
    .eq("project_id", projectId)
    .select("*")
    .single();
  if (error) {
    if (isTaskAssigneeSchemaMissingError(error)) return null;
    throw new Error(error.message);
  }
  return updated;
}

export async function copySopAssigneesToProjectSteps(
  supabase: SupabaseClient,
  pairs: { sopStepId: string; projectStepId: string }[],
): Promise<boolean> {
  if (!pairs.length) return true;
  const sopStepIds = pairs.map((p) => p.sopStepId);
  const { data: sopAssignees, error: loadErr } = await supabase
    .from("sop_step_assignees")
    .select("*")
    .in("sop_step_id", sopStepIds);
  if (loadErr) {
    if (isTaskAssigneeSchemaMissingError(loadErr)) return false;
    throw new Error(loadErr.message);
  }
  if (!sopAssignees?.length) return true;

  const bySop = new Map<string, DbStepAssignee[]>();
  for (const a of sopAssignees as DbStepAssignee[]) {
    const sid = a.sop_step_id!;
    const arr = bySop.get(sid) ?? [];
    arr.push(a);
    bySop.set(sid, arr);
  }

  const inserts: Record<string, unknown>[] = [];
  for (const { sopStepId, projectStepId } of pairs) {
    for (const a of bySop.get(sopStepId) ?? []) {
      inserts.push({
        project_step_id: projectStepId,
        assignee_kind: a.assignee_kind,
        firm_member_id: a.firm_member_id,
        estimated_hrs: a.estimated_hrs,
        is_billable: a.is_billable,
        notes: a.notes ?? null,
      });
    }
  }
  if (inserts.length) {
    const { error } = await supabase.from("project_step_assignees").insert(inserts);
    if (error) {
      if (isTaskAssigneeSchemaMissingError(error)) return false;
      throw new Error(error.message);
    }
  }
  return true;
}

export async function listFirmMembersForAssigneePicker(
  supabase: SupabaseClient,
  firmId: string,
) {
  const [{ data: members }, { data: principal }] = await Promise.all([
    supabase
      .from("firm_members")
      .select("id, name, role_type, burdened_hourly_rate, is_active")
      .eq("firm_id", firmId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("profiles")
      .select("name, email")
      .eq("firm_id", firmId)
      .eq("role", "principal")
      .maybeSingle(),
  ]);

  const principalName =
    (principal?.name as string | null)?.trim() ||
    (principal?.email as string | null)?.trim() ||
    "Principal";

  return {
    members: (members ?? []) as DbFirmMember[],
    principal: { name: principalName },
  };
}
