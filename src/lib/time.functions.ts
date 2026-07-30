import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireCanWrite, isFinancialRole, canAssignTimeEntryUser, effectiveRole, getCallerProfile } from "@/lib/auth-guards.server";
import {
  isAllowedTimeLogAssignee,
  listTimeLogAssigneesForFirm,
  parseTimeLogAssigneeKey,
} from "@/lib/time-assignees.server";
import { PROJECT_SAFE_SELECT, stripProjectsForRole } from "@/lib/project-safety.server";
import {
  logMarginImpactForProjectHoursChange,
  resolveEntryProjectId,
  sumProjectHours,
} from "@/lib/project-margin-audit.server";
import { listFirmProjects } from "@/lib/project-lifecycle.server";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeStr = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);

const TIME_ASSIGNEE_PROFILE_SELECT =
  "id, name, email, role, color, billable_rate, expected_hrs_per_week, billable_pct";

async function fetchFirmProfileAssignees(
  supabase: { from: (table: string) => unknown },
  firmId: string,
) {
  const { data, error } = await (supabase as any)
    .from("profiles")
    .select(TIME_ASSIGNEE_PROFILE_SELECT)
    .eq("firm_id", firmId)
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function loadTimeLogAssignees(
  supabase: { from: (table: string) => unknown },
  firmId: string,
) {
  try {
    return await listTimeLogAssigneesForFirm(firmId);
  } catch {
    const profiles = await fetchFirmProfileAssignees(supabase, firmId);
    return (profiles as { id: string; name: string | null; email: string }[]).map((p) => ({
      key: `p:${p.id}`,
      name: p.name || p.email || "Team member",
      email: p.email ?? null,
      profileId: p.id,
      firmMemberId: null,
    }));
  }
}

function assigneesToTeamRows(
  assignees: Awaited<ReturnType<typeof loadTimeLogAssignees>>,
) {
  return assignees.map((a) => ({
    id: a.profileId ?? a.firmMemberId!,
    name: a.name,
    email: a.email ?? "",
    role: "team",
    billable_rate: null,
    expected_hrs_per_week: null,
    billable_pct: null,
    color: null,
    assigneeKey: a.key,
    firmMemberId: a.firmMemberId,
    profileId: a.profileId,
  }));
}

function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(0, eh + em / 60 - (sh + sm / 60));
}

