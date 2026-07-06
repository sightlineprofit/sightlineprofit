// State-aware employer payroll tax defaults.
// New-employer SUI rates + wage bases sourced from 2024/2025 state schedules.
// These are reference starting points — actual rates vary by employer
// experience rating. The employer_payroll_tax_pct field is always editable.

export type SuiRate = {
  sui_new_employer_rate: number; // percentage, e.g. 2.7
  sui_wage_base: number;         // annual wage base in dollars
  notes: string;
};

export const FEDERAL_FICA_PCT = 7.65;

export const SUI_RATES: Record<string, SuiRate> = {
  AL: { sui_new_employer_rate: 2.70, sui_wage_base: 8000,  notes: "" },
  AK: { sui_new_employer_rate: 1.00, sui_wage_base: 49700, notes: "Employee also contributes to SUI in AK." },
  AZ: { sui_new_employer_rate: 2.00, sui_wage_base: 8000,  notes: "" },
  AR: { sui_new_employer_rate: 3.10, sui_wage_base: 10000, notes: "" },
  CA: { sui_new_employer_rate: 3.40, sui_wage_base: 7000,  notes: "Plus ETT surcharge for eligible employers." },
  CO: { sui_new_employer_rate: 1.70, sui_wage_base: 23800, notes: "" },
  CT: { sui_new_employer_rate: 3.00, sui_wage_base: 25000, notes: "" },
  DE: { sui_new_employer_rate: 1.80, sui_wage_base: 10500, notes: "" },
  FL: { sui_new_employer_rate: 2.70, sui_wage_base: 7000,  notes: "" },
  GA: { sui_new_employer_rate: 2.70, sui_wage_base: 9500,  notes: "" },
  HI: { sui_new_employer_rate: 3.00, sui_wage_base: 59100, notes: "" },
  ID: { sui_new_employer_rate: 1.00, sui_wage_base: 53500, notes: "Includes workforce development surcharge." },
  IL: { sui_new_employer_rate: 3.43, sui_wage_base: 13590, notes: "" },
  IN: { sui_new_employer_rate: 2.50, sui_wage_base: 9500,  notes: "" },
  IA: { sui_new_employer_rate: 1.00, sui_wage_base: 38200, notes: "" },
  KS: { sui_new_employer_rate: 2.70, sui_wage_base: 14000, notes: "" },
  KY: { sui_new_employer_rate: 2.70, sui_wage_base: 11400, notes: "" },
  LA: { sui_new_employer_rate: 1.16, sui_wage_base: 7700,  notes: "" },
  ME: { sui_new_employer_rate: 2.07, sui_wage_base: 12000, notes: "Includes CSSF assessment." },
  MD: { sui_new_employer_rate: 2.30, sui_wage_base: 8500,  notes: "" },
  MA: { sui_new_employer_rate: 2.42, sui_wage_base: 15000, notes: "Plus EMAC + workforce training surcharges." },
  MI: { sui_new_employer_rate: 2.70, sui_wage_base: 9500,  notes: "" },
  MN: { sui_new_employer_rate: 1.00, sui_wage_base: 42000, notes: "Rate varies by industry." },
  MS: { sui_new_employer_rate: 1.00, sui_wage_base: 14000, notes: "" },
  MO: { sui_new_employer_rate: 2.376, sui_wage_base: 10500, notes: "" },
  MT: { sui_new_employer_rate: 1.00, sui_wage_base: 43000, notes: "Rate varies by industry." },
  NE: { sui_new_employer_rate: 1.25, sui_wage_base: 9000,  notes: "" },
  NV: { sui_new_employer_rate: 2.95, sui_wage_base: 40600, notes: "Includes career enhancement program tax." },
  NH: { sui_new_employer_rate: 1.70, sui_wage_base: 14000, notes: "" },
  NJ: { sui_new_employer_rate: 2.80, sui_wage_base: 42300, notes: "Employee also contributes to SUI/SDI in NJ." },
  NM: { sui_new_employer_rate: 1.00, sui_wage_base: 30100, notes: "Rate varies by industry." },
  NY: { sui_new_employer_rate: 3.20, sui_wage_base: 12500, notes: "Includes re-employment services fund." },
  NC: { sui_new_employer_rate: 1.00, sui_wage_base: 31400, notes: "" },
  ND: { sui_new_employer_rate: 1.08, sui_wage_base: 43800, notes: "" },
  OH: { sui_new_employer_rate: 2.70, sui_wage_base: 9000,  notes: "Construction industry uses a higher rate." },
  OK: { sui_new_employer_rate: 1.50, sui_wage_base: 27000, notes: "" },
  OR: { sui_new_employer_rate: 2.40, sui_wage_base: 52800, notes: "" },
  PA: { sui_new_employer_rate: 3.78, sui_wage_base: 10000, notes: "Employee also contributes to SUI in PA." },
  RI: { sui_new_employer_rate: 1.16, sui_wage_base: 29200, notes: "Includes job development fund." },
  SC: { sui_new_employer_rate: 0.55, sui_wage_base: 14000, notes: "" },
  SD: { sui_new_employer_rate: 1.20, sui_wage_base: 15000, notes: "Includes investment fee." },
  TN: { sui_new_employer_rate: 2.70, sui_wage_base: 7000,  notes: "" },
  TX: { sui_new_employer_rate: 2.70, sui_wage_base: 9000,  notes: "" },
  UT: { sui_new_employer_rate: 1.00, sui_wage_base: 47000, notes: "Rate varies by industry." },
  VT: { sui_new_employer_rate: 1.00, sui_wage_base: 14000, notes: "" },
  VA: { sui_new_employer_rate: 2.53, sui_wage_base: 8000,  notes: "Includes pool + fund-building surcharges." },
  WA: { sui_new_employer_rate: 1.00, sui_wage_base: 72800, notes: "Rate varies by industry." },
  WV: { sui_new_employer_rate: 2.70, sui_wage_base: 9000,  notes: "" },
  WI: { sui_new_employer_rate: 3.05, sui_wage_base: 14000, notes: "Payroll ≥ $500k uses a higher rate." },
  WY: { sui_new_employer_rate: 0.28, sui_wage_base: 29100, notes: "Rate varies by industry." },
  DC: { sui_new_employer_rate: 2.70, sui_wage_base: 9000,  notes: "" },
};

