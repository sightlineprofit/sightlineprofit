// Shared helpers for fully-burdened team member cost.

export type Burden = {
  yr: number;
  wk: number;
  hr: number;
  base: number;
  ptax: number;
  benefits: number;
  other: number;
};

export type BurdenInput = {
  compensation_type?: string | null;
  cost_rate?: number | null;
  annual_base_salary?: number | null;
  employer_payroll_tax_pct?: number | null;
  annual_benefits?: number | null;
  other_annual_costs?: number | null;
  expected_hrs_per_week?: number | null;
  weeks_per_year?: number | null;
};

export function computeBurden(i: BurdenInput): Burden {
  const wks = Number(i.weeks_per_year) || 48;
  const hpw = Number(i.expected_hrs_per_week) || 40;
  const ptaxPct = Number(i.employer_payroll_tax_pct ?? 7.65) || 0;
  const benefits = Number(i.annual_benefits) || 0;
  const other = Number(i.other_annual_costs) || 0;

  if ((i.compensation_type || "hourly") === "salaried") {
    const base = Number(i.annual_base_salary) || 0;
    const ptax = base * (ptaxPct / 100);
    const yr = base + ptax + benefits + other;
    const wk = wks > 0 ? yr / wks : 0;
    const hr = hpw > 0 && wks > 0 ? wk / hpw : 0;
    return { yr, wk, hr, base, ptax, benefits, other };
  }

  // hourly
  const cost = Number(i.cost_rate) || 0;
  const yearlyHrs = Math.max(1, wks * hpw);
  const hr = cost * (1 + ptaxPct / 100) + benefits / yearlyHrs + other / yearlyHrs;
  const wk = hr * hpw;
  const yr = wk * wks;
  const base = cost * yearlyHrs;
  const ptax = base * (ptaxPct / 100);
  return { yr, wk, hr, base, ptax, benefits, other };
}