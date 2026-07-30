import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, ChevronLeft, ChevronRight, Lock, Plus, Trash2, Pencil, Copy } from "lucide-react";
import { toast } from "sonner";
import { getTimeLogFraming, getBillableToggleLabel } from "@/lib/time-framing";
import { TimeCalendarEmptyState } from "@/components/time/TimeCalendarEmptyState";
import {
  TimeLogTaskPicker,
  type TimeLogPhase,
  type TimeLogProjectStep,
  type TimeLogWorkflowAttachment,
} from "@/components/time/TimeLogTaskPicker";
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
import { getCalendarData, saveTimeEntry, deleteTimeEntry, updateTargets, listTimeAssignees } from "@/lib/time.functions";
import {
  beginGoogleCalendarConnect,
  disconnectGoogleCalendar,
  getCalendarIntegrationStatus,
  getCalendarOverlay,
  resyncCalendarOverlay,
  linkCalendarEventToEntry,
} from "@/lib/calendar-sync.functions";
import {
  overlayOccursOnDate,
  overlayToLocalDisplay,
  localIsoDate,
  type OverlayEventDisplay,
} from "@/lib/calendar-display";
import { fmtUsd } from "@/lib/finance";
import { useMe } from "@/lib/role";
import { canAssignTimeEntries } from "@/lib/time-entry-permissions";
import { cn } from "@/lib/utils";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";

export const Route = createFileRoute("/_authenticated/time-calendar")({
  head: () => ({ meta: [{ title: "Time Calendar — Sightline" }] }),
  validateSearch: (
    s: Record<string, unknown>,
  ): { calendar?: "connected" | "error"; reason?: string } => ({
    calendar: s.calendar === "connected" ? "connected" : s.calendar === "error" ? "error" : undefined,
    reason: typeof s.reason === "string" ? s.reason : undefined,
  }),
  component: TimeCalendarPage,
});

// ───────── helpers ─────────
const HOUR_START = 0;
const HOUR_END = 24;
const HOURS = HOUR_END - HOUR_START;
const ROW_H = 36;
const ROW_H_DAY = 48;

