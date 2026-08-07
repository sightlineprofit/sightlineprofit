import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  calc as calcFinance,
  getProjectMarginCalc,
  buildSnapshotFromCalc,
  getProjectFinancials,
  projectHoursBreakdownFromEntries,
  projectHoursBreakdownFromPhases,
  breakEvenResultFromSnapshot,
  type Expense,
  type FirmConfig,
} from "@/lib/finance";
import {
  copySopAssigneesToProjectSteps,
  fetchProjectStepAssigneeRows,
  isTaskAssigneeSchemaMissingError,
  listFirmMembersForAssigneePicker,
  refreshProjectCostSnapshot,
} from "@/lib/project-cost-snapshot.server";
import {
  logMarginImpactForProjectHoursChange,
  resolveEntryProjectId,
  sumProjectHours,
} from "@/lib/project-margin-audit.server";
import {
  listDeletedFirmProjects,
  listFirmProjects,
  requireProjectLifecycleMigration,
  isMissingProjectLifecycleColumn,
} from "@/lib/project-lifecycle.server";
import {
  isFinancialRole,
  requireCanWrite,
  requirePrincipalOrAdmin,
} from "@/lib/auth-guards.server";
import { insertProjectWithSchemaFallback, stripProjectForRole } from "@/lib/project-safety.server";

function assigneeDbError(error: { message: string }): Error {
  if (isTaskAssigneeSchemaMissingError(error)) {
    return new Error(
      "Team assignments require a database update. In the Supabase SQL editor, run supabase/migrations/20260716120000_task_assignee_cost_basis.sql",
    );
  }
  return new Error(error.message);
}

export const getProjectList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requirePrincipalOrAdmin(supabase, userId);
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id, role")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) return { projects: [], deletedProjects: [], config: null, isAdmin: false };
    const isAdmin = profile.role === "principal" || profile.role === "admin";
    const [projectsResult, { data: phases }, { data: config }, { data: team }, { data: expenses }, deletedResult] =
      await Promise.all([
        listFirmProjects(supabase, profile.firm_id),
        supabase.from("project_phases").select("project_id, expected_hrs, actual_hrs"),
        supabase.from("firm_config").select("*").eq("firm_id", profile.firm_id).maybeSingle(),
        supabase.from("profiles").select("id, cost_rate, billable_rate").eq("firm_id", profile.firm_id),
        supabase.from("expenses").select("*").eq("firm_id", profile.firm_id),
        isAdmin ? listDeletedFirmProjects(supabase, profile.firm_id) : Promise.resolve({ data: [], lifecycleReady: false }),
      ]);
    const projects = projectsResult.data;
    const deletedProjects = deletedResult.data;
    const totals: Record<string, { scoped: number; actual: number }> = {};
    for (const p of phases ?? []) {
      const t = (totals[p.project_id] ||= { scoped: 0, actual: 0 });
      t.scoped += Number(p.expected_hrs || 0);
      t.actual += Number(p.actual_hrs || 0);
    }

    const projectIds = (projects ?? []).map((p) => p.id);
    const { data: entries } = projectIds.length
      ? await supabase
          .from("time_entries")
          .select("project_id, user_id, hrs, billable, date")
          .in("project_id", projectIds)
      : { data: [] as Array<{ project_id: string | null; user_id: string; hrs: number; billable: boolean; date: string }> };

    // Locked cost snapshots per project (Phase 1). Nullable per project;
    // the card handles the missing case with a setup prompt.
    const { data: snapshotRows } = projectIds.length
      ? await (supabase.from("project_cost_snapshots") as any)
          .select("*")
          .in("project_id", projectIds)
      : { data: [] as Array<any> };
    const snapshotByProject = new Map<string, any>();
    for (const s of (snapshotRows ?? []) as Array<{ project_id: string }>) {
      if (!snapshotByProject.has(s.project_id)) snapshotByProject.set(s.project_id, s);
    }

    // Pull most recent 'nothing_to_report' event per project so the freshness
    // clock resets on a legitimate override (see project detail page).
    const { data: ntrRows } = projectIds.length
      ? await supabase
          .from("project_activity_log")
          .select("project_id, occurred_at")
          .eq("event_type", "nothing_to_report")
          .in("project_id", projectIds)
          .order("occurred_at", { ascending: false })
      : { data: [] as Array<{ project_id: string; occurred_at: string }> };
    const lastNtrByProject = new Map<string, string>();
    for (const r of ntrRows ?? []) {
      if (!lastNtrByProject.has(r.project_id)) {
        // First hit is the most recent thanks to the order clause.
        // Store as YYYY-MM-DD so it composes with time_entries.date below.
        lastNtrByProject.set(r.project_id, String(r.occurred_at).slice(0, 10));
      }
    }

    const costRateByUser = new Map<string, number>();
    const billRateByUser = new Map<string, number>();
    for (const t of team ?? []) {
      if (t.cost_rate != null) costRateByUser.set(t.id, Number(t.cost_rate));
      if (t.billable_rate != null) billRateByUser.set(t.id, Number(t.billable_rate));
    }

    // Firm break-even as fallback cost rate
    const fin = calcFinance(config as FirmConfig | null, (expenses ?? []) as unknown as Expense[]);
    const firmBreakEven = Number(fin.breakEvenRate) || 0;
    const firmBilledRate = Number((config as { rate_billed?: number } | null)?.rate_billed) || 0;
    const firmAlignedRate = Number(fin.alignedRate) || 0;

    const now = Date.now();
    const weekAgo = now - 7 * 24 * 3600 * 1000;

    type Agg = {
      totalCost: number;
      weeklyCost: number;
      revenue: number;
      hasAnyEntry: boolean;
      usingFallbackCostRate: boolean;
      lastEntryAt: string | null;
      hoursLogged: number;
      hoursLoggedThisMonth: number;
    };
    const agg: Record<string, Agg> = {};
    const monthStartIso = new Date(now);
    monthStartIso.setDate(1);
    const monthStart = monthStartIso.toISOString().slice(0, 10);
    for (const e of entries ?? []) {
      if (!e.project_id) continue;
      const a = (agg[e.project_id] ||= {
        totalCost: 0, weeklyCost: 0, revenue: 0, hasAnyEntry: false, usingFallbackCostRate: false, lastEntryAt: null, hoursLogged: 0, hoursLoggedThisMonth: 0,
      });
      a.hasAnyEntry = true;
      const hrs = Number(e.hrs || 0);
      a.hoursLogged += hrs;
      if ((e.date as string) >= monthStart) a.hoursLoggedThisMonth += hrs;
      let cr = costRateByUser.get(e.user_id);
      if (cr == null) { cr = firmBreakEven; a.usingFallbackCostRate = true; }
      const cost = hrs * (cr || 0);
      a.totalCost += cost;
      const ts = new Date(e.date).getTime();
      if (!Number.isNaN(ts) && ts >= weekAgo) a.weeklyCost += cost;
      if (!a.lastEntryAt || (e.date as string) > a.lastEntryAt) a.lastEntryAt = e.date as string;
      if (e.billable) {
        const br = billRateByUser.get(e.user_id) ?? firmBilledRate;
        a.revenue += hrs * (br || 0);
      }
    }

    return {
      config,
      firmMetrics: {
        breakEvenRate: firmBreakEven,
        alignedRate: firmAlignedRate,
        perHour: fin.perHour,
      },
      projects: (projects ?? []).map((p) => {
        const a = agg[p.id] ?? { totalCost: 0, weeklyCost: 0, revenue: 0, hasAnyEntry: false, usingFallbackCostRate: false, lastEntryAt: null, hoursLogged: 0, hoursLoggedThisMonth: 0 };
        const fixedFee = Number((p as { fixed_fee?: number | null }).fixed_fee) || 0;
        const scopedRate = Number(p.scoped_rate) || 0;
        const scopedHrs = totals[p.id]?.scoped ?? Number(p.scoped_hrs || 0);
        const mode: "fixed" | "hourly" | "none" = fixedFee > 0 ? "fixed" : scopedRate > 0 ? "hourly" : "none";
        let projectFee = 0;
        if (mode === "fixed") {
          projectFee = fixedFee;
        } else if (mode === "hourly") {
          projectFee = scopedRate * scopedHrs;
        }
        const actualHrs = totals[p.id]?.actual ?? 0;
        const marginCalc = mode === "none"
          ? null
          : getProjectMarginCalc({
              projectFee,
              scopedHours: scopedHrs,
              hoursLogged: actualHrs,
              breakEvenRate: firmBreakEven,
              alignedRate: firmAlignedRate,
            });
        const marginRemaining = marginCalc ? marginCalc.remainingMargin : null;
        // Freshness computation.
        // lastActivityAt = MAX(most recent time entry, most recent
        // 'nothing_to_report' override). Real time entries live in
        // time_entries; the override lives in project_activity_log.
        const lastNtr = lastNtrByProject.get(p.id) ?? null;
        const lastActivityAt =
          a.lastEntryAt && lastNtr
            ? (a.lastEntryAt > lastNtr ? a.lastEntryAt : lastNtr)
            : (a.lastEntryAt ?? lastNtr);
        let daysSince: number | null = null;
        if (lastActivityAt) {
          const ts = new Date(lastActivityAt as string).getTime();
          if (!Number.isNaN(ts)) daysSince = Math.floor((now - ts) / (24 * 3600 * 1000));
        }
        // "new" = no history at all (no time entries, no NTR override) AND
        // the project hasn't started yet (or has no start date). Retroactive
        // projects (past start date, no entries) still surface as critical
        // so the user is prompted to backfill hours.
        const startRaw = (p as { start_date?: string | null }).start_date ?? null;
        const todayIso = new Date(now).toISOString().slice(0, 10);
        const hasHistory = a.hasAnyEntry || lastNtr != null;
        const notStarted = !startRaw || (startRaw as string) >= todayIso;
        let freshnessState: "new" | "current" | "stale" | "critical";
        if (!hasHistory && notStarted) freshnessState = "new";
        else if (daysSince == null) freshnessState = "critical";
        else if (daysSince < 7) freshnessState = "current";
        else if (daysSince <= 20) freshnessState = "stale";
        else freshnessState = "critical";
        return {
          ...p,
          totals: totals[p.id] ?? { scoped: Number(p.scoped_hrs || 0), actual: 0 },
          snapshot: snapshotByProject.get(p.id) ?? null,
          hoursLogged: a.hoursLogged,
          hoursLoggedThisMonth: a.hoursLoggedThisMonth,
          lastEntryDate: a.lastEntryAt,
          freshness: {
            lastEntryAt: lastActivityAt,
            daysSince,
            state: freshnessState,
          },
          margin: {
            mode,
            projectFee,
            totalCost: a.totalCost,
            weeklyCost: a.weeklyCost,
            revenue: a.revenue,
            remaining: marginRemaining,
            hasAnyEntry: a.hasAnyEntry,
            usingFallbackCostRate: a.usingFallbackCostRate,
            calc: marginCalc,
          },
        };
      }),
      deletedProjects,
      isAdmin,
    };
  });

