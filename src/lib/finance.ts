// Shared finance math for Sightline. All values in USD/year unless noted.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePrincipalOrAdmin } from "@/lib/auth-guards.server";

export type FirmConfig = {
  comp_draw_annual: number | null;
  comp_ptax_pct: number | null;
  comp_health_annual: number | null;
  comp_retire_annual: number | null;
  available_hrs_per_week: number | null;
  target_billable_hrs_per_week: number | null;
  target_gross_margin_pct: number | null;
  rate_billed: number | null;
  /** Planning utilization % applied to revenue capacity (0–100). Null = full target hours. */
  target_utilization_pct?: number | null;
  pricing_structure?: string | null;
  actual_billed_rate: number | null;
  accounting_basis?: string | null;
  business_structure?: string | null;
  comp_distribution_annual?: number | null;
  comp_reserve_target_annual?: number | null;
  planned_activity_allocation?: Record<string, number> | unknown | null;
};

/** Principal billable target capped at available hours when available is set. */
export function effectivePrincipalBillableHrsWeek(
  config: FirmConfig | null | undefined,
  hrsOverride?: number | null,
): number {
  const raw = (hrsOverride ?? Number(config?.target_billable_hrs_per_week)) || 0;
  const available = Number(config?.available_hrs_per_week) || 0;
  if (available <= 0) return raw;
  return Math.min(raw, available);
}

/** True when principal and/or team hours give a non-zero annual productive denominator. */
export function firmHasProductiveCapacity(annualBillableHrs: number | null | undefined): boolean {
  return (Number(annualBillableHrs) || 0) > 0;
}

/** Clamp target billable to available on a config patch (mutates copy). */
export function capTargetBillableToAvailable(
  data: Record<string, unknown>,
  prevConfig?: Record<string, unknown> | null,
): void {
  const mergedAvailable =
    data.available_hrs_per_week !== undefined
      ? data.available_hrs_per_week
      : prevConfig?.available_hrs_per_week;
  const mergedTarget =
    data.target_billable_hrs_per_week !== undefined
      ? data.target_billable_hrs_per_week
      : prevConfig?.target_billable_hrs_per_week;
  const availN = Number(mergedAvailable) || 0;
  const targetN = Number(mergedTarget) || 0;
  if (availN > 0 && targetN > availN) {
    data.target_billable_hrs_per_week = availN;
  }
}

/** One principal's compensation record (from owner_compensation table). */
export type OwnerCompensationRow = {
  profile_id?: string;
  comp_draw_annual: number | null;
  payroll_tax_pct: number | null;
  health_insurance_annual: number | null;
  retirement_annual: number | null;
  distribution_annual: number | null;
  distribution_tax_rate?: number | null;
  reserve_target: number | null;
  reserve_months?: number | null;
  employee_payroll_tax_pct?: number | null;
};

/** Gross-up reserve so net distributions cover personal income tax at effective rate. */
export function computeDistributionTaxReserve(
  distributions: number,
  distributionTaxRate: number | null | undefined,
): { distributionTaxReserve: number; grossedUpDistributions: number } {
  const dist = Number(distributions) || 0;
  const rate = distributionTaxRate != null ? Number(distributionTaxRate) : null;
  if (rate == null || rate <= 0 || rate >= 1 || dist <= 0) {
    return { distributionTaxReserve: 0, grossedUpDistributions: dist };
  }
  const grossedUpDistributions = dist / (1 - rate);
  return {
    distributionTaxReserve: grossedUpDistributions - dist,
    grossedUpDistributions,
  };
}

/** Team member burdened cost input (from profiles for non-principals). */
export type TeamBurden = {
  burdened_weekly_cost: number | null;
  weeks_per_year: number | null;
  /** Billable hours per week this team member is expected to contribute.
   * When present, added to the firm's aligned-rate denominator. */
  expected_hrs_per_week?: number | null;
  /** Optional per-member billed rate. When null, the firm default is used. */
  billed_rate?: number | null;
  /** Client-project hours/week included in firm-wide capacity denominator. */
  productive_hrs_per_week?: number | null;
  is_active?: boolean | null;
};

/** Client-project hours/week for firm capacity denominator. */
export function memberProductiveHrsWeek(member: TeamBurden): number {
  const productive = Number(member.productive_hrs_per_week);
  if (Number.isFinite(productive) && productive > 0) return productive;
  const expected = Number(member.expected_hrs_per_week);
  if (Number.isFinite(expected) && expected > 0) return expected;
  return 0;
}

/** Map a firm_members row into calc() team profile input. */
export function mapTeamBurdenRow(t: {
  burdened_weekly_cost?: number | null;
  weeks_per_year?: number | null;
  expected_hrs_per_week?: number | null;
  productive_hrs_per_week?: number | null;
  billed_rate?: number | null;
  is_active?: boolean | null;
}): TeamBurden {
  return {
    burdened_weekly_cost: t.burdened_weekly_cost ?? null,
    weeks_per_year: t.weeks_per_year ?? null,
    expected_hrs_per_week: t.expected_hrs_per_week ?? null,
    productive_hrs_per_week: t.productive_hrs_per_week ?? null,
    billed_rate: t.billed_rate ?? null,
    is_active: t.is_active ?? null,
  };
}

export type Expense = {
  id: string;
  name: string;
  amount: number;
  frequency: "annual" | "monthly" | "quarterly" | "onetime";
  amort_months: number | null;
  recurring: boolean;
};

export type RateOverrides = {
  extraOneTimeAnnual?: number; // sum of one-time investments amortized to /yr
  extraRecurringAnnual?: number;
  rateOverride?: number | null;
  hrsOverride?: number | null; // billable hrs/week
  payIncreaseAnnual?: number;
  /** When provided, calc() sums owner cost across these rows instead of reading firm_config. */
  ownerComp?: OwnerCompensationRow[];
  /** When provided, calc() adds team member fully burdened annual cost. */
  teamProfiles?: TeamBurden[];
};

export const WEEKS_DEFAULT = 48;

export function annualizeExpense(e: Expense): { recurring: number; oneTime: number } {
  const amt = Number(e.amount) || 0;
  if (e.frequency === "annual") return { recurring: amt, oneTime: 0 };
  if (e.frequency === "monthly") return { recurring: amt * 12, oneTime: 0 };
  if (e.frequency === "quarterly") return { recurring: amt * 4, oneTime: 0 };
  // one-time: amortize over amort_months (default 12)
  const months = e.amort_months ?? 12;
  return { recurring: 0, oneTime: (amt / months) * 12 };
}

export function calc(config: FirmConfig | null, expenses: Expense[], ov: RateOverrides = {}) {
  const structure = (config?.business_structure ?? null) as
    | "sole_prop"
    | "s_corp"
    | "partnership"
    | "c_corp"
    | "other"
    | null;

  let opexRecurring = 0;
  let opexOneTime = 0;
  for (const e of expenses) {
    const a = annualizeExpense(e);
    opexRecurring += a.recurring;
    opexOneTime += a.oneTime;
  }
  opexRecurring += ov.extraRecurringAnnual || 0;
  opexOneTime += ov.extraOneTimeAnnual || 0;
  const opexAnnualForReserve = opexRecurring + opexOneTime;

  // ── Owner compensation ──
  // Prefer owner_compensation rows when provided (new multi-principal model).
  // Fall back to firm_config for backward compatibility with older callers.
  let draw = 0;
  let ptax = 0;
  let health = 0;
  let retire = 0;
  let distribution = 0;
  let reserveTarget = 0;
  let distributionTaxReserve = 0;
  let grossedUpDistributions = 0;
  let distributionTaxRate: number | null = null;
  const ownerRows = ov.ownerComp;
  if (ownerRows && ownerRows.length > 0) {
    const ratesSeen = new Set<number>();
    for (const r of ownerRows) {
      const d = Number(r.comp_draw_annual) || 0;
      const pct = Number(r.payroll_tax_pct ?? 15.3) || 0;
      draw += d;
      // S-Corp: payroll_tax_pct = employer share; add employee share too.
      const empePct =
        structure === "s_corp" ? Number(r.employee_payroll_tax_pct ?? 0) || 0 : 0;
      ptax += d * ((pct + empePct) / 100);
      health += Number(r.health_insurance_annual) || 0;
      retire += Number(r.retirement_annual) || 0;
      const rowDist = Number(r.distribution_annual) || 0;
      distribution += rowDist;
      const rowRate =
        r.distribution_tax_rate != null ? Number(r.distribution_tax_rate) : null;
      const rowReserve = computeDistributionTaxReserve(rowDist, rowRate);
      distributionTaxReserve += rowReserve.distributionTaxReserve;
      grossedUpDistributions += rowReserve.grossedUpDistributions;
      if (rowRate != null && rowRate > 0) ratesSeen.add(rowRate);
      if (structure === "s_corp") {
        const months = Number(r.reserve_months) || 0;
        if (months > 0) {
          reserveTarget += months * (opexAnnualForReserve / 12);
        } else {
          reserveTarget += Number(r.reserve_target) || 0;
        }
      }
    }
    distributionTaxRate = ratesSeen.size === 1 ? [...ratesSeen][0]! : null;
    draw += ov.payIncreaseAnnual || 0;
    if (ov.payIncreaseAnnual && ownerRows[0]) {
      const pct0 = Number(ownerRows[0].payroll_tax_pct ?? 15.3) || 0;
      ptax += (ov.payIncreaseAnnual || 0) * (pct0 / 100);
    }
  } else {
    draw = (Number(config?.comp_draw_annual) || 0) + (ov.payIncreaseAnnual || 0);
    const ptaxPct = Number(config?.comp_ptax_pct) || 0;
    ptax = (draw * ptaxPct) / 100;
    health = Number(config?.comp_health_annual) || 0;
    retire = Number(config?.comp_retire_annual) || 0;
    distribution = Number(config?.comp_distribution_annual) || 0;
    reserveTarget =
      structure === "s_corp" ? Number(config?.comp_reserve_target_annual) || 0 : 0;
    grossedUpDistributions = distribution;
  }
  const compTotal =
    draw + ptax + health + retire + distribution + distributionTaxReserve + reserveTarget;

  // ── Team member fully burdened annual cost ──
  let teamCostTotal = 0;
  let teamBillableHrsWeek = 0;
  for (const t of ov.teamProfiles ?? []) {
    const wk = Number(t.burdened_weekly_cost) || 0;
    const wks = Number(t.weeks_per_year) || 48;
    teamCostTotal += wk * wks;
    teamBillableHrsWeek += Number(t.expected_hrs_per_week) || 0;
  }

  const totalCost = compTotal + opexRecurring + opexOneTime + teamCostTotal;

  const principalBillableHrsWeek = effectivePrincipalBillableHrsWeek(config, ov.hrsOverride);
  const targetBillableHrsWeek = principalBillableHrsWeek + teamBillableHrsWeek;
  const weeksPerYear = WEEKS_DEFAULT;
  const ownerHrs = principalBillableHrsWeek * weeksPerYear;
  const teamHrs = (ov.teamProfiles ?? [])
    .filter((m) => m.is_active !== false)
    .reduce((sum, member) => {
      const memberWeeklyHrs = memberProductiveHrsWeek(member);
      const memberWeeks = Number(member.weeks_per_year) || weeksPerYear;
      return sum + memberWeeklyHrs * memberWeeks;
    }, 0);
  const annualBillableHrs = ownerHrs + teamHrs;

  const breakEvenRate = annualBillableHrs > 0 ? totalCost / annualBillableHrs : 0;

  const marginPct = Number(config?.target_gross_margin_pct) || 0;
  const alignedRate = marginPct < 100 && annualBillableHrs > 0
    ? breakEvenRate / (1 - marginPct / 100)
    : breakEvenRate;

  const billedRate = ov.rateOverride ?? Number(config?.rate_billed) ?? alignedRate;

  // Per-contributor budget revenue. Principal bills at firm default rate;
  // each team member bills at their own billed_rate when set, else firm default.
  const firmRate = Number(billedRate) || 0;
  const principalRevenue = firmRate * principalBillableHrsWeek * weeksPerYear;
  let teamRevenue = 0;
  for (const t of ov.teamProfiles ?? []) {
    const hrs = Number(t.expected_hrs_per_week) || 0;
    if (hrs <= 0) continue;
    const rate = Number(t.billed_rate);
    const useRate = Number.isFinite(rate) && rate > 0 ? rate : firmRate;
    teamRevenue += useRate * hrs * weeksPerYear;
  }
  const annualRevenue = principalRevenue + teamRevenue;
  const targetUtilizationPctRaw = Number(config?.target_utilization_pct);
  const targetUtilizationPct =
    Number.isFinite(targetUtilizationPctRaw) && targetUtilizationPctRaw > 0
      ? Math.min(100, Math.max(0, targetUtilizationPctRaw))
      : null;
  const utilizationFactor =
    targetUtilizationPct != null ? targetUtilizationPct / 100 : 1;
  const revenueCapacityAtTargets = annualRevenue;
  const revenueCapacityAtUtilization = annualRevenue * utilizationFactor;
  const grossProfit = annualRevenue - totalCost;
  const grossMarginPct = annualRevenue > 0 ? (grossProfit / annualRevenue) * 100 : 0;

  // CORRECT: aligned rate is the floor. Margin above floor = billed - aligned.
  // Can be negative when billed rate falls short of the floor.
  const marginAboveFloor = (billedRate || 0) - alignedRate;
  const marginAboveBreakEven = (billedRate || 0) - breakEvenRate;
  const gapToFloor = Math.max(0, alignedRate - (billedRate || 0));
  const gapToBreakEven = Math.max(0, breakEvenRate - (billedRate || 0));
  // Rate safety buffer = cushion above break-even, as % of break-even.
  const rateSafetyBuffer = breakEvenRate > 0 ? (marginAboveBreakEven / breakEvenRate) * 100 : 0;

  // Three-state rate health
  type RateHealth = "critical" | "below_floor" | "healthy";
  const rateHealth: RateHealth =
    (billedRate || 0) < breakEvenRate
      ? "critical"
      : (billedRate || 0) < alignedRate
        ? "below_floor"
        : "healthy";

  // Per-hour allocation. Split margin into "at floor" (needed to reach aligned)
  // and "above floor" (true cushion). Both clamp to >= 0 for bar rendering.
  const billedForBar = Math.max(0, billedRate || 0);
  const perHour = annualBillableHrs > 0 ? {
    comp: compTotal / annualBillableHrs,
    opexRecurring: opexRecurring / annualBillableHrs,
    opexOneTime: opexOneTime / annualBillableHrs,
    marginAtFloor: Math.max(0, Math.min(alignedRate, billedForBar) - breakEvenRate),
    marginAbove: Math.max(0, billedForBar - alignedRate),
    gapToFloor,
  } : { comp: 0, opexRecurring: 0, opexOneTime: 0, marginAtFloor: 0, marginAbove: 0, gapToFloor: 0 };

  return {
    draw, ptax, health, retire, distribution, reserveTarget, compTotal,
    distributionTaxReserve, grossedUpDistributions, distributionTaxRate,
    structure,
    opexRecurring, opexOneTime, teamCostTotal, totalCost,
    targetBillableHrsWeek, weeksPerYear, annualBillableHrs,
    principalBillableHrsWeek, teamBillableHrsWeek,
    principalRevenue, teamRevenue,
    breakEvenRate, alignedRate, billedRate,
    annualRevenue, revenueCapacityAtTargets, revenueCapacityAtUtilization,
    targetUtilizationPct,
    grossProfit, grossMarginPct,
    marginAboveFloor, marginAboveBreakEven, gapToFloor, gapToBreakEven,
    rateHealth, rateSafetyBuffer,
    marginBuffer: marginAboveFloor,
    perHour,
  };
}

