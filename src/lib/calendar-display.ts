/** Client-side display helpers for calendar overlay events (browser local timezone). */

export type OverlayEventRaw = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
};

export type OverlayEventDisplay = OverlayEventRaw & {
  date: string;
  start_time: string | null;
  end_time: string | null;
  hrs: number;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Local calendar date YYYY-MM-DD from a Date. */
export function localIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Local HH:MM from a Date. */
export function localTimeStr(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Map stored overlay event → local date/times for the grid (uses browser timezone). */
export function overlayToLocalDisplay(ev: OverlayEventRaw): OverlayEventDisplay {
  if (ev.all_day) {
    const date = ev.start_at.slice(0, 10);
    const startDay = new Date(`${date}T00:00:00`);
    const endDay = new Date(`${ev.end_at.slice(0, 10)}T00:00:00`);
    const durDays = Math.max(1, Math.round((endDay.getTime() - startDay.getTime()) / 86400000));
    return {
      ...ev,
      date,
      start_time: null,
      end_time: null,
      hrs: durDays * 8,
    };
  }

  const startAt = new Date(ev.start_at);
  const endAt = new Date(ev.end_at);
  const hrs = Math.max(0.25, (endAt.getTime() - startAt.getTime()) / 3600000);

  return {
    ...ev,
    date: localIsoDate(startAt),
    start_time: localTimeStr(startAt),
    end_time: localTimeStr(endAt),
    hrs: Math.round(hrs * 100) / 100,
  };
}

/** All-day events can span multiple calendar days (Google end date is exclusive). */
export function overlayOccursOnDate(ev: OverlayEventDisplay, dayIso: string): boolean {
  if (!ev.all_day) return ev.date === dayIso;
  const startDay = ev.start_at.slice(0, 10);
  const endDay = ev.end_at.slice(0, 10);
  return dayIso >= startDay && dayIso < endDay;
}
