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
      // Distribution and reserve only apply to S-Corp in structure-aware mode.
      if (structure === "s_corp") {
        distribution += Number(r.distribution_annual) || 0;
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
    distribution =
      structure === "s_corp" ? Number(config?.comp_distribution_annual) || 0 : 0;
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