export function fmtUsd(n: number, opts: { decimals?: number } = {}) {
  const d = opts.decimals ?? 0;
  if (!Number.isFinite(n)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: d, maximumFractionDigits: d,
  }).format(n);
}

export function fmtPct(n: number, decimals = 1) {
  if (!Number.isFinite(n)) return "0%";
  return `${n.toFixed(decimals)}%`;
}

// Hours formatter: precise decimal up to 2 places; no trailing zeros; never rounds whole numbers.
// Examples: 8 → "8 hrs", 1.5 → "1.5 hrs", 1.25 → "1.25 hrs", 47.25 → "47.25 hrs".
export function formatHours(hrs: number): string {
  const n = Number(hrs) || 0;
  if (n === Math.floor(n)) return `${n} hrs`;
  return `${parseFloat(n.toFixed(2))} hrs`;
}

// Health score (0-100): weighted blend of margin, safety buffer, comp ratio
export function healthScore(c: ReturnType<typeof calc>) {
  const marginScore = Math.max(0, Math.min(100, (c.grossMarginPct / 50) * 100));
  const bufferScore = Math.max(0, Math.min(100, (c.rateSafetyBuffer / 100) * 100));
  const compRatio = c.totalCost > 0 ? c.compTotal / c.totalCost : 0;
  // sweet spot for comp share is ~0.45-0.60
  const compScore = Math.max(0, 100 - Math.abs(compRatio - 0.52) * 200);
  return Math.round(marginScore * 0.45 + bufferScore * 0.35 + compScore * 0.2);
}

// ─── Plain-language helpers for "every dollar has a per-hour cost" framing ───

/** Cash recovery for a one-time purchase, given current above-floor margin. */
export function cashRecovery({
  amount,
  marginPerHr,
  billableHrsPerWeek,
}: {
  amount: number;
  marginPerHr: number;
  billableHrsPerWeek: number;
}) {
  if (!Number.isFinite(amount) || amount <= 0) return { hours: 0, weeks: 0, months: 0 };
  if (!Number.isFinite(marginPerHr) || marginPerHr <= 0) {
    return { hours: Infinity, weeks: Infinity, months: Infinity };
  }
  const hours = amount / marginPerHr;
  const weeks = billableHrsPerWeek > 0 ? hours / billableHrsPerWeek : Infinity;
  const months = weeks / 4.33;
  return { hours, weeks, months };
}

/** Per-hour cost added by spreading a one-time amount over N months. */
export function oneTimePerHr({
  amount,
  months,
  annualBillableHrs,
}: {
  amount: number;
  months: number;
  annualBillableHrs: number;
}) {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (!Number.isFinite(months) || months <= 0) return 0;
  if (!Number.isFinite(annualBillableHrs) || annualBillableHrs <= 0) return 0;
  const annualized = (amount / months) * 12;
  return annualized / annualBillableHrs;
}

/** Suggested split of above-floor margin: 25% tax, 10% reserve, remainder growth. */
export function marginBreakdown(grossProfitPerHr: number) {
  const m = Math.max(0, Number(grossProfitPerHr) || 0);
  const tax = m * 0.25;
  const reserve = m * 0.1;
  const growth = Math.max(0, m - tax - reserve);
  return { tax, reserve, growth, available: growth };
}

// ─── Per-project margin (true margin, not revenue) ─────────────────────────
// Uses the firm's break-even rate as the per-hour cost floor. Margin equals
// project fee minus (breakEven × scoped hours). Margin only erodes once
// hours logged exceed the scoped budget: each over-scope hour subtracts
// breakEven from remaining margin.

export type ProjectMarginCalc = {
  projectFee: number;
  scopedHours: number;
  hoursLogged: number;
  hoursRemaining: number;
  breakEvenRate: number;
  alignedRate: number | null;
  effectiveRate: number;
  totalProjectCost: number;
  grossMargin: number;
  grossMarginPct: number;
  taxReserve: number;
  netProfit: number;
  netProfitPct: number;
  isBelowBreakEven: boolean;
  isBelowAlignedRate: boolean;
  isOverScope: boolean;
  overScopeHours: number;
  marginErosion: number;
  remainingMargin: number;
  remainingMarginPct: number;
};

export function getProjectMarginCalc(args: {
  projectFee: number;
  scopedHours: number;
  hoursLogged: number;
  breakEvenRate: number;
  alignedRate?: number | null;
  taxReservePct?: number;
}): ProjectMarginCalc {
  const projectFee = Number(args.projectFee) || 0;
  const scopedHours = Number(args.scopedHours) || 0;
  const hoursLogged = Math.max(0, Number(args.hoursLogged) || 0);
  const breakEvenRate = Math.max(0, Number(args.breakEvenRate) || 0);
  const alignedRate = args.alignedRate == null ? null : Number(args.alignedRate) || 0;
  const taxReservePct = args.taxReservePct ?? 0.25;

  const totalProjectCost = breakEvenRate * scopedHours;
  const grossMargin = projectFee - totalProjectCost;
  const grossMarginPct = projectFee > 0 ? (grossMargin / projectFee) * 100 : 0;
  const taxReserve = grossMargin > 0 ? grossMargin * taxReservePct : 0;
  const netProfit = grossMargin - taxReserve;
  const netProfitPct = projectFee > 0 ? (netProfit / projectFee) * 100 : 0;

  const effectiveRate = scopedHours > 0 ? projectFee / scopedHours : 0;
  const isBelowBreakEven = effectiveRate > 0 && effectiveRate < breakEvenRate;
  const isBelowAlignedRate =
    alignedRate != null && alignedRate > 0 && effectiveRate > 0 && effectiveRate < alignedRate;

  const overScopeHours = Math.max(0, hoursLogged - scopedHours);
  const isOverScope = overScopeHours > 0;

  const costHours = hoursLogged > scopedHours ? hoursLogged : scopedHours;
  const totalProjectCostAtLogged = breakEvenRate * costHours;
  const actualGrossMargin = projectFee - totalProjectCostAtLogged;
  const actualTaxReserve = actualGrossMargin > 0 ? actualGrossMargin * taxReservePct : 0;
  const remainingMargin = actualGrossMargin - actualTaxReserve;
  const remainingMarginPct = projectFee > 0 ? (remainingMargin / projectFee) * 100 : 0;
  const marginErosion = Math.max(0, netProfit - remainingMargin);
  const hoursRemaining = Math.max(0, scopedHours - hoursLogged);

  return {
    projectFee, scopedHours, hoursLogged, hoursRemaining,
    breakEvenRate, alignedRate, effectiveRate,
    totalProjectCost, grossMargin, grossMarginPct,
    taxReserve, netProfit, netProfitPct,
    isBelowBreakEven, isBelowAlignedRate,
    isOverScope, overScopeHours, marginErosion,
    remainingMargin, remainingMarginPct,
  };
}

