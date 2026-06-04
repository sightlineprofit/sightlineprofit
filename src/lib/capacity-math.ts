// Pure capacity math. No React, no Supabase. All hours.

export type ProjRow = {
  id: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  scoped_hrs: number | null;
  scoped_rate: number | null;
  fixed_fee: number | null;
  sop_template_id?: string | null;
  quoted_hours?: number | null;
};
export type PhaseRow = {
  id: string;
  project_id: string;
  expected_hrs: number | null;
  billable: boolean;
  sort_order: number;
};
export type PipelineRow = {
  id: string;
  name: string;
  estimated_hrs: number | null;
  estimated_start: string | null;
  probability_pct: number | null;
};
export type TrailingEntry = {
  hrs: number | null;
  billable: boolean;
  date: string;
  user_id?: string;
};

export type CapacityInputs = {
  projects: ProjRow[];
  phases: PhaseRow[];
  pipeline: PipelineRow[];
  trailingEntries: TrailingEntry[];
  avgWeeklyNonBillable: number;
  targetHrsPerWeek: number;
  weeksPerYear: number;
  ratePerHr: number;
};

export type WeekBucket = {
  weekStart: Date;
  past: boolean;
  committed: number;
};

export type CapacityWindow = {
  id: string;
  label: string;
  startWeek: number;
  endWeek: number;
  available: number;
  avgPctOfTarget: number;
  classification: "comfortable" | "tight" | "over";
};

export type CapacitySummary = {
  annualTarget: number;
  committed: number; // hrs from active projects
  prospectTotalHrs: number;
  nonBillableEst: number;
  available: number;
  status: "comfortable" | "getting-full" | "nearly-full" | "at-capacity";
  committedPct: number;
  availablePct: number;
  weeks: WeekBucket[];
  windows: CapacityWindow[];
  committedDollars: number; // sum of project dollar values where calculable
  committedDollarMode: "none" | "all-fixed" | "all-estimated" | "mixed";
};

function isActive(p: ProjRow): boolean {
  return (p.status || "").toLowerCase() === "active";
}

function projectHours(p: ProjRow, phases: PhaseRow[]): number {
  const ph = phases.filter((x) => x.project_id === p.id);
  if (ph.length) return ph.reduce((s, x) => s + Number(x.expected_hrs || 0), 0);
  return Number(p.scoped_hrs || 0);
}

// Returns dollar value for a single project per the rules:
//  - fixed_fee > 0  → fixed_fee (contracted)
//  - else quoted_hours * scoped_rate (estimated)
//  - else null (no dollar figure)
export function projectDollarValue(
  p: ProjRow,
): { value: number; kind: "fixed" | "estimated" } | null {
  const fee = Number(p.fixed_fee || 0);
  if (fee > 0) return { value: fee, kind: "fixed" };
  const qHrs = Number(p.quoted_hours ?? p.scoped_hrs ?? 0);
  const rate = Number(p.scoped_rate || 0);
  if (qHrs > 0 && rate > 0) return { value: qHrs * rate, kind: "estimated" };
  return null;
}

export function startOfISOWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  // align Sunday start (matches existing dashboard week)
  x.setDate(x.getDate() - x.getDay());
  return x;
}

export function addWeeks(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n * 7);
  return x;
}

