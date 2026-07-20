export type PricingStructure = "hourly" | "flat_fee" | "both";

export const PRICING_STRUCTURE_OPTIONS: Array<{
  value: PricingStructure;
  title: string;
  description: string;
}> = [
  {
    value: "hourly",
    title: "Hourly",
    description: "You bill clients by the hour",
  },
  {
    value: "flat_fee",
    title: "Flat project fee",
    description: "You quote a fixed fee per project",
  },
  {
    value: "both",
    title: "Both (hourly and flat)",
    description: "You use hourly and flat fees depending on the project",
  },
];

export function normalizePricingStructure(value: unknown): PricingStructure {
  if (value === "flat_fee" || value === "both" || value === "hourly") return value;
  return "hourly";
}

/** Whether the firm UI should collect and require a billed hourly rate. */
export function requiresBilledRate(structure: PricingStructure | null | undefined): boolean {
  const s = normalizePricingStructure(structure);
  return s === "hourly" || s === "both";
}

/** Reference project sizes for flat-fee minimum fee guidance. */
export function referenceProjectHours(scopedHoursList: number[]): [number, number, number] {
  const valid = scopedHoursList.filter((h) => Number.isFinite(h) && h > 0);
  if (valid.length === 0) return [75, 120, 175];

  const avg = valid.reduce((sum, h) => sum + h, 0) / valid.length;
  return [
    Math.max(1, Math.round(avg * (75 / 120))),
    Math.max(1, Math.round(avg)),
    Math.max(1, Math.round(avg * (175 / 120))),
  ];
}
