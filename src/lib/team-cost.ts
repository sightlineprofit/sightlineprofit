// Shared team-cost breakdown. Single source of truth used by:
//   - Cost Floor popover (MetricBreakdown)
//   - Understand my numbers → Layer 03 (rate-architecture)
//
// The per-component sum equals `burdened_weekly_cost × weeks_per_year`,
// which is what finance.calc()'s teamCostTotal already uses. This module
// does not change calculations; it only exposes the components that
// compose each member's burdened total.

export type TeamMemberInput = {
  id?: string | null;
  name?: string | null;
  role_type?: string | null;
  burdened_weekly_cost?: number | null;
  weeks_per_year?: number | null;
  employment_type?: string | null;
  compensation_type?: string | null;
  hourly_wage?: number | null;
  annual_base_salary?: number | null;
  employer_payroll_tax_pct?: number | null;
  annual_benefits?: number | null;
  other_annual_costs?: number | null;
  expected_hrs_per_week?: number | null;
  is_active?: boolean | null;
};

export type MemberCostBreakdown = {
  id: string;
  name: string;
  role: string;
  base: number;
  baseLabel: string;
  tax: number;
  benefits: number;
  equipment: number;
  total: number;
  isW2: boolean;
};

export function memberCostBreakdown(m: TeamMemberInput) {
  const isContract =
    m.employment_type === "contractor" || m.employment_type === "1099";
  const isW2 = !isContract;
  const wks = Number(m.weeks_per_year) || 48;
  const hpw = Number(m.expected_hrs_per_week) || 40;
  const ptaxPct = isContract ? 0 : Number(m.employer_payroll_tax_pct ?? 7.65) || 0;
  const benefits = isContract ? 0 : Number(m.annual_benefits) || 0;
  const other = Number(m.other_annual_costs) || 0;
  const comp = m.compensation_type || "hourly";

  let base = 0;
  let baseLabel = "Base wage";
  if (comp === "salaried") {
    base = Number(m.annual_base_salary) || 0;
    baseLabel = "Salary";
  } else if (comp === "contract_annual") {
    base = Number(m.annual_base_salary) || 0;
    baseLabel = "Contract";
  } else {
    base = (Number(m.hourly_wage) || 0) * hpw * wks;
    baseLabel = "Hourly wage";
  }
  const tax = base * (ptaxPct / 100);
  const total = base + tax + benefits + other;
  return { base, baseLabel, tax, benefits, equipment: other, total, isW2 };
}

export function buildTeamCostBreakdown(
  members: TeamMemberInput[] | null | undefined,
): MemberCostBreakdown[] {
  return (members ?? [])
    .filter(
      (m) =>
        (m.role_type ?? "").toString().toLowerCase() !== "principal" &&
        Number(m.burdened_weekly_cost) > 0,
    )
    .map((m, i) => {
      const b = memberCostBreakdown(m);
      return {
        id: (m.id ?? `member-${i}`).toString(),
        name: (m.name || "Team member").toString(),
        role: (m.role_type || "team").toString().replace(/_/g, " "),
        ...b,
      };
    })
    .sort((a, b) => b.total - a.total);
}

// ─── Simplified burdened-cost estimator ──────────────────────────────────
// Used by the BurdenedCostCalculator UI in both onboarding and Settings.
// Encodes the "designer doesn't know their real burden" simplifications:
//   employer payroll tax  → flat 11% of base (SS 6.2 + Medicare 1.45 + FUTA 0.6 + avg SUTA 2.7)
//   benefits + retirement → flat 13.5% of base when either is opted in
// Output is locked to formula — never manually overridden here. Advanced
// users override in Settings via the existing granular fields.

export const BURDEN_EMPLOYER_TAX_PCT = 11;
export const BURDEN_BENEFITS_PCT = 13.5;

export type BurdenBasis = "hourly" | "salary";

export type BurdenEstimateInput = {
  basis: BurdenBasis;
  hourlyRate?: number | null;
  hoursPerWeek?: number | null;
  annualSalary?: number | null;
  hasBenefits?: boolean;
  hasRetirement?: boolean;
};

export type BurdenEstimate = {
  base: number;
  taxPct: number;
  taxAmount: number;
  benefitsPct: number;
  benefitsAmount: number;
  total: number;
  perHour: number; // burdened hourly (total / (hours/wk × 52))
};

const HOURS_ANNUAL_WEEKS = 52;

export function estimateBurdenedCost(input: BurdenEstimateInput): BurdenEstimate {
  const hpw = Math.max(0, Number(input.hoursPerWeek) || 0);
  let base = 0;
  if (input.basis === "hourly") {
    const rate = Math.max(0, Number(input.hourlyRate) || 0);
    base = rate * hpw * HOURS_ANNUAL_WEEKS;
  } else {
    base = Math.max(0, Number(input.annualSalary) || 0);
  }
  const taxPct = BURDEN_EMPLOYER_TAX_PCT;
  const taxAmount = base * (taxPct / 100);
  const benefitsPct = input.hasBenefits || input.hasRetirement ? BURDEN_BENEFITS_PCT : 0;
  const benefitsAmount = base * (benefitsPct / 100);
  const total = base + taxAmount + benefitsAmount;
  const denomHours =
    input.basis === "hourly" ? hpw * HOURS_ANNUAL_WEEKS : hpw > 0 ? hpw * HOURS_ANNUAL_WEEKS : 0;
  const perHour = denomHours > 0 ? total / denomHours : 0;
  return { base, taxPct, taxAmount, benefitsPct, benefitsAmount, total, perHour };
}