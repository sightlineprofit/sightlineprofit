// Shared finance math for Sightline. All values in USD/year unless noted.

export type FirmConfig = {
  comp_draw_annual: number | null;
  comp_ptax_pct: number | null;
  comp_health_annual: number | null;
  comp_retire_annual: number | null;
  available_hrs_per_week: number | null;
  target_billable_hrs_per_week: number | null;
  target_gross_margin_pct: number | null;
  rate_billed: number | null;
  actual_billed_rate: number | null;
  accounting_basis?: string | null;
  business_structure?: string | null;
  comp_distribution_annual?: number | null;
  comp_reserve_target_annual?: number | null;
  planned_activity_allocation?: Record<string, number> | unknown | null;
};

/** One principal's compensation record (from owner_compensation table). */
export type OwnerCompensationRow = {
  profile_id?: string;
  comp_draw_annual: number | null;
  payroll_tax_pct: number | null;
  health_insurance_annual: number | null;
  retirement_annual: number | null;
  distribution_annual: number | null;
  reserve_target: number | null;
  reserve_months?: number | null;
  employee_payroll_tax_pct?: number | null;
};

/** Team member burdened cost input (from profiles for non-principals). */
export type TeamBurden = {
  burdened_weekly_cost: number | null;
  weeks_per_year: number | null;
  /** Billable hours per week this team member is expected to contribute.
   * When present, added to the firm's aligned-rate denominator. */
  expected_hrs_per_week?: number | null;
  /** Optional per-member billed rate. When null, the firm default is used. */
  billed_rate?: number | null;
};

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

const WEEKS_DEFAULT = 48;

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
  const ownerRows = ov.ownerComp;
  if (ownerRows && ownerRows.length > 0) {
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
      // Distributions are real cash the firm must fund regardless of tax
      // structure — Simple mode surfaces the field for every firm and the
      // drawer total already includes it. Reserve target stays S-Corp-only
      // (structural planning target, not out-the-door comp).
      distribution += Number(r.distribution_annual) || 0;
      if (structure === "s_corp") {
        const months = Number(r.reserve_months) || 0;
        if (months > 0) {
          reserveTarget += months * (opexAnnualForReserve / 12);
        } else {
          reserveTarget += Number(r.reserve_target) || 0;
        }
      }
    }
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
  }
  const compTotal = draw + ptax + health + retire + distribution + reserveTarget;

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

  const principalBillableHrsWeek =
    (ov.hrsOverride ?? Number(config?.target_billable_hrs_per_week)) || 0;
  const targetBillableHrsWeek = principalBillableHrsWeek + teamBillableHrsWeek;
  const weeksPerYear = WEEKS_DEFAULT;
  // Firm billable capacity: principal target + Σ team expected, annualized.
  // Used as the shared denominator for break-even, aligned rate, and every
  // "$X/hr" display (opex/hr, comp/hr, team/hr). Not the same as
  // firm_config.available_hrs_per_week (max capacity).
  const annualBillableHrs = targetBillableHrsWeek * weeksPerYear;

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
    structure,
    opexRecurring, opexOneTime, teamCostTotal, totalCost,
    targetBillableHrsWeek, weeksPerYear, annualBillableHrs,
    principalBillableHrsWeek, teamBillableHrsWeek,
    principalRevenue, teamRevenue,
    breakEvenRate, alignedRate, billedRate,
    annualRevenue, grossProfit, grossMarginPct,
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
  const marginErosion = overScopeHours * breakEvenRate;
  const remainingMargin = grossMargin - marginErosion;
  const remainingMarginPct = projectFee > 0 ? (remainingMargin / projectFee) * 100 : 0;
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

export type ProjectPricingMethod = "flat_fee" | "hourly" | "hybrid";

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
  snapshotted_at?: string | null;
  is_retroactive?: boolean | null;
};