// ─── getProjectFinancials — snapshot-locked project math ────────────────────
// Single source of truth for the redesigned project card + detail. Reads from
// a project_cost_snapshots row (locked at project creation) instead of the
// firm's current cost structure, so margin never shifts under a project after
// it's quoted. Tax reserve is applied to gross margin (profit-only), per
// spec: taxReserve = grossMargin × tax_reserve_pct.

export type ProjectPricingMethod = "flat_fee" | "hourly" | "hybrid" | "retainer";

export function getRetainerRevenue(
  project: {
    monthly_retainer_fee?: number | null;
    retainer_monthly_amount?: number | null;
    retainer_start_date?: string | null;
    start_date?: string | null;
  },
  now: Date = new Date(),
): {
  monthsActive: number;
  totalRevenue: number;
  currentMonthRevenue: number;
} {
  const monthly =
    Number(project.monthly_retainer_fee ?? project.retainer_monthly_amount) || 0;
  const startStr = project.retainer_start_date ?? project.start_date;
  let monthsActive = 1;
  if (startStr) {
    const start = new Date(`${startStr}T12:00:00`);
    if (!Number.isNaN(start.getTime())) {
      monthsActive =
        (now.getFullYear() - start.getFullYear()) * 12 +
        (now.getMonth() - start.getMonth()) +
        1;
      monthsActive = Math.max(1, monthsActive);
    }
  }
  return {
    monthsActive,
    totalRevenue: monthly * monthsActive,
    currentMonthRevenue: monthly,
  };
}

export function retainerContractValue(project: {
  monthly_retainer_fee?: number | null;
  retainer_monthly_amount?: number | null;
  retainer_start_date?: string | null;
  retainer_duration_months?: number | null;
  start_date?: string | null;
  flat_fee_amount?: number | null;
  fixed_fee?: number | null;
}): number {
  const monthly =
    Number(project.monthly_retainer_fee ?? project.retainer_monthly_amount) || 0;
  if (monthly > 0 && (project.retainer_start_date ?? project.start_date)) {
    return getRetainerRevenue(project).totalRevenue;
  }
  const months = Number(project.retainer_duration_months) || 0;
  if (monthly > 0 && months > 0) return monthly * months;
  return Number(project.flat_fee_amount ?? project.fixed_fee) || 0;
}

export type ProjectCostSnapshot = {
  annual_billable_hrs: number;
  target_margin_pct: number;
  weeks_per_year: number;
  comp_per_hour: number;
  opex_per_hour: number;
  team_per_hour: number;
  break_even_rate: number;
  aligned_rate: number;
  tax_reserve_pct: number;
  total_owner_comp: number;
  total_opex: number;
  total_team_cost: number;
  total_cost_floor: number;
  distribution_tax_reserve?: number;
  distribution_tax_rate?: number | null;
  snapshotted_at?: string | null;
  is_retroactive?: boolean | null;
  cost_basis_method?: "firm_average" | "task_assignee";
  assignee_cost_breakdown?: AssigneeCostItem[] | null;
  project_break_even_rate?: number | null;
};

export type AssigneeCostItem = {
  firmMemberId: string | null;
  memberName: string;
  burdenedRatePerHour: number;
  billableHrs: number;
  nonBillableHrs: number;
  totalHrs: number;
  costContribution: number;
  isPrincipal?: boolean;
};

export type ProjectBreakEvenResult = {
  method: "task_assignee" | "firm_average";
  projectBreakEvenRate: number;
  assigneeBreakdown: AssigneeCostItem[];
  totalAssigneeCost: number;
  opexContribution: number;
  totalProjectCost: number;
  hasAssigneeData: boolean;
  opexPerHour: number;
  billableScopedHrs: number;
  nonBillableScopedHrs: number;
  totalScopedHrs: number;
};

/** Raw assignee row used to compute project break-even (from DB or snapshot). */
export type TaskAssigneeRow = {
  firmMemberId: string | null;
  memberName: string;
  isPrincipal: boolean;
  burdenedRatePerHour: number;
  estimatedHrs: number;
  isBillable: boolean;
};

export function calculateProjectBreakEven(
  snapshot: ProjectCostSnapshot,
  assigneeRows: TaskAssigneeRow[],
): ProjectBreakEvenResult {
  const opexPerHour = Number(snapshot.opex_per_hour) || 0;
  const firmBreakEven = Number(snapshot.break_even_rate) || 0;

  const withHours = assigneeRows.filter((r) => Number(r.estimatedHrs) > 0);
  if (withHours.length === 0) {
    return {
      method: "firm_average",
      projectBreakEvenRate: firmBreakEven,
      assigneeBreakdown: [],
      totalAssigneeCost: 0,
      opexContribution: 0,
      totalProjectCost: 0,
      hasAssigneeData: false,
      opexPerHour,
      billableScopedHrs: 0,
      nonBillableScopedHrs: 0,
      totalScopedHrs: 0,
    };
  }

  const byMember = new Map<string, AssigneeCostItem>();
  let billableScopedHrs = 0;
  let nonBillableScopedHrs = 0;

  for (const row of withHours) {
    const hrs = Number(row.estimatedHrs) || 0;
    if (row.isBillable) billableScopedHrs += hrs;
    else nonBillableScopedHrs += hrs;

    const key = row.isPrincipal ? "__principal__" : row.firmMemberId ?? row.memberName;
    const existing = byMember.get(key) ?? {
      firmMemberId: row.isPrincipal ? null : row.firmMemberId,
      memberName: row.memberName,
      burdenedRatePerHour: row.burdenedRatePerHour,
      billableHrs: 0,
      nonBillableHrs: 0,
      totalHrs: 0,
      costContribution: 0,
      isPrincipal: row.isPrincipal,
    };
    if (row.isBillable) existing.billableHrs += hrs;
    else existing.nonBillableHrs += hrs;
    byMember.set(key, existing);
  }

  const assigneeBreakdown: AssigneeCostItem[] = [];
  let totalAssigneeCost = 0;
  let totalAssigneeHrs = 0;

  for (const item of byMember.values()) {
    item.totalHrs = item.billableHrs + item.nonBillableHrs;
    item.costContribution = item.burdenedRatePerHour * item.totalHrs;
    totalAssigneeCost += item.costContribution;
    totalAssigneeHrs += item.totalHrs;
    assigneeBreakdown.push(item);
  }

  const opexContribution = opexPerHour * totalAssigneeHrs;
  const totalProjectCost = totalAssigneeCost + opexContribution;
  const projectBreakEvenRate =
    totalAssigneeHrs > 0 ? totalProjectCost / totalAssigneeHrs : firmBreakEven;

  return {
    method: "task_assignee",
    projectBreakEvenRate,
    assigneeBreakdown,
    totalAssigneeCost,
    opexContribution,
    totalProjectCost,
    hasAssigneeData: true,
    opexPerHour,
    billableScopedHrs,
    nonBillableScopedHrs,
    totalScopedHrs: totalAssigneeHrs,
  };
}

export function parseAssigneeBreakdownFromJson(raw: unknown): AssigneeCostItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row: Record<string, unknown>) => {
    const billableHrs = Number(row.scoped_hrs_billable ?? row.billableHrs) || 0;
    const nonBillableHrs = Number(row.scoped_hrs_nonbillable ?? row.nonBillableHrs) || 0;
    return {
      firmMemberId: (row.firm_member_id ?? row.firmMemberId ?? null) as string | null,
      memberName: String(row.member_name ?? row.memberName ?? "Unknown"),
      burdenedRatePerHour: Number(row.burdened_rate ?? row.burdenedRatePerHour) || 0,
      billableHrs,
      nonBillableHrs,
      totalHrs: billableHrs + nonBillableHrs,
      costContribution: Number(row.cost_contribution ?? row.costContribution) || 0,
      isPrincipal: !!(row.is_principal ?? row.isPrincipal),
    };
  });
}

export function breakEvenResultFromSnapshot(
  snapshot: ProjectCostSnapshot,
): ProjectBreakEvenResult | null {
  if (snapshot.cost_basis_method !== "task_assignee") return null;
  const rate = Number(snapshot.project_break_even_rate);
  if (!Number.isFinite(rate) || rate <= 0) return null;

  const breakdown = parseAssigneeBreakdownFromJson(snapshot.assignee_cost_breakdown);
  const totalAssigneeCost = breakdown.reduce((s, a) => s + (Number(a.costContribution) || 0), 0);
  const totalScopedHrs = breakdown.reduce((s, a) => s + (Number(a.totalHrs) || 0), 0);
  const billableScopedHrs = breakdown.reduce((s, a) => s + (Number(a.billableHrs) || 0), 0);
  const nonBillableScopedHrs = breakdown.reduce((s, a) => s + (Number(a.nonBillableHrs) || 0), 0);
  const opexPerHour = Number(snapshot.opex_per_hour) || 0;
  const opexContribution = opexPerHour * totalScopedHrs;

  return {
    method: "task_assignee",
    projectBreakEvenRate: rate,
    assigneeBreakdown: breakdown,
    totalAssigneeCost,
    opexContribution,
    totalProjectCost: totalAssigneeCost + opexContribution,
    hasAssigneeData: breakdown.length > 0,
    opexPerHour,
    billableScopedHrs,
    nonBillableScopedHrs,
    totalScopedHrs,
  };
}

export function snapshotAssigneePayload(result: ProjectBreakEvenResult) {
  if (result.method !== "task_assignee" || !result.hasAssigneeData) {
    return {
      cost_basis_method: "firm_average" as const,
      assignee_cost_breakdown: [],
      project_break_even_rate: null,
    };
  }
  return {
    cost_basis_method: "task_assignee" as const,
    assignee_cost_breakdown: result.assigneeBreakdown.map((a) => ({
      firm_member_id: a.firmMemberId,
      member_name: a.memberName,
      burdened_rate: a.burdenedRatePerHour,
      scoped_hrs_billable: a.billableHrs,
      scoped_hrs_nonbillable: a.nonBillableHrs,
      cost_contribution: a.costContribution,
      is_principal: !!a.isPrincipal,
    })),
    project_break_even_rate: result.projectBreakEvenRate,
  };
}

export type ProjectFinancialsInput = {
  project: {
    pricing_method: ProjectPricingMethod | string | null | undefined;
    flat_fee_amount?: number | null;
    scoped_rate?: number | null;
    scoped_hrs?: number | null;
    hourly_scoped_hours?: number | null;
    retainer_monthly_amount?: number | null;
    retainer_duration_months?: number | null;
    monthly_retainer_fee?: number | null;
    retainer_start_date?: string | null;
    start_date?: string | null;
    fixed_fee?: number | null;
  };
  snapshot: ProjectCostSnapshot;
  hoursLogged: number;
  /** Hours logged in the current calendar month (retainer monthly rate). */
  hoursLoggedThisMonth?: number;
  lastEntryDate?: Date | string | null;
  /** Live assignee calculation; takes precedence over snapshot when provided. */
  breakEvenResult?: ProjectBreakEvenResult | null;
  /** When true, live assignees exist but snapshot still uses firm_average. */
  assigneesNewerThanSnapshot?: boolean;
};

