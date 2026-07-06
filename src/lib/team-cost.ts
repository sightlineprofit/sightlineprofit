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