export type ProjectFinancialsInput = {
  project: {
    pricing_method: ProjectPricingMethod | string | null | undefined;
    flat_fee_amount?: number | null;
    scoped_rate?: number | null;
    scoped_hrs?: number | null;
    hourly_scoped_hours?: number | null;
  };
  snapshot: ProjectCostSnapshot;
  hoursLogged: number;
  lastEntryDate?: Date | string | null;
};

export type ProjectFinancials = {
  // Revenue
  totalRevenue: number;
  pricingMethod: ProjectPricingMethod;
  flatFeeAmount: number;
  hourlyRevenue: number;
  scopedHours: number;
  // Cost allocation (locked to snapshot)
  compAllocation: number;
  opexAllocation: number;
  teamAllocation: number;
  totalCostAllocation: number;
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
  // Freshness
  lastEntryDate: Date | null;
  daysSinceEntry: number;
  freshnessState: "current" | "stale" | "critical" | "none";
  isReliable: boolean;
};

function normalizePricingMethod(v: unknown): ProjectPricingMethod {
  return v === "hourly" || v === "hybrid" ? v : "flat_fee";
}

export function getProjectFinancials(input: ProjectFinancialsInput): ProjectFinancials {
  const { project, snapshot } = input;
  const pricingMethod = normalizePricingMethod(project.pricing_method);
  const flatFeeAmount = Number(project.flat_fee_amount) || 0;
  const scopedRate = Number(project.scoped_rate) || 0;
  const scopedHrsField = Number(project.scoped_hrs) || 0;
  const hourlyScopedHours = Number(project.hourly_scoped_hours) || 0;

  let totalRevenue = 0;
  let hourlyRevenue = 0;
  let scopedHours = 0;

  if (pricingMethod === "flat_fee") {
    totalRevenue = flatFeeAmount;
    scopedHours = scopedHrsField;
  } else if (pricingMethod === "hourly") {
    scopedHours = scopedHrsField;
    hourlyRevenue = scopedRate * scopedHours;
    totalRevenue = hourlyRevenue;
  } else {
    // hybrid: flat portion + hourly portion
    hourlyRevenue = scopedRate * hourlyScopedHours;
    totalRevenue = flatFeeAmount + hourlyRevenue;
    scopedHours = scopedHrsField; // total scoped (flat phase hrs + hourly hrs)
  }

  const breakEven = Number(snapshot.break_even_rate) || 0;
  const aligned = Number(snapshot.aligned_rate) || 0;
  const taxReservePct = Number(snapshot.tax_reserve_pct) || 0.25;
  const targetMarginPct = Number(snapshot.target_margin_pct) || 0;

  const compAllocation = (Number(snapshot.comp_per_hour) || 0) * scopedHours;
  const opexAllocation = (Number(snapshot.opex_per_hour) || 0) * scopedHours;
  const teamAllocation = (Number(snapshot.team_per_hour) || 0) * scopedHours;
  const totalCostAllocation = breakEven * scopedHours;

  const lockedMargin = totalRevenue - totalCostAllocation;
  const lockedMarginPct = totalRevenue > 0 ? (lockedMargin / totalRevenue) * 100 : 0;
  const taxReserve = lockedMargin > 0 ? lockedMargin * taxReservePct : 0;
  const netProfit = lockedMargin - taxReserve;
  const netProfitPct = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  const hoursLogged = Math.max(0, Number(input.hoursLogged) || 0);
  const hoursRemaining = Math.max(0, scopedHours - hoursLogged);
  const overHours = Math.max(0, hoursLogged - scopedHours);
  const pctConsumed = scopedHours > 0 ? (hoursLogged / scopedHours) * 100 : 0;

  const marginErosion = overHours * breakEven;
  const marginRemaining = lockedMargin - marginErosion;
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
    lastEntryDate,
    daysSinceEntry,
    freshnessState,
    isReliable,
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
    is_retroactive: !!opts.isRetroactive,
  };
}