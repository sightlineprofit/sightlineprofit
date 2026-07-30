import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePrincipalOrAdmin } from "@/lib/auth-guards.server";
import { calc, getRetainerRevenue, mapTeamBurdenRow, type FirmConfig, type Expense, type OwnerCompensationRow } from "@/lib/finance";

export type RetainerClientStatus = "healthy" | "watch" | "concern" | "no_data";

export type RetainerClientSummary = {
  projectId: string;
  projectName: string;
  clientName: string | null;
  monthlyFee: number;
  hoursThisMonth: number | null;
  realizedRateThisMonth: number | null;
  monthsActive: number;
  status: RetainerClientStatus;
};

export type RetainerPortfolioMetrics = {
  totalMonthlyRetainerRevenue: number;
  annualRetainerRevenue: number;
  monthlyRevenueTarget: number;
  monthlyRevenueGap: number;
  revenueOnTrack: boolean;
  totalFirmMonthlyHrs: number;
  committedMonthlyHrs: number;
  availableMonthlyHrs: number;
  hasHoursData: boolean;
  clients: RetainerClientSummary[];
  activeClientCount: number;
  clientsNeededToCloseGap: number;
  averageMonthlyFee: number;
  alignedRate: number;
  breakEvenRate: number;
  portfolioRealizedRate: number | null;
  targetMarginPct: number;
};

const STATUS_SORT: Record<RetainerClientStatus, number> = {
  concern: 0,
  watch: 1,
  healthy: 2,
  no_data: 3,
};

function roundUpToHalf(n: number): number {
  return Math.ceil(n * 2) / 2;
}

function clientStatus(
  realizedRate: number | null,
  alignedRate: number,
  breakEvenRate: number,
): RetainerClientStatus {
  if (realizedRate == null || !Number.isFinite(realizedRate)) return "no_data";
  if (realizedRate >= alignedRate) return "healthy";
  if (realizedRate >= breakEvenRate) return "watch";
  return "concern";
}

type RetainerProjectRow = {
  id: string;
  name: string;
  client_name: string | null;
  monthly_retainer_fee?: number | null;
  retainer_monthly_amount?: number | null;
  retainer_start_date?: string | null;
  start_date?: string | null;
  status?: string | null;
  pricing_method?: string | null;
};

type TimeEntryRow = { project_id: string; hrs: number | null };

/** Pure builder — no I/O. */
export function buildRetainerPortfolioMetrics(args: {
  calcResult: ReturnType<typeof calc>;
  targetMarginPct: number;
  projects: RetainerProjectRow[];
  timeEntriesLast30Days: TimeEntryRow[];
  now?: Date;
}): RetainerPortfolioMetrics {
  const { calcResult, targetMarginPct, projects, timeEntriesLast30Days } = args;
  const now = args.now ?? new Date();

  const alignedRate = calcResult.alignedRate || 0;
  const breakEvenRate = calcResult.breakEvenRate || 0;
  const annualRevenueRequired = alignedRate * calcResult.annualBillableHrs;
  const monthlyRevenueTarget = annualRevenueRequired / 12;
  const totalFirmMonthlyHrs = calcResult.annualBillableHrs / 12;

  const hoursByProject = new Map<string, number>();
  for (const entry of timeEntriesLast30Days) {
    const pid = entry.project_id;
    const hrs = Number(entry.hrs) || 0;
    hoursByProject.set(pid, (hoursByProject.get(pid) ?? 0) + hrs);
  }

  const clients: RetainerClientSummary[] = [];
  let totalMonthlyRetainerRevenue = 0;
  let committedMonthlyHrs = 0;

  for (const project of projects) {
    const monthlyFee =
      Number(project.monthly_retainer_fee ?? project.retainer_monthly_amount) || 0;
    const hoursRaw = hoursByProject.get(project.id);
    const hasHours = hoursRaw != null && hoursRaw > 0;
    const hoursThisMonth = hasHours ? hoursRaw! : null;
    const realizedRateThisMonth = hasHours ? monthlyFee / hoursThisMonth! : null;
    const { monthsActive } = getRetainerRevenue(project, now);

    totalMonthlyRetainerRevenue += monthlyFee;
    if (hasHours) committedMonthlyHrs += hoursThisMonth!;

    clients.push({
      projectId: project.id,
      projectName: project.name,
      clientName: project.client_name,
      monthlyFee,
      hoursThisMonth,
      realizedRateThisMonth,
      monthsActive,
      status: clientStatus(realizedRateThisMonth, alignedRate, breakEvenRate),
    });
  }

  clients.sort(
    (a, b) =>
      STATUS_SORT[a.status] - STATUS_SORT[b.status] ||
      (a.clientName ?? a.projectName).localeCompare(b.clientName ?? b.projectName),
  );

  const activeClientCount = clients.length;
  const averageMonthlyFee =
    activeClientCount > 0 ? totalMonthlyRetainerRevenue / activeClientCount : 0;
  const annualRetainerRevenue = totalMonthlyRetainerRevenue * 12;
  const monthlyRevenueGap = monthlyRevenueTarget - totalMonthlyRetainerRevenue;
  const revenueOnTrack = annualRetainerRevenue >= annualRevenueRequired;
  const hasHoursData = committedMonthlyHrs > 0;
  const availableMonthlyHrs = totalFirmMonthlyHrs - committedMonthlyHrs;

  let clientsNeededToCloseGap = 0;
  if (monthlyRevenueGap > 0 && averageMonthlyFee > 0) {
    clientsNeededToCloseGap = roundUpToHalf(monthlyRevenueGap / averageMonthlyFee);
  }

  const portfolioRealizedRate = hasHoursData
    ? totalMonthlyRetainerRevenue / committedMonthlyHrs
    : null;

  return {
    totalMonthlyRetainerRevenue,
    annualRetainerRevenue,
    monthlyRevenueTarget,
    monthlyRevenueGap,
    revenueOnTrack,
    totalFirmMonthlyHrs,
    committedMonthlyHrs,
    availableMonthlyHrs,
    hasHoursData,
    clients,
    activeClientCount,
    clientsNeededToCloseGap,
    averageMonthlyFee,
    alignedRate,
    breakEvenRate,
    portfolioRealizedRate,
    targetMarginPct,
  };
}