function fmtMonth(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Distribute project hours flat across the project's weekly span.
function projectWeeklyHrs(p: ProjRow, totalHrs: number): { start: Date; end: Date; perWeek: number } | null {
  if (!p.start_date || !p.end_date) return null;
  const start = startOfISOWeek(new Date(p.start_date + "T00:00:00"));
  const end = startOfISOWeek(new Date(p.end_date + "T00:00:00"));
  const weeks = Math.max(1, Math.round((end.getTime() - start.getTime()) / (7 * 86400000)) + 1);
  return { start, end, perWeek: totalHrs / weeks };
}

function summaryStatus(committedPct: number): CapacitySummary["status"] {
  if (committedPct < 60) return "comfortable";
  if (committedPct < 80) return "getting-full";
  if (committedPct < 95) return "nearly-full";
  return "at-capacity";
}

export function computeCapacity(input: CapacityInputs): CapacitySummary {
  const { projects, phases, pipeline, trailingEntries, avgWeeklyNonBillable, targetHrsPerWeek, weeksPerYear } = input;
  const active = projects.filter(isActive);
  const annualTarget = targetHrsPerWeek * weeksPerYear;

  const committed = active.reduce((s, p) => s + projectHours(p, phases), 0);

  // Per-project dollar values (honour fixed_fee vs hourly estimate, omit otherwise).
  let committedDollars = 0;
  let fixedCount = 0;
  let estimatedCount = 0;
  for (const p of active) {
    const dv = projectDollarValue(p);
    if (!dv) continue;
    committedDollars += dv.value;
    if (dv.kind === "fixed") fixedCount++;
    else estimatedCount++;
  }
  const committedDollarMode: CapacitySummary["committedDollarMode"] =
    fixedCount === 0 && estimatedCount === 0
      ? "none"
      : fixedCount > 0 && estimatedCount === 0
        ? "all-fixed"
        : estimatedCount > 0 && fixedCount === 0
          ? "all-estimated"
          : "mixed";

  // Plain sum of estimated prospect hours — no probability weighting.
  const prospectTotalHrs = pipeline.reduce(
    (s, r) => s + Number(r.estimated_hrs || 0),
    0,
  );

  const now = new Date();
  const weekStart = startOfISOWeek(now);
  // Weeks remaining in current calendar year (approx)
  const yearEnd = new Date(now.getFullYear(), 11, 31);
  const weeksRemaining = Math.max(0, Math.ceil((yearEnd.getTime() - weekStart.getTime()) / (7 * 86400000)));
  const nonBillableEst = avgWeeklyNonBillable * weeksRemaining;

  const available = Math.max(0, annualTarget - committed - nonBillableEst);
  const committedPct = annualTarget > 0 ? (committed / annualTarget) * 100 : 0;
  const availablePct = annualTarget > 0 ? (available / annualTarget) * 100 : 0;

  // Build 16-week buckets centered around now: 0..15 future weeks starting this week.
  const buckets: WeekBucket[] = [];
  for (let i = 0; i < 16; i++) {
    buckets.push({ weekStart: addWeeks(weekStart, i), past: false, committed: 0 });
  }

  // Past weeks: replace committed of the current week from actual logged billable
  // (also fold 0-indexed week into committed from time entries to reflect now).
  for (const t of trailingEntries) {
    const tDate = new Date(t.date + "T00:00:00");
    const ws = startOfISOWeek(tDate);
    if (ws.getTime() === weekStart.getTime() && t.billable) {
      buckets[0].committed += Number(t.hrs || 0);
    }
  }
  // Reset week 0 actual is intentional — past weeks displayed in chart use actuals if past.

  // Future allocation from active projects.
  for (const p of active) {
    const total = projectHours(p, phases);
    const d = projectWeeklyHrs(p, total);
    if (!d) continue;
    for (let i = 0; i < buckets.length; i++) {
      const ws = buckets[i].weekStart;
      if (ws >= d.start && ws <= d.end) {
        // For week 0, we already added actual logged; for future weeks, use planned.
        if (i === 0) {
          // Replace planned only if no actual recorded
          if (buckets[0].committed === 0) buckets[0].committed = d.perWeek;
        } else {
          buckets[i].committed += d.perWeek;
        }
      }
    }
  }

  // Open windows: contiguous spans of 2+ weeks where committed < 70% of target.
  const windows: CapacityWindow[] = [];
  if (targetHrsPerWeek > 0) {
    let i = 0;
    while (i < buckets.length) {
      if (buckets[i].committed < targetHrsPerWeek * 0.7) {
        let j = i;
        while (j < buckets.length && buckets[j].committed < targetHrsPerWeek * 0.7) j++;
        const length = j - i;
        if (length >= 2) {
          const span = buckets.slice(i, j);
          const avgCommitted = span.reduce((s, b) => s + b.committed, 0) / length;
          const avgPct = (avgCommitted / targetHrsPerWeek) * 100;
          const availHrs = span.reduce((s, b) => s + Math.max(0, targetHrsPerWeek - b.committed), 0);
          const classification: CapacityWindow["classification"] =
            avgPct < 60 ? "comfortable" : avgPct < 85 ? "tight" : "over";
          const label = `${fmtMonth(span[0].weekStart)} – ${fmtMonth(addWeeks(span[span.length - 1].weekStart, 0))}`;
          windows.push({
            id: `w-${i}-${j}`,
            label,
            startWeek: i,
            endWeek: j - 1,
            available: Math.round(availHrs),
            avgPctOfTarget: avgPct,
            classification,
          });
        }
        i = j;
      } else {
        i++;
      }
    }
  }

  return {
    annualTarget,
    committed,
    prospectTotalHrs,
    nonBillableEst,
    available,
    status: summaryStatus(committedPct),
    committedPct,
    availablePct,
    weeks: buckets,
    windows,
    committedDollars,
    committedDollarMode,
  };
}

export function statusMeta(s: CapacitySummary["status"]) {
  switch (s) {
    case "comfortable":
      return { label: "Comfortable", color: "#5C8A6E", bg: "#E6EFEA" };
    case "getting-full":
      return { label: "Getting Full", color: "#B8860B", bg: "#F5EDD6" };
    case "nearly-full":
      return { label: "Nearly Full", color: "#C4714A", bg: "#F5E2D6" };
    case "at-capacity":
      return { label: "At Capacity", color: "#B85C5C", bg: "#F3D9D9" };
  }
}

export function fmtHrs(n: number): string {
  return n >= 100 ? Math.round(n).toString() : n.toFixed(1);
}