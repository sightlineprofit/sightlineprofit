import type { EffectiveCapacityResult, FirmLifeEvent } from "@/lib/finance";
import { leaveStartMonthLabel } from "@/lib/leave-insight";

export type DurationOption = "1" | "2" | "3" | "4-6" | "6+";

export const DURATION_OPTIONS: Array<{ value: DurationOption; label: string; months: number }> = [
  { value: "1", label: "1 month", months: 1 },
  { value: "2", label: "2 months", months: 2 },
  { value: "3", label: "3 months", months: 3 },
  { value: "4-6", label: "4–6 months", months: 5 },
  { value: "6+", label: "6+ months", months: 7 },
];

export type MonthOption = {
  value: string;
  label: string;
  month: number;
  year: number;
};

export function upcomingMonthOptions(count = 13): MonthOption[] {
  const now = new Date();
  const out: MonthOption[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    out.push({
      value: `${year}-${month}`,
      label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      month,
      year,
    });
  }
  return out;
}

/** Month options scoped to a planning year (all 12 months, or from today if current year). */
export function upcomingMonthOptionsForYear(planningYear: number): MonthOption[] {
  const currentYear = new Date().getFullYear();
  if (planningYear > currentYear) {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(planningYear, i, 1);
      const month = i + 1;
      return {
        value: `${planningYear}-${month}`,
        label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        month,
        year: planningYear,
      };
    });
  }
  return upcomingMonthOptions();
}

function parseIso(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00`);
}

function eventCoversMonth(event: FirmLifeEvent, year: number, month: number): boolean {
  if (event.is_recurring) {
    const start = parseIso(event.start_date);
    const end = parseIso(event.end_date);
    const sm = start.getMonth() + 1;
    const em = end.getMonth() + 1;
    if (sm <= em) return month >= sm && month <= em;
    return month >= sm || month <= em;
  }
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  const evStart = parseIso(event.start_date);
  const evEnd = parseIso(event.end_date);
  return evStart <= monthEnd && evEnd >= monthStart;
}

export type LifeEventConflict = {
  event: FirmLifeEvent;
  monthLabel: string;
  suggestAfter: string;
};

export function findLifeEventConflict(
  lifeEvents: FirmLifeEvent[],
  startMonth: number,
  startYear: number,
  durationMonths: number,
): LifeEventConflict | null {
  for (let offset = 0; offset < durationMonths; offset++) {
    const d = new Date(startYear, startMonth - 1 + offset, 1);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();

    for (const event of lifeEvents) {
      if (Number(event.capacity_pct) >= 100) continue;
      if (!eventCoversMonth(event, year, month)) continue;

      const end = parseIso(event.end_date);
      const suggestAfter = end.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });

      return {
        event,
        monthLabel: leaveStartMonthLabel(month),
        suggestAfter,
      };
    }
  }
  return null;
}

export function minimumProjectFee(
  breakEvenRate: number,
  scopedHrs: number,
  targetMarginPct: number,
): number {
  if (scopedHrs <= 0 || breakEvenRate <= 0) return 0;
  const margin = targetMarginPct / 100;
  if (margin >= 1) return breakEvenRate * scopedHrs;
  return (breakEvenRate * scopedHrs) / (1 - margin);
}

export type EffectiveRateTone = "above-aligned" | "above-break-even" | "below-break-even" | null;

export function effectiveRateTone(
  fee: number,
  hrs: number,
  alignedRate: number,
  breakEvenRate: number,
): { rate: number; tone: EffectiveRateTone; label: string } | null {
  if (fee <= 0 || hrs <= 0) return null;
  const rate = fee / hrs;
  if (rate >= alignedRate) {
    return { rate, tone: "above-aligned", label: "↑ Above your aligned rate" };
  }
  if (rate >= breakEvenRate) {
    return { rate, tone: "above-break-even", label: "↓ Below aligned but above break-even" };
  }
  return { rate, tone: "below-break-even", label: "⚠ Below break-even" };
}

export function capacityReductionHrs(effective: EffectiveCapacityResult): number {
  return Math.max(0, effective.standardHrs - effective.effectiveHrs);
}

export function parseCurrencyInput(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function formatCurrencyInput(n: number): string {
  if (!n) return "";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