export type ProjectFinancials = {
  // Revenue
  totalRevenue: number;
  pricingMethod: ProjectPricingMethod;
  flatFeeAmount: number;
  hourlyRevenue: number;
  scopedHours: number;
  // Cost allocation (locked to snapshot at scoped hours)
  compAllocation: number;
  opexAllocation: number;
  teamAllocation: number;
  totalCostAllocation: number;
  /** Cost lines recalculated at logged hours when over scope. */
  actualCompAllocation: number;
  actualOpexAllocation: number;
  actualTeamAllocation: number;
  actualCostAllocation: number;
  actualTaxReserve: number;
  actualAssigneeAllocations: AssigneeCostItem[];
  lockedMargin: number;
  lockedMarginPct: number;
  taxReserve: number;
  netProfit: number;
  netProfitPct: number;
  // Hours
  hoursLogged: number;
  hoursRemaining: number;
  overHours: number;
  pctConsumed: number;
  // Erosion
  marginErosion: number;
  marginRemaining: number;
  marginRemainingPct: number;
  // Targets
  targetMarginPct: number;
  targetMarginDollar: number;
  marginVariance: number;
  isAboveTarget: boolean;
  isBelowTarget: boolean;
  isBelowBreakEven: boolean;
  // Rate
  effectiveRate: number | null;
  effectiveVsAligned: number;
  effectiveVsBreakEven: number;
  // Cost basis
  costBasisMethod: "firm_average" | "task_assignee";
  projectBreakEvenRate: number;
  assigneeAllocations: AssigneeCostItem[];
  assigneesNewerThanSnapshot: boolean;
  billableScopedFromAssignees: number | null;
  nonBillableScopedFromAssignees: number | null;
  // Freshness
  lastEntryDate: Date | null;
  daysSinceEntry: number;
  freshnessState: "current" | "stale" | "critical" | "none";
  isReliable: boolean;
  /** Present when pricing_method is retainer. */
  retainerMetrics?: {
    monthlyFee: number;
    monthsActive: number;
    totalRevenue: number;
    currentMonthRevenue: number;
    currentMonthHours: number;
    currentMonthRealizedRate: number | null;
    cumulativeRealizedRate: number | null;
    hasEnoughData: boolean;
    retainerStartDate: string | null;
    monthlyCostAllocation: number;
    monthlyMargin: number;
  };
};

function normalizePricingMethod(v: unknown): ProjectPricingMethod {
  if (v === "hourly" || v === "hybrid" || v === "retainer") return v;
  return "flat_fee";
}

export function getProjectFinancials(input: ProjectFinancialsInput): ProjectFinancials {
  const { project, snapshot } = input;
  const pricingMethod = normalizePricingMethod(project.pricing_method);
  const flatFeeAmount = Number(project.flat_fee_amount) || 0;
  const scopedRate = Number(project.scoped_rate) || 0;
  const scopedHrsField = Number(project.scoped_hrs) || 0;
  const hourlyScopedHours = Number(project.hourly_scoped_hours) || 0;

  const liveBreakEven =
    input.breakEvenResult ??
    (input.assigneesNewerThanSnapshot ? null : breakEvenResultFromSnapshot(snapshot));

  const useTaskAssignee = liveBreakEven?.method === "task_assignee" && liveBreakEven.hasAssigneeData;
  const costBasisMethod: "firm_average" | "task_assignee" = useTaskAssignee
    ? "task_assignee"
    : "firm_average";

  let totalRevenue = 0;
  let hourlyRevenue = 0;
  let scopedHours = 0;
  let retainerMetrics: ProjectFinancials["retainerMetrics"];

  if (pricingMethod === "flat_fee") {
    totalRevenue = flatFeeAmount;
    scopedHours = scopedHrsField;
  } else if (pricingMethod === "retainer") {
    totalRevenue = getRetainerRevenue(project).totalRevenue;
    scopedHours = scopedHrsField;
  } else if (pricingMethod === "hourly") {
    scopedHours = scopedHrsField;
    hourlyRevenue = scopedRate * scopedHours;
    totalRevenue = hourlyRevenue;
  } else {
    hourlyRevenue = scopedRate * hourlyScopedHours;
    totalRevenue = flatFeeAmount + hourlyRevenue;
    scopedHours = scopedHrsField;
  }

  if (useTaskAssignee && liveBreakEven && liveBreakEven.totalScopedHrs > 0) {
    scopedHours = liveBreakEven.totalScopedHrs;
  }

  const breakEven = useTaskAssignee && liveBreakEven
    ? liveBreakEven.projectBreakEvenRate
    : Number(snapshot.break_even_rate) || 0;
  const aligned = Number(snapshot.aligned_rate) || 0;
  const taxReservePct = Number(snapshot.tax_reserve_pct) || 0.25;
  const targetMarginPct = Number(snapshot.target_margin_pct) || 0;

  let compAllocation = 0;
  let opexAllocation = 0;
  let teamAllocation = 0;
  let totalCostAllocation = 0;
  let assigneeAllocations: AssigneeCostItem[] = [];

  if (useTaskAssignee && liveBreakEven) {
    assigneeAllocations = liveBreakEven.assigneeBreakdown;
    opexAllocation = liveBreakEven.opexContribution;
    totalCostAllocation = liveBreakEven.totalProjectCost;
    if (scopedHours > 0 && liveBreakEven.totalScopedHrs > 0 && scopedHours !== liveBreakEven.totalScopedHrs) {
      const scale = scopedHours / liveBreakEven.totalScopedHrs;
      assigneeAllocations = assigneeAllocations.map((a) => ({
        ...a,
        costContribution: a.costContribution * scale,
      }));
      opexAllocation *= scale;
      totalCostAllocation = breakEven * scopedHours;
    }
  } else {
    compAllocation = (Number(snapshot.comp_per_hour) || 0) * scopedHours;
    opexAllocation = (Number(snapshot.opex_per_hour) || 0) * scopedHours;
    teamAllocation = (Number(snapshot.team_per_hour) || 0) * scopedHours;
    totalCostAllocation = breakEven * scopedHours;
  }

  const lockedMargin = totalRevenue - totalCostAllocation;
  const lockedMarginPct = totalRevenue > 0 ? (lockedMargin / totalRevenue) * 100 : 0;
  const taxReserve = lockedMargin > 0 ? lockedMargin * taxReservePct : 0;
  const netProfit = lockedMargin - taxReserve;
  const netProfitPct = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  const hoursLogged = Math.max(0, Number(input.hoursLogged) || 0);

  if (pricingMethod === "retainer") {
    const retainerRev = getRetainerRevenue(project);
    const monthlyFee = retainerRev.currentMonthRevenue;
    const currentMonthHours = Number(input.hoursLoggedThisMonth) || 0;
    const monthlyCostAllocation = breakEven * currentMonthHours;
    retainerMetrics = {
      monthlyFee,
      monthsActive: retainerRev.monthsActive,
      totalRevenue: retainerRev.totalRevenue,
      currentMonthRevenue: monthlyFee,
      currentMonthHours,
      currentMonthRealizedRate:
        currentMonthHours > 0 ? monthlyFee / currentMonthHours : null,
      cumulativeRealizedRate:
        hoursLogged > 0 ? retainerRev.totalRevenue / hoursLogged : null,
      hasEnoughData: hoursLogged >= 3,
      retainerStartDate:
        project.retainer_start_date ?? project.start_date ?? null,
      monthlyCostAllocation,
      monthlyMargin: monthlyFee - monthlyCostAllocation,
    };
  }

  const hoursRemaining = Math.max(0, scopedHours - hoursLogged);
  const overHours = Math.max(0, hoursLogged - scopedHours);
  const pctConsumed = scopedHours > 0 ? (hoursLogged / scopedHours) * 100 : 0;

  let actualCompAllocation = compAllocation;
  let actualOpexAllocation = opexAllocation;
  let actualTeamAllocation = teamAllocation;
  let actualAssigneeAllocations = assigneeAllocations;
  let actualCostAllocation = totalCostAllocation;

  if (hoursLogged > scopedHours) {
    if (useTaskAssignee && liveBreakEven && scopedHours > 0) {
      const scale = hoursLogged / scopedHours;
      actualAssigneeAllocations = assigneeAllocations.map((a) => ({
        ...a,
        billableHrs: a.billableHrs * scale,
        nonBillableHrs: a.nonBillableHrs * scale,
        totalHrs: a.totalHrs * scale,
        costContribution: a.costContribution * scale,
      }));
      actualOpexAllocation = opexAllocation * scale;
      actualCompAllocation = actualAssigneeAllocations
        .filter((a) => a.isPrincipal)
        .reduce((s, a) => s + a.costContribution, 0);
      actualTeamAllocation = actualAssigneeAllocations
        .filter((a) => !a.isPrincipal)
        .reduce((s, a) => s + a.costContribution, 0);
      actualCostAllocation =
        actualAssigneeAllocations.reduce((s, a) => s + a.costContribution, 0) +
        actualOpexAllocation;
    } else {
      const compPerHour = Number(snapshot.comp_per_hour) || 0;
      const opexPerHour = Number(snapshot.opex_per_hour) || 0;
      const teamPerHour = Number(snapshot.team_per_hour) || 0;
      actualCompAllocation = compPerHour * hoursLogged;
      actualOpexAllocation = opexPerHour * hoursLogged;
      actualTeamAllocation = teamPerHour * hoursLogged;
      actualCostAllocation =
        actualCompAllocation + actualOpexAllocation + actualTeamAllocation;
      if (actualCostAllocation <= 0 && breakEven > 0) {
        actualCostAllocation = breakEven * hoursLogged;
      }
    }
  }

  const actualLockedMargin = totalRevenue - actualCostAllocation;
  const actualTaxReserve = actualLockedMargin > 0 ? actualLockedMargin * taxReservePct : 0;
  const marginRemaining = actualLockedMargin - actualTaxReserve;
  const marginErosion = Math.max(0, netProfit - marginRemaining);
  const marginRemainingPct = totalRevenue > 0 ? (marginRemaining / totalRevenue) * 100 : 0;

  const targetMarginDollar = totalRevenue * (targetMarginPct / 100);
  const marginVariance = marginRemainingPct - targetMarginPct;
  const isAboveTarget = marginVariance > 0.5;
  const isBelowTarget = marginVariance < -0.5;

  const effectiveRate = hoursLogged > 0 ? totalRevenue / hoursLogged : null;
  const effectiveVsAligned = effectiveRate == null ? 0 : effectiveRate - aligned;
  const effectiveVsBreakEven = effectiveRate == null ? 0 : effectiveRate - breakEven;
  const isBelowBreakEven = effectiveRate != null && effectiveRate < breakEven;

  // Freshness
  let lastEntryDate: Date | null = null;
  if (input.lastEntryDate) {
    const d = input.lastEntryDate instanceof Date
      ? input.lastEntryDate
      : new Date(input.lastEntryDate);
    if (!Number.isNaN(d.getTime())) lastEntryDate = d;
  }
  const now = Date.now();
  const daysSinceEntry = lastEntryDate
    ? Math.floor((now - lastEntryDate.getTime()) / (24 * 3600 * 1000))
    : 0;
  let freshnessState: ProjectFinancials["freshnessState"];
  if (!lastEntryDate || hoursLogged === 0) freshnessState = "none";
  else if (daysSinceEntry <= 6) freshnessState = "current";
  else if (daysSinceEntry <= 20) freshnessState = "stale";
  else freshnessState = "critical";
  const isReliable = freshnessState === "current" || freshnessState === "none";

  return {
    totalRevenue,
    pricingMethod,
    flatFeeAmount,
    hourlyRevenue,
    scopedHours,
    compAllocation,
    opexAllocation,
    teamAllocation,
    totalCostAllocation,
    actualCompAllocation,
    actualOpexAllocation,
    actualTeamAllocation,
    actualCostAllocation,
    actualTaxReserve,
    actualAssigneeAllocations,
    lockedMargin,
    lockedMarginPct,
    taxReserve,
    netProfit,
    netProfitPct,
    hoursLogged,
    hoursRemaining,
    overHours,
    pctConsumed,
    marginErosion,
    marginRemaining,
    marginRemainingPct,
    targetMarginPct,
    targetMarginDollar,
    marginVariance,
    isAboveTarget,
    isBelowTarget,
    isBelowBreakEven,
    effectiveRate,
    effectiveVsAligned,
    effectiveVsBreakEven,
    costBasisMethod,
    projectBreakEvenRate: breakEven,
    assigneeAllocations,
    assigneesNewerThanSnapshot: !!input.assigneesNewerThanSnapshot,
    billableScopedFromAssignees: useTaskAssignee && liveBreakEven ? liveBreakEven.billableScopedHrs : null,
    nonBillableScopedFromAssignees: useTaskAssignee && liveBreakEven ? liveBreakEven.nonBillableScopedHrs : null,
    lastEntryDate,
    daysSinceEntry,
    freshnessState,
    isReliable,
    retainerMetrics,
  };
}

