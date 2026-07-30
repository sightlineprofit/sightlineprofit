/**
 * SOP library core logic (workflows = sop_templates, tasks = sop_steps).
 * Used by sop.functions.ts server fns and project attach flows.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SopAssignedRole } from "@/lib/sop-roles";
import { normalizeWorkflowPeriodInput, type WorkflowPeriodInput } from "@/lib/sop-workflow-period";

export type { SopAssignedRole };

export type RoleBreakdown = {
  role: string;
  displayName: string;
  totalHrs: number;
  taskCount: number;
  pctOfTotal: number;
};

export type RoleInsightResult = {
  roles: RoleBreakdown[];
  totalHrsPerProject: number;
  delegatableHrs: number;
  delegatablePct: number;
  tasksWithResources: number;
  totalTasks: number;
  principalHrsPerProject: number;
  projectsWithWorkflows: number;
  topHireRecommendation: {
    role: string;
    hrs: number;
    rationale: string;
  } | null;
};

const ROLE_LABELS: Record<string, string> = {
  principal: "Principal",
  designer: "Designer",
  junior_designer: "Junior designer",
  coordinator: "Coordinator",
  project_manager: "Project manager",
  account_manager: "Account manager",
  administrative: "Administrative",
  external: "External",
  other: "Other",
};

type StepRow = {
  id: string;
  phase_id: string;
  description: string;
  name?: string | null;
  estimated_hrs: number;
  sort_order: number;
  assigned_role?: string | null;
  assigned_role_label?: string | null;
  trigger_description?: string | null;
  completion_criteria?: string | null;
  steps?: unknown;
  notes?: string | null;
  is_billable?: boolean | null;
};

type PhaseRow = {
  id: string;
  name: string;
  description?: string | null;
  expected_hrs: number;
  billable: boolean;
  sort_order: number;
  estimated_hrs?: number | null;
};

function stepName(s: StepRow): string {
  return (s.name?.trim() || s.description?.trim() || "Untitled task").slice(0, 500);
}

function stepDescription(s: StepRow): string {
  return stepName(s);
}

async function nextWorkflowAttachmentSortOrder(
  supabase: SupabaseClient,
  projectId: string,
): Promise<number> {
  const { data: existing } = await supabase
    .from("project_workflow_attachments")
    .select("sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1);
  return (existing?.[0]?.sort_order ?? -1) + 1;
}

/** Copy sop_templates → project_phases / project_steps (+ resources). Rolls back on failure. */
export async function attachWorkflowToProject(
  supabase: SupabaseClient,
  workflowId: string,
  projectId: string,
  firmId: string,
  period?: WorkflowPeriodInput | null,
): Promise<void> {
  const { data: workflow, error: wfErr } = await supabase
    .from("sop_templates")
    .select("id, firm_id, name, is_active, deleted_at")
    .eq("id", workflowId)
    .eq("firm_id", firmId)
    .is("deleted_at", null)
    .maybeSingle();
  if (wfErr) throw new Error(wfErr.message);
  if (!workflow) throw new Error("Workflow not found");

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, firm_id")
    .eq("id", projectId)
    .eq("firm_id", firmId)
    .maybeSingle();
  if (projErr) throw new Error(projErr.message);
  if (!project) throw new Error("Project not found");

  const { data: phases, error: phErr } = await supabase
    .from("sop_phases")
    .select("id, name, description, expected_hrs, billable, sort_order, estimated_hrs")
    .eq("template_id", workflowId)
    .eq("firm_id", firmId)
    .order("sort_order");
  if (phErr) throw new Error(phErr.message);
  if (!phases?.length) throw new Error("Workflow has no phases");

  const phaseIds = phases.map((p) => p.id);
  const { data: allSteps, error: stErr } = await supabase
    .from("sop_steps")
    .select(
      "id, phase_id, description, name, estimated_hrs, sort_order, assigned_role, assigned_role_label, trigger_description, completion_criteria, steps, notes, is_billable",
    )
    .in("phase_id", phaseIds)
    .order("sort_order");
  if (stErr) throw new Error(stErr.message);

  const stepIds = (allSteps ?? []).map((s) => s.id);
  const { data: resourceLinks } = stepIds.length
    ? await supabase.from("sop_step_resources").select("sop_step_id, resource_id, firm_id").in("sop_step_id", stepIds)
    : { data: [] as { sop_step_id: string; resource_id: string; firm_id: string }[] };

  const { data: existing } = await supabase
    .from("project_phases")
    .select("sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1);
  let nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

  const insertedPhaseIds: string[] = [];
  const insertedStepIds: string[] = [];
  let attachmentId: string | null = null;

  const periodNorm = normalizeWorkflowPeriodInput(period);

  try {
    const attachmentSort = await nextWorkflowAttachmentSortOrder(supabase, projectId);
    const { data: attachmentRow, error: attErr } = await supabase
      .from("project_workflow_attachments")
      .insert({
        project_id: projectId,
        firm_id: firmId,
        sop_template_id: workflowId,
        period_label: periodNorm.period_label,
        period_start: periodNorm.period_start,
        period_end: periodNorm.period_end,
        sort_order: attachmentSort,
      })
      .select("id")
      .single();
    if (attErr) {
      if (/project_workflow_attachments|could not find/i.test(attErr.message)) {
        attachmentId = null;
      } else {
        throw new Error(attErr.message);
      }
    } else {
      attachmentId = attachmentRow.id as string;
    }

    for (const p of phases as PhaseRow[]) {
      const phaseInsert: Record<string, unknown> = {
        project_id: projectId,
        firm_id: firmId,
        sop_phase_id: p.id,
        name: p.name,
        description: p.description ?? null,
        expected_hrs: Number(p.estimated_hrs ?? p.expected_hrs) || 0,
        estimated_hrs: Number(p.estimated_hrs ?? p.expected_hrs) || 0,
        billable: p.billable,
        sort_order: nextOrder++,
        actual_hrs: 0,
      };
      if (attachmentId) phaseInsert.project_workflow_attachment_id = attachmentId;

      const { data: ins, error: insErr } = await supabase
        .from("project_phases")
        .insert(phaseInsert)
        .select("id")
        .single();
      if (insErr) throw new Error(insErr.message);
      insertedPhaseIds.push(ins.id);

      const steps = ((allSteps ?? []) as StepRow[]).filter((s) => s.phase_id === p.id);
      for (const s of steps) {
        const { data: newStep, error: stepInsErr } = await supabase
          .from("project_steps")
          .insert({
            project_id: projectId,
            firm_id: firmId,
            project_phase_id: ins.id,
            sop_step_id: s.id,
            description: stepDescription(s),
            name: stepName(s),
            estimated_hrs: Number(s.estimated_hrs) || 0,
            template_estimated_hrs: Number(s.estimated_hrs) || 0,
            is_custom: false,
            sort_order: s.sort_order,
            actual_hrs: 0,
            assigned_role: s.assigned_role ?? "principal",
            assigned_role_label: s.assigned_role_label ?? null,
            trigger_description: s.trigger_description ?? null,
            completion_criteria: s.completion_criteria ?? null,
            steps: s.steps ?? null,
            notes: s.notes ?? null,
            is_billable: s.is_billable ?? true,
          })
          .select("id")
          .single();
        if (stepInsErr) throw new Error(stepInsErr.message);
        insertedStepIds.push(newStep.id);

        const links = (resourceLinks ?? []).filter((l) => l.sop_step_id === s.id);
        if (links.length) {
          const { error: resErr } = await supabase.from("project_step_resources").insert(
            links.map((l) => ({
              project_step_id: newStep.id,
              resource_id: l.resource_id,
              firm_id: firmId,
            })),
          );
          if (resErr) throw new Error(resErr.message);
        }
      }
    }

    const { data: wfMeta } = await supabase
      .from("sop_templates")
      .select("workflow_type")
      .eq("id", workflowId)
      .maybeSingle();
    const wfType = (wfMeta as { workflow_type?: string } | null)?.workflow_type ?? "project";

    const { data: projRow } = await supabase
      .from("projects")
      .select("sop_template_id")
      .eq("id", projectId)
      .eq("firm_id", firmId)
      .maybeSingle();

    // Primary project template only — firm operations append phases without replacing it.
    if (wfType === "project" && !projRow?.sop_template_id) {
      const { error: tplUpdErr } = await supabase
        .from("projects")
        .update({ sop_template_id: workflowId })
        .eq("id", projectId)
        .eq("firm_id", firmId);
      if (tplUpdErr) throw new Error(tplUpdErr.message);
    }

    try {
      const { copySopAssigneesToProjectSteps } = await import("@/lib/project-cost-snapshot.server");
      const pairs: { sopStepId: string; projectStepId: string }[] = [];
      for (const stepId of insertedStepIds) {
        const { data: row } = await supabase
          .from("project_steps")
          .select("id, sop_step_id")
          .eq("id", stepId)
          .single();
        if (row?.sop_step_id) {
          pairs.push({ sopStepId: row.sop_step_id, projectStepId: row.id });
        }
      }
      if (pairs.length) await copySopAssigneesToProjectSteps(supabase, pairs);
    } catch {
      /* assignee copy optional if migration pending */
    }

    await supabaseAdmin.rpc("refresh_sop_template_estimated_hrs", { p_template_id: workflowId });
  } catch (e) {
    if (insertedStepIds.length) {
      await supabase.from("project_step_resources").delete().in("project_step_id", insertedStepIds);
      await supabase.from("project_steps").delete().in("id", insertedStepIds);
    }
    if (insertedPhaseIds.length) {
      await supabase.from("project_phases").delete().in("id", insertedPhaseIds);
    }
    if (attachmentId) {
      await supabase.from("project_workflow_attachments").delete().eq("id", attachmentId);
    }
    throw e instanceof Error ? e : new Error("Failed to attach workflow");
  }
}

/** Remove one attached workflow instance (period) and its template phases/steps. */
export async function detachProjectWorkflowAttachment(
  supabase: SupabaseClient,
  attachmentId: string,
  projectId: string,
  firmId: string,
): Promise<void> {
  const { data: attachment, error: attErr } = await supabase
    .from("project_workflow_attachments")
    .select("id, project_id, firm_id, sop_template_id")
    .eq("id", attachmentId)
    .eq("project_id", projectId)
    .eq("firm_id", firmId)
    .maybeSingle();
  if (attErr) throw new Error(attErr.message);
  if (!attachment) throw new Error("Workflow period not found");

  const { data: phaseRows, error: phErr } = await supabase
    .from("project_phases")
    .select("id")
    .eq("project_id", projectId)
    .eq("project_workflow_attachment_id", attachmentId);
  if (phErr) throw new Error(phErr.message);

  const phaseIds = (phaseRows ?? []).map((p) => p.id);
  if (phaseIds.length) {
    const { data: steps } = await supabase
      .from("project_steps")
      .select("id")
      .in("project_phase_id", phaseIds);
    const stepIds = (steps ?? []).map((s) => s.id);
    if (stepIds.length) {
      await supabase.from("project_step_resources").delete().in("project_step_id", stepIds);
      await supabase.from("project_step_assignees").delete().in("project_step_id", stepIds);
      const { error: delStepsErr } = await supabase.from("project_steps").delete().in("id", stepIds);
      if (delStepsErr) throw new Error(delStepsErr.message);
    }
    const { error: delPhErr } = await supabase.from("project_phases").delete().in("id", phaseIds);
    if (delPhErr) throw new Error(delPhErr.message);
  }

  const { error: delAttErr } = await supabase
    .from("project_workflow_attachments")
    .delete()
    .eq("id", attachmentId);
  if (delAttErr) throw new Error(delAttErr.message);

  const { data: projRow } = await supabase
    .from("projects")
    .select("sop_template_id")
    .eq("id", projectId)
    .maybeSingle();
  if (projRow?.sop_template_id === attachment.sop_template_id) {
    const { count } = await supabase
      .from("project_workflow_attachments")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("sop_template_id", attachment.sop_template_id);
    if ((count ?? 0) === 0) {
      await supabase
        .from("projects")
        .update({ sop_template_id: null })
        .eq("id", projectId)
        .eq("firm_id", firmId);
    }
  }
}

export async function listProjectWorkflowAttachments(
  supabase: SupabaseClient,
  projectId: string,
  firmId: string,
): Promise<
  {
    id: string;
    sop_template_id: string;
    period_label: string | null;
    period_start: string | null;
    period_end: string | null;
    sort_order: number;
    template_name: string | null;
  }[]
> {
  const { data: rows, error } = await supabase
    .from("project_workflow_attachments")
    .select("id, sop_template_id, period_label, period_start, period_end, sort_order")
    .eq("project_id", projectId)
    .eq("firm_id", firmId)
    .order("sort_order");
  if (error) {
    if (/project_workflow_attachments|could not find/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  if (!rows?.length) return [];

  const templateIds = [...new Set(rows.map((r) => r.sop_template_id))];
  const { data: templates } = await supabase
    .from("sop_templates")
    .select("id, name")
    .in("id", templateIds);
  const nameById = new Map((templates ?? []).map((t) => [t.id, t.name as string]));

  return rows.map((r) => ({
    id: r.id as string,
    sop_template_id: r.sop_template_id as string,
    period_label: (r.period_label as string | null) ?? null,
    period_start: (r.period_start as string | null) ?? null,
    period_end: (r.period_end as string | null) ?? null,
    sort_order: Number(r.sort_order) || 0,
    template_name: nameById.get(r.sop_template_id as string) ?? null,
  }));
}

/** Remove template-origin phases/steps; preserve manual (sop_step_id IS NULL) work. */
export async function detachWorkflowFromProject(
  supabase: SupabaseClient,
  projectId: string,
  firmId: string,
): Promise<void> {
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("firm_id", firmId)
    .maybeSingle();
  if (projErr) throw new Error(projErr.message);
  if (!project) throw new Error("Project not found");

  const { data: templateSteps, error: stErr } = await supabase
    .from("project_steps")
    .select("id, project_phase_id")
    .eq("project_id", projectId)
    .not("sop_step_id", "is", null);
  if (stErr) throw new Error(stErr.message);

  const stepIds = (templateSteps ?? []).map((s) => s.id);
  if (stepIds.length) {
    await supabase.from("project_step_resources").delete().in("project_step_id", stepIds);
    await supabase.from("project_step_assignees").delete().in("project_step_id", stepIds);
    const { error: delStepsErr } = await supabase.from("project_steps").delete().in("id", stepIds);
    if (delStepsErr) throw new Error(delStepsErr.message);
  }

  const { data: templatePhases, error: phErr } = await supabase
    .from("project_phases")
    .select("id")
    .eq("project_id", projectId)
    .not("sop_phase_id", "is", null);
  if (phErr) throw new Error(phErr.message);

  for (const ph of templatePhases ?? []) {
    const { count } = await supabase
      .from("project_steps")
      .select("id", { count: "exact", head: true })
      .eq("project_phase_id", ph.id);
    if ((count ?? 0) === 0) {
      const { error: delPhErr } = await supabase.from("project_phases").delete().eq("id", ph.id);
      if (delPhErr) throw new Error(delPhErr.message);
    }
  }

  const { error: updErr } = await supabase
    .from("projects")
    .update({ sop_template_id: null })
    .eq("id", projectId)
    .eq("firm_id", firmId);
  if (updErr) throw new Error(updErr.message);

  await supabase.from("project_workflow_attachments").delete().eq("project_id", projectId).eq("firm_id", firmId);
}

const EMPTY_INSIGHTS: RoleInsightResult = {
  roles: [],
  totalHrsPerProject: 0,
  delegatableHrs: 0,
  delegatablePct: 0,
  tasksWithResources: 0,
  totalTasks: 0,
  principalHrsPerProject: 0,
  projectsWithWorkflows: 0,
  topHireRecommendation: null,
};

export async function getRoleInsights(
  supabase: SupabaseClient,
  firmId: string,
): Promise<RoleInsightResult> {
  const { data: projects, error: pErr } = await supabase
    .from("projects")
    .select("id, sop_template_id")
    .eq("firm_id", firmId)
    .not("sop_template_id", "is", null)
    .is("deleted_at", null)
    .is("archived_at", null);
  if (pErr) throw new Error(pErr.message);

  const assignedProjects = (projects ?? []).filter(
    (p): p is { id: string; sop_template_id: string } => !!p.sop_template_id,
  );
  if (!assignedProjects.length) {
    return EMPTY_INSIGHTS;
  }

  const templateIds = [...new Set(assignedProjects.map((p) => p.sop_template_id))];
  const projectCount = assignedProjects.length;

  const { data: workflows, error: wfErr } = await supabase
    .from("sop_templates")
    .select("id, estimated_total_hrs")
    .eq("firm_id", firmId)
    .in("id", templateIds)
    .eq("workflow_type", "project")
    .eq("is_active", true)
    .is("deleted_at", null);
  if (wfErr) throw new Error(wfErr.message);

  const workflowIds = (workflows ?? []).map((w) => w.id);
  if (!workflowIds.length) {
    return { ...EMPTY_INSIGHTS, projectsWithWorkflows: projectCount };
  }

  const { data: phases, error: phErr } = await supabase
    .from("sop_phases")
    .select("id, template_id")
    .in("template_id", workflowIds);
  if (phErr) throw new Error(phErr.message);

  const phaseIds = (phases ?? []).map((p) => p.id);
  if (!phaseIds.length) {
    return { ...EMPTY_INSIGHTS, projectsWithWorkflows: projectCount };
  }

  const { data: tasks, error: tErr } = await supabase
    .from("sop_steps")
    .select("id, phase_id, assigned_role, estimated_hrs")
    .in("phase_id", phaseIds);
  if (tErr) throw new Error(tErr.message);

  const taskList = tasks ?? [];
  const totalTasks = taskList.length;

  const { data: resLinks } = totalTasks
    ? await supabase.from("sop_step_resources").select("sop_step_id").in(
        "sop_step_id",
        taskList.map((t) => t.id),
      )
    : { data: [] as { sop_step_id: string }[] };
  const tasksWithResources = new Set((resLinks ?? []).map((r) => r.sop_step_id)).size;

  const templateRoleHrs = new Map<string, Map<string, number>>();
  const templateTaskCounts = new Map<string, Map<string, number>>();

  for (const workflowId of workflowIds) {
    const wfPhaseIds = new Set(
      (phases ?? []).filter((p) => p.template_id === workflowId).map((p) => p.id),
    );
    const wfTasks = taskList.filter((t) => wfPhaseIds.has(t.phase_id));
    const hrsByRole = new Map<string, number>();
    const countByRole = new Map<string, number>();
    for (const t of wfTasks) {
      const role = t.assigned_role ?? "principal";
      hrsByRole.set(role, (hrsByRole.get(role) ?? 0) + (Number(t.estimated_hrs) || 0));
      countByRole.set(role, (countByRole.get(role) ?? 0) + 1);
    }
    templateRoleHrs.set(workflowId, hrsByRole);
    templateTaskCounts.set(workflowId, countByRole);
  }

  const roleTotals = new Map<string, { hrs: number; taskCount: number }>();
  let totalHrsAllProjects = 0;

  for (const project of assignedProjects) {
    const templateId = project.sop_template_id;
    const hrsByRole = templateRoleHrs.get(templateId);
    if (!hrsByRole) continue;
    for (const [role, hrs] of hrsByRole) {
      const cur = roleTotals.get(role) ?? { hrs: 0, taskCount: 0 };
      cur.hrs += hrs;
      roleTotals.set(role, cur);
    }
    totalHrsAllProjects += [...hrsByRole.values()].reduce((sum, hrs) => sum + hrs, 0);
  }

  for (const [, countByRole] of templateTaskCounts) {
    for (const [role, count] of countByRole) {
      const cur = roleTotals.get(role) ?? { hrs: 0, taskCount: 0 };
      cur.taskCount += count;
      roleTotals.set(role, cur);
    }
  }

  const totalHrsPerProject = projectCount > 0 ? totalHrsAllProjects / projectCount : 0;
  const roleAverages = new Map<string, { hrs: number; taskCount: number }>();
  for (const [role, v] of roleTotals) {
    roleAverages.set(role, {
      hrs: projectCount > 0 ? v.hrs / projectCount : 0,
      taskCount: v.taskCount,
    });
  }

  const principalHrsPerProject = roleAverages.get("principal")?.hrs ?? 0;
  const delegatableHrs = Math.max(0, totalHrsPerProject - principalHrsPerProject);
  const delegatablePct = totalHrsPerProject > 0 ? (delegatableHrs / totalHrsPerProject) * 100 : 0;

  const roles: RoleBreakdown[] = [...roleAverages.entries()]
    .map(([role, v]) => ({
      role,
      displayName: ROLE_LABELS[role] ?? role,
      totalHrs: v.hrs,
      taskCount: v.taskCount,
      pctOfTotal: totalHrsPerProject > 0 ? (v.hrs / totalHrsPerProject) * 100 : 0,
    }))
    .sort((a, b) => b.totalHrs - a.totalHrs);

  const { data: members } = await supabase
    .from("firm_members")
    .select("role_type, is_active")
    .eq("firm_id", firmId)
    .eq("is_active", true);
  const hasTeamMember = (members ?? []).some((m) => m.role_type !== "principal");

  let topHireRecommendation: RoleInsightResult["topHireRecommendation"] = null;
  const nonPrincipal = roles.filter((r) => r.role !== "principal" && r.totalHrs > 0);
  if (nonPrincipal.length) {
    const top = nonPrincipal[0];
    const roleNeedsCoverage = top.role !== "principal" && !hasTeamMember;
    if (roleNeedsCoverage) {
      topHireRecommendation = {
        role: top.displayName,
        hrs: top.totalHrs,
        rationale: `${Math.round(top.totalHrs)} hours per project that doesn't require your design expertise or client relationship.`,
      };
    }
  }

  return {
    roles,
    totalHrsPerProject,
    delegatableHrs,
    delegatablePct,
    tasksWithResources,
    totalTasks,
    principalHrsPerProject,
    projectsWithWorkflows: projectCount,
    topHireRecommendation,
  };
}