const retainerMetricsSchema = z.object({
  firmId: z.string().uuid(),
});

export const getRetainerPortfolioMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => retainerMetricsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requirePrincipalOrAdmin(supabase, userId);
    const effectiveFirmId = profile.impersonated_firm_id ?? profile.firm_id;
    if (effectiveFirmId !== data.firmId && !profile.is_super_admin) {
      throw new Error("Access restricted");
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sinceIso = thirtyDaysAgo.toISOString().slice(0, 10);

    const [{ data: config }, { data: expenses }, { data: ownerComp }, { data: teamBurdens }, { data: projects }] =
      await Promise.all([
        supabase.from("firm_config").select("*").eq("firm_id", data.firmId).maybeSingle(),
        supabase.from("expenses").select("*").eq("firm_id", data.firmId),
        supabase.from("owner_compensation").select("*").eq("firm_id", data.firmId),
        supabase
          .from("firm_members")
          .select(
            "burdened_weekly_cost, weeks_per_year, expected_hrs_per_week, productive_hrs_per_week, billed_rate, is_active",
          )
          .eq("firm_id", data.firmId)
          .eq("is_active", true)
          .neq("role_type", "principal"),
        supabase
          .from("projects")
          .select(
            "id, name, client_name, monthly_retainer_fee, retainer_monthly_amount, retainer_start_date, start_date, status, pricing_method",
          )
          .eq("firm_id", data.firmId)
          .eq("pricing_method", "retainer")
          .in("status", ["active", "in_progress"]),
      ]);

    const firmConfig = (config ?? null) as FirmConfig | null;
    const calcResult = calc(firmConfig, (expenses ?? []) as Expense[], {
      ownerComp: (ownerComp ?? []) as OwnerCompensationRow[],
      teamProfiles: (teamBurdens ?? []).map(mapTeamBurdenRow),
    });

    const projectRows = (projects ?? []) as RetainerProjectRow[];
    const projectIds = projectRows.map((p) => p.id);

    let timeEntriesLast30Days: TimeEntryRow[] = [];
    if (projectIds.length > 0) {
      const { data: entries } = await supabase
        .from("time_entries")
        .select("project_id, hrs")
        .eq("firm_id", data.firmId)
        .in("project_id", projectIds)
        .gte("date", sinceIso);
      timeEntriesLast30Days = (entries ?? []) as TimeEntryRow[];
    }

    return buildRetainerPortfolioMetrics({
      calcResult,
      targetMarginPct: Number(firmConfig?.target_gross_margin_pct) || 0,
      projects: projectRows,
      timeEntriesLast30Days,
    });
  });