// Build a snapshot payload from a live calc() result. Used by createProject
// and the retroactive backfill path in getProjectDetail.
export function buildSnapshotFromCalc(
  fin: ReturnType<typeof calc>,
  config: FirmConfig | null,
  opts: { isRetroactive?: boolean } = {},
) {
  const abh = Number(fin.annualBillableHrs) || 0;
  const compPerHour = abh > 0 ? (Number(fin.compTotal) || 0) / abh : 0;
  const opexTotal = (Number(fin.opexRecurring) || 0) + (Number(fin.opexOneTime) || 0);
  const opexPerHour = abh > 0 ? opexTotal / abh : 0;
  const teamPerHour = abh > 0 ? (Number(fin.teamCostTotal) || 0) / abh : 0;
  return {
    annual_billable_hrs: abh,
    target_margin_pct: Number(config?.target_gross_margin_pct) || 0,
    weeks_per_year: Number(fin.weeksPerYear) || 48,
    comp_per_hour: compPerHour,
    opex_per_hour: opexPerHour,
    team_per_hour: teamPerHour,
    break_even_rate: Number(fin.breakEvenRate) || 0,
    aligned_rate: Number(fin.alignedRate) || 0,
    tax_reserve_pct: 0.25,
    total_owner_comp: Number(fin.compTotal) || 0,
    total_opex: opexTotal,
    total_team_cost: Number(fin.teamCostTotal) || 0,
    total_cost_floor: Number(fin.totalCost) || 0,
    distribution_tax_reserve: Number(fin.distributionTaxReserve) || 0,
    distribution_tax_rate: fin.distributionTaxRate ?? null,
    is_retroactive: !!opts.isRetroactive,
  };
}

// ─── Utilization reality check ─────────────────────────────────────────────
// Compares principal target billable hours/week to actual logged billable hours
// over the trailing 90 days. Informational only — does not change live rates.

const UTILIZATION_MIN_WEEKS = 8;
const UTILIZATION_LOOKBACK_DAYS = 90;

export type UtilizationRealityCheck = {
  has_sufficient_data: boolean;
  target_weekly_hrs: number;
  actual_weekly_avg: number;
  variance_hrs: number;
  variance_pct: number;
  actual_annual_hrs: number;
  aligned_rate_at_target: number;
  aligned_rate_at_actual: number;
  rate_difference: number;
  weeks_of_data: number;
};

type TimeEntryRow = { hrs: number; date: string };

function mondayKeyFromDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  const dow = d.getDay();
  const diff = (dow + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

function aggregateBillableWeeks(entries: TimeEntryRow[]): { totalHours: number; weeksWithEntries: number } {
  const weekSet = new Set<string>();
  let totalHours = 0;
  for (const e of entries) {
    totalHours += Number(e.hrs) || 0;
    weekSet.add(mondayKeyFromDate(e.date));
  }
  return { totalHours, weeksWithEntries: weekSet.size };
}

export function buildUtilizationRealityCheck(args: {
  targetWeeklyHrs: number;
  weeksPerYear: number;
  totalBillableHours: number;
  weeksWithEntries: number;
  alignedRateAtTarget: number;
  alignedRateAtActual: number;
}): UtilizationRealityCheck {
  const {
    targetWeeklyHrs,
    weeksPerYear,
    totalBillableHours,
    weeksWithEntries,
    alignedRateAtTarget,
    alignedRateAtActual,
  } = args;

  const actualWeeklyAvg = weeksWithEntries > 0 ? totalBillableHours / weeksWithEntries : 0;
  const varianceHrs = targetWeeklyHrs - actualWeeklyAvg;
  const variancePct = targetWeeklyHrs > 0 ? (varianceHrs / targetWeeklyHrs) * 100 : 0;
  const actualAnnualHrs = actualWeeklyAvg * weeksPerYear;

  return {
    has_sufficient_data: weeksWithEntries >= UTILIZATION_MIN_WEEKS,
    target_weekly_hrs: targetWeeklyHrs,
    actual_weekly_avg: actualWeeklyAvg,
    variance_hrs: varianceHrs,
    variance_pct: variancePct,
    actual_annual_hrs: actualAnnualHrs,
    aligned_rate_at_target: alignedRateAtTarget,
    aligned_rate_at_actual: alignedRateAtActual,
    rate_difference: alignedRateAtActual - alignedRateAtTarget,
    weeks_of_data: weeksWithEntries,
  };
}

export const getUtilizationReality = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ firmId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requirePrincipalOrAdmin(supabase, userId);
    const effectiveFirmId = profile.impersonated_firm_id ?? profile.firm_id;
    if (effectiveFirmId !== data.firmId && !profile.is_super_admin) {
      throw new Error("Access restricted");
    }

    const [
      { data: config },
      { data: expenses },
      { data: ownerComp },
      { data: teamBurdens },
      { data: entries },
    ] = await Promise.all([
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
        .from("time_entries")
        .select("hrs, date")
        .eq("firm_id", data.firmId)
        .eq("user_id", userId)
        .eq("billable", true)
        .gte(
          "date",
          new Date(Date.now() - UTILIZATION_LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10),
        ),
    ]);

    const targetWeeklyHrs = effectivePrincipalBillableHrsWeek(firmConfig);
    const weeksPerYear = WEEKS_DEFAULT;

    const firmConfig = (config ?? null) as FirmConfig | null;
    const expenseRows = (expenses ?? []) as Expense[];
    const ownerRows = (ownerComp ?? []) as OwnerCompensationRow[];
    const teamRows = (teamBurdens ?? []).map(mapTeamBurdenRow);

    const calcOverrides = {
      ownerComp: ownerRows,
      teamProfiles: teamRows,
    };

    const atTarget = calc(firmConfig, expenseRows, calcOverrides);
    const { totalHours, weeksWithEntries } = aggregateBillableWeeks(
      (entries ?? []) as TimeEntryRow[],
    );
    const actualWeeklyAvg = weeksWithEntries > 0 ? totalHours / weeksWithEntries : 0;

    const atActual = calc(firmConfig, expenseRows, {
      ...calcOverrides,
      hrsOverride: actualWeeklyAvg > 0 ? actualWeeklyAvg : undefined,
    });

    return buildUtilizationRealityCheck({
      targetWeeklyHrs,
      weeksPerYear,
      totalBillableHours: totalHours,
      weeksWithEntries,
      alignedRateAtTarget: atTarget.alignedRate,
      alignedRateAtActual: atActual.alignedRate,
    });
  });

// ─── Owner pay calculator (monthly draw guidance) ───────────────────────────

export type OwnerPayCalcResult = {
  monthlySalaryTarget: number;
  monthlyDistTarget: number;
  monthlyCompTarget: number;
  collectedThisMonth: number;
  monthlyOpex: number;
  monthlyTeamCost: number;
  grossMarginThisMonth: number;
  taxReserveThisMonth: number;
  availableForDist: number;
  safeToDrawDist: number;
  safeToDrawTotal: number;
  monthlyGap: number;
  ytdSalaryDrawn: number;
  ytdDistDrawn: number;
  ytdTotalDrawn: number;
  ytdCompTarget: number;
  ytdGap: number;
  annualCompTarget: number;
  projectedAnnualDraw: number;
  onTrackForAnnualTarget: boolean;
  monthsRemaining: number;
  drawNeededPerMonth: number;
  revenueNeededPerMonth: number;
  hasDrawHistory: boolean;
  hasCollectionData: boolean;
  totalOpex: number;
  totalTeamCost: number;
  distributionTaxReserveAnnual: number;
};

export type ProjectPaymentSummary = {
  totalInvoiced: number;
  totalCollected: number;
  collectedThisMonth: number;
  outstandingBalance: number;
  projectsUnpaid: number;
  projectsPartial: number;
};

export type OwnerPayCalcInput = {
  periodMonth: number;
  periodYear: number;
  salaryAnnual: number;
  distributionAnnual: number;
  totalOpex: number;
  totalTeamCost: number;
  collectedThisMonth: number;
  ytdSalaryDrawn: number;
  ytdDistDrawn: number;
  hasDrawHistory: boolean;
  hasCollectionData: boolean;
};

