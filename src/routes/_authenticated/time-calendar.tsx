import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, Lock, Plus, Trash2, Pencil, Copy } from "lucide-react";
import { toast } from "sonner";
import { ModulePage } from "@/components/shell/ModulePage";
import { UpgradeModal } from "@/components/shell/UpgradeModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { getMyContext } from "@/lib/firm.functions";
import { effectiveTier } from "@/lib/role";
import { getCalendarData, saveTimeEntry, deleteTimeEntry, updateTargets } from "@/lib/time.functions";
import { fmtUsd } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";

export const Route = createFileRoute("/_authenticated/time-calendar")({
  head: () => ({ meta: [{ title: "Time Calendar — Sightline" }] }),
  component: TimeCalendarPage,
});

// ───────── helpers ─────────
const HOUR_START = 7;
const HOUR_END = 20;
const HOURS = HOUR_END - HOUR_START;
const ROW_H = 44;
const ROW_H_DAY = 56;

function startOfWeek(d: Date) {
  const day = d.getDay(); // 0 = Sun
  const monOffset = day === 0 ? -6 : 1 - day;
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() + monOffset);
  return r;
}
function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function toHourFloat(t: string | null): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h + m / 60;
}
function formatHour(h: number) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const ampm = hh >= 12 ? "PM" : "AM";
  const d = hh % 12 || 12;
  return mm === 0 ? `${d} ${ampm}` : `${d}:${String(mm).padStart(2, "0")} ${ampm}`;
}
function hourToTime(h: number) {
  const hh = String(Math.floor(h)).padStart(2, "0");
  const mm = String(Math.round((h - Math.floor(h)) * 60)).padStart(2, "0");
  return `${hh}:${mm}`;
}
function snap15(h: number) {
  return Math.round(h * 4) / 4;
}
function addHoursToTime(t: string, deltaHrs: number): string {
  const h = toHourFloat(t) + deltaHrs;
  return hourToTime(Math.max(0, Math.min(24, h)));
}

// ───────── types ─────────
type Entry = {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  hrs: number;
  billable: boolean;
  notes: string | null;
  description: string | null;
  project_id: string | null;
  project_phase_id: string | null;
  activity_group_id: string | null;
  activity_type_id: string | null;
  user_id: string;
};
type Project = { id: string; name: string; client_name: string | null; scoped_rate: number | null };
type Phase = { id: string; project_id: string; name: string; expected_hrs: number; actual_hrs: number };
type Ag = { id: string; name: string; color: string };
type ActivityType = { id: string; name: string; is_billable: boolean; color: string; sort_order: number | null };
type Member = {
  id: string; name: string | null; email: string; role: string;
  billable_rate: number | null; expected_hrs_per_week: number | null; billable_pct: number | null;
  color?: string | null;
};

type View = "week" | "day" | "team";

// ───────── page ─────────
function TimeCalendarPage() {
  const getCtx = useServerFn(getMyContext);
  const { data: ctx } = useQuery({ queryKey: ["me"], queryFn: () => getCtx() });
  // Time calendar is available at all paid tiers (Studio is the base).
  return <Calendar isAdmin={["principal", "admin"].includes((ctx?.profile?.role as string) || "")} />;
}