export const getProjectDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id, role")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) throw new Error("No firm");
    const isFinancialUser = isFinancialRole(profile.role as string);
    const isPrincipal = profile.role === "principal";
    const isAdmin = profile.role === "principal" || profile.role === "admin";
    const [
      { data: project }, { data: phases }, { data: entries }, configResult,
      { data: template }, { data: team }, { data: activityLog }, { data: milestones },
      expensesResult, ownerCompResult, teamBurdensResult,
    ] = await Promise.all([
      supabase.from("projects").select("*").eq("id", data.id).eq("firm_id", profile.firm_id).single(),
      supabase.from("project_phases").select("*").eq("project_id", data.id).order("sort_order"),
      supabase.from("time_entries").select("*").eq("project_id", data.id).order("date", { ascending: false }),
      isFinancialUser
        ? supabase.from("firm_config").select("*").eq("firm_id", profile.firm_id).maybeSingle()
        : supabase.from("firm_config_team_safe").select("*").eq("firm_id", profile.firm_id).maybeSingle(),
      supabase.from("projects").select("sop_template_id").eq("id", data.id).single().then(async (r) => {
        const tid = r.data?.sop_template_id;
        if (!tid) return { data: null };
        return supabase.from("sop_templates").select("id, name, category").eq("id", tid).maybeSingle();
      }),
      supabase.from("profiles").select("id, name, email, cost_rate, billable_rate").eq("firm_id", profile.firm_id),
      supabase.from("project_activity_log").select("*").eq("project_id", data.id).order("occurred_at", { ascending: false }),
      supabase.from("project_milestones").select("*").eq("project_id", data.id).order("milestone_date"),
      isFinancialUser
        ? supabase.from("expenses").select("*").eq("firm_id", profile.firm_id)
        : Promise.resolve({ data: [] as never[] }),
      isFinancialUser
        ? supabase.from("owner_compensation").select("*").eq("firm_id", profile.firm_id)
        : Promise.resolve({ data: [] as never[] }),
      isFinancialUser
        ? supabase
            .from("firm_members")
            .select("burdened_weekly_cost, weeks_per_year, role_type, expected_hrs_per_week, billed_rate")
            .eq("firm_id", profile.firm_id)
            .eq("is_active", true)
            .neq("role_type", "principal")
        : Promise.resolve({ data: [] as never[] }),
    ]);
    const config = configResult.data;
    const expenses = expensesResult.data;
    const ownerComp = ownerCompResult.data;
    const teamBurdens = teamBurdensResult.data;
    if (!project) throw new Error("Project not found");
    if ((project as { deleted_at?: string | null }).deleted_at && !isAdmin) {
      throw new Error("Project not found");
    }
    const phaseIds = (phases ?? []).map((p) => p.id);
    const { data: steps } = phaseIds.length
      ? await supabase.from("project_steps").select("*").in("project_phase_id", phaseIds).order("sort_order")
      : { data: [] as never[] };

    let stepAssignees: unknown[] = [];
    let assigneePickerMembers: unknown[] = [];
    let assigneePickerPrincipal: { name: string } | null = null;
    if (phaseIds.length) {
      const stepIds = (steps ?? []).map((s: { id: string }) => s.id);
      if (stepIds.length) {
        const { data: assignees, error: assigneeErr } = await supabase
          .from("project_step_assignees")
          .select("*")
          .in("project_step_id", stepIds);
        if (assigneeErr) {
          if (!isTaskAssigneeSchemaMissingError(assigneeErr)) {
            throw new Error(assigneeErr.message);
          }
        } else {
          stepAssignees = assignees ?? [];
        }
      }
      if (isAdmin) {
        const picker = await listFirmMembersForAssigneePicker(supabase, profile.firm_id);
        assigneePickerMembers = picker.members;
        assigneePickerPrincipal = picker.principal;
      }
    }

    let stepResources: unknown[] = [];
    let stepResourceMeta: unknown[] = [];
    const stepIds = (steps ?? []).map((s: { id: string }) => s.id);
    if (stepIds.length) {
      const { data: links, error: linkErr } = await supabase
        .from("project_step_resources")
        .select("*")
        .in("project_step_id", stepIds);
      if (!linkErr && links?.length) {
        stepResources = links;
        const resourceIds = [...new Set(links.map((l: { resource_id: string }) => l.resource_id))];
        const { data: resources } = await supabase
          .from("firm_resources")
          .select("id, name, resource_type, url, content, subject_line, file_path, file_name")
          .in("id", resourceIds);
        stepResourceMeta = resources ?? [];
      }
    }

    const sopPhaseIds = (phases ?? [])
      .map((p) => p.sop_phase_id)
      .filter((id): id is string => !!id);
    const { data: sopPhases } = sopPhaseIds.length
      ? await supabase.from("sop_phases").select("id, description").in("id", sopPhaseIds)
      : { data: [] as { id: string; description: string | null }[] };

    const { listProjectWorkflowAttachments } = await import("@/lib/sop-library.server");
    const workflowAttachments = await listProjectWorkflowAttachments(
      supabase,
      data.id,
      profile.firm_id,
    );

    const importLogIds = [
      ...new Set(
        (entries ?? [])
          .map((e: { import_log_id?: string | null }) => e.import_log_id)
          .filter((id): id is string => !!id),
      ),
    ];
    const { data: importLogs } = importLogIds.length
      ? await supabase.from("time_import_logs").select("*").in("id", importLogIds).order("imported_at", { ascending: false })
      : { data: [] as never[] };
    const { data: audit } = isAdmin
      ? await supabase
          .from("project_financial_audit")
          .select("*")
          .eq("project_id", data.id)
          .order("changed_at", { ascending: false })
      : { data: [] as never[] };
    let firmMetrics: {
      breakEvenRate: number;
      alignedRate: number;
      billedRate: number;
      perHour: ReturnType<typeof calcFinance>["perHour"];
    } | null = null;
    let snapshot: any = null;
    let financials: ReturnType<typeof getProjectFinancials> | null = null;
    let assigneesNewerThanSnapshot = false;

    if (isFinancialUser) {
    const fin = calcFinance(
      (config as FirmConfig | null) ?? null,
      ((expenses as unknown) as Expense[]) ?? [],
      {
        ownerComp: (ownerComp as any) ?? [],
        teamProfiles: (teamBurdens as any) ?? [],
      },
    );
    firmMetrics = {
      breakEvenRate: Number(fin.breakEvenRate) || 0,
      alignedRate: Number(fin.alignedRate) || 0,
      billedRate: Number(fin.billedRate) || 0,
      perHour: fin.perHour,
    };

    // ─── Locked cost snapshot (retroactively backfilled on first load) ───
    {
      const { data: existing } = await (supabase
        .from("project_cost_snapshots") as any)
        .select("*")
        .eq("project_id", data.id)
        .maybeSingle();
      if (existing) {
        snapshot = existing;
      } else {
        const body = buildSnapshotFromCalc(fin, (config as FirmConfig | null) ?? null, {
          isRetroactive: true,
        });
        const { data: inserted } = await (supabase
          .from("project_cost_snapshots") as any)
          .insert({ project_id: data.id, firm_id: profile.firm_id, ...body })
          .select("*")
          .single();
        snapshot = inserted ?? { project_id: data.id, firm_id: profile.firm_id, ...body };
      }
    }

    // Compute snapshot-locked financials for this project
    const hoursLogged = await sumProjectHours(supabase, data.id);
    const lastEntryDate = (entries ?? [])
      .map((e: any) => e.date as string | null)
      .filter(Boolean)
      .sort()
      .slice(-1)[0] ?? null;

    let breakEvenResult = null;
    if (snapshot) {
      const { liveResult } = await fetchProjectStepAssigneeRows(
        supabase,
        data.id,
        snapshot as any,
        profile.firm_id,
      );
      const snapshotResult = breakEvenResultFromSnapshot(snapshot as any);
      assigneesNewerThanSnapshot =
        liveResult.hasAssigneeData &&
        (!snapshotResult || (snapshot as { cost_basis_method?: string }).cost_basis_method === "firm_average");
      breakEvenResult =
        liveResult.hasAssigneeData && !assigneesNewerThanSnapshot ? liveResult : snapshotResult;
    }

    const loggedBreakdown = projectHoursBreakdownFromEntries(entries ?? []);
    const scopedBreakdown = projectHoursBreakdownFromPhases(phases ?? [], breakEvenResult);

      financials = snapshot
        ? getProjectFinancials({
            project: project as any,
            snapshot: snapshot as any,
            hoursLogged,
            billableHoursLogged: loggedBreakdown.billableLogged,
            nonBillableHoursLogged: loggedBreakdown.nonBillableLogged,
            billableHoursScoped: scopedBreakdown.billableScoped,
            nonBillableHoursScoped: scopedBreakdown.nonBillableScoped,
            lastEntryDate,
            breakEvenResult,
            assigneesNewerThanSnapshot,
          })
        : null;
    }

    const safeTeam = isFinancialUser
      ? (team ?? [])
      : (team ?? []).map((m: { id: string; name: string | null; email: string | null }) => ({
          id: m.id,
          name: m.name,
          email: m.email,
        }));

    return {
      project: stripProjectForRole(project as Record<string, unknown>, profile.role as string),
      phases: phases ?? [],
      steps: steps ?? [],
      stepAssignees,
      stepResources,
      stepResourceMeta,
      assigneePickerMembers,
      assigneePickerPrincipal,
      entries: entries ?? [],
      config,
      template,
      team: safeTeam,
      audit: audit ?? [],
      activityLog: activityLog ?? [],
      milestones: milestones ?? [],
      sopPhases: sopPhases ?? [],
      workflowAttachments,
      importLogs: importLogs ?? [],
      isPrincipal,
      isAdmin,
      canWrite: profile.role !== "view_only",
      firmMetrics,
      snapshot,
      financials,
      assigneesNewerThanSnapshot,
    };
  });