// Map full state names → two-letter codes so callers can pass either.
export const STATE_NAME_TO_CODE: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", "District of Columbia": "DC",
  Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL",
  Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA",
  Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI",
  Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT",
  Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ",
  "New Mexico": "NM", "New York": "NY", "North Carolina": "NC",
  "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR",
  Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT",
  Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV",
  Wisconsin: "WI", Wyoming: "WY",
};

export function normalizeStateCode(input?: string | null): string | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;
  if (s.length === 2 && SUI_RATES[s.toUpperCase()]) return s.toUpperCase();
  const code = STATE_NAME_TO_CODE[s];
  return code ?? null;
}

export type DefaultEmployerTax = {
  federal_fica: number;
  state_sui: number;
  total: number;
  sui_wage_base: number;
  state_notes: string;
  state_code: string | null;
};

export function getDefaultEmployerTaxRate(state?: string | null): DefaultEmployerTax {
  const code = normalizeStateCode(state);
  if (!code) {
    return {
      federal_fica: FEDERAL_FICA_PCT,
      state_sui: 0,
      total: FEDERAL_FICA_PCT,
      sui_wage_base: 0,
      state_notes: "State not set — add your state in Firm settings to include state unemployment tax.",
      state_code: null,
    };
  }
  const r = SUI_RATES[code];
  const total = round2(FEDERAL_FICA_PCT + r.sui_new_employer_rate);
  return {
    federal_fica: FEDERAL_FICA_PCT,
    state_sui: r.sui_new_employer_rate,
    total,
    sui_wage_base: r.sui_wage_base,
    state_notes: r.notes,
    state_code: code,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** True if `saved` is (approximately) the plain 7.65% federal-only fallback. */
export function isFallbackFederalOnly(saved: number | null | undefined): boolean {
  if (saved == null) return true;
  return Math.abs(saved - FEDERAL_FICA_PCT) < 0.005;
}