// ───────── calendar shell ─────────
function Calendar({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [view, setView] = useState<View>("week");
  const [weekDate, setWeekDate] = useState(() => startOfWeek(new Date()));
  const [activeDay, setActiveDay] = useState(() => new Date());
  const [modal, setModal] = useState<null | (Partial<Entry> & { _duplicate?: boolean })>(null);

  const weekStart = isoDate(weekDate);
  const fetchData = useServerFn(getCalendarData);
  const { data, isLoading } = useQuery({
    queryKey: ["calendar", weekStart],
    queryFn: () => fetchData({ data: { weekStart } }),
  });

  const entries: Entry[] = (data?.entries ?? []) as Entry[];
  const projects: Project[] = (data?.projects ?? []) as Project[];
  const phases: Phase[] = (data?.phases ?? []) as Phase[];
  const ags: Ag[] = (data?.activityGroups ?? []) as Ag[];
  const activityTypes: ActivityType[] = (data?.activityTypes ?? []) as ActivityType[];
  const team: Member[] = (data?.team ?? []) as Member[];
  const config = data?.config ?? null;
  const me = data?.profile ?? null;

  const firmId = (me?.firm_id as string | null | undefined) ?? undefined;
  const teamOnly = !isAdmin && me?.id ? `user_id=eq.${me.id}` : undefined;
  useRealtimeInvalidate(
    `calendar-${firmId ?? "none"}-${weekStart}`,
    [
      {
        table: "time_entries",
        filter: firmId
          ? teamOnly
            ? `${teamOnly}`
            : `firm_id=eq.${firmId}`
          : undefined,
      },
    ],
    [["calendar", weekStart]],
    !!firmId,
  );

  const days = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(weekDate, i)), [weekDate]);

  const myEntries = entries.filter((e) => e.user_id === me?.id);
  const myBillable = myEntries.filter((e) => e.billable).reduce((s, e) => s + Number(e.hrs || 0), 0);
  const myNonBillable = myEntries.filter((e) => !e.billable).reduce((s, e) => s + Number(e.hrs || 0), 0);
  const myRate = Number(me?.billable_rate) || Number(config?.rate_billed) || 0;
  const weeklyRevenue = myBillable * myRate;
  const weeklyTarget = Number(config?.target_billable_hrs_per_week) || 0;
  const hoursToTarget = Math.max(0, weeklyTarget - myBillable);
  const targetRevenue = weeklyTarget * myRate;
  const revenueGap = Math.max(0, targetRevenue - weeklyRevenue);

  const refresh = () => qc.invalidateQueries({ queryKey: ["calendar"] });

  return (
    <div className="flex w-full">
      <div className="min-w-0 flex-1 px-6 py-8">
        {/* header */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-gold">Studio</p>
            <h1 className="mt-1 font-display text-4xl tracking-tight text-ch">Time Calendar</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-border bg-white p-0.5">
              {(["week", "day", isAdmin ? "team" : null].filter(Boolean) as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "px-3 py-1.5 text-xs uppercase tracking-[0.15em] rounded",
                    view === v ? "bg-ch text-cream" : "text-ch/60 hover:text-ch",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
            <Button variant="outline" size="icon" onClick={() => setWeekDate((d) => addDays(d, -7))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => { setWeekDate(startOfWeek(new Date())); setActiveDay(new Date()); }}>
              Today
            </Button>
            <Button variant="outline" size="icon" onClick={() => setWeekDate((d) => addDays(d, 7))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <p className="mt-3 font-display text-lg italic text-ch/60">
          {days[0].toLocaleDateString(undefined, { month: "long", day: "numeric" })} —{" "}
          {days[6].toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
        </p>

        <div className="mt-5">
          {isLoading ? (
            <p className="text-ch/55">Loading…</p>
          ) : view === "week" ? (
            <WeekView
              days={days} entries={entries} myId={me?.id || ""} projects={projects} ags={ags} activityTypes={activityTypes}
              onCellClick={(date, hour) => setModal({
                date: isoDate(date), start_time: hourToTime(hour), end_time: hourToTime(hour + 1),
                billable: true,
              })}
              onEntryClick={(e) => setModal(e)}
              onDuplicate={(e) => setModal({
                _duplicate: true,
                date: e.date,
                start_time: e.end_time || hourToTime(toHourFloat(e.start_time) + Number(e.hrs || 1)),
                end_time: hourToTime(toHourFloat(e.end_time || "10:00") + Number(e.hrs || 1)),
                billable: e.billable,
                notes: e.notes,
                description: e.description,
                project_id: e.project_id,
                project_phase_id: e.project_phase_id,
                activity_group_id: e.activity_group_id,
                activity_type_id: e.activity_type_id,
              })}
            />
          ) : view === "day" ? (
            <DayView
              day={activeDay} weekDays={days} setDay={setActiveDay}
              entries={entries.filter((e) => e.date === isoDate(activeDay))}
              projects={projects} ags={ags} activityTypes={activityTypes}
              onCellClick={(hour) => setModal({
                date: isoDate(activeDay), start_time: hourToTime(hour), end_time: hourToTime(hour + 1),
                billable: true,
              })}
              onEntryClick={(e) => setModal(e)}
              onDuplicate={(e) => setModal({
                _duplicate: true,
                date: e.date,
                start_time: e.end_time || hourToTime(toHourFloat(e.start_time) + Number(e.hrs || 1)),
                end_time: hourToTime(toHourFloat(e.end_time || "10:00") + Number(e.hrs || 1)),
                billable: e.billable,
                notes: e.notes,
                description: e.description,
                project_id: e.project_id,
                project_phase_id: e.project_phase_id,
                activity_group_id: e.activity_group_id,
                activity_type_id: e.activity_type_id,
              })}
            />
          ) : (
            <TeamView
              days={days}
              entries={entries}
              team={team}
              projects={projects}
              ags={ags}
              activityTypes={activityTypes}
              onEntryClick={(e) => setModal(e)}
            />
          )}
        </div>
      </div>

      {/* right sidebar */}
      <aside className="w-[320px] shrink-0 border-l border-border bg-white px-5 py-6 hidden xl:block">
        <SidebarStats
          weeklyBillable={myBillable}
          weeklyNonBillable={myNonBillable}
          weeklyRevenue={weeklyRevenue}
          weeklyTarget={weeklyTarget}
          hoursToTarget={hoursToTarget}
          revenueGap={revenueGap}
          rate={myRate}
          isAdmin={isAdmin}
        />
        <div className="mt-6 border-t border-border pt-5">
          <h3 className="font-display text-xl text-ch">Quick log</h3>
          <EntryForm
            compact
            projects={projects}
            phases={phases}
            ags={ags}
            activityTypes={activityTypes}
            team={team}
            isAdmin={isAdmin}
            meId={me?.id || ""}
            initial={{
              date: isoDate(new Date()),
              start_time: "09:00",
              end_time: "10:00",
              billable: true,
            }}
            onSaved={() => { refresh(); toast.success("Logged"); }}
          />
        </div>
      </aside>

      {/* modal */}
      <Dialog open={!!modal} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-ch">
              {modal?.id ? "Edit time entry" : "Log time"}
            </DialogTitle>
          </DialogHeader>
          {modal && (
            <EntryForm
              projects={projects}
              phases={phases}
              ags={ags}
              activityTypes={activityTypes}
              team={team}
              isAdmin={isAdmin}
              meId={me?.id || ""}
              initial={modal._duplicate ? { ...modal, id: undefined } : modal}
              onSaved={() => { setModal(null); refresh(); toast.success(modal._duplicate ? "New entry logged" : modal.id ? "Updated" : "Logged"); }}
              onDeleted={() => { setModal(null); refresh(); toast.success("Deleted"); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ───────── week view ─────────
function WeekView({
  days, entries, myId, projects, ags, activityTypes, onCellClick, onEntryClick, onDuplicate,
}: {
  days: Date[]; entries: Entry[]; myId: string;
  projects: Project[]; ags: Ag[]; activityTypes: ActivityType[];
  onCellClick: (date: Date, hour: number) => void;
  onEntryClick: (e: Entry) => void;
  onDuplicate: (e: Entry) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-white">
      <div className="grid" style={{ gridTemplateColumns: "60px repeat(7, minmax(0, 1fr))" }}>
        <div />
        {days.map((d) => (
          <div key={d.toISOString()} className="border-l border-border px-2 py-2 text-center">
            <div className="text-[11px] uppercase tracking-[0.18em] text-ch/50">
              {d.toLocaleDateString(undefined, { weekday: "short" })}
            </div>
            <div className="font-display text-2xl text-ch leading-tight">{d.getDate()}</div>
          </div>
        ))}
      </div>
      <Grid
        days={days}
        entries={entries}
        rowH={ROW_H}
        myId={myId}
        projects={projects}
        ags={ags}
        activityTypes={activityTypes}
        onCellClick={onCellClick}
        onEntryClick={onEntryClick}
        onDuplicate={onDuplicate}
      />
      <DayFooters days={days} entries={entries} myId={myId} />
    </div>
  );
}

function Grid({
  days, entries, rowH, myId, projects, ags, activityTypes, onCellClick, onEntryClick, onDuplicate,
}: {
  days: Date[]; entries: Entry[]; rowH: number; myId: string;
  projects: Project[]; ags: Ag[]; activityTypes: ActivityType[];
  onCellClick: (date: Date, hour: number) => void;
  onEntryClick: (e: Entry) => void;
  onDuplicate: (e: Entry) => void;
}) {
  const project = (id: string | null) => projects.find((p) => p.id === id);
  const agName = (id: string | null) => ags.find((a) => a.id === id)?.name;
  const atName = (id: string | null) => activityTypes.find((a) => a.id === id)?.name;
  const dayRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const getDayDateAt = (x: number, y: number): string | null => {
    for (const [iso, el] of dayRefs.current.entries()) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return iso;
    }
    return null;
  };
  return (
    <div className="relative grid border-t border-border" style={{ gridTemplateColumns: `60px repeat(${days.length}, minmax(0, 1fr))` }}>
      {/* time labels */}
      <div>
        {Array.from({ length: HOURS }).map((_, i) => (
          <div key={i} className="border-t border-border text-right pr-2 pt-1 text-[11px] text-ch/40" style={{ height: rowH }}>
            {formatHour(HOUR_START + i)}
          </div>
        ))}
      </div>
      {days.map((d) => {
        const dayEntries = entries.filter((e) => e.date === isoDate(d));
        const iso = isoDate(d);
        return (
          <div
            key={d.toISOString()}
            ref={(el) => {
              if (el) dayRefs.current.set(iso, el);
              else dayRefs.current.delete(iso);
            }}
            className="relative border-l border-border"
          >
            {Array.from({ length: HOURS }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onCellClick(d, HOUR_START + i)}
                className="block w-full border-t border-border hover:bg-goldp/30 transition-colors"
                style={{ height: rowH }}
              />
            ))}
            {dayEntries.map((e) => {
              const top = (toHourFloat(e.start_time) - HOUR_START) * rowH;
              const h = Math.max(0.25, Number(e.hrs || 0)) * rowH;
              const isMine = e.user_id === myId;
              const proj = project(e.project_id);
              const activity = atName(e.activity_type_id) ?? agName(e.activity_group_id);
              const clientPart = proj?.client_name ? `${proj.client_name} · ${proj.name}` : (proj?.name ?? "Firm");
              const dur = Number(e.hrs || 0).toFixed(2).replace(/\.?0+$/, "") + "h";
              const tooltip = [clientPart, activity, `${dur} · ${e.billable ? "Billable" : "Non-Bill"}`, e.notes].filter(Boolean).join("\n");
              const lineCount = h >= 56 ? 3 : h >= 36 ? 2 : 1;
              return (
                <EntryBlock
                  key={e.id}
                  entry={e}
                  top={top}
                  height={h}
                  rowH={rowH}
                  isMine={isMine}
                  bg={e.billable ? "#5C8A6E" : "#C4714A"}
                  borderColor={e.billable ? "#4A7158" : "#A85F3D"}
                  tooltip={tooltip}
                  lineCount={lineCount}
                  clientPart={clientPart}
                  activity={activity}
                  durLabel={dur}
                  getDayDateAt={getDayDateAt}
                  onOpen={() => onEntryClick(e)}
                  onDuplicate={() => onDuplicate(e)}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ───────── interactive entry block (resize / move / duplicate / undo) ─────────
function EntryBlock({
  entry, top, height, rowH, isMine, bg, borderColor, tooltip, lineCount,
  clientPart, activity, durLabel, getDayDateAt, onOpen, onDuplicate,
}: {
  entry: Entry;
  top: number;
  height: number;
  rowH: number;
  isMine: boolean;
  bg: string;
  borderColor: string;
  tooltip: string;
  lineCount: number;
  clientPart: string;
  activity: string | undefined;
  durLabel: string;
  getDayDateAt: (x: number, y: number) => string | null;
  onOpen: () => void;
  onDuplicate: () => void;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveTimeEntry);
  const [mode, setMode] = useState<"idle" | "resize" | "move">("idle");
  const [previewTop, setPreviewTop] = useState(top);
  const [previewH, setPreviewH] = useState(height);
  const [previewLeftPx, setPreviewLeftPx] = useState<number | null>(null);
  const [hoverDay, setHoverDay] = useState<string | null>(null);
  const startState = useRef({ pointerY: 0, pointerX: 0, top, height, moved: false });
  const armedRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);

  const editable = isMine;

  function showUndoToast(label: string, prev: Entry) {
    const t = toast.success(label, {
      duration: 10000,
      action: {
        label: "Undo",
        onClick: async () => {
          try {
            await saveFn({
              data: {
                id: prev.id,
                date: prev.date,
                start_time: (prev.start_time || "09:00").slice(0, 5),
                end_time: (prev.end_time || "10:00").slice(0, 5),
                billable: prev.billable,
                notes: prev.notes ?? null,
                description: prev.description ?? null,
                project_id: prev.project_id ?? null,
                project_phase_id: prev.project_phase_id ?? null,
                activity_group_id: prev.activity_group_id ?? null,
                activity_type_id: prev.activity_type_id ?? null,
                user_id: prev.user_id,
              },
            });
            qc.invalidateQueries({ queryKey: ["calendar"] });
            toast.dismiss(t);
            toast.success("Reverted");
          } catch (e) {
            toast.error((e as Error).message || "Could not undo");
          }
        },
      },
    });
  }

  async function commitResize(newHeightPx: number) {
    const durHrs = Math.max(0.25, snap15(newHeightPx / rowH));
    const startHrs = toHourFloat(entry.start_time);
    const newEnd = hourToTime(startHrs + durHrs);
    if (newEnd === (entry.end_time || "").slice(0, 5)) return;
    const prev = { ...entry };
    try {
      await saveFn({
        data: {
          id: entry.id,
          date: entry.date,
          start_time: (entry.start_time || "09:00").slice(0, 5),
          end_time: newEnd,
          billable: entry.billable,
          notes: entry.notes ?? null,
          description: entry.description ?? null,
          project_id: entry.project_id ?? null,
          project_phase_id: entry.project_phase_id ?? null,
          activity_group_id: entry.activity_group_id ?? null,
          activity_type_id: entry.activity_type_id ?? null,
          user_id: entry.user_id,
        },
      });
      qc.invalidateQueries({ queryKey: ["calendar"] });
      const h = Math.floor(durHrs);
      const m = Math.round((durHrs - h) * 60);
      showUndoToast(`Entry updated to ${h}h${m ? ` ${m}m` : ""}`, prev);
    } catch (e) {
      toast.error((e as Error).message || "Could not resize");
    }
  }

  async function commitMove(newDateIso: string) {
    if (newDateIso === entry.date) return;
    const prev = { ...entry };
    try {
      await saveFn({
        data: {
          id: entry.id,
          date: newDateIso,
          start_time: (entry.start_time || "09:00").slice(0, 5),
          end_time: (entry.end_time || "10:00").slice(0, 5),
          billable: entry.billable,
          notes: entry.notes ?? null,
          description: entry.description ?? null,
          project_id: entry.project_id ?? null,
          project_phase_id: entry.project_phase_id ?? null,
          activity_group_id: entry.activity_group_id ?? null,
          activity_type_id: entry.activity_type_id ?? null,
          user_id: entry.user_id,
        },
      });
      qc.invalidateQueries({ queryKey: ["calendar"] });
      const label = new Date(newDateIso + "T00:00:00").toLocaleDateString(undefined, { weekday: "long" });
      showUndoToast(`Moved to ${label}`, prev);
    } catch (e) {
      toast.error((e as Error).message || "Could not move");
    }
  }

  function onResizeDown(ev: React.PointerEvent) {
    if (!editable) return;
    ev.preventDefault();
    ev.stopPropagation();
    (ev.target as Element).setPointerCapture(ev.pointerId);
    setMode("resize");
    armedRef.current = true;
    pointerIdRef.current = ev.pointerId;
    startState.current = { pointerY: ev.clientY, pointerX: ev.clientX, top, height, moved: false };
    setPreviewH(height);
  }

  function onBodyDown(ev: React.PointerEvent) {
    if (!editable) return;
    // Ignore clicks on the resize handle or controls (they stop propagation).
    (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
    armedRef.current = true;
    pointerIdRef.current = ev.pointerId;
    startState.current = { pointerY: ev.clientY, pointerX: ev.clientX, top, height, moved: false };
    setMode("idle"); // becomes "move" after threshold
  }

  function onPointerMove(ev: React.PointerEvent) {
    if (!editable) return;
    // Only react when a pointerdown has armed this block. Without this guard
    // a bare hover would trip the drag threshold and shift the block.
    if (!armedRef.current) return;
    const dx = ev.clientX - startState.current.pointerX;
    const dy = ev.clientY - startState.current.pointerY;

    if (mode === "resize") {
      const raw = startState.current.height + dy;
      const snapped = Math.max(rowH * 0.25, snap15(raw / rowH) * rowH);
      setPreviewH(snapped);
      startState.current.moved = true;
      return;
    }

    // Begin move once user crosses a small drag threshold (4px).
    if (mode === "idle" && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      setMode("move");
    }
    if (mode === "move" || (mode === "idle" && (Math.abs(dx) > 4 || Math.abs(dy) > 4))) {
      startState.current.moved = true;
      setPreviewLeftPx(dx);
      setHoverDay(getDayDateAt(ev.clientX, ev.clientY));
    }
  }

  function onPointerUp(ev: React.PointerEvent) {
    try { (ev.target as Element).releasePointerCapture(ev.pointerId); } catch { /* noop */ }
    const wasMode = mode;
    const moved = startState.current.moved;
    setMode("idle");
    armedRef.current = false;
    pointerIdRef.current = null;
    setPreviewLeftPx(null);
    const dropDay = hoverDay;
    setHoverDay(null);

    if (wasMode === "resize" && moved) {
      commitResize(previewH);
      return;
    }
    if (wasMode === "move" && moved) {
      if (dropDay) commitMove(dropDay);
      return;
    }
    // Click (no drag) → open editor.
    if (!moved) onOpen();
  }

  const draggingStyle: React.CSSProperties =
    mode === "move"
      ? { transform: `translateX(${previewLeftPx ?? 0}px)`, opacity: 0.85, zIndex: 20 }
      : {};

  const liveDur = mode === "resize" ? (previewH / rowH) : Number(entry.hrs || 0);
  const liveHr = Math.floor(liveDur);
  const liveMin = Math.round((liveDur - liveHr) * 60);
  const liveLabel = `${liveHr}h${liveMin ? ` ${liveMin}m` : ""}`;

  return (
    <>
      {/* ghost outline of original position while moving */}
      {mode === "move" && (
        <div
          className="absolute left-1 right-1 rounded border border-dashed pointer-events-none"
          style={{ top, height, borderColor, opacity: 0.4 }}
        />
      )}
      <div
        role="button"
        tabIndex={0}
        onContextMenu={(ev) => { ev.preventDefault(); onDuplicate(); }}
        onPointerDown={onBodyDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cn(
          "group absolute left-1 right-1 rounded px-1.5 py-0.5 text-left text-[11px] leading-tight overflow-hidden",
          "border shadow-sm select-none touch-none",
          !isMine && "opacity-70",
          editable && "cursor-grab active:cursor-grabbing",
        )}
        style={{
          top: mode === "resize" ? top : top,
          height: mode === "resize" ? previewH : height,
          background: bg,
          borderColor,
          color: "#fff",
          ...draggingStyle,
        }}
        title={tooltip}
      >
        {editable && (
          <button
            type="button"
            onPointerDown={(ev) => { ev.stopPropagation(); }}
            onClick={(ev) => { ev.stopPropagation(); onDuplicate(); }}
            aria-label="Duplicate entry"
            className="absolute top-0.5 right-0.5 hidden group-hover:flex h-4 w-4 items-center justify-center rounded bg-black/20 hover:bg-black/40"
          >
            <Copy className="h-2.5 w-2.5" />
          </button>
        )}
        <div className="font-medium truncate pr-5">{clientPart}</div>
        {lineCount >= 2 && <div className="opacity-90 truncate">{activity || "—"}</div>}
        {lineCount >= 3 && (
          <div className="opacity-80 truncate">{durLabel} · {entry.billable ? "Billable" : "Non-Bill"}</div>
        )}
        {mode === "resize" && (
          <div className="absolute bottom-0 left-0 right-0 text-center text-[11px] bg-black/30 num">
            {liveLabel}
          </div>
        )}
        {editable && (
          <div
            onPointerDown={onResizeDown}
            className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize bg-black/20 opacity-0 group-hover:opacity-100"
            aria-hidden
          />
        )}
      </div>
    </>
  );
}

function DayFooters({ days, entries, myId }: { days: Date[]; entries: Entry[]; myId: string }) {
  return (
    <div className="grid border-t border-border" style={{ gridTemplateColumns: "60px repeat(7, minmax(0, 1fr))" }}>
      <div />
      {days.map((d) => {
        const dayE = entries.filter((e) => e.date === isoDate(d) && e.user_id === myId);
        const b = dayE.filter((e) => e.billable).reduce((s, e) => s + Number(e.hrs || 0), 0);
        const nb = dayE.filter((e) => !e.billable).reduce((s, e) => s + Number(e.hrs || 0), 0);
        const total = b + nb;
        const pct = total > 0 ? (b / total) * 100 : 0;
        return (
          <div key={d.toISOString()} className="border-l border-border px-2 py-2 text-center">
            <div className="num text-sm text-ch">{total.toFixed(1)}h</div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-creamd">
              <div className="h-full bg-success" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1 text-[11px] text-ch/50">
              <span className="text-success">{b.toFixed(1)}</span>/<span className="text-terra">{nb.toFixed(1)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ───────── day view ─────────
function DayView({
  day, weekDays, setDay, entries, projects, ags, activityTypes, onCellClick, onEntryClick, onDuplicate,
}: {
  day: Date; weekDays: Date[]; setDay: (d: Date) => void;
  entries: Entry[]; projects: Project[]; ags: Ag[]; activityTypes: ActivityType[];
  onCellClick: (hour: number) => void;
  onEntryClick: (e: Entry) => void;
  onDuplicate: (e: Entry) => void;
}) {
  const activeIso = isoDate(day);
  return (
    <div>
      <div className="mb-3 flex gap-1.5">
        {weekDays.map((d) => {
          const active = isoDate(d) === activeIso;
          return (
            <button
              key={d.toISOString()}
              onClick={() => setDay(d)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs transition-colors",
                active ? "bg-ch text-cream" : "bg-white border border-border text-ch/70 hover:bg-creamd",
              )}
            >
              <span className="uppercase tracking-[0.14em] mr-1">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
              <span className="num">{d.getDate()}</span>
            </button>
          );
        })}
      </div>
      <div className="rounded-lg border border-border bg-white">
        <Grid
          days={[day]}
          entries={entries}
          rowH={ROW_H_DAY}
          myId={entries[0]?.user_id || ""}
          projects={projects}
          ags={ags}
          activityTypes={activityTypes}
          onCellClick={(_d, h) => onCellClick(h)}
          onEntryClick={onEntryClick}
          onDuplicate={onDuplicate}
        />
      </div>
    </div>
  );
}

// ───────── team view ─────────
type TeamMode = "overview" | "calendar";

function TeamView({
  days, entries, team, projects, ags, activityTypes, onEntryClick,
}: {
  days: Date[]; entries: Entry[]; team: Member[];
  projects: Project[]; ags: Ag[]; activityTypes: ActivityType[];
  onEntryClick: (e: Entry) => void;
}) {
  const [mode, setMode] = useState<TeamMode>("overview");
  const [memberFilter, setMemberFilter] = useState<string>("all");

  const dayMemberHrs = (d: Date, m: Member) => {
    const iso = isoDate(d);
    return entries
      .filter((e) => e.date === iso && e.user_id === m.id)
      .reduce((s, e) => s + Number(e.hrs || 0), 0);
  };
  const weekMemberTotal = (m: Member, billable?: boolean) =>
    entries
      .filter((e) => e.user_id === m.id && (billable === undefined || e.billable === billable))
      .reduce((s, e) => s + Number(e.hrs || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-md border border-border bg-white p-0.5">
          {(["overview", "calendar"] as TeamMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setMode(v)}
              className={cn(
                "px-3 py-1.5 text-xs uppercase tracking-[0.15em] rounded",
                mode === v ? "bg-ch text-cream" : "text-ch/60 hover:text-ch",
              )}
            >
              {v}
            </button>
          ))}
        </div>
        {mode === "calendar" && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setMemberFilter("all")}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                memberFilter === "all" ? "bg-ch text-cream border-ch" : "bg-white border-border text-ch/70 hover:bg-creamd",
              )}
            >
              All
            </button>
            {team.map((m) => (
              <button
                key={m.id}
                onClick={() => setMemberFilter(m.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs",
                  memberFilter === m.id ? "bg-ch text-cream border-ch" : "bg-white border-border text-ch/70 hover:bg-creamd",
                )}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: m.color || "#B8860B" }} />
                {(m.name || m.email).split(" ")[0]}
              </button>
            ))}
          </div>
        )}
      </div>

      {mode === "overview" ? (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {days.map((d) => {
          const total = team.reduce((s, m) => s + dayMemberHrs(d, m), 0);
          return (
            <div key={d.toISOString()} className="rounded-lg border border-border bg-white p-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-ch/50">
                {d.toLocaleDateString(undefined, { weekday: "short" })}
              </div>
              <div className="font-display text-2xl text-ch">{d.getDate()}</div>
              <div className="mt-2 space-y-1.5">
                {team.map((m) => {
                  const hrs = dayMemberHrs(d, m);
                  const pct = Math.min(100, (hrs / 8) * 100);
                  return (
                    <div key={m.id} title={`${m.name || m.email}: ${hrs.toFixed(1)}h`}>
                      <div className="flex items-center justify-between text-[11px] text-ch/55">
                        <span className="truncate">{(m.name || m.email).split(" ")[0]}</span>
                        <span className="num">{hrs.toFixed(1)}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded bg-creamd">
                        <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 border-t border-border pt-2 text-center">
                <div className="text-[11px] uppercase tracking-[0.15em] text-ch/50">Team</div>
                <div className="num text-lg text-ch">{total.toFixed(1)}h</div>
              </div>
            </div>
          );
        })}
      </div>
      ) : (
        <TeamCalendarGrid
          days={days}
          entries={entries}
          team={team}
          projects={projects}
          ags={ags}
          activityTypes={activityTypes}
          memberFilter={memberFilter}
          onEntryClick={onEntryClick}
        />
      )}

      <div className="rounded-lg border border-border bg-white p-5">
        <h3 className="font-display text-xl text-ch">Week summary</h3>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.18em] text-ch/50">
              <th className="text-left py-2 font-normal">Member</th>
              <th className="text-right py-2 font-normal">Total</th>
              <th className="text-right py-2 font-normal">Billable</th>
              <th className="text-right py-2 font-normal">Non-billable</th>
              <th className="text-right py-2 font-normal">Utilization</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {team.map((m) => {
              const total = weekMemberTotal(m);
              const bill = weekMemberTotal(m, true);
              const nonbill = weekMemberTotal(m, false);
              const target = (Number(m.expected_hrs_per_week) || 0) * (Number(m.billable_pct) || 0) / 100;
              const util = target > 0 ? (bill / target) * 100 : 0;
              return (
                <tr key={m.id}>
                  <td className="py-2.5">
                    <div className="text-ch">{m.name || m.email}</div>
                    <div className="text-[11px] text-ch/50 capitalize">{m.role}</div>
                  </td>
                  <td className="py-2.5 text-right num">{total.toFixed(1)}</td>
                  <td className="py-2.5 text-right num text-success">{bill.toFixed(1)}</td>
                  <td className="py-2.5 text-right num text-terra">{nonbill.toFixed(1)}</td>
                  <td className="py-2.5 text-right num">{util.toFixed(0)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ───────── team calendar grid ─────────
function TeamCalendarGrid({
  days, entries, team, projects, ags, activityTypes, memberFilter, onEntryClick,
}: {
  days: Date[]; entries: Entry[]; team: Member[];
  projects: Project[]; ags: Ag[]; activityTypes: ActivityType[];
  memberFilter: string;
  onEntryClick: (e: Entry) => void;
}) {
  const project = (id: string | null) => projects.find((p) => p.id === id);
  const agName = (id: string | null) => ags.find((a) => a.id === id)?.name;
  const atName = (id: string | null) => activityTypes.find((a) => a.id === id)?.name;
  const memberOf = (id: string) => team.find((m) => m.id === id);

  const visibleMembers = memberFilter === "all" ? team : team.filter((m) => m.id === memberFilter);
  const showDetail = memberFilter !== "all";
  const rowH = ROW_H;

  return (
    <div className="rounded-lg border border-border bg-white">
      <div className="grid" style={{ gridTemplateColumns: "60px repeat(7, minmax(0, 1fr))" }}>
        <div />
        {days.map((d) => (
          <div key={d.toISOString()} className="border-l border-border px-2 py-2 text-center">
            <div className="text-[11px] uppercase tracking-[0.18em] text-ch/50">
              {d.toLocaleDateString(undefined, { weekday: "short" })}
            </div>
            <div className="font-display text-2xl text-ch leading-tight">{d.getDate()}</div>
          </div>
        ))}
      </div>
      <div className="relative grid border-t border-border" style={{ gridTemplateColumns: `60px repeat(7, minmax(0, 1fr))` }}>
        <div>
          {Array.from({ length: HOURS }).map((_, i) => (
            <div key={i} className="border-t border-border text-right pr-2 pt-1 text-[11px] text-ch/40" style={{ height: rowH }}>
              {formatHour(HOUR_START + i)}
            </div>
          ))}
        </div>
        {days.map((d) => {
          const dayEntries = entries.filter(
            (e) => e.date === isoDate(d) && visibleMembers.some((m) => m.id === e.user_id),
          );
          const subCount = visibleMembers.length;
          return (
            <div key={d.toISOString()} className="relative border-l border-border">
              {Array.from({ length: HOURS }).map((_, i) => (
                <div key={i} className="border-t border-border" style={{ height: rowH }} />
              ))}
              {dayEntries.map((e) => {
                const top = (toHourFloat(e.start_time) - HOUR_START) * rowH;
                const h = Math.max(0.25, Number(e.hrs || 0)) * rowH;
                const member = memberOf(e.user_id);
                const idx = visibleMembers.findIndex((m) => m.id === e.user_id);
                const widthPct = 100 / subCount;
                const leftPct = idx * widthPct;
                const proj = project(e.project_id);
                const activity = atName(e.activity_type_id) ?? agName(e.activity_group_id);
                const clientPart = proj?.client_name ? `${proj.client_name} · ${proj.name}` : (proj?.name ?? "Firm");
                const dur = Number(e.hrs || 0).toFixed(2).replace(/\.?0+$/, "") + "h";
                const memberName = (member?.name || member?.email || "").split(" ")[0];
                const tooltip = [memberName, clientPart, activity, `${dur} · ${e.billable ? "Billable" : "Non-Bill"}`].filter(Boolean).join("\n");
                const bg = member?.color || (e.billable ? "#5C8A6E" : "#C4714A");
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={(ev) => { ev.stopPropagation(); onEntryClick(e); }}
                    className="absolute rounded px-1.5 py-0.5 text-left text-[11px] leading-tight overflow-hidden border shadow-sm"
                    style={{
                      top, height: h,
                      left: `calc(${leftPct}% + 2px)`,
                      width: `calc(${widthPct}% - 4px)`,
                      background: bg,
                      borderColor: "rgba(0,0,0,0.15)",
                      color: "#fff",
                    }}
                    title={tooltip}
                  >
                    {showDetail ? (
                      <>
                        <div className="font-medium truncate">{clientPart}</div>
                        {h >= 36 && <div className="opacity-90 truncate">{activity || "—"}</div>}
                        {h >= 56 && <div className="opacity-80 truncate">{dur}</div>}
                      </>
                    ) : (
                      <>
                        <div className="font-medium truncate">{memberName}</div>
                        {h >= 36 && <div className="opacity-90 truncate num">{dur}</div>}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────── stats sidebar ─────────
function SidebarStats({
  weeklyBillable, weeklyNonBillable, weeklyRevenue, weeklyTarget, hoursToTarget, revenueGap, rate, isAdmin,
}: {
  weeklyBillable: number; weeklyNonBillable: number; weeklyRevenue: number;
  weeklyTarget: number; hoursToTarget: number; revenueGap: number; rate: number; isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(updateTargets);
  const [editing, setEditing] = useState(false);
  const [targetHrs, setTargetHrs] = useState(weeklyTarget);
  const [billRate, setBillRate] = useState(rate);
  const mut = useMutation({
    mutationFn: () => saveFn({ data: { target_billable_hrs_per_week: targetHrs, rate_billed: billRate } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      setEditing(false);
      toast.success("Targets updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const targetMet = hoursToTarget === 0 && weeklyTarget > 0;
  return (
    <div>
      <h3 className="font-display text-xl text-ch">This week</h3>
      <dl className="mt-3 space-y-2.5">
        <Row label="Total hours" value={`${(weeklyBillable + weeklyNonBillable).toFixed(1)}`} />
        <Row label="Billable" value={weeklyBillable.toFixed(1)} accent="text-success" />
        <Row label="Non-billable" value={weeklyNonBillable.toFixed(1)} accent="text-terra" />
        <Row label="Revenue earned" value={fmtUsd(weeklyRevenue)} accent="text-ch font-display" />
      </dl>

      <div className="mt-5 rounded-lg border border-border bg-goldp/30 p-4">
        <div className="text-[11px] uppercase tracking-[0.18em] text-gold">Target progress</div>
        {targetMet ? (
          <div className="mt-1 font-display text-2xl text-success">✓ Met</div>
        ) : (
          <>
            <div className="mt-1 font-display text-2xl text-ch num">{hoursToTarget.toFixed(1)} hrs</div>
            <div className="text-xs text-ch/60">to hit your weekly billable target</div>
          </>
        )}
        {revenueGap > 0 && (
          <div className="mt-2 text-xs text-ch/65">
            Revenue gap: <span className="num text-ch">{fmtUsd(revenueGap)}</span>
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-[0.18em] text-ch/50">Targets</div>
          {isAdmin && (
            <button onClick={() => setEditing((v) => !v)} className="text-ch/50 hover:text-gold">
              <Pencil className="h-3 w-3" />
            </button>
          )}
        </div>
        {editing ? (
          <div className="mt-2 space-y-2">
            <div>
              <Label className="text-[11px] text-ch/60">Billable hrs/week</Label>
              <Input type="number" value={targetHrs} onChange={(e) => setTargetHrs(Number(e.target.value) || 0)} className="num h-8" />
            </div>
            <div>
              <Label className="text-[11px] text-ch/60">Billed rate</Label>
              <Input type="number" value={billRate} onChange={(e) => setBillRate(Number(e.target.value) || 0)} className="num h-8" />
            </div>
            <div className="text-[11px] text-ch/55">
              Weekly revenue target: <span className="num text-ch">{fmtUsd(targetHrs * billRate)}</span>
            </div>
            <Button size="sm" className="w-full bg-gold hover:bg-goldl text-white" disabled={mut.isPending} onClick={() => mut.mutate()}>
              Save
            </Button>
          </div>
        ) : (
          <dl className="mt-2 space-y-1.5">
            <Row label="Billable target" value={`${weeklyTarget.toFixed(0)} hrs/wk`} />
            <Row label="Billed rate" value={fmtUsd(rate)} />
            <Row label="Weekly revenue target" value={fmtUsd(weeklyTarget * rate)} />
          </dl>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <dt className="text-ch/60">{label}</dt>
      <dd className={cn("num text-ch", accent)}>{value}</dd>
    </div>
  );
}

function ProjectTaskPicker({
  phases, phaseId, onChange,
}: { phases: Phase[]; phaseId: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(!!phaseId);
  const [q, setQ] = useState("");
  const selected = phases.find((p) => p.id === phaseId);
  const filtered = q
    ? phases.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
    : phases;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button type="button" className="flex w-full items-center justify-between rounded-md border border-border bg-white px-3 py-2 text-left text-xs text-ch/70 hover:bg-creamd">
          <span className="flex items-center gap-2">
            <ChevronDown className={cn("h-3 w-3 transition-transform", !open && "-rotate-90")} />
            Link to project task (optional)
          </span>
          {selected && <span className="rounded bg-goldp/40 px-2 py-0.5 text-[11px] text-ch">Linked: {selected.name}</span>}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 rounded-md border border-border bg-cream/40 p-2">
        {phases.length > 8 && (
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tasks…"
            className="mb-2 h-8 text-xs"
          />
        )}
        <div className="max-h-48 overflow-y-auto space-y-0.5">
          <button type="button" onClick={() => onChange("")} className={cn("block w-full rounded px-2 py-1 text-left text-xs hover:bg-white", !phaseId && "bg-white font-medium")}>— None —</button>
          {filtered.map((p) => {
            const over = p.actual_hrs > p.expected_hrs && p.expected_hrs > 0;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange(p.id)}
                className={cn(
                  "block w-full rounded px-2 py-1 text-left text-xs hover:bg-white",
                  phaseId === p.id && "bg-white font-medium text-gold",
                )}
              >
                {p.name} <span className="text-ch/50">({p.actual_hrs.toFixed(1)}/{p.expected_hrs.toFixed(0)}h){over ? " ⚠" : ""}</span>
              </button>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ───────── entry form ─────────
function EntryForm({
  compact = false, projects, phases, ags, activityTypes, team, isAdmin, meId, initial, onSaved, onDeleted,
}: {
  compact?: boolean;
  projects: Project[]; phases: Phase[]; ags: Ag[]; activityTypes: ActivityType[]; team: Member[];
  isAdmin: boolean; meId: string;
  initial: Partial<Entry>;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const [date, setDate] = useState(initial.date || isoDate(new Date()));
  const [startTime, setStartTime] = useState((initial.start_time || "09:00").slice(0, 5));
  const [endTime, setEndTime] = useState((initial.end_time || "10:00").slice(0, 5));
  const [projectId, setProjectId] = useState<string>(initial.project_id || "");
  const [phaseId, setPhaseId] = useState<string>(initial.project_phase_id || "");
  const [atId, setAtId] = useState<string>(initial.activity_type_id || "");
  const [agId] = useState<string>(initial.activity_group_id || "");
  const [billable, setBillable] = useState(initial.billable ?? true);
  const [description, setDescription] = useState(initial.description || "");
  const [notes, setNotes] = useState(initial.notes || "");
  const [userId, setUserId] = useState(initial.user_id || meId);

  const saveFn = useServerFn(saveTimeEntry);
  const delFn = useServerFn(deleteTimeEntry);

  const projectPhases = phases.filter((p) => p.project_id === projectId);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          id: initial.id,
          date, start_time: startTime, end_time: endTime, billable,
          description: description || null,
          notes: notes || null,
          project_id: projectId || null,
          project_phase_id: phaseId || null,
          activity_group_id: agId || null,
          activity_type_id: atId || null,
          user_id: isAdmin ? userId : undefined,
        },
      }),
    onSuccess: () => {
      onSaved();
      if (compact) {
        // reset partial state for quick log convenience
        setDescription("");
        setNotes("");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: () => delFn({ data: { id: initial.id! } }),
    onSuccess: () => onDeleted?.(),
  });

  return (
    <div className={cn("space-y-3", compact ? "mt-3" : "mt-2")}>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-3">
          <Label className="text-[11px] uppercase tracking-[0.16em] text-ch/60">Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-[0.16em] text-ch/60">Start</Label>
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-9" />
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-[0.16em] text-ch/60">End</Label>
          <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-9" />
        </div>
        <div className="flex items-end justify-end gap-2">
          <div className="flex items-center gap-1.5">
            <Switch checked={billable} onCheckedChange={setBillable} />
            <span className="text-xs text-ch/70">Billable</span>
          </div>
        </div>
      </div>

      <div>
        <Label className="text-[11px] uppercase tracking-[0.16em] text-ch/60">Project</Label>
        <Select
          value={projectId || "_none"}
          onValueChange={(v) => {
            if (v === "_none") { setProjectId(""); setPhaseId(""); return; }
            setProjectId(v); setPhaseId("");
          }}
        >
          <SelectTrigger className="h-9"><SelectValue placeholder="Choose project" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">— Firm (no client project) —</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}{p.client_name ? ` · ${p.client_name}` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-[11px] uppercase tracking-[0.16em] text-ch/60">Activity</Label>
        <Select
          value={atId || "_none"}
          onValueChange={(v) => {
            if (v === "_none") { setAtId(""); return; }
            setAtId(v);
            const picked = activityTypes.find((a) => a.id === v);
            if (picked) setBillable(picked.is_billable);
          }}
        >
          <SelectTrigger className="h-9"><SelectValue placeholder="Choose activity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">— None —</SelectItem>
            {activityTypes.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: a.color }} />
                  {a.name}
                  <span className="text-[11px] text-ch/40">{a.is_billable ? "· billable" : "· non-bill"}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-[11px] uppercase tracking-[0.16em] text-ch/60">Description</Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          placeholder="What did you work on?"
          className="h-9"
        />
      </div>

      {projectId && projectPhases.length > 0 && (
        <ProjectTaskPicker
          phases={projectPhases}
          phaseId={phaseId}
          onChange={setPhaseId}
        />
      )}

      {isAdmin && team.length > 1 && (
        <div>
          <Label className="text-[11px] uppercase tracking-[0.16em] text-ch/60">Team member</Label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {team.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name || m.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {!compact && (
        <div>
          <Label className="text-[11px] uppercase tracking-[0.16em] text-ch/60">Notes</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      )}

      {compact ? (
        <Button data-tour="log-time-entry" onClick={() => save.mutate()} disabled={save.isPending} className="w-full bg-gold text-white hover:bg-goldl">
          <Plus className="h-3.5 w-3.5 mr-1" /> Log time
        </Button>
      ) : (
        <DialogFooter className="mt-3 sm:justify-between">
          {initial.id ? (
            <Button variant="outline" className="text-danger" onClick={() => del.mutate()} disabled={del.isPending}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          ) : <div />}
          <Button data-tour="log-time-entry" onClick={() => save.mutate()} disabled={save.isPending} className="bg-gold text-white hover:bg-goldl">
            {initial.id ? "Save changes" : "Create entry"}
          </Button>
        </DialogFooter>
      )}
    </div>
  );
}