/** Pure owner-pay math — unit-testable without DB. */
export function buildOwnerPayCalc(input: OwnerPayCalcInput): OwnerPayCalcResult {
  const monthlySalaryTarget = input.salaryAnnual / 12;
  const monthlyDistTarget = input.distributionAnnual / 12;
  const monthlyCompTarget = monthlySalaryTarget + monthlyDistTarget;

  const monthlyOpex = input.totalOpex / 12;
  const monthlyTeamCost = input.totalTeamCost / 12;

  const grossMarginThisMonth = Math.max(
    0,
    input.collectedThisMonth - monthlySalaryTarget - monthlyOpex - monthlyTeamCost,
  );
  const taxReserveThisMonth = grossMarginThisMonth * 0.25;
  const availableForDist = Math.max(0, grossMarginThisMonth - taxReserveThisMonth);
  const safeToDrawDist = availableForDist * 0.75;
  const safeToDrawTotal = monthlySalaryTarget + safeToDrawDist;
  const monthlyGap = safeToDrawTotal - monthlyCompTarget;

  const ytdSalaryDrawn = input.ytdSalaryDrawn;
  const ytdDistDrawn = input.ytdDistDrawn;
  const ytdTotalDrawn = ytdSalaryDrawn + ytdDistDrawn;
  const ytdCompTarget = monthlyCompTarget * input.periodMonth;
  const ytdGap = ytdTotalDrawn - ytdCompTarget;
  const annualCompTarget = monthlyCompTarget * 12;
  const projectedAnnualDraw =
    input.periodMonth > 0 ? (ytdTotalDrawn / input.periodMonth) * 12 : 0;
  const onTrackForAnnualTarget = projectedAnnualDraw >= annualCompTarget * 0.9;
  const monthsRemaining = Math.max(0, 12 - input.periodMonth);
  const drawNeededPerMonth =
    monthsRemaining > 0
      ? Math.max(0, (annualCompTarget - ytdTotalDrawn) / monthsRemaining)
      : 0;

  // Solve for monthly revenue x where:
  // drawNeeded = salary + ((x - salary - opex - team) * 0.75 * 0.75)
  const distNeeded = Math.max(0, drawNeededPerMonth - monthlySalaryTarget);
  const revenueNeededPerMonth =
    distNeeded > 0
      ? distNeeded / 0.5625 + monthlySalaryTarget + monthlyOpex + monthlyTeamCost
      : monthlySalaryTarget + monthlyOpex + monthlyTeamCost;

  return {
    monthlySalaryTarget,
    monthlyDistTarget,
    monthlyCompTarget,
    collectedThisMonth: input.collectedThisMonth,
    monthlyOpex,
    monthlyTeamCost,
    grossMarginThisMonth,
    taxReserveThisMonth,
    availableForDist,
    safeToDrawDist,
    safeToDrawTotal,
    monthlyGap,
    ytdSalaryDrawn,
    ytdDistDrawn,
    ytdTotalDrawn,
    ytdCompTarget,
    ytdGap,
    annualCompTarget,
    projectedAnnualDraw,
    onTrackForAnnualTarget,
    monthsRemaining,
    drawNeededPerMonth,
    revenueNeededPerMonth,
    hasDrawHistory: input.hasDrawHistory,
    hasCollectionData: input.hasCollectionData,
    totalOpex: input.totalOpex,
    totalTeamCost: input.totalTeamCost,
  };
}

export function buildProjectPaymentSummary(args: {
  projects: Array<{
    payment_status?: string | null;
    payment_collected?: number | null;
    payment_collected_date?: string | null;
    flat_fee_amount?: number | null;
    fixed_fee?: number | null;
    scoped_rate?: number | null;
    scoped_hrs?: number | null;
    hourly_scoped_hours?: number | null;
    pricing_method?: string | null;
  }>;
  month: number;
  year: number;
}): ProjectPaymentSummary {
  let totalInvoiced = 0;
  let totalCollected = 0;
  let collectedThisMonth = 0;
  let projectsUnpaid = 0;
  let projectsPartial = 0;

  for (const p of args.projects) {
    const fee = projectFeeEstimate(p);
    totalInvoiced += fee;
    const collected = Number(p.payment_collected) || 0;
    totalCollected += collected;

    const status = p.payment_status ?? "unpaid";
    if (status === "unpaid") projectsUnpaid += 1;
    if (status === "partially_paid") projectsPartial += 1;

    if (p.payment_collected_date && collected > 0) {
      const d = new Date(`${p.payment_collected_date}T12:00:00`);
      if (d.getMonth() + 1 === args.month && d.getFullYear() === args.year) {
        collectedThisMonth += collected;
      }
    }
  }

  return {
    totalInvoiced,
    totalCollected,
    collectedThisMonth,
    outstandingBalance: Math.max(0, totalInvoiced - totalCollected),
    projectsUnpaid,
    projectsPartial,
  };
}

function projectFeeEstimate(p: {
  flat_fee_amount?: number | null;
  fixed_fee?: number | null;
  scoped_rate?: number | null;
  scoped_hrs?: number | null;
  hourly_scoped_hours?: number | null;
  pricing_method?: string | null;
  retainer_monthly_amount?: number | null;
  retainer_duration_months?: number | null;
}): number {
  const method = p.pricing_method ?? "flat_fee";
  const flat = Number(p.flat_fee_amount ?? p.fixed_fee) || 0;
  const rate = Number(p.scoped_rate) || 0;
  const scopedHrs = Number(p.scoped_hrs) || 0;
  const hourlyHrs = Number(p.hourly_scoped_hours) || 0;
  if (method === "retainer") return retainerContractValue(p);
  if (method === "hourly") return rate * scopedHrs;
  if (method === "hybrid") return flat + rate * hourlyHrs;
  return flat;
}

const ownerPayPeriodSchema = z.object({
  firmId: z.string().uuid(),
  periodMonth: z.number().int().min(1).max(12).optional(),
  periodYear: z.number().int().min(2000).max(2100).optional(),
});

export const getOwnerPayCalc = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ownerPayPeriodSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requirePrincipalOrAdmin(supabase, userId);
    const now = new Date();
    const periodMonth = data.periodMonth ?? now.getMonth() + 1;
    const periodYear = data.periodYear ?? now.getFullYear();

    const effectiveFirmId = profile.impersonated_firm_id ?? profile.firm_id;
    if (effectiveFirmId !== data.firmId && !profile.is_super_admin) {
      throw new Error("Access restricted");
    }

    const [
      { data: ownerComp },
      { data: config },
      { data: expenses },
      { data: teamBurdens },
      { data: projects },
      { data: draws },
      { count: drawCount },
      { count: collectionCount },
    ] = await Promise.all([
      supabase.from("owner_compensation").select("*").eq("firm_id", data.firmId),
      supabase.from("firm_config").select("*").eq("firm_id", data.firmId).maybeSingle(),
      supabase.from("expenses").select("*").eq("firm_id", data.firmId),
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
          "payment_collected, payment_collected_date, payment_status, flat_fee_amount, fixed_fee, scoped_rate, scoped_hrs, hourly_scoped_hours, pricing_method",
        )
        .eq("firm_id", data.firmId),
      supabase
        .from("owner_draws")
        .select("amount, draw_type, draw_date")
        .eq("firm_id", data.firmId)
        .gte("draw_date", `${periodYear}-01-01`)
        .lte("draw_date", `${periodYear}-12-31`),
      supabase
        .from("owner_draws")
        .select("id", { count: "exact", head: true })
        .eq("firm_id", data.firmId),
      supabase
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("firm_id", data.firmId)
        .gt("payment_collected", 0),
    ]);

    let salaryAnnual = 0;
    let distributionAnnual = 0;
    for (const row of ownerComp ?? []) {
      salaryAnnual += Number(row.comp_draw_annual) || 0;
      distributionAnnual += Number(row.distribution_annual) || 0;
    }
    if (!ownerComp?.length && config) {
      salaryAnnual = Number(config.comp_draw_annual) || 0;
      distributionAnnual = Number(config.comp_distribution_annual) || 0;
    }

    const fin = calc(
      (config ?? null) as FirmConfig | null,
      (expenses ?? []) as Expense[],
      {
        ownerComp: (ownerComp ?? []) as OwnerCompensationRow[],
        teamProfiles: (teamBurdens ?? []).map((t) => ({
          burdened_weekly_cost: t.burdened_weekly_cost as number | null,
          weeks_per_year: t.weeks_per_year as number | null,
          expected_hrs_per_week: t.expected_hrs_per_week as number | null,
          billed_rate: t.billed_rate as number | null,
        })),
      },
    );

    const paymentSummary = buildProjectPaymentSummary({
      projects: projects ?? [],
      month: periodMonth,
      year: periodYear,
    });

    let ytdSalaryDrawn = 0;
    let ytdDistDrawn = 0;
    for (const d of draws ?? []) {
      const m = new Date(`${d.draw_date}T12:00:00`).getMonth() + 1;
      if (m > periodMonth) continue;
      const amt = Number(d.amount) || 0;
      if (d.draw_type === "salary") ytdSalaryDrawn += amt;
      else ytdDistDrawn += amt;
    }

    return {
      ...buildOwnerPayCalc({
      periodMonth,
      periodYear,
      salaryAnnual,
      distributionAnnual,
      totalOpex: (Number(fin.opexRecurring) || 0) + (Number(fin.opexOneTime) || 0),
      totalTeamCost: Number(fin.teamCostTotal) || 0,
      collectedThisMonth: paymentSummary.collectedThisMonth,
      ytdSalaryDrawn,
      ytdDistDrawn,
      hasDrawHistory: (drawCount ?? 0) > 0,
      hasCollectionData: (collectionCount ?? 0) > 0,
    }),
      distributionTaxReserveAnnual: Number(fin.distributionTaxReserve) || 0,
    };
  });

export const getProjectPaymentSummaryFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        firmId: z.string().uuid(),
        month: z.number().int().min(1).max(12),
        year: z.number().int().min(2000).max(2100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requirePrincipalOrAdmin(supabase, userId);
    const effectiveFirmId = profile.impersonated_firm_id ?? profile.firm_id;
    if (effectiveFirmId !== data.firmId && !profile.is_super_admin) {
      throw new Error("Access restricted");
    }

    const { data: projects } = await supabase
      .from("projects")
      .select(
        "payment_status, payment_collected, payment_collected_date, flat_fee_amount, fixed_fee, scoped_rate, scoped_hrs, hourly_scoped_hours, pricing_method",
      )
      .eq("firm_id", data.firmId);

    return buildProjectPaymentSummary({
      projects: projects ?? [],
      month: data.month,
      year: data.year,
    });
  });

// ─── Capacity planner (Phase A) ───────────────────────────────────────────────

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

import { monthCapacityFromBlocks } from "@/lib/schedule-blocks";

const AVG_WEEKS_PER_MONTH = 4.33;
const DEFAULT_PROJECT_FEE = 25_000;

export type BlockType =
  | "life_event"
  | "recurring_season"
  | "recurring_weekly"
  | "blackout_date";

