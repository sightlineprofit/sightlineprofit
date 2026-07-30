import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ACCESS_RESTRICTED,
  effectiveRole,
  getCallerProfile,
  isFinancialRole,
  requireCanWrite,
  resolveTimeEntryTargetUserId,
} from "@/lib/auth-guards.server";
import { getCurrentFirmMemberId } from "@/lib/firm-member.server";
import { PROJECT_SAFE_SELECT, stripProjectForRole } from "@/lib/project-safety.server";

const ACTIVE_STATUSES = ["active", "pipeline", "pursuit"] as const;

function startOfWeekIso(d = new Date()): string {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  const day = s.getDay();
  s.setDate(s.getDate() - (day === 0 ? 6 : day - 1));
  return s.toISOString().slice(0, 10);
}

function endOfWeekIso(d = new Date()): string {
  const s = new Date(startOfWeekIso(d) + "T00:00:00");
  s.setDate(s.getDate() + 6);
  return s.toISOString().slice(0, 10);
}

function greetingForHour(h: number): string {
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

async function resolveMyWorkMemberId(
  supabase: { from: (table: string) => unknown },
  userId: string,
  firmId: string,
  previewMemberId?: string | null,
) {
  const profile = await getCallerProfile(supabase, userId);
  const role = effectiveRole(profile);

  if (previewMemberId) {
    if (!isFinancialRole(role) && !profile.is_super_admin) {
      throw new Error(ACCESS_RESTRICTED);
    }
    const { data: member } = await (supabase as any)
      .from("firm_members")
      .select("id, name, firm_id")
      .eq("id", previewMemberId)
      .eq("firm_id", firmId)
      .maybeSingle();
    if (!member) throw new Error("Team member not found");
    return { profile, role, firmMemberId: member.id as string, previewMode: true, previewName: member.name as string };
  }

  if (role !== "team" && role !== "view_only" && !profile.is_super_admin) {
    throw new Error(ACCESS_RESTRICTED);
  }

  const firmMemberId = await getCurrentFirmMemberId(supabase, userId, firmId);
  return { profile, role, firmMemberId, previewMode: false, previewName: null as string | null };
}

export const getMyWorkData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ previewMemberId: z.string().uuid().optional().nullable() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("id, firm_id, role, name, email, is_super_admin, impersonated_firm_id")
      .eq("id", userId)
      .single();
    if (profErr || !profile?.firm_id) throw new Error("No firm");
    const firmId = profile.impersonated_firm_id ?? profile.firm_id;

    const ctx = await resolveMyWorkMemberId(supabase, userId, firmId, data.previewMemberId);
    const role = ctx.role;

    if (!ctx.firmMemberId) {
      return {
        previewMode: ctx.previewMode,
        previewName: ctx.previewName,
        displayName: profile.name || profile.email?.split("@")[0] || "there",
        firmName: null as string | null,
        greeting: greetingForHour(new Date().getHours()),
        weekHours: 0,
        activeProjectCount: 0,
        upcomingMilestoneCount: 0,
        projects: [] as unknown[],
        recentEntries: [] as unknown[],
        firmMemberId: null,
      };
    }

    const weekStart = startOfWeekIso();
    const weekEnd = endOfWeekIso();
    const today = new Date().toISOString().slice(0, 10);
    const in14 = new Date();
    in14.setDate(in14.getDate() + 14);
    const in14Iso = in14.toISOString().slice(0, 10);
    const in60 = new Date();
    in60.setDate(in60.getDate() + 60);
    const in60Iso = in60.toISOString().slice(0, 10);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoIso = weekAgo.toISOString().slice(0, 10);

    const [{ data: firm }, { data: assignments }] = await Promise.all([
      supabase.from("firms").select("name").eq("id", firmId).maybeSingle(),
      supabase
        .from("project_assignments")
        .select("project_id, role_on_project")
        .eq("firm_id", firmId)
        .eq("assignee_id", ctx.firmMemberId),
    ]);

    const projectIds = (assignments ?? []).map((a: { project_id: string }) => a.project_id);
    if (!projectIds.length) {
      const [{ data: weekEntries }, { data: recentEntries }] = await Promise.all([
        supabase
          .from("time_entries")
          .select("hrs")
          .eq("firm_id", firmId)
          .eq("user_id", userId)
          .gte("date", weekStart)
          .lte("date", weekEnd),
        supabase
          .from("time_entries")
          .select("id, date, hrs, billable, project_id, projects(name)")
          .eq("firm_id", firmId)
          .eq("user_id", userId)
          .gte("date", weekAgoIso)
          .order("date", { ascending: false })
          .limit(5),
      ]);
      const weekHours = (weekEntries ?? []).reduce((s: number, e: { hrs: number }) => s + Number(e.hrs || 0), 0);
      return {
        previewMode: ctx.previewMode,
        previewName: ctx.previewName,
        displayName: profile.name || profile.email?.split("@")[0] || "there",
        firmName: (firm?.name as string) ?? null,
        greeting: greetingForHour(new Date().getHours()),
        weekHours,
        activeProjectCount: 0,
        upcomingMilestoneCount: 0,
        projects: [],
        recentEntries: recentEntries ?? [],
        firmMemberId: ctx.firmMemberId,
      };
    }

    const [{ data: projectsRaw }, { data: phases }, { data: stepAssignees }, { data: milestones }, { data: timeEntries }, { data: weekEntries }] =
      await Promise.all([
        supabase
          .from("projects")
          .select(PROJECT_SAFE_SELECT)
          .eq("firm_id", firmId)
          .in("id", projectIds)
          .in("status", [...ACTIVE_STATUSES])
          .is("deleted_at", null)
          .order("start_date", { ascending: true, nullsFirst: false }),
        supabase.from("project_phases").select("id, project_id, expected_hrs, actual_hrs, name").in("project_id", projectIds),
        supabase
          .from("project_step_assignees")
          .select("id, firm_member_id, estimated_hrs, project_step_id, project_steps(id, project_phase_id, description, completed_at)")
          .eq("firm_member_id", ctx.firmMemberId),
        supabase
          .from("project_milestones")
          .select("id, project_id, label, milestone_date")
          .in("project_id", projectIds)
          .gte("milestone_date", today)
          .lte("milestone_date", in60Iso)
          .order("milestone_date", { ascending: true }),
        supabase
          .from("time_entries")
          .select("hrs, project_id, project_phase_id, user_id")
          .eq("firm_id", firmId)
          .in("project_id", projectIds),
        supabase
          .from("time_entries")
          .select("hrs")
          .eq("firm_id", firmId)
          .eq("user_id", userId)
          .gte("date", weekStart)
          .lte("date", weekEnd),
      ]);

    const phaseIds = new Set((phases ?? []).map((p: { id: string }) => p.id));
    const myEntries = (timeEntries ?? []).filter((e: { user_id: string }) => e.user_id === userId);

    const projects = (projectsRaw ?? []).map((p: Record<string, unknown>) => {
      const pid = p.id as string;
      const myAssignedHrs = (stepAssignees ?? [])
        .filter((sa: { project_steps?: { project_phase_id?: string } | null }) => {
          const phaseId = sa.project_steps?.project_phase_id;
          if (!phaseId) return false;
          const phase = (phases ?? []).find((ph: { id: string; project_id: string }) => ph.id === phaseId);
          return phase?.project_id === pid;
        })
        .reduce((s: number, sa: { estimated_hrs: number }) => s + Number(sa.estimated_hrs || 0), 0);

      const myLoggedHrs = myEntries
        .filter((e: { project_id: string | null }) => e.project_id === pid)
        .reduce((s: number, e: { hrs: number }) => s + Number(e.hrs || 0), 0);

      const projectMilestones = (milestones ?? []).filter((m: { project_id: string }) => m.project_id === pid);
      const nextMilestone = projectMilestones[0] ?? null;

      const myTasks = (stepAssignees ?? []).filter((sa: { project_steps?: { project_phase_id?: string } | null }) => {
        const phaseId = sa.project_steps?.project_phase_id;
        if (!phaseId) return false;
        return (phases ?? []).some((ph: { id: string; project_id: string }) => ph.id === phaseId && ph.project_id === pid);
      });
      const completedTasks = myTasks.filter(
        (t: { project_steps?: { completed_at?: string | null } | null }) => !!t.project_steps?.completed_at,
      ).length;

      const roleOnProject =
        (assignments ?? []).find((a: { project_id: string; role_on_project?: string | null }) => a.project_id === pid)
          ?.role_on_project ?? null;

      return {
        ...stripProjectForRole(p, role),
        roleOnProject,
        myAssignedHrs,
        myLoggedHrs,
        nextMilestone,
        taskCount: myTasks.length,
        completedTaskCount: completedTasks,
      };
    });

    const upcomingMilestoneCount = (milestones ?? []).filter(
      (m: { milestone_date: string }) => m.milestone_date <= in14Iso,
    ).length;

    const weekHours = (weekEntries ?? []).reduce((s: number, e: { hrs: number }) => s + Number(e.hrs || 0), 0);

    const { data: recentEntries } = await supabase
      .from("time_entries")
      .select("id, date, hrs, billable, project_id, projects(name)")
      .eq("firm_id", firmId)
      .eq("user_id", userId)
      .gte("date", weekAgoIso)
      .order("date", { ascending: false })
      .limit(5);

    return {
      previewMode: ctx.previewMode,
      previewName: ctx.previewName,
      displayName: profile.name || profile.email?.split("@")[0] || "there",
      firmName: (firm?.name as string) ?? null,
      greeting: greetingForHour(new Date().getHours()),
      weekHours,
      activeProjectCount: projects.length,
      upcomingMilestoneCount,
      projects,
      recentEntries: recentEntries ?? [],
      firmMemberId: ctx.firmMemberId,
    };
  });