// Log a 'confirmed_reviewed' event and stamp projects.last_confirmed_at.
// Enabled only in State 2 (fresh but unconfirmed) client-side; server writes
// unconditionally so any RLS-authorized firm member can acknowledge.
export const confirmProjectReviewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requireCanWrite(supabase, userId);
    const now = new Date().toISOString();
    const { error: logErr } = await supabase.from("project_activity_log").insert({
      project_id: data.project_id,
      firm_id: profile.firm_id,
      event_type: "confirmed_reviewed",
      occurred_at: now,
      logged_by: userId,
      note: null,
    });
    if (logErr) throw new Error(logErr.message);
    const { error: upErr } = await supabase
      .from("projects").update({ last_confirmed_at: now }).eq("id", data.project_id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true, last_confirmed_at: now };
  });

// Log a 'nothing_to_report' override. Requires the exact typed phrase to
// enforce deliberate friction. Also stamps last_confirmed_at (per spec,
// this doubles as confirmation) and — because lastActivityAt is derived as
// MAX(time_entries.date, nothing_to_report.occurred_at) — resets the
// freshness clock without a fabricated time entry.
export const NOTHING_TO_REPORT_PHRASE = "NOTHING TO REPORT";
export const logNothingToReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      project_id: z.string().uuid(),
      phrase: z.string(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.phrase.trim().toUpperCase() !== NOTHING_TO_REPORT_PHRASE) {
      throw new Error(`You must type "${NOTHING_TO_REPORT_PHRASE}" exactly to confirm.`);
    }
    const { supabase, userId } = context;
    const profile = await requireCanWrite(supabase, userId);
    const now = new Date().toISOString();
    const { error: logErr } = await supabase.from("project_activity_log").insert({
      project_id: data.project_id,
      firm_id: profile.firm_id,
      event_type: "nothing_to_report",
      occurred_at: now,
      logged_by: userId,
      note: data.phrase.trim(),
    });
    if (logErr) throw new Error(logErr.message);
    const { error: upErr } = await supabase
      .from("projects").update({ last_confirmed_at: now }).eq("id", data.project_id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true, last_confirmed_at: now };
  });