export type FirmLifeEvent = {
  id: string;
  firm_id: string;
  firm_member_id?: string | null;
  name: string;
  event_type: string;
  start_date: string;
  end_date: string;
  capacity_pct: number;
  notes: string | null;
  is_recurring: boolean;
  block_type?: BlockType;
  recurs_annually?: boolean;
  default_capacity_pct?: number | null;
  weekly_hours_blocked?: number | null;
  scheduling_only?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ScheduleException = {
  id: string;
  firm_id: string;
  life_event_id: string;
  week_start: string;
  capacity_pct: number;
  label: string | null;
  notes: string | null;
  created_at?: string;
};

export type MonthCapacity = {
  month: number;
  monthName: string;
  capacityPct: number;
  availableHrs: number;
  lifeEventName: string | null;
  lifeEventType: string | null;
  isLeave: boolean;
  isReduced: boolean;
  isFull: boolean;
};

export type EffectiveCapacityResult = {
  standardHrs: number;
  effectiveHrs: number;
  reducedHrs: number;
  leaveHrs: number;
  capacityReductionPct: number;
  adjustedBreakEvenRate: number;
  adjustedRevenueTarget: number;
  reserveNeeded: number;
  monthlyProfile: MonthCapacity[];
  lifeEvents: FirmLifeEvent[];
  hasLifeEvents: boolean;
};

export type LeaveScenarioResult = {
  hoursLost: number;
  effectiveHrs: number;
  revenueGap: number;
  reserveNeeded: number;
  monthsToSave: number;
  startSavingByDate: Date;
  startSavingByStr: string;
  isAlreadyLate: boolean;
  additionalProjectsNeeded: number;
  additionalRevenuePerMonth: number;
};

export type LeaveScenarioPhases = {
  rampDownMonths: number;
  rampDownCapacityPct: number;
  fullLeaveMonths: number;
  returnMonths: number;
  returnCapacityPct: number;
};

export type SayNoThresholdResult = {
  annualRevenueTarget: number;
  committedRevenue: number;
  projectedRevenue: number;
  thresholdReached: boolean;
  thresholdMonth: number | null;
  thresholdMonthName: string | null;
  surplusRevenue: number;
  canDeclineFromDate: Date | null;
  canDeclineFromStr: string | null;
};

function parseIsoDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00`);
}

function monthBounds(year: number, month: number) {
  return {
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 0),
  };
}

function recurringEventCoversMonth(event: FirmLifeEvent, month: number): boolean {
  const start = parseIsoDate(event.start_date);
  const end = parseIsoDate(event.end_date);
  const sm = start.getMonth() + 1;
  const em = end.getMonth() + 1;
  if (sm <= em) return month >= sm && month <= em;
  return month >= sm || month <= em;
}

function eventCoversMonth(event: FirmLifeEvent, year: number, month: number): boolean {
  if (event.is_recurring) return recurringEventCoversMonth(event, month);
  const { start, end } = monthBounds(year, month);
  const evStart = parseIsoDate(event.start_date);
  const evEnd = parseIsoDate(event.end_date);
  return evStart <= end && evEnd >= start;
}

function monthCapacityPct(
  events: FirmLifeEvent[],
  year: number,
  month: number,
): { capacityPct: number; event: FirmLifeEvent | null } {
  const covering = events.filter((e) => eventCoversMonth(e, year, month));
  if (covering.length === 0) return { capacityPct: 100, event: null };
  const minPct = Math.min(...covering.map((e) => Number(e.capacity_pct)));
  const primary = covering.find((e) => Number(e.capacity_pct) === minPct) ?? covering[0];
  return { capacityPct: minPct, event: primary };
}

export function computeEffectiveAnnualCapacity(params: {
  hrsPerWeek: number;
  weeksPerYear: number;
  targetMarginPct: number;
  totalCost: number;
  compTotal: number;
  opexRecurring: number;
  opexOneTime: number;
  breakEvenRate: number;
  alignedRate: number;
  year: number;
  lifeEvents: FirmLifeEvent[];
  scheduleExceptions?: ScheduleException[];
}): EffectiveCapacityResult {
  const {
    hrsPerWeek,
    weeksPerYear,
    targetMarginPct,
    totalCost,
    compTotal,
    opexRecurring,
    opexOneTime,
    breakEvenRate,
    alignedRate,
    year,
    lifeEvents,
    scheduleExceptions = [],
  } = params;

  const standardHrs = hrsPerWeek * weeksPerYear;
  const fullMonthlyHrs = hrsPerWeek * AVG_WEEKS_PER_MONTH;
  const monthlyFixedObligation = (compTotal + opexRecurring + opexOneTime) / 12;

  const monthlyProfile: MonthCapacity[] = [];
  let effectiveHrs = 0;
  let leaveHrs = 0;
  let reducedHrs = 0;
  let reserveNeeded = 0;

  for (let month = 1; month <= 12; month++) {
    const { capacityPct, availableHrs, primaryEvent } = monthCapacityFromBlocks({
      events: lifeEvents,
      exceptions: scheduleExceptions,
      year,
      month,
      hrsPerWeek,
    });
    const event = primaryEvent;
    effectiveHrs += availableHrs;

    if (capacityPct === 0) {
      leaveHrs += fullMonthlyHrs;
      reserveNeeded += monthlyFixedObligation;
    } else if (capacityPct < 100) {
      reducedHrs += fullMonthlyHrs - availableHrs;
    }

    monthlyProfile.push({
      month,
      monthName: MONTH_NAMES[month - 1],
      capacityPct,
      availableHrs,
      lifeEventName: event?.name ?? null,
      lifeEventType: event?.event_type ?? null,
      isLeave: capacityPct === 0,
      isReduced: capacityPct > 0 && capacityPct < 100,
      isFull: capacityPct >= 100,
    });
  }

  const capacityReductionPct =
    standardHrs > 0 ? Math.max(0, ((standardHrs - effectiveHrs) / standardHrs) * 100) : 0;

  const adjustedBreakEvenRate =
    effectiveHrs > 0 && effectiveHrs < standardHrs ? totalCost / effectiveHrs : breakEvenRate;

  const margin = targetMarginPct / 100;
  const adjustedRevenueTarget =
    effectiveHrs > 0 && effectiveHrs < standardHrs && margin < 1
      ? adjustedBreakEvenRate / (1 - margin)
      : alignedRate * standardHrs;

  return {
    standardHrs,
    effectiveHrs,
    reducedHrs,
    leaveHrs,
    capacityReductionPct,
    adjustedBreakEvenRate,
    adjustedRevenueTarget,
    reserveNeeded,
    monthlyProfile,
    lifeEvents,
    hasLifeEvents: lifeEvents.length > 0,
  };
}

export function getLeaveScenario(params: {
  monthsOfLeave?: number;
  rampDownMonths?: number;
  rampDownCapacityPct?: number;
  fullLeaveMonths?: number;
  returnCapacityPct: number;
  returnMonths: number;
  savingsPerMonth: number;
  firmCalcResult: ReturnType<typeof calc>;
  monthsUntilLeaveStart?: number;
}): LeaveScenarioResult {
  const { returnCapacityPct, returnMonths, savingsPerMonth, firmCalcResult } = params;
  const rampDownMonths = params.rampDownMonths ?? 0;
  const rampDownCapacityPct = params.rampDownCapacityPct ?? 50;
  const fullLeaveMonths = params.fullLeaveMonths ?? params.monthsOfLeave ?? 0;

  const hrsPerMonth = firmCalcResult.annualBillableHrs / 12;
  const totalOpex = firmCalcResult.opexRecurring + firmCalcResult.opexOneTime;
  const monthlyObligations = (firmCalcResult.compTotal + totalOpex) / 12;

  const phaseHoursLost = (months: number, capacityPct: number) =>
    months <= 0 ? 0 : months * hrsPerMonth * (1 - capacityPct / 100);

  const hoursLost =
    phaseHoursLost(rampDownMonths, rampDownCapacityPct) +
    phaseHoursLost(fullLeaveMonths, 0) +
    phaseHoursLost(returnMonths, returnCapacityPct);

  const effectiveHrs = Math.max(0, firmCalcResult.annualBillableHrs - hoursLost);
  const revenueGap = hoursLost * firmCalcResult.breakEvenRate;

  const phaseReserve = (months: number, capacityPct: number) =>
    months <= 0 ? 0 : months * (1 - capacityPct / 100);
  const reserveNeeded =
    (phaseReserve(rampDownMonths, rampDownCapacityPct) +
      phaseReserve(fullLeaveMonths, 0) +
      phaseReserve(returnMonths, returnCapacityPct)) *
    monthlyObligations;

  const monthsToSave = savingsPerMonth > 0 ? reserveNeeded / savingsPerMonth : Infinity;

  const startSavingByDate = new Date();
  startSavingByDate.setHours(12, 0, 0, 0);
  startSavingByDate.setMonth(startSavingByDate.getMonth() - Math.ceil(monthsToSave));

  const isAlreadyLate = startSavingByDate < new Date();
  const startSavingByStr = startSavingByDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const totalLeaveSpan = rampDownMonths + fullLeaveMonths + returnMonths;
  const monthsUntilLeave = Math.max(0, params.monthsUntilLeaveStart ?? totalLeaveSpan);
  const additionalRevenuePerMonth =
    monthsUntilLeave > 0 && !isAlreadyLate ? revenueGap / monthsUntilLeave : 0;

  const additionalProjectsNeeded = Math.round((revenueGap / DEFAULT_PROJECT_FEE) * 10) / 10;

  return {
    hoursLost,
    effectiveHrs,
    revenueGap,
    reserveNeeded,
    monthsToSave,
    startSavingByDate,
    startSavingByStr,
    isAlreadyLate,
    additionalProjectsNeeded,
    additionalRevenuePerMonth,
  };
}

function projectFeeAmount(p: {
  fixed_fee?: number | null;
  flat_fee_amount?: number | null;
  scoped_hrs?: number | null;
  scoped_rate?: number | null;
}): number {
  const flat = Number(p.flat_fee_amount ?? p.fixed_fee ?? 0);
  if (flat > 0) return flat;
  return (Number(p.scoped_hrs) || 0) * (Number(p.scoped_rate) || 0);
}

export function computeSayNoThreshold(params: {
  annualRevenueTarget: number;
  projects: Array<{
    status: string | null;
    end_date?: string | null;
    fixed_fee?: number | null;
    flat_fee_amount?: number | null;
    scoped_hrs?: number | null;
    scoped_rate?: number | null;
  }>;
  year: number;
}): SayNoThresholdResult {
  const { annualRevenueTarget, projects, year } = params;

  const committedStatuses = new Set(["active", "completed", "invoiced", "collected"]);
  const projectedStatuses = new Set(["pipeline", "pursuit"]);

  let committedRevenue = 0;
  const committedProjects: Array<{ fee: number; endDate: Date | null }> = [];

  for (const p of projects) {
    const status = (p.status ?? "").toLowerCase();
    if (!committedStatuses.has(status)) continue;
    const fee = projectFeeAmount(p);
    if (fee <= 0) continue;
    committedRevenue += fee;
    committedProjects.push({
      fee,
      endDate: p.end_date ? parseIsoDate(p.end_date) : null,
    });
  }

  let projectedRevenue = committedRevenue;
  for (const p of projects) {
    const status = (p.status ?? "").toLowerCase();
    if (!projectedStatuses.has(status)) continue;
    projectedRevenue += projectFeeAmount(p);
  }

  const thresholdReached = committedRevenue >= annualRevenueTarget;
  const surplusRevenue = Math.max(0, committedRevenue - annualRevenueTarget);

  let thresholdMonth: number | null = null;
  if (thresholdReached) {
    const sorted = committedProjects.slice().sort((a, b) => {
      const ta = a.endDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const tb = b.endDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return ta - tb;
    });

    let running = 0;
    for (const p of sorted) {
      running += p.fee;
      if (running >= annualRevenueTarget) {
        const d = p.endDate ?? new Date(year, 11, 31);
        thresholdMonth = d.getFullYear() === year ? d.getMonth() + 1 : 12;
        break;
      }
    }
    if (thresholdMonth == null) thresholdMonth = new Date().getMonth() + 1;
  }

  const canDeclineFromDate =
    thresholdMonth != null ? new Date(year, thresholdMonth - 1, 1) : null;

  return {
    annualRevenueTarget,
    committedRevenue,
    projectedRevenue,
    thresholdReached,
    thresholdMonth,
    thresholdMonthName: thresholdMonth != null ? MONTH_NAMES[thresholdMonth - 1] : null,
    surplusRevenue,
    canDeclineFromDate,
    canDeclineFromStr: canDeclineFromDate
      ? canDeclineFromDate.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : null,
  };
}

async function loadFirmCalcContext(
  supabase: any,
  firmId: string,
): Promise<{
  config: FirmConfig | null;
  expenses: Expense[];
  calcResult: ReturnType<typeof calc>;
}> {
  const [{ data: config }, { data: expenses }, { data: ownerComp }, { data: teamBurdens }] =
    await Promise.all([
      supabase.from("firm_config").select("*").eq("firm_id", firmId).maybeSingle(),
      supabase.from("expenses").select("*").eq("firm_id", firmId),
      supabase.from("owner_compensation").select("*").eq("firm_id", firmId),
      supabase
        .from("firm_members")
        .select(
          "burdened_weekly_cost, weeks_per_year, expected_hrs_per_week, productive_hrs_per_week, billed_rate, is_active",
        )
        .eq("firm_id", firmId)
        .eq("is_active", true)
        .neq("role_type", "principal"),
    ]);

  const firmConfig = (config ?? null) as FirmConfig | null;
  const expenseRows = (expenses ?? []) as Expense[];
  const calcResult = calc(firmConfig, expenseRows, {
    ownerComp: (ownerComp ?? []) as OwnerCompensationRow[],
    teamProfiles: (teamBurdens ?? []).map(mapTeamBurdenRow),
  });

  return { config: firmConfig, expenses: expenseRows, calcResult };
}

export const getEffectiveAnnualCapacity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        firmId: z.string().uuid(),
        year: z.number().int().min(2000).max(2100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requirePrincipalOrAdmin(supabase, userId);
    const effectiveFirmId = profile.impersonated_firm_id ?? profile.firm_id;
    if (effectiveFirmId !== data.firmId && !profile.is_super_admin) {
      throw new Error("Access restricted");
    }

    const yearStart = `${data.year}-01-01`;
    const yearEnd = `${data.year}-12-31`;

    const [{ config, calcResult }, { data: lifeEvents }, { data: recurringEvents }, { data: scheduleExceptions }] =
      await Promise.all([
        loadFirmCalcContext(supabase, data.firmId),
        supabase
          .from("firm_life_events")
          .select("*")
          .eq("firm_id", data.firmId)
          .lte("start_date", yearEnd)
          .gte("end_date", yearStart)
          .order("start_date", { ascending: true }),
        supabase.from("firm_life_events").select("*").eq("firm_id", data.firmId).or("is_recurring.eq.true,recurs_annually.eq.true,block_type.eq.recurring_season,block_type.eq.recurring_weekly"),
        supabase.from("schedule_exceptions").select("*").eq("firm_id", data.firmId),
      ]);

    const eventMap = new Map<string, FirmLifeEvent>();
    for (const e of [...(lifeEvents ?? []), ...(recurringEvents ?? [])]) {
      eventMap.set(e.id as string, e as FirmLifeEvent);
    }

    const hrsPerWeek = effectivePrincipalBillableHrsWeek(config);
    const weeksPerYear = WEEKS_DEFAULT;
    const targetMarginPct = Number(config?.target_gross_margin_pct) || 0;

    return computeEffectiveAnnualCapacity({
      hrsPerWeek,
      weeksPerYear,
      targetMarginPct,
      totalCost: calcResult.totalCost,
      compTotal: calcResult.compTotal,
      opexRecurring: calcResult.opexRecurring,
      opexOneTime: calcResult.opexOneTime,
      breakEvenRate: calcResult.breakEvenRate,
      alignedRate: calcResult.alignedRate,
      year: data.year,
      lifeEvents: [...eventMap.values()],
      scheduleExceptions: (scheduleExceptions ?? []) as ScheduleException[],
    });
  });

export const getSayNoThreshold = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        firmId: z.string().uuid(),
        year: z.number().int().min(2000).max(2100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requirePrincipalOrAdmin(supabase, userId);
    const effectiveFirmId = profile.impersonated_firm_id ?? profile.firm_id;
    if (effectiveFirmId !== data.firmId && !profile.is_super_admin) {
      throw new Error("Access restricted");
    }

    const { calcResult } = await loadFirmCalcContext(supabase, data.firmId);
    const annualRevenueTarget = calcResult.alignedRate * calcResult.annualBillableHrs;

    const { data: projects } = await supabase
      .from("projects")
      .select("status, end_date, fixed_fee, flat_fee_amount, scoped_hrs, scoped_rate")
      .eq("firm_id", data.firmId);

    return computeSayNoThreshold({
      annualRevenueTarget,
      projects: projects ?? [],
      year: data.year,
    });
  });

// ─── Portfolio realized rate (firm-level profitability signal) ───────────────

export type PortfolioRealizedRateStatus =
  | "above_aligned"
  | "above_breakeven"
  | "below_breakeven"
  | "insufficient_data";

export type PortfolioRealizedRateResult = {
  realizedRate: number | null;
  totalHoursLogged: number;
  totalActiveRevenue: number;
  activeProjectCount: number;
  alignedRate: number;
  breakEvenRate: number;
  status: PortfolioRealizedRateStatus;
  statusLabel: string;
  comparisonSentence: string;
  hasEnoughData: boolean;
};

export type ActiveProjectForPortfolio = {
  flat_fee_amount?: number | null;
  fixed_fee?: number | null;
  scoped_rate?: number | null;
  scoped_hrs?: number | null;
  hourly_scoped_hours?: number | null;
  pricing_method?: string | null;
  retainer_monthly_amount?: number | null;
  retainer_duration_months?: number | null;
  monthly_retainer_fee?: number | null;
  retainer_start_date?: string | null;
  start_date?: string | null;
};

function roundPortfolioRate(n: number): number {
  return Math.round(n);
}

function portfolioRateLabel(n: number): string {
  return `$${roundPortfolioRate(n)}`;
}

/** Revenue attributed to an active project for portfolio rate math. */
export function activeProjectPortfolioRevenue(
  project: ActiveProjectForPortfolio,
  now: Date = new Date(),
): number {
  const method = project.pricing_method ?? "flat_fee";
  if (method === "retainer") {
    return getRetainerRevenue(project).totalRevenue;
  }
  const flat = Number(project.flat_fee_amount ?? project.fixed_fee) || 0;
  const rate = Number(project.scoped_rate) || 0;
  const scopedHrs = Number(project.scoped_hrs) || 0;
  const hourlyHrs = Number(project.hourly_scoped_hours) || 0;
  if (method === "hourly") return rate * scopedHrs;
  if (method === "hybrid") return flat + rate * hourlyHrs;
  return flat;
}

/** Pure builder — no I/O. */
export function buildPortfolioRealizedRateResult(args: {
  alignedRate: number;
  breakEvenRate: number;
  activeProjects: ActiveProjectForPortfolio[];
  totalHoursLogged: number;
  now?: Date;
}): PortfolioRealizedRateResult {
  const activeProjectCount = args.activeProjects.length;
  const totalActiveRevenue = args.activeProjects.reduce(
    (sum, p) => sum + activeProjectPortfolioRevenue(p, args.now),
    0,
  );
  const alignedRate = Number(args.alignedRate) || 0;
  const breakEvenRate = Number(args.breakEvenRate) || 0;
  const totalHoursLogged = Number(args.totalHoursLogged) || 0;
  const hasEnoughData = activeProjectCount >= 2 && totalHoursLogged >= 10;

  const base = {
    totalHoursLogged,
    totalActiveRevenue,
    activeProjectCount,
    alignedRate: roundPortfolioRate(alignedRate),
    breakEvenRate: roundPortfolioRate(breakEvenRate),
  };

  if (!hasEnoughData) {
    return {
      ...base,
      realizedRate: null,
      status: "insufficient_data",
      statusLabel: "Not enough data yet",
      comparisonSentence:
        "Log time on at least 2 active projects to see your portfolio rate.",
      hasEnoughData: false,
    };
  }

  const realizedRateRaw = totalActiveRevenue / totalHoursLogged;
  const realizedRate = roundPortfolioRate(realizedRateRaw);
  const ar = roundPortfolioRate(alignedRate);
  const ber = roundPortfolioRate(breakEvenRate);

  if (realizedRateRaw >= alignedRate) {
    return {
      ...base,
      realizedRate,
      status: "above_aligned",
      statusLabel: "Above your aligned rate",
      comparisonSentence: `Each productive hour is generating ${portfolioRateLabel(realizedRate)}/hr on average — above your ${portfolioRateLabel(ar)}/hr target. Your project mix is healthy.`,
      hasEnoughData: true,
    };
  }

  if (realizedRateRaw >= breakEvenRate) {
    const gap = roundPortfolioRate(alignedRate - realizedRateRaw);
    return {
      ...base,
      realizedRate,
      status: "above_breakeven",
      statusLabel: "Covering costs, below target",
      comparisonSentence: `Each productive hour is generating ${portfolioRateLabel(realizedRate)}/hr — covering your costs but ${portfolioRateLabel(gap)}/hr below your target of ${portfolioRateLabel(ar)}/hr.`,
      hasEnoughData: true,
    };
  }

  return {
    ...base,
    realizedRate,
    status: "below_breakeven",
    statusLabel: "Below your cost floor",
    comparisonSentence: `Each productive hour is generating ${portfolioRateLabel(realizedRate)}/hr — below the ${portfolioRateLabel(ber)}/hr needed to cover your firm's costs.`,
    hasEnoughData: true,
  };
}