export const getCalendarData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ weekStart: dateStr }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, firm_id, role, billable_rate, is_super_admin, impersonated_firm_id")
      .eq("id", userId)
      .single();
    const firmId = profile?.impersonated_firm_id ?? profile?.firm_id ?? null;
    if (!profile?.id || !firmId) {
      return {
        profile, config: null, weekStart: data.weekStart, entries: [],
        projects: [], phases: [], activityGroups: [], team: [],
        workflowAttachments: [], projectSteps: [],
        canAssignTimeEntries: false,
      };
    }
    const start = new Date(data.weekStart + "T00:00:00");
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const endIso = end.toISOString().slice(0, 10);

    const callerProfile = profile as {
      id: string;
      firm_id: string;
      role: string;
      is_super_admin?: boolean | null;
      impersonated_firm_id?: string | null;
    };
    const canViewTeamEntries = canAssignTimeEntryUser(callerProfile);

    let entriesQ = supabase
      .from("time_entries")
      .select("*")
      .eq("firm_id", firmId)
      .gte("date", data.weekStart)
      .lt("date", endIso);
    if (!canViewTeamEntries) entriesQ = entriesQ.eq("user_id", userId);

    const role = callerProfile.role;
    const isFinancial = isFinancialRole(role) || !!callerProfile.is_super_admin;

    const [
      { data: entries },
      projectsResult,
      { data: phases },
      { data: ags },
      { data: activityTypes },
      teamProfiles,
      configResult,
      { data: workflowAttachmentsRaw },
      { data: projectStepsRaw },
    ] = await Promise.all([
        entriesQ,
        listFirmProjects(supabase, firmId, {
          select: PROJECT_SAFE_SELECT,
          excludeArchived: true,
          orderBy: { column: "name", ascending: true },
        }),
        supabase.from("project_phases").select("*"),
        supabase.from("activity_groups").select("*").eq("firm_id", firmId).order("name"),
        supabase
          .from("activity_types")
          .select("id, name, is_billable, is_default, is_system, color, sort_order")
          .eq("firm_id", firmId)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        canViewTeamEntries ? loadTimeLogAssignees(supabase, firmId) : Promise.resolve([]),
        isFinancial
          ? supabase.from("firm_config").select("*").eq("firm_id", firmId).maybeSingle()
          : supabase.from("firm_config_team_safe").select("*").eq("firm_id", firmId).maybeSingle(),
        supabase
          .from("project_workflow_attachments")
          .select(
            "id, project_id, sop_template_id, period_label, period_start, period_end, sort_order, sop_templates(name)",
          )
          .eq("firm_id", firmId)
          .order("sort_order"),
        supabase
          .from("project_steps")
          .select("id, project_id, project_phase_id, name, description, estimated_hrs, actual_hrs, sort_order")
          .eq("firm_id", firmId)
          .order("sort_order"),
      ]);

    const config = configResult.data;

    const projects = stripProjectsForRole(projectsResult.data ?? [], effectiveRole(callerProfile) as string);

    // filter phases to firm projects (no firm_id on phases table)
    const projectIds = new Set((projects ?? []).map((p) => p.id));
    const phasesScoped = (phases ?? []).filter((p) => projectIds.has(p.project_id));

    const workflowAttachments = (workflowAttachmentsRaw ?? [])
      .filter((a) => projectIds.has(a.project_id as string))
      .map((a) => {
        const tpl = a.sop_templates as { name?: string | null } | null;
        return {
          id: a.id as string,
          project_id: a.project_id as string,
          sop_template_id: a.sop_template_id as string,
          period_label: (a.period_label as string | null) ?? null,
          period_start: (a.period_start as string | null) ?? null,
          period_end: (a.period_end as string | null) ?? null,
          sort_order: Number(a.sort_order ?? 0),
          template_name: tpl?.name ?? null,
        };
      });

    const projectSteps = (projectStepsRaw ?? []).filter((s) => projectIds.has(s.project_id as string));

    const teamRows = canViewTeamEntries ? assigneesToTeamRows(teamProfiles as Awaited<ReturnType<typeof loadTimeLogAssignees>>) : [];

    return {
      profile, config, weekStart: data.weekStart,
      entries: entries ?? [], projects: projects ?? [],
      phases: phasesScoped, activityGroups: ags ?? [],
      activityTypes: activityTypes ?? [], team: teamRows,
      timeAssignees: teamProfiles ?? [],
      workflowAttachments,
      projectSteps: projectSteps ?? [],
      canAssignTimeEntries: canViewTeamEntries,
    };
  });