export const getMyWorkProjectDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        projectId: z.string().uuid(),
        previewMemberId: z.string().uuid().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await getCallerProfile(supabase, userId);
    const firmId = profile.impersonated_firm_id ?? profile.firm_id;
    if (!firmId) throw new Error("No firm");

    const ctx = await resolveMyWorkMemberId(supabase, userId, firmId, data.previewMemberId);
    const role = ctx.role;

    if (!ctx.firmMemberId) throw new Error("No team roster entry linked to your account");

    const { data: assignment } = await supabase
      .from("project_assignments")
      .select("id")
      .eq("project_id", data.projectId)
      .eq("assignee_id", ctx.firmMemberId)
      .eq("firm_id", firmId)
      .maybeSingle();

    if (!assignment) throw new Error("NOT_ASSIGNED");

    const today = new Date().toISOString().slice(0, 10);
    const in60 = new Date();
    in60.setDate(in60.getDate() + 60);
    const in60Iso = in60.toISOString().slice(0, 10);

    const { data: phases } = await supabase
      .from("project_phases")
      .select("id, name, expected_hrs, actual_hrs, sort_order, sop_phase_id")
      .eq("project_id", data.projectId)
      .order("sort_order");

    const phaseIds = (phases ?? []).map((p: { id: string }) => p.id);
    const sopPhaseIds = (phases ?? [])
      .map((p: { sop_phase_id?: string | null }) => p.sop_phase_id)
      .filter((id): id is string => !!id);

    const [{ data: project }, { data: steps }, { data: stepAssignees }, { data: milestones }, { data: entries }, { data: sopPhases }] =
      await Promise.all([
        supabase
          .from("projects")
          .select(PROJECT_SAFE_SELECT)
          .eq("id", data.projectId)
          .eq("firm_id", firmId)
          .single(),
        phaseIds.length
          ? supabase
              .from("project_steps")
              .select("id, description, estimated_hrs, actual_hrs, sort_order, project_phase_id, completed_at, sop_step_id, steps")
              .in("project_phase_id", phaseIds)
              .order("sort_order")
          : Promise.resolve({ data: [] }),
        supabase
          .from("project_step_assignees")
          .select("id, firm_member_id, estimated_hrs, is_billable, project_step_id")
          .eq("firm_member_id", ctx.firmMemberId),
        supabase
          .from("project_milestones")
          .select("id, label, milestone_date, sort_order")
          .eq("project_id", data.projectId)
          .order("milestone_date", { ascending: true }),
        supabase
          .from("time_entries")
          .select("hrs, project_phase_id, project_id, user_id")
          .eq("project_id", data.projectId)
          .eq("user_id", userId),
        sopPhaseIds.length
          ? supabase.from("sop_phases").select("id, description").in("id", sopPhaseIds)
          : Promise.resolve({ data: [] }),
      ]);

    if (!project) throw new Error("Project not found");

    const myStepIds = new Set(
      (stepAssignees ?? []).map((sa: { project_step_id: string }) => sa.project_step_id),
    );
    const mySteps = (steps ?? []).filter((s: { id: string }) => myStepIds.has(s.id));

    const phasesWithTasks = (phases ?? []).map((phase: Record<string, unknown>) => {
      const phaseSteps = mySteps.filter((s: { project_phase_id: string }) => s.project_phase_id === phase.id);
      const myLogged = (entries ?? [])
        .filter((e: { project_phase_id: string | null }) => e.project_phase_id === phase.id)
        .reduce((sum: number, e: { hrs: number }) => sum + Number(e.hrs || 0), 0);
      const myAssigned = phaseSteps.reduce(
        (sum: number, s: { estimated_hrs: number }) => sum + Number(s.estimated_hrs || 0),
        0,
      );
      return {
        ...phase,
        myLoggedHrs: myLogged,
        myAssignedHrs: myAssigned,
        tasks: phaseSteps.map((step: Record<string, unknown>) => {
          const assignee = (stepAssignees ?? []).find(
            (sa: { project_step_id: string }) => sa.project_step_id === step.id,
          );
          const logged = (entries ?? [])
            .filter((e: { project_phase_id: string | null }) => e.project_phase_id === step.project_phase_id)
            .reduce((s: number, e: { hrs: number }) => s + Number(e.hrs || 0), 0);
          return {
            ...step,
            isBillable: assignee?.is_billable ?? true,
            myEstimatedHrs: Number(assignee?.estimated_hrs ?? step.estimated_hrs ?? 0),
            myLoggedHrs: logged,
          };
        }),
      };
    }).filter((p: { tasks: unknown[] }) => p.tasks.length > 0);

    const upcomingMilestones = (milestones ?? []).filter(
      (m: { milestone_date: string }) => m.milestone_date >= today && m.milestone_date <= in60Iso,
    );

    return {
      previewMode: ctx.previewMode,
      previewName: ctx.previewName,
      role,
      project: stripProjectForRole(project as Record<string, unknown>, role),
      phases: phasesWithTasks,
      milestones: milestones ?? [],
      upcomingMilestones,
      sopPhases: sopPhases ?? [],
    };
  });

