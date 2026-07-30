import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveLifeEvent, saveScheduleBlock } from "@/lib/capacity.functions";
import type { FirmLifeEvent } from "@/lib/finance";
import {
  anchorSeasonRange,
  serializeWeeklyMeta,
  type WeeklyCommitmentMeta,
} from "@/lib/schedule-blocks";
import { cn } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";

export type CommitmentScheduleKind = "season" | "weekly" | "one_time";

type ExceptionDraft = {
  week_start: string;
  capacity_pct: number;
  label: string;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const SCHEDULE_OPTIONS: Array<{
  kind: CommitmentScheduleKind;
  title: string;
  sub: string;
}> = [
  {
    kind: "season",
    title: "Season or period",
    sub: "Part of the year — school year, busy season, summer slowdown",
  },
  {
    kind: "weekly",
    title: "Weekly",
    sub: "Same days each week — evening class, part-time hours, standing meeting",
  },
  {
    kind: "one_time",
    title: "One-time",
    sub: "A specific date or short stretch — conference, networking event, trip",
  },
];

type CommitmentImpact = "workload" | "scheduling";

const IMPACT_OPTIONS: Array<{ value: CommitmentImpact; title: string; sub: string }> = [
  {
    value: "workload",
    title: "Reduces workload capacity",
    sub: "This commitment displaces design hours — part-time work, a busy season when you take fewer projects.",
  },
  {
    value: "scheduling",
    title: "Scheduling awareness only",
    sub: "Shows on your calendar but does not change hours-available or revenue targets — evening practices, avoid late site visits.",
  },
];

function inferScheduleKind(event: FirmLifeEvent): CommitmentScheduleKind {
  const bt = event.block_type ?? "life_event";
  if (bt === "recurring_weekly") return "weekly";
  if (bt === "recurring_season") return "season";
  return "one_time";
}

export function CommitmentForm({
  firmId,
  editing,
  planningYear,
  defaultScheduleKind,
  onSaved,
  onBack,
}: {
  firmId: string;
  editing: FirmLifeEvent | null;
  planningYear: number;
  defaultScheduleKind?: CommitmentScheduleKind;
  onSaved: () => void;
  onBack?: () => void;
}) {
  const [scheduleKind, setScheduleKind] = useState<CommitmentScheduleKind>(
    defaultScheduleKind ?? "season",
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [startMonth, setStartMonth] = useState(9);
  const [startDay, setStartDay] = useState(1);
  const [endMonth, setEndMonth] = useState(5);
  const [endDay, setEndDay] = useState(31);
  const [recurs, setRecurs] = useState(true);
  const [seasonCapacityPct, setSeasonCapacityPct] = useState(75);
  const [exceptions, setExceptions] = useState<ExceptionDraft[]>([]);

  const [days, setDays] = useState<string[]>(["tue", "thu"]);
  const [hoursPerDay, setHoursPerDay] = useState("2");
  const [allYear, setAllYear] = useState(true);
  const [monthStart, setMonthStart] = useState(1);
  const [monthEnd, setMonthEnd] = useState(12);

  const [oneStartDate, setOneStartDate] = useState("");
  const [oneEndDate, setOneEndDate] = useState("");
  const [oneCapacityPct, setOneCapacityPct] = useState(75);
  const [impact, setImpact] = useState<CommitmentImpact>("workload");

  const qc = useQueryClient();
  const saveBlockFn = useServerFn(saveScheduleBlock);
  const saveLifeFn = useServerFn(saveLifeEvent);

  useEffect(() => {
    if (!editing) {
      setScheduleKind(defaultScheduleKind ?? "season");
      setName("");
      setDescription("");
      setOneStartDate(`${planningYear}-06-15`);
      setOneEndDate(`${planningYear}-06-15`);
      setImpact("workload");
      return;
    }

    setImpact(editing.scheduling_only ? "scheduling" : "workload");

    setScheduleKind(inferScheduleKind(editing));
    setName(editing.name);
    setDescription(editing.notes && !editing.notes.startsWith("{") ? editing.notes : "");

    if (editing.block_type === "recurring_season") {
      const start = new Date(`${editing.start_date.slice(0, 10)}T12:00:00`);
      const end = new Date(`${editing.end_date.slice(0, 10)}T12:00:00`);
      setStartMonth(start.getMonth() + 1);
      setStartDay(start.getDate());
      setEndMonth(end.getMonth() + 1);
      setEndDay(end.getDate());
      setRecurs(editing.recurs_annually ?? true);
      setSeasonCapacityPct(Number(editing.default_capacity_pct ?? editing.capacity_pct));
    }

    if (editing.block_type === "recurring_weekly") {
      const meta = editing.notes?.startsWith("{")
        ? (JSON.parse(editing.notes) as WeeklyCommitmentMeta)
        : null;
      if (meta) {
        setDays(meta.days);
        setHoursPerDay(String(meta.hoursPerDay));
        setAllYear(meta.applyAllYear);
        if (meta.monthStart) setMonthStart(meta.monthStart);
        if (meta.monthEnd) setMonthEnd(meta.monthEnd);
      }
    }

    if (editing.block_type === "life_event" || !editing.block_type) {
      setOneStartDate(editing.start_date.slice(0, 10));
      setOneEndDate(editing.end_date.slice(0, 10));
      setOneCapacityPct(Number(editing.capacity_pct));
    }
  }, [editing, defaultScheduleKind, planningYear]);

  const weeklyHrs = (Number(hoursPerDay) || 0) * days.length;
  const schedulingOnly = impact === "scheduling";

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (scheduleKind === "one_time") {
        return saveLifeFn({
          data: {
            firmId,
            event: {
              id:
                editing?.block_type === "life_event" || !editing?.block_type
                  ? editing?.id
                  : undefined,
              name: name.trim(),
              event_type: "other",
              start_date: oneStartDate,
              end_date: oneEndDate,
              capacity_pct: schedulingOnly ? 100 : oneCapacityPct,
              notes: description.trim() || null,
              is_recurring: false,
              block_type: "life_event",
              scheduling_only: schedulingOnly,
            },
          },
        });
      }

      if (scheduleKind === "weekly") {
        const meta: WeeklyCommitmentMeta = {
          days,
          hoursPerDay: Number(hoursPerDay) || 0,
          applyAllYear: allYear,
          ...(allYear ? {} : { monthStart, monthEnd }),
        };
        return saveBlockFn({
          data: {
            firmId,
            block: {
              id: editing?.block_type === "recurring_weekly" ? editing.id : undefined,
              name: name.trim(),
              event_type: "other",
              start_date: `${planningYear}-01-01`,
              end_date: `${planningYear}-12-31`,
              capacity_pct: 100,
              notes: serializeWeeklyMeta(meta),
              is_recurring: true,
              recurs_annually: true,
              block_type: "recurring_weekly",
              weekly_hours_blocked: schedulingOnly ? 0 : weeklyHrs,
              scheduling_only: schedulingOnly,
            },
          },
        });
      }

      return saveBlockFn({
        data: {
          firmId,
          block: {
            id: editing?.block_type === "recurring_season" ? editing.id : undefined,
            name: name.trim(),
            event_type: "seasonal_slowdown",
            ...anchorSeasonRange(startMonth, startDay, endMonth, endDay),
            capacity_pct: schedulingOnly ? 100 : seasonCapacityPct,
            default_capacity_pct: schedulingOnly ? 100 : seasonCapacityPct,
            notes: description.trim() || null,
            is_recurring: recurs,
            recurs_annually: recurs,
            block_type: "recurring_season",
            scheduling_only: schedulingOnly,
          },
          exceptions: schedulingOnly
            ? []
            : exceptions
                .filter((e) => e.week_start)
                .map((e) => ({
                  week_start: e.week_start,
                  capacity_pct: e.capacity_pct,
                  label: e.label.trim() || null,
                })),
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["capacity-planner", firmId] });
      toast.success("Commitment saved.");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSave = useMemo(() => {
    if (!name.trim()) return false;
    if (scheduleKind === "one_time") return Boolean(oneStartDate && oneEndDate);
    if (scheduleKind === "weekly") return days.length > 0 && (schedulingOnly || weeklyHrs > 0);
    return true;
  }, [name, scheduleKind, oneStartDate, oneEndDate, days.length, weeklyHrs, schedulingOnly]);

  return (
    <div className="space-y-4">
      {onBack && (
        <button type="button" onClick={onBack} className="font-sans text-xs text-gold underline">
          ← Back
        </button>
      )}

      <div className="rounded-lg border border-border bg-cream/60 px-3.5 py-3">
        <p className="font-sans text-[11px] leading-relaxed text-muted-foreground">
          Commitments can <strong className="font-medium text-ch">reduce workload capacity</strong> (fewer
          billable hours in your stats) or be{" "}
          <strong className="font-medium text-ch">scheduling notes</strong> (visible on the calendar only).
          Evening obligations often fit the second category unless they truly cut your design hours.
        </p>
      </div>

      <Field label="What is this commitment?">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Board role, evening class, volunteer shift…"
        />
      </Field>

      <Field label="Notes (optional)">
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Every Tue/Thu after 5pm, Sep through May"
        />
      </Field>

      {!editing && (
        <Field label="How often does it happen?">
          <div className="space-y-2">
            {SCHEDULE_OPTIONS.map((opt) => (
              <button
                key={opt.kind}
                type="button"
                onClick={() => setScheduleKind(opt.kind)}
                className={cn(
                  "w-full cursor-pointer rounded-lg border p-3 text-left transition-colors",
                  scheduleKind === opt.kind
                    ? "border-gold/50 bg-gold/5"
                    : "border-border bg-white hover:border-gold/30",
                )}
              >
                <p className="font-sans text-sm font-medium text-ch">{opt.title}</p>
                <p className="mt-0.5 font-sans text-[11px] text-muted-foreground">{opt.sub}</p>
              </button>
            ))}
          </div>
        </Field>
      )}

      <Field label="How does this affect your design work?">
        <div className="space-y-2">
          {IMPACT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setImpact(opt.value)}
              className={cn(
                "w-full cursor-pointer rounded-lg border p-3 text-left transition-colors",
                impact === opt.value
                  ? "border-gold/50 bg-gold/5"
                  : "border-border bg-white hover:border-gold/30",
              )}
            >
              <p className="font-sans text-sm font-medium text-ch">{opt.title}</p>
              <p className="mt-0.5 font-sans text-[11px] text-muted-foreground">{opt.sub}</p>
            </button>
          ))}
        </div>
      </Field>

      {scheduleKind === "season" && (
        <>
          <Field label="When does this period run?">
            <div className="grid grid-cols-2 gap-3">
              <MonthDaySelect label="From" month={startMonth} day={startDay} onMonth={setStartMonth} onDay={setStartDay} />
              <MonthDaySelect label="To" month={endMonth} day={endDay} onMonth={setEndMonth} onDay={setEndDay} />
            </div>
          </Field>

          <div className="flex items-center justify-between">
            <Label className="font-sans text-sm text-ch">Repeats every year</Label>
            <Switch checked={recurs} onCheckedChange={setRecurs} />
          </div>

          {!schedulingOnly && (
            <CapacitySlider
              label="Design capacity during this period"
              value={seasonCapacityPct}
              onChange={setSeasonCapacityPct}
              hint="Use when you intentionally take on fewer projects for this stretch — not for evening-only conflicts."
            />
          )}

          {!schedulingOnly && (
            <ExceptionWeeks planningYear={planningYear} exceptions={exceptions} onChange={setExceptions} />
          )}
        </>
      )}

      {scheduleKind === "weekly" && (
        <>
          <Field label="Which days?">
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((label, i) => {
                const key = DAY_KEYS[i];
                const on = days.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      setDays(on ? days.filter((d) => d !== key) : [...days, key])
                    }
                    className={cn(
                      "cursor-pointer rounded-md border px-2.5 py-1 font-sans text-[11px]",
                      on ? "border-ch bg-ch text-white" : "border-border bg-white text-muted-foreground",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Hours blocked per day">
            <Input
              type="number"
              min={0}
              step={0.5}
              value={hoursPerDay}
              onChange={(e) => setHoursPerDay(e.target.value)}
            />
          {!schedulingOnly && (
            <p className="mt-1 font-sans text-[11px] text-muted-foreground">
              {weeklyHrs} hrs/week unavailable for design work
            </p>
          )}
          {schedulingOnly && (
            <p className="mt-1 font-sans text-[11px] italic text-muted-foreground">
              Days and times are for your reference — workload stats won&apos;t change.
            </p>
          )}
        </Field>

          <Field label="When does this apply?">
            <Select value={allYear ? "all" : "range"} onValueChange={(v) => setAllYear(v === "all")}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All year</SelectItem>
                <SelectItem value="range">Specific months only</SelectItem>
              </SelectContent>
            </Select>
            {!allYear && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Select value={String(monthStart)} onValueChange={(v) => setMonthStart(Number(v))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Start month" /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(monthEnd)} onValueChange={(v) => setMonthEnd(Number(v))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="End month" /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </Field>
        </>
      )}

      {scheduleKind === "one_time" && (
        <>
          <Field label="When is it?">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-muted-foreground">From</Label>
                <Input
                  type="date"
                  value={oneStartDate}
                  min={`${planningYear}-01-01`}
                  max={`${planningYear + 1}-12-31`}
                  onChange={(e) => {
                    setOneStartDate(e.target.value);
                    if (!oneEndDate || oneEndDate < e.target.value) setOneEndDate(e.target.value);
                  }}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">To</Label>
                <Input
                  type="date"
                  value={oneEndDate}
                  min={oneStartDate || `${planningYear}-01-01`}
                  max={`${planningYear + 1}-12-31`}
                  onChange={(e) => setOneEndDate(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <p className="mt-1 font-sans text-[10px] italic text-muted-foreground">
              Use the same date for a single-day event.
            </p>
          </Field>

          {!schedulingOnly && (
            <CapacitySlider
              label="Design capacity during this period"
              value={oneCapacityPct}
              onChange={setOneCapacityPct}
              hint="Lower if this event significantly reduces billable hours — not just scheduling preference."
            />
          )}
        </>
      )}

      <SaveButton disabled={!canSave || saveMutation.isPending} onClick={() => saveMutation.mutate()} />
    </div>
  );
}

function CapacitySlider({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint: string;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-ch"
        />
        <span className="font-sans text-sm font-medium text-ch">{value}%</span>
      </div>
      <p className="mt-1 font-sans text-[11px] italic text-muted-foreground">{hint}</p>
    </Field>
  );
}

function ExceptionWeeks({
  planningYear,
  exceptions,
  onChange,
}: {
  planningYear: number;
  exceptions: ExceptionDraft[];
  onChange: (next: ExceptionDraft[]) => void;
}) {
  return (
    <div>
      <Label className="mb-2 block font-sans text-xs text-muted-foreground">
        Exception weeks (optional)
      </Label>
      {exceptions.map((ex, i) => (
        <div key={i} className="mb-2 flex flex-wrap items-end gap-2 rounded-lg border border-border p-2">
          <Input
            type="date"
            value={ex.week_start}
            min={`${planningYear}-01-01`}
            max={`${planningYear}-12-31`}
            onChange={(e) => {
              const next = [...exceptions];
              next[i] = { ...next[i], week_start: e.target.value };
              onChange(next);
            }}
            className="h-8 text-xs"
          />
          <Input
            type="number"
            min={0}
            max={100}
            value={ex.capacity_pct}
            onChange={(e) => {
              const next = [...exceptions];
              next[i] = { ...next[i], capacity_pct: Number(e.target.value) };
              onChange(next);
            }}
            className="h-8 w-16 text-xs"
          />
          <Input
            placeholder="Label"
            value={ex.label}
            onChange={(e) => {
              const next = [...exceptions];
              next[i] = { ...next[i], label: e.target.value };
              onChange(next);
            }}
            className="h-8 flex-1 text-xs"
          />
          <button type="button" onClick={() => onChange(exceptions.filter((_, j) => j !== i))}>
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([...exceptions, { week_start: `${planningYear}-01-01`, capacity_pct: 25, label: "" }])
        }
        className="inline-flex cursor-pointer items-center gap-1 font-sans text-[11px] text-gold underline"
      >
        <Plus className="h-3 w-3" /> Add exception week
      </button>
    </div>
  );
}

function MonthDaySelect({
  label,
  month,
  day,
  onMonth,
  onDay,
}: {
  label: string;
  month: number;
  day: number;
  onMonth: (m: number) => void;
  onDay: (d: number) => void;
}) {
  return (
    <div>
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <div className="mt-1 flex gap-1">
        <Select value={String(month)} onValueChange={(v) => onMonth(Number(v))}>
          <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MONTHS.map((m, i) => (
              <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="number" min={1} max={31} value={day} onChange={(e) => onDay(Number(e.target.value))} className="h-8 w-14 text-xs" />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block font-sans text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function SaveButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full cursor-pointer rounded-lg bg-ch py-3 font-sans text-sm font-medium text-white disabled:opacity-50"
    >
      Save commitment →
    </button>
  );
}