const entrySchema = z.object({
  id: z.string().uuid().optional(),
  date: dateStr,
  start_time: timeStr,
  end_time: timeStr,
  billable: z.boolean(),
  notes: z.string().max(500).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  project_id: z.string().uuid().optional().nullable(),
  project_phase_id: z.string().uuid().optional().nullable(),
  project_step_id: z.string().uuid().optional().nullable(),
  activity_group_id: z.string().uuid().optional().nullable(),
  activity_type_id: z.string().uuid().optional().nullable(),
  user_id: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v : undefined))
    .pipe(z.string().uuid().optional()),
  assignee_key: z
    .string()
    .regex(/^(p|m):[0-9a-f-]{36}$/i)
    .optional(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recomputePhaseActual(supabase: any, phaseId: string): Promise<void> {
  const { data } = await supabase.from("time_entries").select("hrs").eq("project_phase_id", phaseId);
  const total = (data ?? []).reduce((s: number, r: { hrs: number | null }) => s + Number(r.hrs || 0), 0);
  const { data: phase } = await supabase
    .from("project_phases")
    .select("expected_hrs")
    .eq("id", phaseId)
    .maybeSingle();
  const expected = Number(phase?.expected_hrs ?? 0);
  await supabase
    .from("project_phases")
    .update({ actual_hrs: total, phase_over_scope: total > expected })
    .eq("id", phaseId);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recomputeStepActual(supabase: any, stepId: string): Promise<void> {
  const { data } = await supabase.from("time_entries").select("hrs").eq("project_step_id", stepId);
  const total = (data ?? []).reduce((s: number, r: { hrs: number | null }) => s + Number(r.hrs || 0), 0);
  const { data: step } = await supabase
    .from("project_steps")
    .select("estimated_hrs")
    .eq("id", stepId)
    .maybeSingle();
  const expected = Number(step?.estimated_hrs ?? 0);
  await supabase.from("project_steps").update({ actual_hrs: total }).eq("id", stepId);
}

export const saveTimeEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => entrySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const writeProfile = await requireCanWrite(supabase, userId);
    const firmId = writeProfile.impersonated_firm_id ?? writeProfile.firm_id;
    const assigneeKey =
      data.assignee_key ??
      (data.user_id && canAssignTimeEntryUser(writeProfile) ? `p:${data.user_id}` : undefined);

    let targetUserId: string | null = userId;
    let targetFirmMemberId: string | null = null;

    if (assigneeKey && canAssignTimeEntryUser(writeProfile)) {
      if (!(await isAllowedTimeLogAssignee(firmId, assigneeKey))) {
        throw new Error("Team member not found");
      }
      const parsed = parseTimeLogAssigneeKey(assigneeKey);
      if (parsed.profileId) {
        targetUserId = parsed.profileId;
        targetFirmMemberId = parsed.firmMemberId;
      } else if (parsed.firmMemberId) {
        targetUserId = null;
        targetFirmMemberId = parsed.firmMemberId;
      }
    } else if (!canAssignTimeEntryUser(writeProfile)) {
      targetUserId = userId;
    }

    const hrs = hoursBetween(data.start_time, data.end_time);
    if (hrs <= 0) throw new Error("End time must be after start time");

    let projectId = data.project_id ?? null;
    if (!projectId && data.project_phase_id) {
      projectId = await resolveEntryProjectId(supabase, {
        project_phase_id: data.project_phase_id,
      });
    }

    const row = {
      user_id: targetUserId,
      firm_member_id: targetFirmMemberId,
      date: data.date,
      start_time: data.start_time,
      end_time: data.end_time,
      hrs,
      billable: data.billable,
      notes: data.notes ?? null,
      description: data.description ?? null,
      project_id: projectId,
      project_phase_id: data.project_phase_id ?? null,
      project_step_id: data.project_step_id ?? null,
      activity_group_id: data.activity_group_id ?? null,
      activity_type_id: data.activity_type_id ?? null,
    };

    if (data.id) {
      const { data: prev } = await supabase
        .from("time_entries")
        .select("project_phase_id, project_step_id, project_id, hrs")
        .eq("id", data.id)
        .single();
      const previousPhase = (prev?.project_phase_id as string | null) ?? null;
      const previousStep = (prev?.project_step_id as string | null) ?? null;
      const prevProjectId =
        (prev?.project_id as string | null) ??
        (previousPhase
          ? await resolveEntryProjectId(supabase, { project_phase_id: previousPhase })
          : null);

      const effectiveProjectId = projectId ?? prevProjectId;
      if (effectiveProjectId && !projectId) {
        projectId = effectiveProjectId;
        row.project_id = effectiveProjectId;
      }

      const hoursBeforeUpdate = effectiveProjectId
        ? await sumProjectHours(supabase, effectiveProjectId)
        : 0;

      const { error } = await supabase
        .from("time_entries")
        .update({ firm_id: firmId, ...row })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      const toRecount = new Set<string>();
      if (row.project_phase_id) toRecount.add(row.project_phase_id);
      if (previousPhase && previousPhase !== row.project_phase_id) toRecount.add(previousPhase);
      for (const phaseId of toRecount) {
        await recomputePhaseActual(supabase, phaseId);
      }
      const toRecountSteps = new Set<string>();
      if (row.project_step_id) toRecountSteps.add(row.project_step_id);
      if (previousStep && previousStep !== row.project_step_id) toRecountSteps.add(previousStep);
      for (const stepId of toRecountSteps) {
        await recomputeStepActual(supabase, stepId);
      }

      if (projectId) {
        await logMarginImpactForProjectHoursChange({
          supabase,
          projectId,
          firmId,
          userId,
          hoursBefore: hoursBeforeUpdate,
          note: `Time entry updated (${fmtHrs(hrs)} hr)`,
        });
      }
      if (prevProjectId && prevProjectId !== projectId) {
        await logMarginImpactForProjectHoursChange({
          supabase,
          projectId: prevProjectId,
          firmId,
          userId,
          hoursBefore: await sumProjectHours(supabase, prevProjectId),
          note: "Time entry moved to another project",
        });
      }

      return { ok: true, id: data.id };
    }

    // New entries: direct insert (RPC doesn't yet accept activity_type_id / description),
    // then recompute the phase actuals.
    const hoursBeforeInsert = projectId ? await sumProjectHours(supabase, projectId) : 0;

    const { data: inserted, error } = await supabase
      .from("time_entries")
      .insert({ firm_id: firmId, ...row })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (row.project_phase_id) {
      await recomputePhaseActual(supabase, row.project_phase_id);
    }
    if (row.project_step_id) {
      await recomputeStepActual(supabase, row.project_step_id);
    }

    if (projectId) {
      await logMarginImpactForProjectHoursChange({
        supabase,
        projectId,
        firmId,
        userId,
        hoursBefore: hoursBeforeInsert,
        note: `Time logged (${fmtHrs(hrs)} hr)`,
      });
    }

    return { ok: true, id: inserted.id as string };
  });

