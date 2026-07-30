import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  calc,
  computeEffectiveAnnualCapacity,
  computeSayNoThreshold,
  effectivePrincipalBillableHrsWeek,
  WEEKS_DEFAULT,
  type EffectiveCapacityResult,
  type FirmLifeEvent,
  type SayNoThresholdResult,
  type FirmConfig,
  type Expense,
  type OwnerCompensationRow,
  type ScheduleException,
} from "@/lib/finance";

import { projectMonthSpan } from "@/lib/capacity-calendar";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { listFirmProjects } from "@/lib/project-lifecycle.server";
import { isRetainerFirm } from "@/lib/pricing-structure";
import {
  buildRetainerPortfolioMetrics,
  type RetainerPortfolioMetrics,
} from "@/lib/retainer-metrics";

const DEFAULT_PROJECT_FEE = 25_000;

function isMissingSchemaColumn(error: { message?: string } | null | undefined, column: string) {
  const msg = error?.message ?? "";
  return msg.includes(column) && (msg.includes("schema cache") || msg.includes("does not exist"));
}

const lifeEventTypeSchema = z.enum([
  "maternity_paternity_leave",
  "medical_leave",
  "vacation",
  "sabbatical",
  "seasonal_slowdown",
  "personal",
  "other",
]);

const lifeEventSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  event_type: lifeEventTypeSchema,
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  capacity_pct: z.number().int().min(0).max(100),
  notes: z.string().max(4000).nullable().optional(),
  is_recurring: z.boolean().optional(),
  block_type: z
    .enum(["life_event", "recurring_season", "recurring_weekly", "blackout_date"])
    .optional(),
  recurs_annually: z.boolean().optional(),
  default_capacity_pct: z.number().int().min(0).max(100).nullable().optional(),
  weekly_hours_blocked: z.number().min(0).nullable().optional(),
  scheduling_only: z.boolean().optional(),
});