export const updateProjectStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum([
          "pursuit",
          "pipeline",
          "active",
          "invoiced",
          "collected",
          "completed",
          "on_hold",
        ]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireCanWrite(supabase, userId);
    const { error } = await supabase.from("projects").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function requireProjectAdmin(
  supabase: { from: (t: string) => any },
  userId: string,
  projectId: string,
) {
  const profile = await requirePrincipalOrAdmin(supabase, userId);
  const { data: project } = await supabase
    .from("projects")
    .select("id, firm_id, deleted_at")
    .eq("id", projectId)
    .eq("firm_id", profile.firm_id)
    .maybeSingle();
  if (!project) throw new Error("Project not found");
  return { profile, project };
}

export const archiveProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { project } = await requireProjectAdmin(supabase, userId, data.id);
    if (project.deleted_at) throw new Error("Deleted projects cannot be archived");
    const { error } = await supabase
      .from("projects")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error && isMissingProjectLifecycleColumn(error)) requireProjectLifecycleMigration();
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unarchiveProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireProjectAdmin(supabase, userId, data.id);
    const { error } = await supabase.from("projects").update({ archived_at: null }).eq("id", data.id);
    if (error && isMissingProjectLifecycleColumn(error)) requireProjectLifecycleMigration();
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireProjectAdmin(supabase, userId, data.id);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("projects")
      .update({ deleted_at: now, archived_at: null })
      .eq("id", data.id);
    if (error && isMissingProjectLifecycleColumn(error)) requireProjectLifecycleMigration();
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const restoreProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireProjectAdmin(supabase, userId, data.id);
    const { error } = await supabase
      .from("projects")
      .update({ deleted_at: null, archived_at: null })
      .eq("id", data.id);
    if (error && isMissingProjectLifecycleColumn(error)) requireProjectLifecycleMigration();
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const workflowPeriodSchema = z.object({
  period_label: z.string().trim().max(120).optional().nullable(),
  period_start: z.string().trim().max(32).optional().nullable(),
  period_end: z.string().trim().max(32).optional().nullable(),
});

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(160),
  client_name: z.string().trim().max(160).optional().nullable(),
  client_email: z.string().trim().max(200).optional().nullable(),
  client_phone: z.string().trim().max(40).optional().nullable(),
  client_preferred_communication: z
    .enum(["email", "phone", "text", "in_person"])
    .optional()
    .nullable(),
  status: z.enum(["active", "pipeline", "completed", "on_hold"]).default("active"),
  scoped_rate: z.number().min(0).max(100000).optional().nullable(),
  fixed_fee: z.number().min(0).max(100000000).optional().nullable(),
  pricing_method: z.enum(["flat_fee", "hourly", "hybrid", "retainer"]).optional().nullable(),
  flat_fee_amount: z.number().min(0).max(100000000).optional().nullable(),
  hourly_scoped_hours: z.number().min(0).max(100000).optional().nullable(),
  retainer_monthly_amount: z.number().min(0).max(100000000).optional().nullable(),
  retainer_duration_months: z.number().min(0).max(600).optional().nullable(),
  monthly_retainer_fee: z.number().min(0).max(100000000).optional().nullable(),
  retainer_start_date: z.string().optional().nullable(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  sop_template_id: z.string().uuid().optional().nullable(),
  workflow_ids: z.array(z.string().uuid()).max(20).optional().nullable(),
  workflow_period: workflowPeriodSchema.optional().nullable(),
  phases: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(160),
        expected_hrs: z.number().min(0).max(10000),
        billable: z.boolean().default(true),
      }),
    )
    .max(200)
    .optional()
    .nullable(),
  assignments: z
    .array(
      z.object({
        firm_member_id: z.string().uuid(),
        role_on_project: z.string().trim().max(120).optional().nullable(),
      }),
    )
    .optional()
    .nullable(),
});

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createProjectSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePrincipalOrAdmin(supabase, userId);
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id, role")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) throw new Error("No firm");

    // If explicit phases are provided (wizard), use them. Otherwise, if
    // workflow template(s) are attached, snapshot their phases (with tasks).
    let scopedHrs = 0;
    let tplPhases: { name: string; expected_hrs: number; billable: boolean; sort_order: number; id: string }[] = [];
    const customPhases = data.phases ?? null;
    const useAttachPath = !!(data.workflow_ids?.length);
    const workflowIds = useAttachPath
      ? (data.workflow_ids ?? [])
      : data.sop_template_id
        ? [data.sop_template_id]
        : [];

    if (customPhases && customPhases.length) {
      scopedHrs = customPhases.reduce((s, p) => s + Number(p.expected_hrs || 0), 0);
    } else if (useAttachPath && workflowIds.length) {
      const { data: phases } = await supabase
        .from("sop_phases")
        .select("expected_hrs")
        .in("template_id", workflowIds);
      scopedHrs = (phases ?? []).reduce((s, p) => s + Number(p.expected_hrs || 0), 0);
    } else if (data.sop_template_id) {
      const { data: phases } = await supabase
        .from("sop_phases")
        .select("id, name, expected_hrs, billable, sort_order")
        .eq("template_id", data.sop_template_id)
        .order("sort_order");
      tplPhases = phases ?? [];
      scopedHrs = tplPhases.reduce((s, p) => s + Number(p.expected_hrs || 0), 0);
    }

    const pricingMethod =
      data.pricing_method ??
      ((Number(data.fixed_fee) || 0) > 0 && (Number(data.scoped_rate) || 0) > 0
        ? "hybrid"
        : (Number(data.scoped_rate) || 0) > 0
          ? "hourly"
          : "flat_fee");

    const insertRow: Record<string, unknown> = {
      firm_id: profile.firm_id,
      name: data.name,
      client_name: data.client_name ?? null,
      status: data.status,
      scoped_rate: data.scoped_rate ?? null,
      fixed_fee: data.fixed_fee ?? null,
      scoped_hrs: scopedHrs || null,
      start_date: data.start_date || null,
      end_date: data.end_date || null,
      sop_template_id: useAttachPath ? null : (data.sop_template_id ?? null),
      pricing_method: pricingMethod,
      flat_fee_amount: data.flat_fee_amount ?? data.fixed_fee ?? null,
      hourly_scoped_hours: data.hourly_scoped_hours ?? null,
    };

    const clientEmail = data.client_email?.trim();
    if (clientEmail) insertRow.client_email = clientEmail;
    const clientPhone = data.client_phone?.trim();
    if (clientPhone) insertRow.client_phone = clientPhone;
    if (data.client_preferred_communication) {
      insertRow.client_preferred_communication = data.client_preferred_communication;
    }

    if (pricingMethod === "retainer") {
      insertRow.retainer_monthly_amount =
        data.retainer_monthly_amount ?? data.monthly_retainer_fee ?? null;
      insertRow.retainer_duration_months = data.retainer_duration_months ?? null;
      insertRow.monthly_retainer_fee =
        data.monthly_retainer_fee ?? data.retainer_monthly_amount ?? null;
      insertRow.retainer_start_date = data.retainer_start_date ?? data.start_date ?? null;
    }

    const project = await insertProjectWithSchemaFallback(supabase, insertRow);

    if (customPhases && customPhases.length) {
      // Insert wizard-provided phases as a plain snapshot (no template link
      // per-phase). The project keeps its sop_template_id association if the
      // wizard was launched from a template.
      const rows = customPhases.map((p, i) => ({
        project_id: project.id,
        name: p.name,
        expected_hrs: Number(p.expected_hrs) || 0,
        billable: p.billable,
        sort_order: i,
        actual_hrs: 0,
      }));
      const { error: phErr } = await supabase.from("project_phases").insert(rows);
      if (phErr) throw new Error(phErr.message);
    } else if (useAttachPath && workflowIds.length) {
      const { attachWorkflowToProject } = await import("@/lib/sop-library.server");
      const period = data.workflow_period ?? null;
      for (const wfId of workflowIds) {
        await attachWorkflowToProject(supabase, wfId, project.id, profile.firm_id, period);
      }
    } else if (tplPhases.length) {
      const phaseIds = tplPhases.map((p) => p.id);
      const { data: allSteps } = await supabase
        .from("sop_steps")
        .select("id, phase_id, description, estimated_hrs, sort_order")
        .in("phase_id", phaseIds)
        .order("sort_order");
      for (const p of tplPhases) {
        const { data: ins, error: phErr } = await supabase
          .from("project_phases")
          .insert({
            project_id: project.id,
            sop_phase_id: p.id,
            name: p.name,
            expected_hrs: p.expected_hrs,
            billable: p.billable,
            sort_order: p.sort_order,
            actual_hrs: 0,
          })
          .select("id")
          .single();
        if (phErr) throw new Error(phErr.message);
        const steps = (allSteps ?? []).filter((s) => s.phase_id === p.id);
        if (steps.length) {
          const { data: insertedSteps, error: stepErr } = await supabase
            .from("project_steps")
            .insert(
              steps.map((s) => ({
                project_phase_id: ins.id,
                sop_step_id: s.id,
                description: s.description,
                estimated_hrs: Number(s.estimated_hrs) || 0,
                template_estimated_hrs: Number(s.estimated_hrs) || 0,
                is_custom: false,
                sort_order: s.sort_order,
                actual_hrs: 0,
              })),
            )
            .select("id, sop_step_id");
          if (stepErr) throw new Error(stepErr.message);
          const pairs = (insertedSteps ?? [])
            .filter((row: { sop_step_id?: string | null }) => row.sop_step_id)
            .map((row: { id: string; sop_step_id: string }) => ({
              sopStepId: row.sop_step_id,
              projectStepId: row.id,
            }));
          await copySopAssigneesToProjectSteps(supabase, pairs);
        }
      }
    }

    // ─── Lock in the firm's current cost structure as this project's
    //     immutable snapshot. Never mutated after creation.
    try {
      const [
        { data: firmConfig },
        { data: firmExpenses },
        { data: firmOwnerComp },
        { data: firmTeam },
      ] = await Promise.all([
        supabase.from("firm_config").select("*").eq("firm_id", profile.firm_id).maybeSingle(),
        supabase.from("expenses").select("*").eq("firm_id", profile.firm_id),
        supabase.from("owner_compensation").select("*").eq("firm_id", profile.firm_id),
        supabase
          .from("firm_members")
          .select("burdened_weekly_cost, weeks_per_year, role_type, expected_hrs_per_week, billed_rate")
          .eq("firm_id", profile.firm_id)
          .eq("is_active", true)
          .neq("role_type", "principal"),
      ]);
      const fin = calcFinance(
        (firmConfig as FirmConfig | null) ?? null,
        ((firmExpenses as unknown) as Expense[]) ?? [],
        {
          ownerComp: (firmOwnerComp as any) ?? [],
          teamProfiles: (firmTeam as any) ?? [],
        },
      );
      const snapshotBody = buildSnapshotFromCalc(fin, (firmConfig as FirmConfig | null) ?? null, {
        isRetroactive: false,
      });
      await (supabase.from("project_cost_snapshots") as any).insert({
        project_id: project.id,
        firm_id: profile.firm_id,
        ...snapshotBody,
      });
      await refreshProjectCostSnapshot(supabase, project.id, profile.firm_id);
    } catch (e) {
      // Don't fail project creation if snapshot insert races or errors — the
      // retroactive backfill in getProjectDetail will create one on first load.
      console.warn("[createProject] snapshot insert failed:", e);
    }

    if (data.assignments?.length) {
      const rows = data.assignments.map((a) => ({
        project_id: project.id,
        firm_id: profile.firm_id,
        assignee_id: a.firm_member_id,
        assigned_by: userId,
        role_on_project: a.role_on_project?.trim() || null,
      }));
      const { error: assignErr } = await supabase.from("project_assignments").insert(rows);
      if (assignErr) console.warn("[createProject] assignments insert failed:", assignErr.message);
    }

    return { id: project.id };
  });

const phaseUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  project_id: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  expected_hrs: z.number().min(0).max(10000),
  billable: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(1000).optional(),
});

export const upsertProjectPhase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => phaseUpsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireCanWrite(supabase, userId);
    if (data.id) {
      const { error } = await supabase
        .from("project_phases")
        .update({
          name: data.name,
          expected_hrs: data.expected_hrs,
          billable: data.billable,
          ...(data.sort_order !== undefined ? { sort_order: data.sort_order } : {}),
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: existing } = await supabase
      .from("project_phases")
      .select("sort_order")
      .eq("project_id", data.project_id)
      .order("sort_order", { ascending: false })
      .limit(1);
    const nextOrder = data.sort_order ?? ((existing?.[0]?.sort_order ?? -1) + 1);
    const { data: row, error } = await supabase
      .from("project_phases")
      .insert({
        project_id: data.project_id,
        name: data.name,
        expected_hrs: data.expected_hrs,
        billable: data.billable,
        sort_order: nextOrder,
        actual_hrs: 0,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteProjectPhase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireCanWrite(supabase, userId);
    const { error } = await supabase.from("project_phases").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateProjectMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(160).optional(),
      client_name: z.string().trim().max(160).optional().nullable(),
      client_email: z.string().trim().max(200).optional().nullable(),
      client_phone: z.string().trim().max(40).optional().nullable(),
      client_preferred_communication: z
        .enum(["email", "phone", "text", "in_person"])
        .optional()
        .nullable(),
      status: z.enum([
        "pursuit",
        "pipeline",
        "active",
        "invoiced",
        "collected",
        "completed",
        "on_hold",
      ]).optional(),
      pricing_method: z.enum(["flat_fee", "hourly", "hybrid", "retainer"]).optional(),
      scoped_rate: z.number().min(0).max(100000).optional().nullable(),
      fixed_fee: z.number().min(0).max(100000000).optional().nullable(),
      flat_fee_amount: z.number().min(0).max(100000000).optional().nullable(),
      hourly_scoped_hours: z.number().min(0).max(100000).optional().nullable(),
      retainer_monthly_amount: z.number().min(0).max(100000000).optional().nullable(),
      retainer_duration_months: z.number().min(0).max(600).optional().nullable(),
      scoped_hrs: z.number().min(0).max(100000).optional().nullable(),
      start_date: z.string().optional().nullable(),
      end_date: z.string().optional().nullable(),
      est_weekly_hrs: z.number().min(0).max(200).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireCanWrite(supabase, userId);
    const { id, ...patch } = data;
    const { error } = await supabase.from("projects").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const recordProjectPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        amount: z.number().min(0).max(1e9),
        payment_collected_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        payment_notes: z.string().trim().max(500).optional().nullable(),
        project_fee: z.number().min(0).max(1e9),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id, role")
      .eq("id", userId)
      .single();
    if (profile?.role !== "principal" && profile?.role !== "admin") {
      throw new Error("Only firm admins can record payments");
    }
    if (!profile?.firm_id) throw new Error("No firm");

    const { data: project, error: projectErr } = await supabase
      .from("projects")
      .select("id, firm_id")
      .eq("id", data.id)
      .eq("firm_id", profile.firm_id)
      .maybeSingle();
    if (projectErr) throw new Error(projectErr.message);
    if (!project) throw new Error("Project not found");

    const fee = data.project_fee;
    const newTotal = data.amount;
    let payment_status: "unpaid" | "partially_paid" | "paid" = "partially_paid";
    if (newTotal <= 0) payment_status = "unpaid";
    else if (fee > 0 && newTotal >= fee) payment_status = "paid";
    else if (newTotal > 0 && fee > 0 && newTotal < fee) payment_status = "partially_paid";
    else if (newTotal > 0) payment_status = "paid";

    const { error } = await supabase
      .from("projects")
      .update({
        payment_status,
        payment_collected: newTotal > 0 ? newTotal : null,
        payment_collected_date: newTotal > 0 ? data.payment_collected_date : null,
        payment_notes: data.payment_notes ?? null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, payment_status, payment_collected: newTotal || null };
  });

// ---- Milestones ------------------------------------------------------------

export const saveProjectMilestone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid().optional(),
      project_id: z.string().uuid(),
      label: z.string().trim().min(1).max(120),
      milestone_date: z.string().min(4),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requireCanWrite(supabase, userId);
    if (data.id) {
      const { error } = await supabase.from("project_milestones")
        .update({ label: data.label, milestone_date: data.milestone_date })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase.from("project_milestones")
      .insert({
        project_id: data.project_id,
        firm_id: profile.firm_id,
        label: data.label,
        milestone_date: data.milestone_date,
      })
      .select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteProjectMilestone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireCanWrite(supabase, userId);
    const { error } = await supabase.from("project_milestones").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Financial mutations (principal-only) -----------------------------------

async function ensureAdminOrPrincipal(supabase: any, userId: string) {
  const profile = await requirePrincipalOrAdmin(supabase, userId);
  return { firmId: profile.firm_id as string };
}

export const updateProjectFinancial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      project_id: z.string().uuid(),
      scoped_rate: z.number().min(0).max(100000).nullable().optional(),
      fixed_fee: z.number().min(0).max(100000000).nullable().optional(),
      flat_fee_amount: z.number().min(0).max(100000000).nullable().optional(),
      reason: z.string().trim().max(500).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { firmId } = await ensureAdminOrPrincipal(supabase, userId);
    const { data: existing } = await supabase
      .from("projects")
      .select("id, firm_id, scoped_rate, fixed_fee, flat_fee_amount")
      .eq("id", data.project_id)
      .eq("firm_id", firmId)
      .single();
    if (!existing) throw new Error("Project not found");

    const audits: { field_changed: string; old_value: string | null; new_value: string | null }[] = [];
    const patch: { scoped_rate?: number | null; fixed_fee?: number | null; flat_fee_amount?: number | null } = {};
    if (data.scoped_rate !== undefined) {
      const oldVal = existing.scoped_rate == null ? null : String(existing.scoped_rate);
      const newVal = data.scoped_rate == null ? null : String(data.scoped_rate);
      if (oldVal !== newVal) {
        patch.scoped_rate = data.scoped_rate;
        audits.push({ field_changed: "scoped_rate", old_value: oldVal, new_value: newVal });
      }
    }
    if (data.fixed_fee !== undefined) {
      const oldVal = (existing as { fixed_fee?: number | null }).fixed_fee == null
        ? null
        : String((existing as { fixed_fee?: number | null }).fixed_fee);
      const newVal = data.fixed_fee == null ? null : String(data.fixed_fee);
      if (oldVal !== newVal) {
        patch.fixed_fee = data.fixed_fee;
        audits.push({ field_changed: "fixed_fee", old_value: oldVal, new_value: newVal });
      }
    }
    if (data.flat_fee_amount !== undefined) {
      const oldVal = (existing as { flat_fee_amount?: number | null }).flat_fee_amount == null
        ? null
        : String((existing as { flat_fee_amount?: number | null }).flat_fee_amount);
      const newVal = data.flat_fee_amount == null ? null : String(data.flat_fee_amount);
      if (oldVal !== newVal) {
        patch.flat_fee_amount = data.flat_fee_amount;
        audits.push({ field_changed: "flat_fee_amount", old_value: oldVal, new_value: newVal });
      }
    }
    if (Object.keys(patch).length === 0) return { ok: true, changed: 0 };

    const { error } = await supabase.from("projects").update(patch).eq("id", data.project_id);
    if (error) throw new Error(error.message);
    if (audits.length) {
      await supabase.from("project_financial_audit").insert(
        audits.map((a) => ({
          ...a,
          project_id: data.project_id,
          firm_id: firmId,
          changed_by: userId,
          reason: data.reason ?? null,
        })),
      );
    }
    return { ok: true, changed: audits.length };
  });

export const updateProjectPhaseFinancial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      expected_hrs: z.number().min(0).max(10000).optional(),
      billable: z.boolean().optional(),
      reason: z.string().trim().max(500).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { firmId } = await ensureAdminOrPrincipal(supabase, userId);
    const { data: phase } = await supabase
      .from("project_phases")
      .select("id, name, expected_hrs, billable, project_id, projects:project_id(firm_id)")
      .eq("id", data.id)
      .single();
    if (!phase) throw new Error("Phase not found");
    const phaseFirmId = (phase as any).projects?.firm_id;
    if (phaseFirmId !== firmId) throw new Error("Not allowed");

    const audits: { field_changed: string; old_value: string | null; new_value: string | null }[] = [];
    const patch: { expected_hrs?: number; billable?: boolean } = {};
    if (data.expected_hrs !== undefined && Number(phase.expected_hrs) !== data.expected_hrs) {
      patch.expected_hrs = data.expected_hrs;
      audits.push({
        field_changed: `phase_expected_hrs:${phase.name}`,
        old_value: String(phase.expected_hrs ?? 0),
        new_value: String(data.expected_hrs),
      });
    }
    if (data.billable !== undefined && phase.billable !== data.billable) {
      patch.billable = data.billable;
      audits.push({
        field_changed: `phase_billable:${phase.name}`,
        old_value: phase.billable ? "true" : "false",
        new_value: data.billable ? "true" : "false",
      });
    }
    if (Object.keys(patch).length === 0) return { ok: true, changed: 0 };

    const { error } = await supabase.from("project_phases").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    if (audits.length) {
      await supabase.from("project_financial_audit").insert(
        audits.map((a) => ({
          ...a,
          project_id: phase.project_id,
          firm_id: firmId,
          changed_by: userId,
          reason: data.reason ?? null,
        })),
      );
    }
    return { ok: true, changed: audits.length };
  });

