import type { FirmLifeEvent, ScheduleException } from "@/lib/finance";

export type BlockType =
  | "life_event"
  | "recurring_season"
  | "recurring_weekly"
  | "blackout_date";

export type WeeklyCommitmentMeta = {
  days: string[];
  hoursPerDay: number;
  applyAllYear: boolean;
  monthStart?: number;
  monthEnd?: number;
};

const AVG_WEEKS_PER_MONTH = 4.33;

export function parseWeeklyMeta(notes: string | null): WeeklyCommitmentMeta | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes);
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.days)) {
      return parsed as WeeklyCommitmentMeta;
    }
  } catch {
    /* plain text notes */
  }
  return null;
}

export function serializeWeeklyMeta(meta: WeeklyCommitmentMeta): string {
  return JSON.stringify(meta);
}

function parseIso(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00`);
}

function monthBounds(year: number, month: number) {
  return {
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 0),
  };
}

function recurringSeasonCoversMonth(event: FirmLifeEvent, month: number): boolean {
  const start = parseIso(event.start_date);
  const end = parseIso(event.end_date);
  const sm = start.getMonth() + 1;
  const em = end.getMonth() + 1;
  if (sm <= em) return month >= sm && month <= em;
  return month >= sm || month <= em;
}

export function eventCoversMonth(
  event: FirmLifeEvent,
  year: number,
  month: number,
): boolean {
  const recurring =
    event.recurs_annually || event.is_recurring || event.block_type === "recurring_season";

  if (recurring && event.block_type === "recurring_season") {
    return recurringSeasonCoversMonth(event, month);
  }

  if (recurring) return recurringSeasonCoversMonth(event, month);

  const { start, end } = monthBounds(year, month);
  const evStart = parseIso(event.start_date);
  const evEnd = parseIso(event.end_date);
  return evStart <= end && evEnd >= start;
}

export function weeklyMetaCoversMonth(
  meta: WeeklyCommitmentMeta | null,
  month: number,
): boolean {
  if (!meta) return true;
  if (meta.applyAllYear) return true;
  const start = meta.monthStart ?? 1;
  const end = meta.monthEnd ?? 12;
  if (start <= end) return month >= start && month <= end;
  return month >= start || month <= end;
}

export function eventEffectiveCapacityPct(event: FirmLifeEvent): number {
  if (event.block_type === "recurring_season") {
    return Number(event.default_capacity_pct ?? event.capacity_pct);
  }
  return Number(event.capacity_pct);
}

function mondayOfWeek(d: Date): Date {
  const out = new Date(d);
  const day = out.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  out.setDate(out.getDate() + diff);
  out.setHours(12, 0, 0, 0);
  return out;
}

function weeksInMonth(year: number, month: number): Date[] {
  const { start, end } = monthBounds(year, month);
  const weeks: Date[] = [];
  let cursor = mondayOfWeek(start);
  while (cursor <= end) {
    weeks.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
}

function exceptionForWeek(
  exceptions: ScheduleException[],
  lifeEventId: string,
  weekStart: Date,
): ScheduleException | undefined {
  const iso = weekStart.toISOString().slice(0, 10);
  return exceptions.find(
    (ex) => ex.life_event_id === lifeEventId && ex.week_start.slice(0, 10) === iso,
  );
}

export function monthCapacityFromBlocks(params: {
  events: FirmLifeEvent[];
  exceptions: ScheduleException[];
  year: number;
  month: number;
  hrsPerWeek: number;
}): { capacityPct: number; availableHrs: number; primaryEvent: FirmLifeEvent | null } {
  const { events, exceptions, year, month, hrsPerWeek } = params;
  const fullMonthlyHrs = hrsPerWeek * AVG_WEEKS_PER_MONTH;

  const covering = events.filter((e) => {
    if (e.scheduling_only) return false;
    if (e.block_type === "recurring_weekly") {
      const meta = parseWeeklyMeta(e.notes);
      return eventCoversMonth(e, year, month) && weeklyMetaCoversMonth(meta, month);
    }
    return eventCoversMonth(e, year, month);
  });

  let capacityPct = 100;
  let primaryEvent: FirmLifeEvent | null = null;

  const pctEvents = covering.filter((e) => e.block_type !== "recurring_weekly");
  if (pctEvents.length > 0) {
    const seasonWeekPcts: number[] = [];
    for (const event of pctEvents) {
      if (event.block_type === "recurring_season") {
        const weeks = weeksInMonth(year, month);
        if (weeks.length === 0) {
          seasonWeekPcts.push(eventEffectiveCapacityPct(event));
          continue;
        }
        for (const w of weeks) {
          const ex = exceptionForWeek(exceptions, event.id, w);
          seasonWeekPcts.push(ex ? ex.capacity_pct : eventEffectiveCapacityPct(event));
        }
      } else {
        seasonWeekPcts.push(eventEffectiveCapacityPct(event));
      }
    }
    capacityPct = Math.min(...seasonWeekPcts);
    primaryEvent =
      pctEvents.find((e) => eventEffectiveCapacityPct(e) === capacityPct) ?? pctEvents[0];
  }

  let availableHrs = fullMonthlyHrs * (capacityPct / 100);

  for (const event of covering.filter((e) => e.block_type === "recurring_weekly")) {
    const blocked = Number(event.weekly_hours_blocked) || 0;
    if (blocked > 0) {
      availableHrs = Math.max(0, availableHrs - blocked * AVG_WEEKS_PER_MONTH);
    }
  }

  if (availableHrs < fullMonthlyHrs * (capacityPct / 100)) {
    capacityPct = fullMonthlyHrs > 0 ? Math.round((availableHrs / fullMonthlyHrs) * 100) : capacityPct;
  }

  return { capacityPct, availableHrs, primaryEvent };
}

export function seasonBlockTone(pct: number): "muted" | "gold" | "amber" {
  if (pct >= 80) return "muted";
  if (pct >= 50) return "gold";
  return "amber";
}

export function seasonMonthSpan(
  event: FirmLifeEvent,
  year: number,
): { startMonth: number; endMonth: number } | null {
  if (event.block_type !== "recurring_season") return null;
  const start = parseIso(event.start_date);
  const end = parseIso(event.end_date);
  const sm = start.getMonth() + 1;
  const em = end.getMonth() + 1;
  return { startMonth: sm, endMonth: em };
}

export function exceptionsInMonth(
  exceptions: ScheduleException[],
  lifeEventId: string,
  year: number,
  month: number,
): ScheduleException[] {
  const { start, end } = monthBounds(year, month);
  return exceptions.filter((ex) => {
    if (ex.life_event_id !== lifeEventId) return false;
    const w = parseIso(ex.week_start);
    return w >= start && w <= end;
  });
}

export function anchorSeasonDate(month: number, day: number, year = 2000): string {
  const dim = new Date(year, month, 0).getDate();
  const d = Math.min(day, dim);
  return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Anchor dates for a recurring season; end rolls to next anchor year when the season wraps (e.g. Sep–May). */
export function anchorSeasonRange(
  startMonth: number,
  startDay: number,
  endMonth: number,
  endDay: number,
): { start_date: string; end_date: string } {
  const start_date = anchorSeasonDate(startMonth, startDay, 2000);
  const wraps =
    endMonth < startMonth || (endMonth === startMonth && endDay < startDay);
  const end_date = anchorSeasonDate(endMonth, endDay, wraps ? 2001 : 2000);
  return { start_date, end_date };
}

export { AVG_WEEKS_PER_MONTH, weeksInMonth, mondayOfWeek };