const scheduleExceptionSchema = z.object({
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  capacity_pct: z.number().int().min(0).max(100),
  label: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export type CapacityPlannerProject = {
  id: string;
  name: string;
  client_name: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  scoped_hrs: number | null;
  scoped_rate: number | null;
  fixed_fee: number | null;
  flat_fee_amount: number | null;
  pricing_method?: string | null;
  monthly_retainer_fee?: number | null;
  retainer_monthly_amount?: number | null;
  retainer_start_date?: string | null;
  memberEstimatedHrs?: number;
};

export type CapacityPlannerScope = "firm" | "member";

export type MemberCapacitySummary = {
  firmMemberId: string;
  name: string;
  billableHrsPerWeek: number;
  standardHrs: number;
  effectiveHrs: number;
  committedHrs: number;
  availableHrs: number;
  eventCount: number;
};

export type CapacityPlannerData = {
  year: number;
  scope: CapacityPlannerScope;
  firmMemberId: string | null;
  memberName: string | null;
  hideFinancials: boolean;
  effective: EffectiveCapacityResult;
  sayNo: SayNoThresholdResult;
  projects: CapacityPlannerProject[];
  committedHrs: number;
  activeProjectCount: number;
  billableHrsPerWeek: number;
  acceptingNewClients: boolean;
  acceptingNewClientsUntil: string | null;
  hasLeaveEvents: boolean;
  monthsOfLeave: number;
  projectsNeeded: number;
  calcResult: ReturnType<typeof calc>;
  maternityLeaveSavingsPerMonth: number | null;
  scheduleExceptions: ScheduleException[];
  capacityBlocksOnboarded: boolean;
  isPlanningYear: boolean;
  teamMemberSummaries: MemberCapacitySummary[];
  memberNamesById: Record<string, string>;
  pricingStructure: string;
  retainerMetrics: RetainerPortfolioMetrics | null;
  retainerHoursByProject: Record<string, number>;
};

type CapacityContext = {
  role: string;
  isAdmin: boolean;
  scope: CapacityPlannerScope;
  firmMemberId: string | null;
  memberName: string | null;
  memberBillableHrsPerWeek: number;
};

async function resolveCapacityContext(
  supabase: any,
  userId: string,
  firmId: string,
): Promise<CapacityContext> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("firm_id, impersonated_firm_id, role, is_super_admin")
    .eq("id", userId)
    .single();

  const effectiveFirmId = profile?.impersonated_firm_id ?? profile?.firm_id;
  if (effectiveFirmId !== firmId) throw new Error("Unauthorized");

  const role = profile?.is_super_admin ? "principal" : ((profile?.role as string) ?? "team");
  const isAdmin = role === "principal" || role === "admin";

  if (isAdmin) {
    return {
      role,
      isAdmin: true,
      scope: "firm",
      firmMemberId: null,
      memberName: null,
      memberBillableHrsPerWeek: 0,
    };
  }

  if (role !== "team") {
    throw new Error("You do not have access to the capacity planner.");
  }

  const { data: member } = await supabase
    .from("firm_members")
    .select("id, name, expected_hrs_per_week")
    .eq("profile_id", userId)
    .eq("firm_id", firmId)
    .eq("is_active", true)
    .maybeSingle();

  if (!member) {
    throw new Error(
      "Your account is not linked to a team roster entry. Ask your firm principal to invite you from Settings → Team.",
    );
  }

  const hrs = Number(member.expected_hrs_per_week) || 0;
  if (hrs <= 0) {
    throw new Error(
      "Your expected hours per week are not configured yet. Ask your firm principal to set your capacity in Settings → Team.",
    );
  }

  return {
    role,
    isAdmin: false,
    scope: "member",
    firmMemberId: member.id as string,
    memberName: member.name as string,
    memberBillableHrsPerWeek: hrs,
  };
}

function assertAdminOnly(ctx: CapacityContext, action: string) {
  if (!ctx.isAdmin) throw new Error(`Only firm owners can ${action}.`);
}

async function assertLifeEventAccess(
  supabase: any,
  ctx: CapacityContext,
  firmId: string,
  eventId: string,
) {
  const { data: row, error } = await supabase
    .from("firm_life_events")
    .select("id, firm_member_id")
    .eq("id", eventId)
    .eq("firm_id", firmId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Time block not found.");
  if (ctx.isAdmin) return;
  if (row.firm_member_id !== ctx.firmMemberId) {
    throw new Error("You can only edit your own capacity entries.");
  }
}

function memberBillableHrsPerWeek(member: { expected_hrs_per_week?: number | null }) {
  return Number(member.expected_hrs_per_week) || 0;
}

async function loadLifeEvents(
  supabase: any,
  firmId: string,
  year: number,
  opts?: { firmMemberId?: string | null; includeAllForFirm?: boolean },
): Promise<{ events: FirmLifeEvent[]; exceptions: ScheduleException[] }> {
  let eventsQuery = supabase
    .from("firm_life_events")
    .select("*")
    .eq("firm_id", firmId)
    .order("start_date", { ascending: true });

  if (opts?.firmMemberId) {
    eventsQuery = eventsQuery.eq("firm_member_id", opts.firmMemberId);
  } else if (!opts?.includeAllForFirm) {
    eventsQuery = eventsQuery.is("firm_member_id", null);
  }

  const [{ data: allEvents }, { data: exceptions }] = await Promise.all([
    eventsQuery,
    supabase.from("schedule_exceptions").select("*").eq("firm_id", firmId),
  ]);

  const events = (allEvents ?? []) as FirmLifeEvent[];
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const relevant = events.filter((e) => {
    const block = e.block_type ?? "life_event";
    if (block === "recurring_season" || block === "recurring_weekly") return true;
    if (e.recurs_annually || e.is_recurring) return true;
    return e.start_date <= yearEnd && e.end_date >= yearStart;
  });

  const yearExceptions = (exceptions ?? []).filter((ex) => {
    const ws = (ex as { week_start: string }).week_start.slice(0, 10);
    return ws >= yearStart && ws <= yearEnd;
  });

  return {
    events: relevant,
    exceptions: yearExceptions as ScheduleException[],
  };
}

async function loadFirmCalc(supabase: any, firmId: string) {
  const [{ data: config }, { data: expenses }, { data: ownerComp }, { data: teamBurdens }] =
    await Promise.all([
      supabase.from("firm_config").select("*").eq("firm_id", firmId).maybeSingle(),
      supabase.from("expenses").select("*").eq("firm_id", firmId),
      supabase.from("owner_compensation").select("*").eq("firm_id", firmId),
      supabase
        .from("firm_members")
        .select("burdened_weekly_cost, weeks_per_year, expected_hrs_per_week, billed_rate")
        .eq("firm_id", firmId)
        .eq("is_active", true)
        .neq("role_type", "principal"),
    ]);

  const firmConfig = (config ?? null) as FirmConfig | null;
  const calcResult = calc(firmConfig, (expenses ?? []) as Expense[], {
    ownerComp: (ownerComp ?? []) as OwnerCompensationRow[],
    teamProfiles: (teamBurdens ?? []).map((t: any) => ({
      burdened_weekly_cost: t.burdened_weekly_cost as number | null,
      weeks_per_year: t.weeks_per_year as number | null,
      expected_hrs_per_week: t.expected_hrs_per_week as number | null,
      billed_rate: t.billed_rate as number | null,
    })),
  });

  return { config: firmConfig, calcResult };
}

function sumCommittedHrs(
  projects: CapacityPlannerProject[],
  year: number,
  billableHrsPerWeek: number,
) {
  const activeStatuses = new Set(["active", "pipeline", "pursuit"]);
  let committedHrs = 0;
  let activeProjectCount = 0;

  for (const p of projects) {
    const status = (p.status ?? "").toLowerCase();
    if (!activeStatuses.has(status)) continue;
    const span = projectMonthSpan(p, year, billableHrsPerWeek);
    if (!span) continue;
    committedHrs += Number(p.scoped_hrs) || 0;
    activeProjectCount++;
  }

  return { committedHrs, activeProjectCount };
}

function sumMemberCommittedHrs(
  projects: CapacityPlannerProject[],
  year: number,
  billableHrsPerWeek: number,
) {
  const activeStatuses = new Set(["active", "pipeline", "pursuit"]);
  let committedHrs = 0;
  let activeProjectCount = 0;

  for (const p of projects) {
    const status = (p.status ?? "").toLowerCase();
    if (!activeStatuses.has(status)) continue;
    const span = projectMonthSpan(p, year, billableHrsPerWeek);
    if (!span) continue;
    committedHrs += Number(p.memberEstimatedHrs) || 0;
    if ((p.memberEstimatedHrs ?? 0) > 0) activeProjectCount++;
  }

  return { committedHrs, activeProjectCount };
}

async function loadMemberAssignedProjects(
  supabase: any,
  firmId: string,
  firmMemberId: string,
): Promise<CapacityPlannerProject[]> {
  const { data: rows, error } = await supabase
    .from("project_step_assignees")
    .select(
      `
      estimated_hrs,
      project_steps!inner (
        project_id,
        projects!inner (
          id, name, client_name, status, start_date, end_date, created_at,
          scoped_hrs, scoped_rate, fixed_fee, flat_fee_amount, firm_id
        )
      )
    `,
    )
    .eq("firm_member_id", firmMemberId)
    .eq("assignee_kind", "member");

  if (error) throw new Error(error.message);

  const byProject = new Map<string, CapacityPlannerProject>();
  for (const row of rows ?? []) {
    const ps = row.project_steps as {
      projects: CapacityPlannerProject & { firm_id: string };
    };
    const p = ps?.projects;
    if (!p || p.firm_id !== firmId) continue;
    const existing = byProject.get(p.id) ?? { ...p, memberEstimatedHrs: 0 };
    existing.memberEstimatedHrs =
      (existing.memberEstimatedHrs ?? 0) + (Number(row.estimated_hrs) || 0);
    byProject.set(p.id, existing);
  }

  return Array.from(byProject.values()).sort((a, b) => a.name.localeCompare(b.name));
}

async function buildTeamMemberSummaries(
  supabase: any,
  firmId: string,
  year: number,
  calcResult: ReturnType<typeof calc>,
  config: FirmConfig | null,
  scheduleExceptions: ScheduleException[],
): Promise<{ summaries: MemberCapacitySummary[]; memberNamesById: Record<string, string> }> {
  const { data: members } = await supabase
    .from("firm_members")
    .select("id, name, expected_hrs_per_week")
    .eq("firm_id", firmId)
    .eq("is_active", true)
    .eq("is_platform_user", true)
    .neq("role_type", "principal");

  const summaries: MemberCapacitySummary[] = [];
  const memberNamesById: Record<string, string> = {};

  for (const member of members ?? []) {
    const memberId = member.id as string;
    memberNamesById[memberId] = member.name as string;
    const hrsPerWeek = memberBillableHrsPerWeek(member);
    if (hrsPerWeek <= 0) continue;

    const { events } = await loadLifeEvents(supabase, firmId, year, {
      firmMemberId: memberId,
    });
    const effective = computeEffectiveAnnualCapacity({
      hrsPerWeek,
      weeksPerYear: WEEKS_DEFAULT,
      targetMarginPct: Number(config?.target_gross_margin_pct) || 0,
      totalCost: calcResult.totalCost,
      compTotal: calcResult.compTotal,
      opexRecurring: calcResult.opexRecurring,
      opexOneTime: calcResult.opexOneTime,
      breakEvenRate: calcResult.breakEvenRate,
      alignedRate: calcResult.alignedRate,
      year,
      lifeEvents: events,
      scheduleExceptions,
    });

    const assignedProjects = await loadMemberAssignedProjects(supabase, firmId, memberId);
    const { committedHrs } = sumMemberCommittedHrs(assignedProjects, year, hrsPerWeek);

    summaries.push({
      firmMemberId: memberId,
      name: member.name as string,
      billableHrsPerWeek: hrsPerWeek,
      standardHrs: effective.standardHrs,
      effectiveHrs: effective.effectiveHrs,
      committedHrs,
      availableHrs: effective.effectiveHrs - committedHrs,
      eventCount: events.length,
    });
  }

  return { summaries, memberNamesById };
}

export const getCapacityPlannerData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        firmId: z.string().uuid(),
        year: z.number().int().min(2000).max(2100).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ctx = await resolveCapacityContext(supabase, userId, data.firmId);

    const year = data.year ?? new Date().getFullYear();
    const currentYear = new Date().getFullYear();
    const isPlanningYear = year > currentYear;

    const lifeEventFilter =
      ctx.scope === "member"
        ? { firmMemberId: ctx.firmMemberId }
        : { includeAllForFirm: true };

    const [
      { config, calcResult },
      { events: lifeEvents, exceptions: scheduleExceptions },
      projectsResult,
      firmConfigResult,
      capacityOnboardedResult,
    ] = await Promise.all([
      loadFirmCalc(supabase, data.firmId),
      loadLifeEvents(supabase, data.firmId, year, lifeEventFilter),
      ctx.scope === "member"
        ? loadMemberAssignedProjects(supabase, data.firmId, ctx.firmMemberId!)
        : listFirmProjects(supabase, data.firmId, {
            select:
              "id, name, client_name, status, start_date, end_date, created_at, scoped_hrs, scoped_rate, fixed_fee, flat_fee_amount, pricing_method, monthly_retainer_fee, retainer_monthly_amount, retainer_start_date",
            excludeArchived: true,
            orderBy: { column: "created_at", ascending: false },
          }).then((r) => r.data),
      supabase
        .from("firm_config")
        .select(
          "accepting_new_clients, accepting_new_clients_until, maternity_leave_savings_per_month",
        )
        .eq("firm_id", data.firmId)
        .maybeSingle(),
      ctx.isAdmin
        ? supabaseAdmin
            .from("firm_config")
            .select("capacity_blocks_onboarded")
            .eq("firm_id", data.firmId)
            .maybeSingle()
        : Promise.resolve({ data: { capacity_blocks_onboarded: true }, error: null }),
    ]);

    const onboardedError = capacityOnboardedResult.error;
    if (
      onboardedError &&
      !isMissingSchemaColumn(onboardedError, "capacity_blocks_onboarded")
    ) {
      throw new Error(onboardedError.message);
    }

    const firmConfigRow = firmConfigResult.data;
    const capacityBlocksOnboarded =
      !onboardedError &&
      capacityOnboardedResult.data?.capacity_blocks_onboarded === true;

    const hrsPerWeek =
      ctx.scope === "member"
        ? ctx.memberBillableHrsPerWeek
        : effectivePrincipalBillableHrsWeek(config);

    const eventsForCapacity =
      ctx.scope === "firm"
        ? lifeEvents.filter((e) => !e.firm_member_id)
        : lifeEvents;

    const effective = computeEffectiveAnnualCapacity({
      hrsPerWeek,
      weeksPerYear: WEEKS_DEFAULT,
      targetMarginPct: Number(config?.target_gross_margin_pct) || 0,
      totalCost: calcResult.totalCost,
      compTotal: calcResult.compTotal,
      opexRecurring: calcResult.opexRecurring,
      opexOneTime: calcResult.opexOneTime,
      breakEvenRate: calcResult.breakEvenRate,
      alignedRate: calcResult.alignedRate,
      year,
      lifeEvents: eventsForCapacity,
      scheduleExceptions,
    });

    if (ctx.scope === "firm") {
      effective.lifeEvents = lifeEvents;
    }

    const projectRows = (
      Array.isArray(projectsResult) ? projectsResult : []
    ) as CapacityPlannerProject[];

    const annualRevenueTarget = calcResult.alignedRate * calcResult.annualBillableHrs;
    const sayNo = computeSayNoThreshold({
      annualRevenueTarget,
      projects: ctx.scope === "member" ? [] : projectRows,
      year,
    });

    const committed =
      ctx.scope === "member"
        ? sumMemberCommittedHrs(projectRows, year, hrsPerWeek)
        : sumCommittedHrs(projectRows, year, hrsPerWeek);

    const { committedHrs, activeProjectCount } = committed;

    const hasLeaveEvents = lifeEvents.some((e) => Number(e.capacity_pct) === 0);
    const monthsOfLeave = effective.monthlyProfile.filter((m) => m.isLeave).length;
    const projectsNeeded = Math.max(
      0,
      Math.ceil(
        Math.max(0, sayNo.annualRevenueTarget - sayNo.committedRevenue) / DEFAULT_PROJECT_FEE,
      ),
    );

    let teamMemberSummaries: MemberCapacitySummary[] = [];
    let memberNamesById: Record<string, string> = {};

    if (ctx.isAdmin) {
      const built = await buildTeamMemberSummaries(
        supabase,
        data.firmId,
        year,
        calcResult,
        config,
        scheduleExceptions,
      );
      teamMemberSummaries = built.summaries;
      memberNamesById = built.memberNamesById;

      if (teamMemberSummaries.length > 0) {
        effective.effectiveHrs += teamMemberSummaries.reduce((s, m) => s + m.effectiveHrs, 0);
        effective.standardHrs += teamMemberSummaries.reduce((s, m) => s + m.standardHrs, 0);
      }
    }

    const teamCommittedHrs = teamMemberSummaries.reduce((s, m) => s + m.committedHrs, 0);

    const pricingStructure = String(config?.pricing_structure ?? "hourly");
    let retainerMetrics: RetainerPortfolioMetrics | null = null;
    let retainerHoursByProject: Record<string, number> = {};

    if (ctx.scope === "firm" && isRetainerFirm(pricingStructure)) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const sinceIso = thirtyDaysAgo.toISOString().slice(0, 10);

      const retainerProjects = projectRows.filter(
        (p) => (p.pricing_method ?? "").toLowerCase() === "retainer" &&
          ["active", "in_progress"].includes((p.status ?? "").toLowerCase()),
      );
      const retainerIds = retainerProjects.map((p) => p.id);

      let timeEntriesLast30Days: Array<{ project_id: string; hrs: number | null }> = [];
      if (retainerIds.length > 0) {
        const { data: entries } = await supabase
          .from("time_entries")
          .select("project_id, hrs")
          .eq("firm_id", data.firmId)
          .in("project_id", retainerIds)
          .gte("date", sinceIso);
        timeEntriesLast30Days = entries ?? [];
        for (const e of timeEntriesLast30Days) {
          const pid = e.project_id as string;
          retainerHoursByProject[pid] =
            (retainerHoursByProject[pid] ?? 0) + (Number(e.hrs) || 0);
        }
      }

      retainerMetrics = buildRetainerPortfolioMetrics({
        calcResult,
        targetMarginPct: Number(config?.target_gross_margin_pct) || 0,
        projects: retainerProjects,
        timeEntriesLast30Days,
      });
    }

    return {
      year,
      scope: ctx.scope,
      firmMemberId: ctx.firmMemberId,
      memberName: ctx.memberName,
      hideFinancials: ctx.scope === "member",
      effective,
      sayNo,
      projects: projectRows,
      committedHrs: committedHrs + teamCommittedHrs,
      activeProjectCount,
      billableHrsPerWeek: hrsPerWeek,
      acceptingNewClients: firmConfigRow?.accepting_new_clients !== false,
      acceptingNewClientsUntil: (firmConfigRow?.accepting_new_clients_until as string | null) ?? null,
      hasLeaveEvents,
      monthsOfLeave,
      projectsNeeded,
      calcResult: ctx.isAdmin ? calcResult : null,
      maternityLeaveSavingsPerMonth:
        firmConfigRow?.maternity_leave_savings_per_month != null
          ? Number(firmConfigRow.maternity_leave_savings_per_month)
          : null,
      scheduleExceptions,
      capacityBlocksOnboarded,
      isPlanningYear,
      teamMemberSummaries,
      memberNamesById,
      pricingStructure,
      retainerMetrics,
      retainerHoursByProject,
    } satisfies CapacityPlannerData;
  });