// Lightweight patch for time entries (no time recomputation) — reassign phase,
// flip billable, or edit notes after the fact. Used by the Time Log tab.
export const patchTimeEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      project_phase_id: z.string().uuid().nullable().optional(),
      billable: z.boolean().optional(),
      notes: z.string().max(500).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireCanWrite(supabase, userId);
    const { data: prev } = await supabase
      .from("time_entries")
      .select("project_phase_id, project_id, hrs, firm_id")
      .eq("id", data.id)
      .single();
    if (!prev) throw new Error("Time entry not found");

    const projectIdBefore = await resolveEntryProjectId(supabase, {
      project_id: prev.project_id as string | null,
      project_phase_id: prev.project_phase_id as string | null,
    });
    const hoursBefore = projectIdBefore ? await sumProjectHours(supabase, projectIdBefore) : 0;

    const patch: { project_phase_id?: string | null; billable?: boolean; notes?: string | null } = {};
    if (data.project_phase_id !== undefined) patch.project_phase_id = data.project_phase_id;
    if (data.billable !== undefined) patch.billable = data.billable;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabase.from("time_entries").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    // Recompute phase actuals for any affected phase
    const toRecount = new Set<string>();
    if (prev?.project_phase_id) toRecount.add(prev.project_phase_id as string);
    if (data.project_phase_id) toRecount.add(data.project_phase_id);
    for (const phaseId of toRecount) {
      const { data: rows } = await supabase.from("time_entries").select("hrs").eq("project_phase_id", phaseId);
      const total = (rows ?? []).reduce((s: number, r: { hrs: number | null }) => s + Number(r.hrs || 0), 0);
      const { data: ph } = await supabase.from("project_phases").select("expected_hrs").eq("id", phaseId).maybeSingle();
      const expected = Number(ph?.expected_hrs ?? 0);
      await supabase.from("project_phases").update({ actual_hrs: total, phase_over_scope: total > expected }).eq("id", phaseId);
    }

    const projectIdAfter = await resolveEntryProjectId(supabase, {
      project_id: prev.project_id as string | null,
      project_phase_id: (data.project_phase_id ?? prev.project_phase_id) as string | null,
    });

    if (projectIdBefore && projectIdBefore === projectIdAfter) {
      await logMarginImpactForProjectHoursChange({
        supabase,
        projectId: projectIdBefore,
        firmId: prev.firm_id as string,
        userId,
        hoursBefore,
        note: "Time entry updated",
      });
    } else {
      if (projectIdBefore) {
        await logMarginImpactForProjectHoursChange({
          supabase,
          projectId: projectIdBefore,
          firmId: prev.firm_id as string,
          userId,
          hoursBefore,
          note: "Time entry moved to another project",
        });
      }
      if (projectIdAfter && projectIdAfter !== projectIdBefore) {
        await logMarginImpactForProjectHoursChange({
          supabase,
          projectId: projectIdAfter,
          firmId: prev.firm_id as string,
          userId,
          hoursBefore: await sumProjectHours(supabase, projectIdAfter),
          note: "Time entry moved from another project",
        });
      }
    }

    return { ok: true };
  });