function fmtHrs(n: number): string {
  const r = Math.round(n * 10) / 10;
  return r % 1 === 0 ? String(r) : r.toFixed(1);
}

export const deleteTimeEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requireCanWrite(supabase, userId);

    const { data: prev } = await supabase
      .from("time_entries")
      .select("project_phase_id, project_step_id, project_id, hrs")
      .eq("id", data.id)
      .single();
    const projectId = await resolveEntryProjectId(supabase, {
      project_id: prev?.project_id as string | null,
      project_phase_id: prev?.project_phase_id as string | null,
    });
    const hoursBefore = projectId ? await sumProjectHours(supabase, projectId) : 0;
    const removedHrs = Number(prev?.hrs) || 0;

    const { error } = await supabase.from("time_entries").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (prev?.project_phase_id) {
      await recomputePhaseActual(supabase, prev.project_phase_id as string);
    }
    if (prev?.project_step_id) {
      await recomputeStepActual(supabase, prev.project_step_id as string);
    }

    if (projectId && removedHrs > 0) {
      await logMarginImpactForProjectHoursChange({
        supabase,
        projectId,
        firmId: profile.firm_id,
        userId,
        hoursBefore,
        note: `Time entry deleted (${fmtHrs(removedHrs)} hr removed)`,
      });
    }

    return { ok: true };
  });

const targetsSchema = z.object({
  target_billable_hrs_per_week: z.number().min(0).max(168).optional().nullable(),
  rate_billed: z.number().min(0).max(100000).optional().nullable(),
});

export const listTimeAssignees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const profile = await getCallerProfile(supabase, userId);
    await requireCanWrite(supabase, userId);
    if (!canAssignTimeEntryUser(profile)) {
      return { assignees: [] as { id: string; name: string | null; email: string }[] };
    }
    const firmId = profile.impersonated_firm_id ?? profile.firm_id;
    const rows = await loadTimeLogAssignees(supabase, firmId);
    return {
      assignees: rows.map((a) => ({
        key: a.key,
        id: a.profileId ?? a.firmMemberId!,
        name: a.name,
        email: a.email,
        profileId: a.profileId,
        firmMemberId: a.firmMemberId,
      })),
    };
  });

export const updateTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => targetsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("firm_id, role").eq("id", userId).single();
    if (!profile?.firm_id) throw new Error("No firm");
    if (!["principal", "admin"].includes(profile.role as string)) throw new Error("Not allowed");
    const { error } = await supabase
      .from("firm_config")
      .upsert({ firm_id: profile.firm_id, ...data, updated_at: new Date().toISOString() }, { onConflict: "firm_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });