import type { FirmLifeEvent } from "@/lib/finance";

const AVG_WEEKS_PER_MONTH = 4.33;
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export { MONTH_ABBR };

export type CalendarProject = {
  id: string;
  name: string;
  status: string;
  startMonth: number;
  endMonth: number;
  isRetainer?: boolean;
  clientName?: string | null;
  monthlyFee?: number;
  avgHoursPerMonth?: number | null;
  realizedRate?: number | null;
};

export type CalendarEventBlock = {
  event: FirmLifeEvent;
  startMonth: number;
  endMonth: number;
  startFraction: number;
  endFraction: number;
};

function parseIso(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00`);
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function overlapDaysInMonth(
  start: Date,
  end: Date,
  year: number,
  month: number,
): { days: number; startFrac: number; endFrac: number } {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  const from = start > monthStart ? start : monthStart;
  const to = end < monthEnd ? end : monthEnd;
  if (from > to) return { days: 0, startFrac: 0, endFrac: 0 };
  const dim = daysInMonth(year, month);
  const startDay = from.getDate();
  const endDay = to.getDate();
  return {
    days: endDay - startDay + 1,
    startFrac: (startDay - 1) / dim,
    endFrac: endDay / dim,
  };
}

function eventRangeInYear(
  event: FirmLifeEvent,
  year: number,
): { start: Date; end: Date } | null {
  const recurring =
    event.is_recurring ||
    event.recurs_annually ||
    event.block_type === "recurring_season" ||
    event.block_type === "recurring_weekly";

  if (recurring) {
    const s = parseIso(event.start_date);
    const e = parseIso(event.end_date);
    const start = new Date(year, s.getMonth(), s.getDate());
    const anchorSpanYears = Math.max(0, e.getFullYear() - s.getFullYear());
    let end = new Date(year + anchorSpanYears, e.getMonth(), e.getDate());
    if (end < start) {
      end = new Date(year + 1, e.getMonth(), e.getDate());
    }
    return { start, end };
  }
  const start = parseIso(event.start_date);
  const end = parseIso(event.end_date);
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  if (end < yearStart || start > yearEnd) return null;
  return { start, end };
}

export function projectMonthSpan(
  project: {
    start_date: string | null;
    end_date: string | null;
    created_at: string;
    scoped_hrs: number | null;
  },
  year: number,
  billableHrsPerWeek: number,
): { startMonth: number; endMonth: number } | null {
  const start = project.start_date
    ? parseIso(project.start_date)
    : parseIso(project.created_at.slice(0, 10));
  let end = project.end_date ? parseIso(project.end_date) : null;
  if (!end && project.scoped_hrs && billableHrsPerWeek > 0) {
    const months = Math.max(1, Math.ceil(project.scoped_hrs / (billableHrsPerWeek * AVG_WEEKS_PER_MONTH)));
    end = new Date(start);
    end.setMonth(end.getMonth() + months);
    end.setDate(end.getDate() - 1);
  }
  if (!end) end = new Date(year, 11, 31);

  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  if (end < yearStart || start > yearEnd) return null;

  const clampStart = start < yearStart ? yearStart : start;
  const clampEnd = end > yearEnd ? yearEnd : end;
  return {
    startMonth: clampStart.getMonth() + 1,
    endMonth: clampEnd.getMonth() + 1,
  };
}

export function buildCalendarProjects(
  projects: Array<{
    id: string;
    name: string;
    client_name?: string | null;
    status: string | null;
    start_date: string | null;
    end_date: string | null;
    created_at: string;
    scoped_hrs: number | null;
    pricing_method?: string | null;
    retainer_start_date?: string | null;
    monthly_retainer_fee?: number | null;
    retainer_monthly_amount?: number | null;
  }>,
  year: number,
  billableHrsPerWeek: number,
): CalendarProject[] {
  const statuses = new Set(["active", "pipeline", "pursuit", "invoiced", "collected"]);
  const out: CalendarProject[] = [];

  for (const p of projects) {
    const method = (p.pricing_method ?? "").toLowerCase();
    if (method === "retainer") continue;

    const status = (p.status ?? "").toLowerCase();
    if (status === "completed") {
      if (!p.end_date) continue;
      if (parseIso(p.end_date).getFullYear() !== year) continue;
    } else if (!statuses.has(status)) {
      continue;
    }

    const span = projectMonthSpan(p, year, billableHrsPerWeek);
    if (!span) continue;
    out.push({
      id: p.id,
      name: p.name,
      status,
      startMonth: span.startMonth,
      endMonth: span.endMonth,
    });
  }

  return out.sort((a, b) => a.startMonth - b.startMonth || a.name.localeCompare(b.name));
}

export function buildRetainerCalendarProjects(
  projects: Array<{
    id: string;
    name: string;
    client_name?: string | null;
    status: string | null;
    retainer_start_date?: string | null;
    start_date?: string | null;
    created_at: string;
    pricing_method?: string | null;
    monthly_retainer_fee?: number | null;
    retainer_monthly_amount?: number | null;
  }>,
  year: number,
  retainerHoursByProject?: Record<string, number>,
): CalendarProject[] {
  const activeStatuses = new Set(["active", "in_progress"]);
  const out: CalendarProject[] = [];
  const yearEnd = new Date(year, 11, 31);

  for (const p of projects) {
    if ((p.pricing_method ?? "").toLowerCase() !== "retainer") continue;
    const status = (p.status ?? "").toLowerCase();
    if (!activeStatuses.has(status)) continue;

    const startStr = p.retainer_start_date ?? p.start_date ?? p.created_at.slice(0, 10);
    const start = parseIso(startStr);
    if (start > yearEnd) continue;

    const clampStart = start.getFullYear() < year ? new Date(year, 0, 1) : start;
    const startMonth = clampStart.getMonth() + 1;
    const endMonth = 12;

    const monthlyFee =
      Number(p.monthly_retainer_fee ?? p.retainer_monthly_amount) || 0;
    const avgHours = retainerHoursByProject?.[p.id];
    const realizedRate =
      avgHours != null && avgHours > 0 ? monthlyFee / avgHours : null;

    out.push({
      id: p.id,
      name: p.name,
      status,
      startMonth,
      endMonth,
      isRetainer: true,
      clientName: p.client_name,
      monthlyFee,
      avgHoursPerMonth: avgHours ?? null,
      realizedRate,
    });
  }

  return out.sort(
    (a, b) =>
      a.startMonth - b.startMonth ||
      (a.clientName ?? a.name).localeCompare(b.clientName ?? b.name),
  );
}

export function buildEventBlocks(
  events: FirmLifeEvent[],
  year: number,
  kind: "leave" | "reduced",
): CalendarEventBlock[] {
  const blocks: CalendarEventBlock[] = [];

  for (const event of events) {
    const pct = Number(event.capacity_pct);
    if (kind === "leave" && pct !== 0) continue;
    if (kind === "reduced" && !(pct > 0 && pct < 100)) continue;

    const range = eventRangeInYear(event, year);
    if (!range) continue;

    let startMonth = range.start.getMonth() + 1;
    let endMonth = range.end.getMonth() + 1;
    const startOv = overlapDaysInMonth(range.start, range.end, year, startMonth);
    const endOv = overlapDaysInMonth(range.start, range.end, year, endMonth);

    blocks.push({
      event,
      startMonth,
      endMonth,
      startFraction: startMonth === endMonth ? startOv.startFrac : 0,
      endFraction: startMonth === endMonth ? endOv.endFrac : 1,
    });
  }

  return blocks;
}

export function eventHoursImpact(event: FirmLifeEvent, billableHrsPerWeek: number, year: number): number {
  const range = eventRangeInYear(event, year);
  if (!range) return 0;
  const pct = Number(event.capacity_pct);
  const fullMonthly = billableHrsPerWeek * AVG_WEEKS_PER_MONTH;
  let lost = 0;
  for (let m = 1; m <= 12; m++) {
    const ov = overlapDaysInMonth(range.start, range.end, year, m);
    if (ov.days <= 0) continue;
    const monthHrs = fullMonthly * (ov.days / daysInMonth(year, m));
    lost += monthHrs * (1 - pct / 100);
  }
  return lost;
}

export function formatEventDateRange(start: string, end: string): string {
  const s = parseIso(start);
  const e = parseIso(end);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const sStr = s.toLocaleDateString("en-US", opts);
  const eStr = e.toLocaleDateString("en-US", { ...opts, year: "numeric" });
  return `${sStr} — ${eStr}`;
}

export function eventDurationLabel(start: string, end: string): string {
  const s = parseIso(start);
  const e = parseIso(end);
  const days = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"}`;
  const weeks = Math.round(days / 7);
  if (weeks < 8) return `${weeks} week${weeks === 1 ? "" : "s"}`;
  const months = Math.max(1, Math.round(days / 30));
  return `${months} month${months === 1 ? "" : "s"}`;
}

export type MonthCellPosition = "single" | "start" | "middle" | "end" | "empty";

export function monthCellPosition(
  month: number,
  startMonth: number,
  endMonth: number,
): MonthCellPosition {
  if (month < startMonth || month > endMonth) return "empty";
  if (startMonth === endMonth) return "single";
  if (month === startMonth) return "start";
  if (month === endMonth) return "end";
  return "middle";
}

export function blockRadiusClass(pos: MonthCellPosition): string {
  if (pos === "single") return "rounded";
  if (pos === "start") return "rounded-l";
  if (pos === "end") return "rounded-r";
  return "rounded-none";
}