export const listSopTemplatesLite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("firm_id").eq("id", userId).single();
    if (!profile?.firm_id) return { templates: [] };
    const { data: templates } = await supabase
      .from("sop_templates")
      .select("id, name, category, workflow_type, is_active")
      .eq("firm_id", profile.firm_id)
      .is("deleted_at", null)
      .order("name");
    const filtered = (templates ?? []).filter(
      (t) =>
        ["project", "firm_operation"].includes(
          (t as { workflow_type?: string }).workflow_type ?? "project",
        ) && ((t as { is_active?: boolean }).is_active ?? true),
    );
    return {
      templates: filtered.map(({ id, name, category, workflow_type }) => ({
        id,
        name,
        category,
        workflowType: (workflow_type as string | null) ?? "project",
      })),
    };
  });
// --- Project step (process step) mutations ----------------------------------

async function recomputePhaseExpectedFromSteps(supabase: any, phaseId: string) {
  const { data: rows } = await supabase
    .from("project_steps")
    .select("estimated_hrs")
    .eq("project_phase_id", phaseId);
  const total = (rows ?? []).reduce(
    (s: number, r: { estimated_hrs: number | null }) => s + Number(r.estimated_hrs || 0),
    0,
  );
  const { data: ph } = await supabase
    .from("project_phases")
    .select("actual_hrs")
    .eq("id", phaseId)
    .maybeSingle();
  const actual = Number(ph?.actual_hrs ?? 0);
  await supabase
    .from("project_phases")
    .update({ expected_hrs: total, phase_over_scope: actual > total })
    .eq("id", phaseId);
}