export const saveLifeEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        firmId: z.string().uuid(),
        event: lifeEventSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ctx = await resolveCapacityContext(supabase, userId, data.firmId);

    if (data.event.id) {
      await assertLifeEventAccess(supabase, ctx, data.firmId, data.event.id);
    }

    let firmMemberId: string | null = ctx.isAdmin ? null : ctx.firmMemberId;
    if (data.event.id && ctx.isAdmin) {
      const { data: existing } = await supabase
        .from("firm_life_events")
        .select("firm_member_id")
        .eq("id", data.event.id)
        .eq("firm_id", data.firmId)
        .maybeSingle();
      firmMemberId = (existing?.firm_member_id as string | null) ?? null;
    }

    const payload = {
      firm_id: data.firmId,
      firm_member_id: firmMemberId,
      name: data.event.name,
      event_type: data.event.event_type,
      start_date: data.event.start_date,
      end_date: data.event.end_date,
      capacity_pct: data.event.capacity_pct,
      notes: data.event.notes ?? null,
      is_recurring: data.event.is_recurring ?? false,
      block_type: data.event.block_type ?? "life_event",
      recurs_annually: data.event.recurs_annually ?? data.event.is_recurring ?? false,
      default_capacity_pct: data.event.default_capacity_pct ?? null,
      weekly_hours_blocked: data.event.weekly_hours_blocked ?? null,
      scheduling_only: data.event.scheduling_only ?? false,
      updated_at: new Date().toISOString(),
    };

    if (data.event.id) {
      const { error } = await supabase
        .from("firm_life_events")
        .update(payload)
        .eq("id", data.event.id)
        .eq("firm_id", data.firmId);
      if (error) throw new Error(error.message);
      return { id: data.event.id };
    }

    const { data: row, error } = await supabase
      .from("firm_life_events")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const deleteLifeEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        firmId: z.string().uuid(),
        id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ctx = await resolveCapacityContext(supabase, userId, data.firmId);
    await assertLifeEventAccess(supabase, ctx, data.firmId, data.id);

    const { error } = await supabase
      .from("firm_life_events")
      .delete()
      .eq("id", data.id)
      .eq("firm_id", data.firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateAcceptingNewClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        firmId: z.string().uuid(),
        accepting: z.boolean(),
        until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ctx = await resolveCapacityContext(supabase, userId, data.firmId);
    assertAdminOnly(ctx, "change accepting-clients settings");

    const { error } = await supabase
      .from("firm_config")
      .update({
        accepting_new_clients: data.accepting,
        accepting_new_clients_until: data.accepting ? null : (data.until ?? null),
      })
      .eq("firm_id", data.firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveMaternityLeaveSavings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        firmId: z.string().uuid(),
        amount: z.number().min(500).max(15000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ctx = await resolveCapacityContext(supabase, userId, data.firmId);
    assertAdminOnly(ctx, "change maternity leave savings");

    const { error } = await supabase
      .from("firm_config")
      .update({ maternity_leave_savings_per_month: data.amount })
      .eq("firm_id", data.firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveScheduleBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        firmId: z.string().uuid(),
        block: lifeEventSchema,
        exceptions: z.array(scheduleExceptionSchema).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ctx = await resolveCapacityContext(supabase, userId, data.firmId);

    if (data.block.id) {
      await assertLifeEventAccess(supabase, ctx, data.firmId, data.block.id);
    }

    let firmMemberId: string | null = ctx.isAdmin ? null : ctx.firmMemberId;
    if (data.block.id && ctx.isAdmin) {
      const { data: existing } = await supabase
        .from("firm_life_events")
        .select("firm_member_id")
        .eq("id", data.block.id)
        .eq("firm_id", data.firmId)
        .maybeSingle();
      firmMemberId = (existing?.firm_member_id as string | null) ?? null;
    }

    const payload = {
      firm_id: data.firmId,
      firm_member_id: firmMemberId,
      name: data.block.name,
      event_type: data.block.event_type,
      start_date: data.block.start_date,
      end_date: data.block.end_date,
      capacity_pct: data.block.capacity_pct,
      notes: data.block.notes ?? null,
      is_recurring: data.block.is_recurring ?? false,
      block_type: data.block.block_type ?? "life_event",
      recurs_annually: data.block.recurs_annually ?? false,
      default_capacity_pct: data.block.default_capacity_pct ?? null,
      weekly_hours_blocked: data.block.weekly_hours_blocked ?? null,
      scheduling_only: data.block.scheduling_only ?? false,
      updated_at: new Date().toISOString(),
    };

    let blockId = data.block.id;

    if (blockId) {
      const { error } = await supabase
        .from("firm_life_events")
        .update(payload)
        .eq("id", blockId)
        .eq("firm_id", data.firmId);
      if (error) throw new Error(error.message);
      await supabase.from("schedule_exceptions").delete().eq("life_event_id", blockId);
    } else {
      const { data: row, error } = await supabase
        .from("firm_life_events")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      blockId = row.id as string;
    }

    if (data.exceptions?.length && blockId) {
      const rows = data.exceptions.map((ex) => ({
        firm_id: data.firmId,
        life_event_id: blockId!,
        week_start: ex.week_start,
        capacity_pct: ex.capacity_pct,
        label: ex.label ?? null,
        notes: ex.notes ?? null,
      }));
      const { error } = await supabase.from("schedule_exceptions").insert(rows);
      if (error) throw new Error(error.message);
    }

    return { id: blockId };
  });

export const markCapacityBlocksOnboarded = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ firmId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ctx = await resolveCapacityContext(supabase, userId, data.firmId);
    assertAdminOnly(ctx, "dismiss the capacity onboarding prompt");

    const { error } = await supabaseAdmin
      .from("firm_config")
      .update({ capacity_blocks_onboarded: true })
      .eq("firm_id", data.firmId);
    if (error) {
      if (isMissingSchemaColumn(error, "capacity_blocks_onboarded")) {
        return { ok: true, persisted: false };
      }
      throw new Error(error.message);
    }
    return { ok: true, persisted: true };
  });