const portfolioRealizedRateSchema = z.object({
  firmId: z.string().uuid(),
});

export const getPortfolioRealizedRate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => portfolioRealizedRateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requirePrincipalOrAdmin(supabase, userId);
    const effectiveFirmId = profile.impersonated_firm_id ?? profile.firm_id;
    if (effectiveFirmId !== data.firmId && !profile.is_super_admin) {
      throw new Error("Access restricted");
    }

    const yearStart = `${new Date().getFullYear()}-01-01`;

    const [{ calcResult }, { data: activeProjects }] = await Promise.all([
      loadFirmCalcContext(supabase, data.firmId),
      supabase
        .from("projects")
        .select(
          "id, flat_fee_amount, fixed_fee, scoped_rate, scoped_hrs, hourly_scoped_hours, pricing_method, retainer_monthly_amount, retainer_duration_months, monthly_retainer_fee, retainer_start_date, start_date, status",
        )
        .eq("firm_id", data.firmId)
        .in("status", ["active", "in_progress"]),
    ]);

    const projectRows = activeProjects ?? [];
    const projectIds = projectRows.map((p) => p.id as string);

    let totalHoursLogged = 0;
    if (projectIds.length > 0) {
      const { data: entries } = await supabase
        .from("time_entries")
        .select("hrs")
        .eq("firm_id", data.firmId)
        .in("project_id", projectIds)
        .gte("date", yearStart);
      totalHoursLogged = (entries ?? []).reduce(
        (sum, e) => sum + (Number(e.hrs) || 0),
        0,
      );
    }

    return buildPortfolioRealizedRateResult({
      alignedRate: calcResult.alignedRate,
      breakEvenRate: calcResult.breakEvenRate,
      activeProjects: projectRows as ActiveProjectForPortfolio[],
      totalHoursLogged,
    });
  });