function startOfWeek(d: Date) {
  const day = d.getDay(); // 0 = Sun
  const monOffset = day === 0 ? -6 : 1 - day;
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() + monOffset);
  return r;
}
function isoDate(d: Date) {
  return localIsoDate(d);
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

/** Map a time entry to pixel top/height within the midnight–midnight calendar grid. */
function calendarEntryLayout(
  entry: { start_time: string | null; end_time: string | null; hrs: number },
  rowH: number,
): { top: number; height: number } {
  const gridPx = HOURS * rowH;
  const minBlockPx = rowH * 0.25;

  let startHrs = entry.start_time ? toHourFloat(entry.start_time) : HOUR_START;
  startHrs = Math.max(HOUR_START, Math.min(startHrs, HOUR_END - minBlockPx / rowH));

  let durHrs = Math.max(0.25, Number(entry.hrs) || 0);
  if (entry.start_time && entry.end_time) {
    const endHrs = toHourFloat(entry.end_time);
    if (endHrs > startHrs) durHrs = endHrs - startHrs;
  }

  const maxDurHrs = HOUR_END - startHrs;
  durHrs = Math.min(durHrs, maxDurHrs);

  let top = (startHrs - HOUR_START) * rowH;
  top = Math.max(0, Math.min(top, gridPx - minBlockPx));

  let height = durHrs * rowH;
  height = Math.min(height, gridPx - top);
  height = Math.max(minBlockPx, height);

  return { top, height };
}
function formatHour(h: number) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const ampm = hh >= 12 ? "PM" : "AM";
  const d = hh % 12 || 12;
  if (hh === 0 && mm === 0) return "12 AM";
  if (hh === 12 && mm === 0) return "12 PM";
  return mm === 0 ? `${d} ${ampm}` : `${d}:${String(mm).padStart(2, "0")} ${ampm}`;
}
function hourToTime(h: number) {
  const capped = Math.min(Math.max(h, 0), 23 + 59 / 60);
  const hh = Math.floor(capped);
  const mm = Math.round((capped - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
function snap15(h: number) {
  return Math.round(h * 4) / 4;
}
function externalEventToModal(ev: OverlayEventDisplay) {
  const googleNotes = [ev.description, ev.location].filter(Boolean).join("\n") || null;
  return {
    date: ev.date,
    start_time: ev.start_time || "09:00",
    end_time: ev.end_time || hourToTime(toHourFloat(ev.start_time || "09:00") + ev.hrs),
    description: ev.title,
    notes: googleNotes,
    billable: false,
    _calendarEventId: ev.id,
    _fromGoogleCalendar: true,
    _googleTitle: ev.title,
    _googleNotes: googleNotes,
  };
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
  project_step_id?: string | null;
  activity_group_id: string | null;
  activity_type_id: string | null;
  user_id: string;
  firm_member_id?: string | null;
};
type Project = { id: string; name: string; client_name: string | null; scoped_rate: number | null };
type Phase = TimeLogPhase;
type Ag = { id: string; name: string; color: string };
type ActivityType = { id: string; name: string; is_billable: boolean; color: string; sort_order: number | null };
type Member = {
  id: string; name: string | null; email: string; role: string;
  billable_rate: number | null; expected_hrs_per_week: number | null; billable_pct: number | null;
  color?: string | null;
  assigneeKey?: string;
  profileId?: string | null;
  firmMemberId?: string | null;
};

type View = "week" | "day" | "team";

// ───────── page ─────────
function TimeCalendarPage() {
  const { data: ctx, realIsSuper, realProfile } = useMe();
  const profile = realProfile ?? ctx?.profile ?? null;
  const myUserId = (profile?.id as string) || "";
  return <Calendar myUserId={myUserId} meProfile={profile} realIsSuper={realIsSuper} />;
}

// ───────── calendar shell ─────────
function Calendar({
  myUserId,
  meProfile,
  realIsSuper,
}: {
  myUserId: string;
  meProfile: { role?: string | null; is_super_admin?: boolean | null } | null;
  realIsSuper: boolean;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { calendar: calendarParam, reason: calendarReason } = Route.useSearch();
  const [view, setView] = useState<View>("week");
  const [weekDate, setWeekDate] = useState(() => startOfWeek(new Date()));
  const [activeDay, setActiveDay] = useState(() => new Date());
  const [modal, setModal] = useState<null | (Partial<Entry> & {
    _duplicate?: boolean;
    _calendarEventId?: string;
    _fromGoogleCalendar?: boolean;
    _googleTitle?: string;
    _googleNotes?: string | null;
  })>(null);

  const weekStart = isoDate(weekDate);
  const fetchData = useServerFn(getCalendarData);
  const listAssigneesFn = useServerFn(listTimeAssignees);
  const fetchOverlay = useServerFn(getCalendarOverlay);
  const fetchIntegration = useServerFn(getCalendarIntegrationStatus);
  const { data, isLoading } = useQuery({
    queryKey: ["calendar", weekStart],
    queryFn: () => fetchData({ data: { weekStart } }),
  });
  const { data: overlayData } = useQuery({
    queryKey: ["calendar-overlay", weekStart],
    queryFn: () => fetchOverlay({ data: { weekStart } }),
    staleTime: 3 * 60_000,
  });
  const { data: integration } = useQuery({
    queryKey: ["calendar-integration"],
    queryFn: () => fetchIntegration(),
  });

  useEffect(() => {
    if (calendarParam === "connected") {
      toast.success("Google Calendar connected");
      qc.invalidateQueries({ queryKey: ["calendar-overlay"] });
      qc.invalidateQueries({ queryKey: ["calendar-integration"] });
      navigate({ to: "/time-calendar", search: {}, replace: true });
    } else if (calendarParam === "error") {
      toast.error(calendarReason || "Could not connect Google Calendar");
      navigate({ to: "/time-calendar", search: {}, replace: true });
    }
  }, [calendarParam, calendarReason, navigate, qc]);

  const entries: Entry[] = (data?.entries ?? []) as Entry[];
  const externalEventsLocal = useMemo(
    () => (overlayData?.events ?? []).map(overlayToLocalDisplay),
    [overlayData?.events],
  );
  const projects: Project[] = (data?.projects ?? []) as Project[];
  const phases: Phase[] = (data?.phases ?? []) as Phase[];
  const workflowAttachments = (data?.workflowAttachments ?? []) as TimeLogWorkflowAttachment[];
  const projectSteps = (data?.projectSteps ?? []) as TimeLogProjectStep[];
  const ags: Ag[] = (data?.activityGroups ?? []) as Ag[];
  const activityTypes: ActivityType[] = (data?.activityTypes ?? []) as ActivityType[];
  const team: Member[] = (data?.team ?? []) as Member[];
  const config = data?.config ?? null;
  const me = data?.profile ?? null;
  const isAdmin =
    canAssignTimeEntries(meProfile, realIsSuper) ||
    canAssignTimeEntries(me as typeof meProfile, false) ||
    data?.canAssignTimeEntries === true;
  const effectiveFirmId =
    (me?.impersonated_firm_id as string | null | undefined) ??
    (me?.firm_id as string | null | undefined) ??
    undefined;
  const { data: assigneeData, isError: assigneesError } = useQuery({
    queryKey: ["time-assignees", effectiveFirmId],
    queryFn: () => listAssigneesFn(),
    enabled: isAdmin && !!effectiveFirmId,
    staleTime: 60_000,
    retry: 1,
  });
  const assigneesForForm: Member[] = useMemo(() => {
    const fromApi = assigneeData?.assignees ?? [];
    if (fromApi.length) {
      return fromApi.map((a) => ({
        id: a.id,
        name: a.name,
        email: a.email ?? "",
        role: "team",
        billable_rate: null,
        expected_hrs_per_week: null,
        billable_pct: null,
        assigneeKey: a.key,
        profileId: a.profileId ?? null,
        firmMemberId: a.firmMemberId ?? null,
      }));
    }
    return team;
  }, [assigneeData?.assignees, team]);
  const entryMeId = myUserId || (me?.id as string) || "";
  const pricingStructure = (config as { pricing_structure?: string | null } | null)?.pricing_structure ?? null;
  const framing = getTimeLogFraming(pricingStructure);
  const billableToggleLabel = getBillableToggleLabel(pricingStructure);

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
            <h1 className="mt-1 font-display text-4xl tracking-tight text-ch">{framing.pageTitle}</h1>
            <p className="mt-1 font-sans text-sm text-muted-foreground">{framing.pageSubtitle}</p>
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

        <CalendarConnectBanner integration={integration} weekStart={weekStart} isAdmin={isAdmin} />

        <div className="mt-5">
          {isLoading ? (
            <p className="text-ch/55">Loading…</p>
          ) : entries.length === 0 ? (
            <TimeCalendarEmptyState
              framing={framing}
              onLogFirst={() =>
                setModal({
                  date: isoDate(new Date()),
                  start_time: "09:00",
                  end_time: "10:00",
                  billable: true,
                })
              }
            />
          ) : view === "week" ? (
            <WeekView
              days={days} entries={entries} externalEvents={externalEventsLocal} myId={me?.id || ""} projects={projects} ags={ags} activityTypes={activityTypes}
              onCellClick={(date, hour) => setModal({
                date: isoDate(date), start_time: hourToTime(hour), end_time: hourToTime(hour + 1),
                billable: true,
              })}
              onEntryClick={(e) => setModal(e)}
              onExternalClick={(ev) => setModal(externalEventToModal(ev))}
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
              day={activeDay} weekDays={days} setDay={setActiveDay} myId={me?.id || ""}
              entries={entries.filter((e) => e.date === isoDate(activeDay))}
              externalEvents={externalEventsLocal.filter((e) => overlayOccursOnDate(e, isoDate(activeDay)))}
              projects={projects} ags={ags} activityTypes={activityTypes}
              onCellClick={(hour) => setModal({
                date: isoDate(activeDay), start_time: hourToTime(hour), end_time: hourToTime(hour + 1),
                billable: true,
              })}
              onEntryClick={(e) => setModal(e)}
              onExternalClick={(ev) => setModal(externalEventToModal(ev))}
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
            workflowAttachments={workflowAttachments}
            projectSteps={projectSteps}
            ags={ags}
            activityTypes={activityTypes}
            team={team}
            assignees={assigneesForForm}
            isAdmin={isAdmin}
            meId={entryMeId}
            assigneesLoading={isAdmin && !assigneeData && !assigneesError}
            entryFormSubtitle={framing.entryFormSubtitle}
            billableToggleLabel={billableToggleLabel}
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
              {modal?.id ? "Edit time entry" : framing.entryFormHeading}
            </DialogTitle>
            {!modal?.id && (
              <p className="font-sans text-xs italic text-muted-lt">{framing.entryFormSubtitle}</p>
            )}
          </DialogHeader>
          {modal && (
            <EntryForm
              projects={projects}
              phases={phases}
              workflowAttachments={workflowAttachments}
              projectSteps={projectSteps}
              ags={ags}
              activityTypes={activityTypes}
              team={team}
              assignees={assigneesForForm}
              isAdmin={isAdmin}
              meId={entryMeId}
              assigneesLoading={isAdmin && !assigneeData && !assigneesError}
              entryFormSubtitle={modal.id ? undefined : framing.entryFormSubtitle}
              billableToggleLabel={billableToggleLabel}
              initial={modal._duplicate ? { ...modal, id: undefined } : modal}
              calendarEventId={modal._calendarEventId}
              fromGoogleCalendar={modal._fromGoogleCalendar}
              googleTitle={modal._googleTitle}
              googleNotes={modal._googleNotes}
              onSaved={() => {
                setModal(null);
                refresh();
                qc.invalidateQueries({ queryKey: ["calendar-overlay"] });
                toast.success(modal._duplicate ? "New entry logged" : modal.id ? "Updated" : "Logged");
              }}
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
  days, entries, externalEvents, myId, projects, ags, activityTypes, onCellClick, onEntryClick, onExternalClick, onDuplicate,
}: {
  days: Date[]; entries: Entry[]; externalEvents: OverlayEventDisplay[]; myId: string;
  projects: Project[]; ags: Ag[]; activityTypes: ActivityType[];
  onCellClick: (date: Date, hour: number) => void;
  onEntryClick: (e: Entry) => void;
  onExternalClick: (e: OverlayEventDisplay) => void;
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
      <div className="max-h-[min(780px,72vh)] overflow-y-auto">
        <Grid
          days={days}
          entries={entries}
          externalEvents={externalEvents}
          rowH={ROW_H}
          myId={myId}
          projects={projects}
          ags={ags}
          activityTypes={activityTypes}
          onCellClick={onCellClick}
          onEntryClick={onEntryClick}
          onExternalClick={onExternalClick}
          onDuplicate={onDuplicate}
        />
      </div>
      <DayFooters days={days} entries={entries} myId={myId} />
    </div>
  );
}

function CalendarConnectBanner({
  integration,
  weekStart,
  isAdmin,
}: {
  integration?: {
    configured: boolean;
    connected: boolean;
    accountEmail: string | null;
    lastSyncedAt: string | null;
  };
  weekStart: string;
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const connectFn = useServerFn(beginGoogleCalendarConnect);
  const disconnectFn = useServerFn(disconnectGoogleCalendar);
  const resyncFn = useServerFn(resyncCalendarOverlay);
  const connectMut = useMutation({
    mutationFn: () => connectFn(),
    onSuccess: ({ authUrl }) => {
      window.location.href = authUrl;
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const disconnectMut = useMutation({
    mutationFn: () => disconnectFn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-integration"] });
      qc.invalidateQueries({ queryKey: ["calendar-overlay"] });
      toast.success("Google Calendar disconnected");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const resyncMut = useMutation({
    mutationFn: () => resyncFn({ data: { weekStart } }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["calendar-overlay"] });
      qc.invalidateQueries({ queryKey: ["calendar-integration"] });
      toast.success(`Calendar synced (${result.count} events updated)`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (integration?.connected) {
    const synced = integration.lastSyncedAt
      ? new Date(integration.lastSyncedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
      : "Not yet synced";
    return (
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-ch/20 bg-cream/40 px-4 py-3">
        <div className="flex items-start gap-2 text-sm text-ch/75">
          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-ch/50" />
          <div>
            <div className="font-medium text-ch">Google Calendar overlay</div>
            <div className="text-xs text-ch/55">
              {integration.accountEmail ? `${integration.accountEmail} · ` : ""}
              Last synced {synced}. Shows this week when you navigate; Sync now pulls ±2 past / 12 future weeks.
              Dashed blocks are read-only — click to log time.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={resyncMut.isPending}
            onClick={() => resyncMut.mutate()}
          >
            {resyncMut.isPending ? "Syncing…" : "Sync now"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={disconnectMut.isPending}
            onClick={() => disconnectMut.mutate()}
          >
            Disconnect
          </Button>
        </div>
      </div>
    );
  }

  const configured = integration?.configured ?? false;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-gold/40 bg-goldp/20 px-4 py-3">
      <div className="flex items-start gap-2 text-sm text-ch/75">
        <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
        <div>
          <div className="font-medium text-ch">Connect Google Calendar</div>
          <div className="text-xs text-ch/55">
            {configured
              ? "Show your meetings as a read-only overlay. Click an event to prefill a time entry — nothing syncs automatically."
              : isAdmin
                ? "Server setup needed: add GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET to Cloudflare Worker secrets (see deploy/google-calendar-setup.md), then refresh."
                : "Calendar connect is not enabled on this server yet. Ask your firm admin to finish setup."}
          </div>
        </div>
      </div>
      <Button
        size="sm"
        className="bg-gold text-white hover:bg-goldl"
        disabled={!configured || connectMut.isPending}
        onClick={() => connectMut.mutate()}
      >
        Connect Google
      </Button>
    </div>
  );
}

function Grid({
  days, entries, externalEvents, rowH, myId, projects, ags, activityTypes, onCellClick, onEntryClick, onExternalClick, onDuplicate,
}: {
  days: Date[]; entries: Entry[]; externalEvents: OverlayEventDisplay[]; rowH: number; myId: string;
  projects: Project[]; ags: Ag[]; activityTypes: ActivityType[];
  onCellClick: (date: Date, hour: number) => void;
  onEntryClick: (e: Entry) => void;
  onExternalClick: (e: OverlayEventDisplay) => void;
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
  const entryBlockLabel = (e: Entry) => {
    const proj = project(e.project_id);
    const activity = atName(e.activity_type_id) ?? agName(e.activity_group_id);
    const clientPart = proj?.client_name ? `${proj.client_name} · ${proj.name}` : (proj?.name ?? "Firm");
    const googleTitle = e.description?.trim();
    const headline = googleTitle || clientPart;
    const subline = googleTitle
      ? [activity, clientPart !== "Firm" ? clientPart : null].filter(Boolean).join(" · ") || activity || "—"
      : activity || "—";
    return { headline, subline, clientPart, activity };
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
        const dayIso = isoDate(d);
        const dayEntries = entries.filter((e) => e.date === dayIso);
        const dayExternal = externalEvents.filter((e) => overlayOccursOnDate(e, dayIso));
        const allDayExternal = dayExternal.filter((e) => e.all_day);
        const timedExternal = dayExternal.filter((e) => !e.all_day);
        const iso = dayIso;
        return (
          <div
            key={d.toISOString()}
            className="relative border-l border-border"
          >
            {allDayExternal.length > 0 && (
              <div className="space-y-0.5 border-b border-border bg-[#E8EEF5]/50 px-1 py-1">
                {allDayExternal.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onExternalClick(ev); }}
                    className="block w-full truncate rounded border border-dashed px-1.5 py-0.5 text-left text-[10px] text-[#2F4563]"
                    style={{ borderColor: "#7A93B8" }}
                    title={`${ev.title}\nAll day · Google Calendar`}
                  >
                    {ev.title}
                  </button>
                ))}
              </div>
            )}
            <div
              className="relative overflow-hidden"
              style={{ height: HOURS * rowH }}
              ref={(el) => {
                if (el) dayRefs.current.set(iso, el);
                else dayRefs.current.delete(iso);
              }}
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
            {timedExternal.map((ev) => {
              const layoutEntry = {
                start_time: ev.start_time,
                end_time: ev.end_time,
                hrs: ev.hrs,
              };
              const { top, height: h } = calendarEntryLayout(layoutEntry, rowH);
              const timeLabel = ev.start_time && ev.end_time ? `${ev.start_time}–${ev.end_time}` : `${ev.hrs}h`;
              const tooltip = [ev.title, ev.location, timeLabel, "Google Calendar · click to log"].filter(Boolean).join("\n");
              return (
                <ExternalEventBlock
                  key={ev.id}
                  event={ev}
                  top={top}
                  height={h}
                  tooltip={tooltip}
                  onClick={() => onExternalClick(ev)}
                />
              );
            })}
            {dayEntries.map((e) => {
              const { top, height: h } = calendarEntryLayout(e, rowH);
              const isMine = e.user_id === myId;
              const { headline, subline, clientPart, activity } = entryBlockLabel(e);
              const dur = Number(e.hrs || 0).toFixed(2).replace(/\.?0+$/, "") + "h";
              const tooltip = [headline, subline, clientPart, activity, `${dur} · ${e.billable ? "Billable" : "Non-Bill"}`, e.notes].filter(Boolean).join("\n");
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
                  headline={headline}
                  subline={subline}
                  durLabel={dur}
                  getDayDateAt={getDayDateAt}
                  onOpen={() => onEntryClick(e)}
                  onDuplicate={() => onDuplicate(e)}
                />
              );
            })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ───────── interactive entry block (resize / move / duplicate / undo) ─────────
function EntryBlock({
  entry, top, height, rowH, isMine, bg, borderColor, tooltip, lineCount,
  headline, subline, durLabel, getDayDateAt, onOpen, onDuplicate,
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
  headline: string;
  subline: string;
  durLabel: string;
  getDayDateAt: (x: number, y: number) => string | null;
  onOpen: () => void;
  onDuplicate: () => void;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveTimeEntry);
  const [mode, setModeState] = useState<"idle" | "resize" | "move">("idle");
  const modeRef = useRef<"idle" | "resize" | "move">("idle");
  const setMode = (next: "idle" | "resize" | "move") => {
    modeRef.current = next;
    setModeState(next);
  };
  const [previewH, setPreviewH] = useState(height);
  const [previewLeftPx, setPreviewLeftPx] = useState<number | null>(null);
  const [hoverDay, setHoverDay] = useState<string | null>(null);
  const startState = useRef({ pointerY: 0, pointerX: 0, top, height, moved: false });
  const armedRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const captureRef = useRef<Element | null>(null);
  const previewHRef = useRef(height);
  const hoverDayRef = useRef<string | null>(null);

  const editable = isMine;

  function releaseCapture() {
    if (captureRef.current != null && pointerIdRef.current != null) {
      try {
        captureRef.current.releasePointerCapture(pointerIdRef.current);
      } catch { /* noop */ }
    }
    captureRef.current = null;
  }

  function armCapture(el: Element, pointerId: number) {
    el.setPointerCapture(pointerId);
    captureRef.current = el;
    pointerIdRef.current = pointerId;
  }

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
    const startHrs = entry.start_time
      ? toHourFloat(entry.start_time)
      : HOUR_START + top / rowH;
    const newEnd = hourToTime(Math.min(startHrs + durHrs, 24));
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
    armCapture(ev.target as Element, ev.pointerId);
    setMode("resize");
    armedRef.current = true;
    startState.current = { pointerY: ev.clientY, pointerX: ev.clientX, top, height, moved: false };
    previewHRef.current = height;
    setPreviewH(height);
  }

  function onBodyDown(ev: React.PointerEvent) {
    if (!editable) return;
    ev.preventDefault();
    armCapture(ev.currentTarget, ev.pointerId);
    armedRef.current = true;
    startState.current = { pointerY: ev.clientY, pointerX: ev.clientX, top, height, moved: false };
    setMode("idle");
  }

  function onPointerMove(ev: React.PointerEvent) {
    if (!editable) return;
    if (!armedRef.current) return;
    const dx = ev.clientX - startState.current.pointerX;
    const dy = ev.clientY - startState.current.pointerY;
    const currentMode = modeRef.current;

    if (currentMode === "resize") {
      const raw = startState.current.height + dy;
      const snapped = Math.max(rowH * 0.25, snap15(raw / rowH) * rowH);
      previewHRef.current = snapped;
      setPreviewH(snapped);
      startState.current.moved = true;
      return;
    }

    if (currentMode === "idle" && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      setMode("move");
    }
    if (modeRef.current === "move") {
      startState.current.moved = true;
      setPreviewLeftPx(dx);
      const day = getDayDateAt(ev.clientX, ev.clientY);
      hoverDayRef.current = day;
      setHoverDay(day);
    }
  }

  function onPointerUp(ev: React.PointerEvent) {
    releaseCapture();
    const wasMode = modeRef.current;
    const moved = startState.current.moved;
    setMode("idle");
    armedRef.current = false;
    pointerIdRef.current = null;
    setPreviewLeftPx(null);
    const dropDay = hoverDayRef.current;
    hoverDayRef.current = null;
    setHoverDay(null);

    if (wasMode === "resize" && moved) {
      commitResize(previewHRef.current);
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
          "group absolute left-1 right-1 z-10 rounded px-1.5 py-0.5 text-left text-[11px] leading-tight overflow-hidden",
          "border shadow-sm select-none touch-none",
          !isMine && "opacity-70",
          editable && "cursor-grab active:cursor-grabbing",
          mode === "move" && "z-30",
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
        <div className="font-medium truncate pr-5">{headline}</div>
        {lineCount >= 2 && <div className="opacity-90 truncate">{subline}</div>}
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

function ExternalEventBlock({
  event, top, height, tooltip, onClick,
}: {
  event: OverlayEventDisplay;
  top: number;
  height: number;
  tooltip: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(ev) => { ev.stopPropagation(); onClick(); }}
      className="absolute left-1 right-1 z-[1] rounded border border-dashed px-1.5 py-0.5 text-left text-[11px] leading-tight overflow-hidden bg-[#E8EEF5]/90 hover:bg-[#DCE6F2] transition-colors"
      style={{
        top,
        height: Math.max(height, 18),
        borderColor: "#7A93B8",
        color: "#2F4563",
      }}
      title={tooltip}
    >
      <div className="font-medium truncate">{event.title}</div>
      {height >= 36 && event.start_time && (
        <div className="opacity-80 truncate text-[10px]">{event.start_time}–{event.end_time}</div>
      )}
    </button>
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
  day, weekDays, setDay, myId, entries, externalEvents, projects, ags, activityTypes, onCellClick, onEntryClick, onExternalClick, onDuplicate,
}: {
  day: Date; weekDays: Date[]; setDay: (d: Date) => void; myId: string;
  entries: Entry[]; externalEvents: OverlayEventDisplay[];
  projects: Project[]; ags: Ag[]; activityTypes: ActivityType[];
  onCellClick: (hour: number) => void;
  onEntryClick: (e: Entry) => void;
  onExternalClick: (e: OverlayEventDisplay) => void;
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
        <div className="max-h-[min(780px,72vh)] overflow-y-auto">
        <Grid
          days={[day]}
          entries={entries}
          externalEvents={externalEvents}
          rowH={ROW_H_DAY}
          myId={myId}
          projects={projects}
          ags={ags}
          activityTypes={activityTypes}
          onCellClick={(_d, h) => onCellClick(h)}
          onEntryClick={onEntryClick}
          onExternalClick={onExternalClick}
          onDuplicate={onDuplicate}
        />
        </div>
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
      .filter((e) => {
        if (e.date !== iso) return false;
        if (m.firmMemberId && e.firm_member_id === m.firmMemberId) return true;
        if (m.profileId && e.user_id === m.profileId) return true;
        return e.user_id === m.id || e.firm_member_id === m.id;
      })
      .reduce((s, e) => s + Number(e.hrs || 0), 0);
  };
  const weekMemberTotal = (m: Member, billable?: boolean) =>
    entries
      .filter((e) => {
        if (billable !== undefined && e.billable !== billable) return false;
        if (m.firmMemberId && e.firm_member_id === m.firmMemberId) return true;
        if (m.profileId && e.user_id === m.profileId) return true;
        return e.user_id === m.id || e.firm_member_id === m.id;
      })
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
            <div key={d.toISOString()} className="relative border-l border-border overflow-hidden">
              {Array.from({ length: HOURS }).map((_, i) => (
                <div key={i} className="border-t border-border" style={{ height: rowH }} />
              ))}
              {dayEntries.map((e) => {
                const { top, height: h } = calendarEntryLayout(e, rowH);
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

function EntryForm({
  compact = false, projects, phases, workflowAttachments, projectSteps, ags, activityTypes, team, assignees, isAdmin, meId, initial,
  entryFormSubtitle, billableToggleLabel = "Billable", assigneesLoading = false,
  calendarEventId, fromGoogleCalendar, googleTitle, googleNotes, onSaved, onDeleted,
}: {
  compact?: boolean;
  projects: Project[]; phases: Phase[];
  workflowAttachments: TimeLogWorkflowAttachment[];
  projectSteps: TimeLogProjectStep[];
  ags: Ag[]; activityTypes: ActivityType[]; team: Member[]; team: Member[];
  assignees?: Member[];
  isAdmin: boolean; meId: string;
  assigneesLoading?: boolean;
  initial: Partial<Entry>;
  entryFormSubtitle?: string;
  billableToggleLabel?: string;
  calendarEventId?: string;
  fromGoogleCalendar?: boolean;
  googleTitle?: string;
  googleNotes?: string | null;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const [date, setDate] = useState(initial.date || isoDate(new Date()));
  const [startTime, setStartTime] = useState((initial.start_time || "09:00").slice(0, 5));
  const [endTime, setEndTime] = useState((initial.end_time || "10:00").slice(0, 5));
  const [projectId, setProjectId] = useState<string>(initial.project_id || "");
  const [phaseId, setPhaseId] = useState<string>(initial.project_phase_id || "");
  const [stepId, setStepId] = useState<string>(initial.project_step_id || "");
  const [atId, setAtId] = useState<string>(initial.activity_type_id || "");
  const [agId] = useState<string>(initial.activity_group_id || "");
  const [billable, setBillable] = useState(initial.billable ?? true);
  const [description, setDescription] = useState(initial.description || "");
  const [notes, setNotes] = useState(initial.notes || "");
  const initialAssigneeKey = useMemo(() => {
    if (initial.firm_member_id) return `m:${initial.firm_member_id}`;
    if (initial.user_id) return `p:${initial.user_id}`;
    return meId ? `p:${meId}` : "";
  }, [initial.firm_member_id, initial.user_id, meId]);

  const [assigneeKey, setAssigneeKey] = useState(initialAssigneeKey);

  const assigneeOptions = useMemo(() => {
    const source = assignees?.length ? assignees : team.length ? team : [];
    const raw =
      source.length > 0
        ? source
        : meId
          ? [{ id: meId, assigneeKey: `p:${meId}`, name: "You", email: "" } as Member]
          : [];
    return raw.filter((m) => {
      const key = m.assigneeKey ?? (m.id ? `p:${m.id}` : "");
      return key.length > 2;
    });
  }, [assignees, team, meId]);

  useEffect(() => {
    if (initial.firm_member_id || initial.user_id) return;
    if (!assigneeOptions.length) return;
    const keys = assigneeOptions.map((m) => m.assigneeKey ?? `p:${m.id}`);
    if (!keys.includes(assigneeKey)) setAssigneeKey(keys[0] ?? initialAssigneeKey);
    else if (!assigneeKey && meId) setAssigneeKey(`p:${meId}`);
  }, [assigneeOptions, assigneeKey, initial.firm_member_id, initial.user_id, initialAssigneeKey, meId]);

  const saveFn = useServerFn(saveTimeEntry);
  const delFn = useServerFn(deleteTimeEntry);
  const linkFn = useServerFn(linkCalendarEventToEntry);

  const projectPhases = phases.filter((p) => p.project_id === projectId);
  const projectWorkflowAttachments = workflowAttachments.filter((a) => a.project_id === projectId);
  const stepsForProject = projectSteps.filter((s) => s.project_id === projectId);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          id: initial.id,
          date, start_time: startTime, end_time: endTime, billable,
          description: (fromGoogleCalendar ? (googleTitle || description) : description) || null,
          notes: (fromGoogleCalendar ? (googleNotes ?? notes) : notes) || null,
          project_id: projectId || null,
          project_phase_id: phaseId || null,
          project_step_id: stepId || null,
          activity_group_id: agId || null,
          activity_type_id: atId || null,
          assignee_key: isAdmin && assigneeKey ? assigneeKey : undefined,
        },
      }),
    onSuccess: async (result) => {
      if (calendarEventId && result?.id && !initial.id) {
        try {
          await linkFn({ data: { calendarEventId, timeEntryId: result.id } });
        } catch (e) {
          console.warn("[EntryForm] calendar link failed", e);
        }
      }
      onSaved();
      if (compact && !fromGoogleCalendar) {
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
      {compact && entryFormSubtitle ? (
        <p className="font-sans text-xs italic text-muted-lt">{entryFormSubtitle}</p>
      ) : null}
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
            <span className="text-xs text-ch/70">{billableToggleLabel}</span>
          </div>
        </div>
      </div>

      {isAdmin && (
        <div>
          <Label className="text-[11px] uppercase tracking-[0.16em] text-ch/60">Team member</Label>
          {assigneeOptions.length > 0 ? (
            <Select
              value={
                assigneeOptions.some((m) => (m.assigneeKey ?? `p:${m.id}`) === assigneeKey)
                  ? assigneeKey
                  : (assigneeOptions[0].assigneeKey ?? `p:${assigneeOptions[0].id}`)
              }
              onValueChange={setAssigneeKey}
            >
              <SelectTrigger className="h-9"><SelectValue placeholder="Who spent this time?" /></SelectTrigger>
              <SelectContent position="popper" className="z-[200]">
                {assigneeOptions.map((m) => {
                  const key = m.assigneeKey ?? `p:${m.id}`;
                  return (
                    <SelectItem key={key} value={key}>{m.name || m.email || "Team member"}</SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          ) : assigneesLoading ? (
            <p className="mt-1 text-xs text-ch/55">Loading team…</p>
          ) : (
            <p className="mt-1 text-xs text-ch/55">
              No Sightline logins on this firm yet. Active users appear here after they accept a team invite.
            </p>
          )}
        </div>
      )}

      <div>
        <Label className="text-[11px] uppercase tracking-[0.16em] text-ch/60">Project</Label>
        <Select
          value={projectId || "_none"}
          onValueChange={(v) => {
            if (v === "_none") { setProjectId(""); setPhaseId(""); setStepId(""); return; }
            setProjectId(v); setPhaseId(""); setStepId("");
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
        {fromGoogleCalendar ? (
          <div className="rounded-md border border-dashed border-[#7A93B8] bg-[#E8EEF5]/40 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-[0.16em] text-ch/50">From Google Calendar</p>
            <p className="mt-1 text-sm font-medium text-ch">{googleTitle || description}</p>
            {(googleNotes || notes) && (
              <p className="mt-1 text-xs text-ch/65 whitespace-pre-wrap">{googleNotes || notes}</p>
            )}
            <p className="mt-2 text-[11px] text-ch/50">
              Pick project and activity below — the calendar title and notes are saved unchanged.
            </p>
          </div>
        ) : (
          <>
            <Label className="text-[11px] uppercase tracking-[0.16em] text-ch/60">Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              placeholder="What did you work on?"
              className="h-9"
            />
          </>
        )}
      </div>

      {projectId && projectPhases.length > 0 && (
        <TimeLogTaskPicker
          phases={projectPhases}
          workflowAttachments={projectWorkflowAttachments}
          projectSteps={stepsForProject}
          phaseId={phaseId}
          stepId={stepId}
          onChange={({ phaseId: p, stepId: s }) => {
            setPhaseId(p);
            setStepId(s);
          }}
        />
      )}

      {!compact && !fromGoogleCalendar && (
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