export const toggleMyWorkStepComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ stepId: z.string().uuid(), completed: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireCanWrite(supabase, userId);

    const { error } = await supabase
      .from("project_steps")
      .update({ completed_at: data.completed ? new Date().toISOString() : null })
      .eq("id", data.stepId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleMyWorkStepItemComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        stepId: z.string().uuid(),
        order: z.number().int(),
        completed: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requireCanWrite(supabase, userId);
    const firmId = profile.impersonated_firm_id ?? profile.firm_id;
    if (!firmId) throw new Error("No firm");

    const ctx = await resolveMyWorkMemberId(supabase, userId, firmId, null);
    if (!ctx.firmMemberId) throw new Error("No team roster entry linked to your account");

    const { data: assignee } = await supabase
      .from("project_step_assignees")
      .select("id")
      .eq("project_step_id", data.stepId)
      .eq("firm_member_id", ctx.firmMemberId)
      .maybeSingle();
    if (!assignee) throw new Error("Not assigned to this task");

    const { data: row, error: fetchErr } = await supabase
      .from("project_steps")
      .select("id, steps, completed_at")
      .eq("id", data.stepId)
      .single();
    if (fetchErr || !row) throw new Error("Step not found");

    const items = Array.isArray(row.steps) ? (row.steps as Array<Record<string, unknown>>) : [];
    const idx = items.findIndex((s) => s.order === data.order);
    if (idx < 0) throw new Error("Sub-step not found");

    const updated = items.map((s, i) => {
      if (i !== idx) return s;
      if (data.completed) {
        return { ...s, completed_at: new Date().toISOString() };
      }
      const { completed_at: _removed, ...rest } = s;
      return rest;
    });

    const allDone =
      updated.length > 0 &&
      updated.every((s) => typeof s.completed_at === "string" && !!s.completed_at);

    const patch: Record<string, unknown> = { steps: updated };
    if (allDone) {
      patch.completed_at = new Date().toISOString();
    } else if (row.completed_at) {
      patch.completed_at = null;
    }

    const { error } = await supabase.from("project_steps").update(patch).eq("id", data.stepId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveQuickTimeEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        hrs: z.number().min(0.25).max(24),
        billable: z.boolean(),
        notes: z.string().max(500).optional().nullable(),
        project_id: z.string().uuid(),
        project_phase_id: z.string().uuid().optional().nullable(),
        user_id: z.string().uuid().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requireCanWrite(supabase, userId);
    if (!profile.firm_id) throw new Error("No firm");
    const targetUser = await resolveTimeEntryTargetUserId(supabase, profile, userId, data.user_id);

    const startH = 9;
    const endH = startH + data.hrs;
    const fmt = (h: number) => {
      const hh = Math.floor(h);
      const mm = Math.round((h - hh) * 60);
      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
    };

    let phaseId = data.project_phase_id ?? null;
    if (!phaseId) {
      const { data: phase } = await supabase
        .from("project_phases")
        .select("id")
        .eq("project_id", data.project_id)
        .order("sort_order")
        .limit(1)
        .maybeSingle();
      phaseId = (phase?.id as string) ?? null;
    }

    const { data: row, error } = await supabase
      .from("time_entries")
      .insert({
        firm_id: profile.firm_id,
        user_id: targetUser,
        project_id: data.project_id,
        project_phase_id: phaseId,
        date: data.date,
        start_time: fmt(startH),
        end_time: fmt(endH),
        hrs: data.hrs,
        billable: data.billable,
        notes: data.notes ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (phaseId) {
      const { data: phaseEntries } = await supabase
        .from("time_entries")
        .select("hrs")
        .eq("project_phase_id", phaseId);
      const total = (phaseEntries ?? []).reduce((s: number, r: { hrs: number }) => s + Number(r.hrs || 0), 0);
      const { data: phaseRow } = await supabase
        .from("project_phases")
        .select("expected_hrs")
        .eq("id", phaseId)
        .single();
      await supabase
        .from("project_phases")
        .update({
          actual_hrs: total,
          phase_over_scope: total > Number(phaseRow?.expected_hrs || 0),
        })
        .eq("id", phaseId);
    }

    return { id: row.id };
  });