export const updateProjectStepHrs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      estimated_hrs: z.number().min(0).max(999),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireCanWrite(supabase, userId);
    const { data: existing } = await supabase
      .from("project_steps")
      .select("id, project_phase_id")
      .eq("id", data.id)
      .single();
    if (!existing) throw new Error("Step not found");
    const { error } = await supabase
      .from("project_steps")
      .update({ estimated_hrs: data.estimated_hrs })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await recomputePhaseExpectedFromSteps(supabase, existing.project_phase_id as string);
    return { ok: true };
  });

export const createProjectStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      project_phase_id: z.string().uuid(),
      description: z.string().trim().min(1).max(500),
      estimated_hrs: z.number().min(0).max(999),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireCanWrite(supabase, userId);
    const { data: existing } = await supabase
      .from("project_steps")
      .select("sort_order")
      .eq("project_phase_id", data.project_phase_id)
      .order("sort_order", { ascending: false })
      .limit(1);
    const nextOrder = ((existing?.[0]?.sort_order ?? -1) + 1);
    const { data: row, error } = await supabase
      .from("project_steps")
      .insert({
        project_phase_id: data.project_phase_id,
        description: data.description,
        estimated_hrs: data.estimated_hrs,
        sort_order: nextOrder,
        actual_hrs: 0,
        is_custom: true,
        sop_step_id: null,
        template_estimated_hrs: null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await recomputePhaseExpectedFromSteps(supabase, data.project_phase_id);
    return { id: row.id };
  });

export const toggleProjectStepComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ step_id: z.string().uuid(), completed: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireCanWrite(supabase, userId);
    const { error } = await supabase
      .from("project_steps")
      .update({
        completed_at: data.completed ? new Date().toISOString() : null,
        completed_by: data.completed ? userId : null,
      })
      .eq("id", data.step_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleProjectStepItemComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        step_id: z.string().uuid(),
        order: z.number().int(),
        completed: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireCanWrite(supabase, userId);

    const { data: row, error: fetchErr } = await supabase
      .from("project_steps")
      .select("id, steps, completed_at")
      .eq("id", data.step_id)
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
      patch.completed_by = userId;
    } else if (row.completed_at) {
      patch.completed_at = null;
      patch.completed_by = null;
    }

    const { error } = await supabase.from("project_steps").update(patch).eq("id", data.step_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProjectStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireCanWrite(supabase, userId);
    const { data: existing } = await supabase
      .from("project_steps")
      .select("id, project_phase_id, is_custom")
      .eq("id", data.id)
      .single();
    if (!existing) throw new Error("Step not found");
    if (!existing.is_custom) throw new Error("Only custom steps can be deleted");
    const { error } = await supabase.from("project_steps").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await recomputePhaseExpectedFromSteps(supabase, existing.project_phase_id as string);
    return { ok: true };
  });

const stepAssigneeSchema = z.object({
  project_step_id: z.string().uuid(),
  assignee_kind: z.enum(["member", "principal"]).default("member"),
  firm_member_id: z.string().uuid().optional().nullable(),
  estimated_hrs: z.number().min(0).max(9999).optional(),
  is_billable: z.boolean().optional(),
  notes: z.string().max(500).optional().nullable(),
});

export const upsertProjectStepAssignee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => stepAssigneeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePrincipalOrAdmin(supabase, userId);
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id, role")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) throw new Error("No firm");

    if (data.assignee_kind === "member" && !data.firm_member_id) {
      throw new Error("firm_member_id required for member assignees");
    }

    const match =
      data.assignee_kind === "principal"
        ? { project_step_id: data.project_step_id, assignee_kind: "principal" as const }
        : {
            project_step_id: data.project_step_id,
            firm_member_id: data.firm_member_id!,
            assignee_kind: "member" as const,
          };

    const { data: existing, error: lookupErr } = await supabase
      .from("project_step_assignees")
      .select("id")
      .match(match)
      .maybeSingle();
    if (lookupErr) throw assigneeDbError(lookupErr);

    const row = {
      project_step_id: data.project_step_id,
      assignee_kind: data.assignee_kind,
      firm_member_id: data.assignee_kind === "principal" ? null : data.firm_member_id,
      estimated_hrs: data.estimated_hrs ?? 0,
      is_billable: data.is_billable ?? true,
      notes: data.notes ?? null,
    };

    if (existing?.id) {
      const { data: updated, error } = await supabase
        .from("project_step_assignees")
        .update(row)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw assigneeDbError(error);
      return updated;
    }

    const { data: inserted, error } = await supabase
      .from("project_step_assignees")
      .insert(row)
      .select("*")
      .single();
    if (error) throw assigneeDbError(error);
    return inserted;
  });

export const deleteProjectStepAssignee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireCanWrite(supabase, userId);
    const { error } = await supabase.from("project_step_assignees").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const refreshProjectCostSnapshotFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requirePrincipalOrAdmin(supabase, userId);
    const updated = await refreshProjectCostSnapshot(
      supabase,
      data.project_id,
      profile.firm_id,
    );
    return { snapshot: updated };
  });
