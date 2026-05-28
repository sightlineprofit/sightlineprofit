import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getDashboardData, updateMetricPrefs, listKnowledge } from "@/lib/dashboard.functions";
import { calc, fmtUsd, fmtPct, healthScore, type RateOverrides } from "@/lib/finance";
import { Tile } from "@/components/dashboard/Tile";
import { InfoTip, GLOSSARY } from "@/components/dashboard/InfoTip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sliders, BookOpen, FlaskConical, Play, Pencil, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import {
  listManualHourLogs,
  upsertManualHourLog,
  deleteManualHourLog,
  getActualsForSpan,
} from "@/lib/manual-hours.functions";
import { UpgradeModal } from "@/components/shell/UpgradeModal";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Sightline" }] }),
  component: Dashboard,
});

type TileId = "rate" | "bva" | "health" | "scenario" | "growth" | "kb" | null;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function Dashboard() {
  const fetch = useServerFn(getDashboardData);
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => fetch() });
  const [open, setOpen] = useState<TileId>(null);
  const firmId = data?.firm?.id as string | undefined;
  useRealtimeInvalidate(
    `dashboard-${firmId ?? "none"}`,
    [
      { table: "firm_config", filter: firmId ? `firm_id=eq.${firmId}` : undefined },
      { table: "expenses", filter: firmId ? `firm_id=eq.${firmId}` : undefined },
      { table: "time_entries", filter: firmId ? `firm_id=eq.${firmId}` : undefined },
      { table: "manual_hour_logs", filter: firmId ? `firm_id=eq.${firmId}` : undefined },
    ],
    [["dashboard"]],
    !!firmId,
  );

  const c = useMemo(() => calc(data?.config ?? null, data?.expenses ?? []), [data]);
  const firstName = (data?.profile?.name || data?.profile?.email || "").split(/[ @]/)[0] || "there";
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  if (isLoading) {
    return <div className="flex h-[50vh] items-center justify-center text-ch/50">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-7xl px-8 py-10">
      {/* Header */}
      <div className="mb-10">
        <h1 className="font-display text-5xl tracking-tight text-ch">
          {greeting()}, <span className="italic">{firstName}</span>
        </h1>
        <p className="mt-2 text-sm text-ch/60">
          {data?.firm?.name} <span className="mx-2 text-ch/30">·</span> {today}
        </p>
      </div>

      {/* 3x2 grid */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        <Tile eyebrow="Rate" title="Rate Allocation" onOpen={() => setOpen("rate")} accent>
          <RatePreview c={c} />
        </Tile>
        <Tile eyebrow="Budget vs Actual" title="This week" onOpen={() => setOpen("bva")}>
          <BvAPreview c={c} weekHours={data?.weekHours ?? 0} />
        </Tile>
        <Tile eyebrow="Health" title="Cost Architecture" onOpen={() => setOpen("health")}>
          <HealthPreview c={c} />
        </Tile>
        <Tile eyebrow="Scenarios" title="Model a decision" onOpen={() => setOpen("scenario")}>
          <ScenarioPreview lastName={data?.scenarios?.[0]?.name} />
        </Tile>
        <Tile eyebrow="Roadmap" title="Growth projection" onOpen={() => setOpen("growth")}>
          <GrowthPreview c={c} />
        </Tile>
        <Tile eyebrow="Learn" title="Knowledge Base" onOpen={() => setOpen("kb")}>
          <KnowledgePreview />
        </Tile>
      </div>

      {/* Full views */}
      <FullViewDialog open={open === "rate"} onClose={() => setOpen(null)} title="Rate Allocation"><RateFull c={c} /></FullViewDialog>
      <FullViewDialog open={open === "bva"} onClose={() => setOpen(null)} title="Budget vs Actual" wide>
        <BvAFull
          c={c}
          weekHours={data?.weekHours ?? 0}
          prefs={data?.prefs.hidden_metrics ?? []}
          tier={(data?.firm?.subscription_tier as "foundation" | "studio" | "practice") ?? "foundation"}
          firmId={firmId}
        />
      </FullViewDialog>
      <FullViewDialog open={open === "health"} onClose={() => setOpen(null)} title="Cost Architecture Health"><HealthFull c={c} /></FullViewDialog>
      <FullViewDialog open={open === "scenario"} onClose={() => setOpen(null)} title="Scenario Planning" wide><ScenarioFull baseConfig={data?.config ?? null} expenses={data?.expenses ?? []} /></FullViewDialog>
      <FullViewDialog open={open === "growth"} onClose={() => setOpen(null)} title="Growth Roadmap"><GrowthFull c={c} /></FullViewDialog>
      <FullViewDialog open={open === "kb"} onClose={() => setOpen(null)} title="Knowledge Base" wide><KnowledgeFull /></FullViewDialog>
    </div>
  );
}

/* ───────── Dialog wrapper ───────── */
function FullViewDialog({ open, onClose, title, wide, children }: { open: boolean; onClose: () => void; title: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn("border-border bg-cream p-0 max-h-[90vh] overflow-hidden flex flex-col", wide ? "max-w-5xl" : "max-w-2xl")}>
        <DialogHeader className="border-b border-border bg-white px-7 py-5">
          <DialogTitle className="font-display text-2xl tracking-tight text-ch">{title}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-7 py-6">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────── Tile 1: Rate ───────── */
function RatePreview({ c }: { c: ReturnType<typeof calc> }) {
  const aligned = c.alignedRate;
  const billed = c.billedRate;
  const gap = billed - aligned;
  return (
    <div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-ch/50">Aligned <InfoTip {...GLOSSARY.alignedRate} /></div>
          <div className="num font-display text-3xl text-ch mt-0.5">{fmtUsd(aligned)}<span className="text-sm text-ch/40">/hr</span></div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ch/50">Currently billed</div>
          <div className="num font-display text-3xl text-ch mt-0.5">{fmtUsd(billed)}<span className="text-sm text-ch/40">/hr</span></div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs">
        <span className={cn("inline-block h-2 w-2 rounded-full", gap >= 0 ? "bg-success" : "bg-danger")} />
        <span className="text-ch/70">
          {gap >= 0 ? `${fmtUsd(gap)}/hr above floor` : `${fmtUsd(Math.abs(gap))}/hr below floor`}
        </span>
        <InfoTip {...GLOSSARY.marginAboveFloor} />
      </div>
    </div>
  );
}

export function RateFull({ c }: { c: ReturnType<typeof calc> }) {
  const total = c.perHour.comp + c.perHour.opexRecurring + c.perHour.opexOneTime + c.perHour.marginAbove;
  const segs = [
    { label: "Compensation", val: c.perHour.comp, color: "#B8860B" },
    { label: "Recurring opex", val: c.perHour.opexRecurring, color: "#5C8A6E" },
    { label: "Amortized one-time", val: c.perHour.opexOneTime, color: "#C4714A" },
    { label: "Margin above floor", val: c.perHour.marginAbove, color: "#D4A017" },
  ];
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-white p-6">
        <div className="flex items-baseline justify-between">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-ch/50">Per billable hour <InfoTip {...GLOSSARY.alignedRate} /></div>
          <div className="num font-display text-3xl text-ch">{fmtUsd(total)}<span className="text-sm text-ch/40">/hr</span></div>
        </div>
        <div className="mt-4 flex h-3 overflow-hidden rounded-full border border-border">
          {segs.map((s) => (
            <div key={s.label} title={`${s.label}: ${fmtUsd(s.val)}/hr`} style={{ width: total > 0 ? `${(s.val / total) * 100}%` : "0%", backgroundColor: s.color }} />
          ))}
        </div>
        <ul className="mt-5 space-y-2 text-sm">
          {segs.map((s) => (
            <li key={s.label} className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-ch/70">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label}
              </span>
              <span className="num text-ch">{fmtUsd(s.val, { decimals: 2 })}/hr</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Break-even rate" value={`${fmtUsd(c.breakEvenRate, { decimals: 2 })}/hr`} tip={GLOSSARY.breakEvenRate} />
        <Stat label="Aligned rate" value={`${fmtUsd(c.alignedRate, { decimals: 2 })}/hr`} tip={GLOSSARY.alignedRate} />
        <Stat label="Annual billable hrs" value={c.annualBillableHrs.toLocaleString()} />
        <Stat label="Annual revenue at aligned rate" value={fmtUsd(c.alignedRate * c.annualBillableHrs)} />
      </div>
    </div>
  );
}

/* ───────── Tile 2: Budget vs Actual ───────── */
function BvAPreview({ c, weekHours }: { c: ReturnType<typeof calc>; weekHours: number }) {
  const target = c.targetBillableHrsWeek;
  const pct = target > 0 ? Math.min(100, (weekHours / target) * 100) : 0;
  const revActual = weekHours * c.billedRate;
  const revTarget = target * c.billedRate;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-ch/60">Billable hrs</span>
          <span className="num font-display text-2xl text-ch">{weekHours.toFixed(1)}<span className="text-sm text-ch/40"> / {target}</span></span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-creamd">
          <div className="h-full bg-gold transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ch/60">Revenue this week</span>
        <span className="num text-ch">{fmtUsd(revActual)}<span className="text-ch/40"> / {fmtUsd(revTarget)}</span></span>
      </div>
    </div>
  );
}

const ALL_METRICS = [
  { id: "billable_hrs", label: "Billable hours" },
  { id: "revenue", label: "Revenue" },
  { id: "utilization", label: "Utilization" },
  { id: "variance_hrs", label: "Variance (hrs)" },
  { id: "variance_rev", label: "Variance (revenue)" },
  { id: "avg_rate", label: "Avg realized rate" },
] as const;

export function BvAFull({
  c,
  weekHours,
  prefs,
  tier = "foundation",
  firmId,
}: {
  c: ReturnType<typeof calc>;
  weekHours: number;
  prefs: string[];
  tier?: "foundation" | "studio" | "practice";
  firmId?: string;
}) {
  const [span, setSpan] = useState<"day" | "week" | "month" | "quarter" | "year">("week");
  const [customize, setCustomize] = useState(false);
  const [hidden, setHidden] = useState<string[]>(prefs);
  const qc = useQueryClient();
  const upd = useServerFn(updateMetricPrefs);

  // Combined actuals (manual_hour_logs + time_entries) for the current span window.
  const actualsFn = useServerFn(getActualsForSpan);
  const { data: actuals } = useQuery({
    queryKey: ["bva-actuals", span],
    queryFn: () => actualsFn({ data: { span } }),
  });
  useRealtimeInvalidate(
    `bva-${firmId ?? "none"}`,
    [
      { table: "manual_hour_logs", filter: firmId ? `firm_id=eq.${firmId}` : undefined },
      { table: "time_entries", filter: firmId ? `firm_id=eq.${firmId}` : undefined },
    ],
    [["bva-actuals", span], ["manual-hours"], ["dashboard"]],
    !!firmId,
  );

  const multipliers = { day: 1 / 5, week: 1, month: 4.33, quarter: 13, year: 48 };
  const m = multipliers[span];
  const targetH = c.targetBillableHrsWeek * m;
  const actualH =
    actuals?.billableHrs !== undefined
      ? actuals.billableHrs
      : span === "week"
      ? weekHours
      : weekHours * m;
  const targetR = targetH * c.billedRate;
  const actualR = actualH * c.billedRate;
  const util = targetH > 0 ? (actualH / targetH) * 100 : 0;

  const rows: { id: string; label: string; target: string; actual: string; variance: number; varFmt: string; tip?: { term: string; definition: string; why?: string } }[] = [
    { id: "billable_hrs", label: "Billable hours", target: targetH.toFixed(1), actual: actualH.toFixed(1), variance: actualH - targetH, varFmt: `${(actualH - targetH).toFixed(1)} hrs` },
    { id: "revenue", label: "Revenue", target: fmtUsd(targetR), actual: fmtUsd(actualR), variance: actualR - targetR, varFmt: fmtUsd(actualR - targetR) },
    { id: "utilization", label: "Utilization", target: "100%", actual: fmtPct(util), variance: util - 100, varFmt: `${(util - 100).toFixed(1)} pts`, tip: GLOSSARY.utilizationRate },
    { id: "variance_hrs", label: "Hours gap", target: "0", actual: (actualH - targetH).toFixed(1), variance: actualH - targetH, varFmt: `${(actualH - targetH).toFixed(1)}` },
    { id: "variance_rev", label: "Revenue gap", target: fmtUsd(0), actual: fmtUsd(actualR - targetR), variance: actualR - targetR, varFmt: fmtUsd(actualR - targetR) },
    { id: "avg_rate", label: "Avg realized rate", target: fmtUsd(c.billedRate, { decimals: 2 }), actual: fmtUsd(c.billedRate, { decimals: 2 }), variance: 0, varFmt: "$0" },
  ].filter((r) => !hidden.includes(r.id));

  async function toggle(id: string) {
    const next = hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id];
    setHidden(next);
    try { await upd({ data: { hidden_metrics: next } }); qc.invalidateQueries({ queryKey: ["dashboard"] }); } catch {}
  }

  return (
    <div className="space-y-5">
      <ManualHoursPanel />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-border bg-white p-0.5">
          {(["day", "week", "month", "quarter", "year"] as const).map((s) => (
            <button key={s} onClick={() => setSpan(s)} className={cn("px-3 py-1.5 text-xs font-medium capitalize rounded-sm transition-colors", span === s ? "bg-goldp text-ch" : "text-ch/60 hover:text-ch")}>{s}</button>
          ))}
        </div>
        <button onClick={() => setCustomize((v) => !v)} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-1.5 text-xs text-ch/70 hover:bg-creamd">
          <Sliders className="h-3.5 w-3.5" /> Customize
        </button>
      </div>

      {customize && (
        <div className="rounded-lg border border-border bg-white p-4">
          <div className="text-xs uppercase tracking-wider text-ch/50 mb-3">Show metrics</div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {ALL_METRICS.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="h-4 w-4 accent-gold" checked={!hidden.includes(m.id)} onChange={() => toggle(m.id)} />
                <span className="text-ch/80">{m.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-cream text-[11px] uppercase tracking-wider text-ch/50">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">Metric</th>
              <th className="text-right px-4 py-2.5 font-medium">Target</th>
              <th className="text-right px-4 py-2.5 font-medium">Actual</th>
              <th className="text-right px-4 py-2.5 font-medium">Variance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 text-ch">
                  <span className="inline-flex items-center gap-1.5">{r.label} {r.tip && <InfoTip {...r.tip} />}</span>
                </td>
                <td className="px-4 py-3 text-right num text-ch/70">{r.target}</td>
                <td className="px-4 py-3 text-right num text-ch">{r.actual}</td>
                <td className={cn("px-4 py-3 text-right num font-medium", r.variance > 0 ? "text-success" : r.variance < 0 ? "text-danger" : "text-ch/50")}>
                  {r.variance > 0 && "+"}{r.varFmt}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ManualHoursHistory />

      {tier === "foundation" && <UpgradeBridge />}
    </div>
  );
}

/* ───────── Manual hours: shared helpers + components ───────── */
type ManualPeriod = "week" | "month";
type ManualLog = {
  id: string;
  period_type: ManualPeriod;
  period_start: string;
  total_hrs_worked: number;
  billable_hrs: number;
  non_billable_hrs: number;
  notes: string | null;
  updated_at: string;
};

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function startOfWeekMonday(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
function startOfMonthDate(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function formatPeriodLabel(periodType: ManualPeriod, periodStart: string) {
  const d = parseISO(periodStart);
  return periodType === "week" ? `Week of ${format(d, "EEE MMM d")}` : format(d, "MMM yyyy");
}

// Module-level event bus so the history list can populate the entry panel
// without prop-threading. Trivial for a single dialog instance.
let editEmitter: ((log: ManualLog) => void) | null = null;

function ManualHoursPanel() {
  const qc = useQueryClient();
  const upsert = useServerFn(upsertManualHourLog);
  const listFn = useServerFn(listManualHourLogs);
  const [periodType, setPeriodType] = useState<ManualPeriod>("week");
  const [periodDate, setPeriodDate] = useState<Date>(() => startOfWeekMonday(new Date()));
  const [total, setTotal] = useState<string>("");
  const [billable, setBillable] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Register edit emitter once
  useMemo(() => {
    editEmitter = (log) => {
      setPeriodType(log.period_type);
      setPeriodDate(parseISO(log.period_start));
      setTotal(String(log.total_hrs_worked));
      setBillable(String(log.billable_hrs));
      setNotes(log.notes ?? "");
      if (log.notes) setNotesOpen(true);
    };
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const normalizedDate =
    periodType === "week" ? startOfWeekMonday(periodDate) : startOfMonthDate(periodDate);
  const periodStartIso = isoDate(normalizedDate);

  const { data: weekLogs } = useQuery({
    queryKey: ["manual-hours", "week"],
    queryFn: () => listFn({ data: { period_type: "week" as const, limit: 24 } }),
  });
  const { data: monthLogs } = useQuery({
    queryKey: ["manual-hours", "month"],
    queryFn: () => listFn({ data: { period_type: "month" as const, limit: 12 } }),
  });
  const existing = ((periodType === "week" ? weekLogs : monthLogs) ?? []).find(
    (l) => l.period_start === periodStartIso,
  ) as ManualLog | undefined;

  // Pre-fill when the active period changes
  useMemo(() => {
    if (existing) {
      setTotal(String(existing.total_hrs_worked));
      setBillable(String(existing.billable_hrs));
      setNotes(existing.notes ?? "");
    } else {
      setTotal("");
      setBillable("");
      setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodStartIso, periodType]);

  const totalNum = Number(total) || 0;
  const billableNum = Number(billable) || 0;
  const nonBillable = Math.max(0, totalNum - billableNum);
  const billableExceeds = billable !== "" && billableNum > totalNum;

  async function submit() {
    if (billableExceeds || totalNum <= 0) return;
    setSubmitting(true);
    try {
      await upsert({
        data: {
          period_type: periodType,
          period_start: periodStartIso,
          total_hrs_worked: totalNum,
          billable_hrs: billableNum,
          notes: notes.trim() ? notes.trim() : null,
        },
      });
      toast.success(existing ? "Hours updated." : "Hours logged.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["manual-hours"] }),
        qc.invalidateQueries({ queryKey: ["bva-actuals"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save hours");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg text-ch">Log Hours</h3>
        {existing && (
          <span className="text-[11px] text-ch/50">
            Logged {format(parseISO(existing.updated_at), "MMM d, yyyy")}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="inline-flex rounded-md border border-border bg-cream p-0.5">
          {(["week", "month"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriodType(p)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium capitalize rounded-sm transition-colors",
                periodType === p ? "bg-white text-ch shadow-sm" : "text-ch/60 hover:text-ch",
              )}
            >
              {p}
            </button>
          ))}
        </div>

        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-white px-3 py-1.5 text-sm text-ch hover:bg-creamd"
            >
              <CalendarIcon className="h-3.5 w-3.5 text-ch/50" />
              {periodType === "week"
                ? `Week of ${format(normalizedDate, "EEE MMM d")}`
                : format(normalizedDate, "MMM yyyy")}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={normalizedDate}
              onSelect={(d) => {
                if (d) {
                  setPeriodDate(periodType === "week" ? startOfWeekMonday(d) : startOfMonthDate(d));
                  setPickerOpen(false);
                }
              }}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-ch/50 mb-1">
            Total hours worked
          </label>
          <input
            type="number"
            min={0}
            step="0.25"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-ch/50 mb-1">
            Billable hours
          </label>
          <input
            type="number"
            min={0}
            step="0.25"
            value={billable}
            onChange={(e) => setBillable(e.target.value)}
            className={cn(
              inputCls,
              billableExceeds && "border-danger focus:border-danger focus:ring-danger/20",
            )}
          />
          {billableExceeds && (
            <p className="mt-1 text-xs text-danger">
              Billable hours cannot exceed total hours worked
            </p>
          )}
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-ch/50 mb-1">
            Non-billable (auto)
          </label>
          <div className="num h-9 rounded-md border border-input bg-cream px-3 py-1.5 text-sm text-ch/50 flex items-center">
            {nonBillable.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="mt-3">
        {!notesOpen ? (
          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            className="text-xs text-ch/50 hover:text-ch"
          >
            + Add note
          </button>
        ) : (
          <input
            type="text"
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            className={inputCls}
          />
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={submitting || billableExceeds || totalNum <= 0}
          className="inline-flex items-center justify-center rounded-md bg-gold px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-goldl disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Saving…" : existing ? "Update Hours" : "Log Hours"}
        </button>
      </div>
    </div>
  );
}

function ManualHoursHistory() {
  const qc = useQueryClient();
  const del = useServerFn(deleteManualHourLog);
  const listFn = useServerFn(listManualHourLogs);
  const [view, setView] = useState<ManualPeriod>("week");
  const limit = view === "week" ? 12 : 6;
  const { data, isLoading } = useQuery({
    queryKey: ["manual-hours", view],
    queryFn: () => listFn({ data: { period_type: view, limit } }),
  });
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const rows = ((data ?? []) as ManualLog[]).slice(0, limit);

  async function onDelete(id: string) {
    try {
      await del({ data: { id } });
      toast.success("Record removed.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["manual-hours"] }),
        qc.invalidateQueries({ queryKey: ["bva-actuals"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
    } finally {
      setConfirmingId(null);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg text-ch">Historical Records</h3>
        <div className="inline-flex rounded-full border border-border bg-cream p-0.5">
          {(["week", "month"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "px-3 py-1 text-xs font-medium capitalize rounded-full transition-colors",
                view === v ? "bg-white text-ch shadow-sm" : "text-ch/60 hover:text-ch",
              )}
            >
              By {v}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-ch/50">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ch/60">
          No hours logged yet. Enter your hours above to start tracking actuals against your plan.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-cream text-[11px] uppercase tracking-wider text-ch/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Period</th>
                <th className="text-right px-3 py-2 font-medium">Total</th>
                <th className="text-right px-3 py-2 font-medium">Billable</th>
                <th className="text-right px-3 py-2 font-medium">Non-bill.</th>
                <th className="text-right px-3 py-2 font-medium">Util.</th>
                <th className="text-left px-3 py-2 font-medium">Notes</th>
                <th className="px-3 py-2 font-medium w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const util =
                  Number(r.total_hrs_worked) > 0
                    ? (Number(r.billable_hrs) / Number(r.total_hrs_worked)) * 100
                    : 0;
                const confirming = confirmingId === r.id;
                return (
                  <tr key={r.id} className="bg-white">
                    <td className="px-3 py-2.5 text-ch">
                      {formatPeriodLabel(r.period_type, r.period_start)}
                    </td>
                    <td className="px-3 py-2.5 text-right num text-ch">
                      {Number(r.total_hrs_worked).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right num text-success">
                      {Number(r.billable_hrs).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right num text-danger/80">
                      {Number(r.non_billable_hrs).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right num text-ch/70">
                      {util.toFixed(0)}%
                    </td>
                    <td
                      className="px-3 py-2.5 text-ch/60 text-xs max-w-[200px] truncate"
                      title={r.notes ?? ""}
                    >
                      {r.notes ?? ""}
                    </td>
                    <td className="px-3 py-2.5">
                      {confirming ? (
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            type="button"
                            onClick={() => onDelete(r.id)}
                            className="rounded bg-danger px-2 py-1 text-[11px] text-white hover:opacity-90"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingId(null)}
                            className="rounded border border-border px-2 py-1 text-[11px] text-ch/70 hover:bg-creamd"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            type="button"
                            onClick={() => editEmitter?.(r)}
                            className="rounded p-1.5 text-ch/50 hover:text-ch hover:bg-creamd"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingId(r.id)}
                            className="rounded p-1.5 text-ch/50 hover:text-danger hover:bg-creamd"
                            title="Delete"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {confirmingId && (
        <p className="mt-2 text-xs text-ch/60">
          Remove this record? This will update your actuals.
        </p>
      )}
    </div>
  );
}

function UpgradeBridge() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="rounded-xl border border-goldp bg-goldp/30 p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="h-4 w-4 text-gold mt-0.5" />
          <div className="flex-1 text-sm text-ch/80">
            You're entering hours manually. Upgrade to Studio to have your calendar log these
            automatically — no manual entry required.{" "}
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="font-medium text-gold hover:underline"
            >
              See what Studio includes →
            </button>
          </div>
        </div>
      </div>
      <UpgradeModal
        targetTier={open ? "studio" : null}
        currentTier="foundation"
        onClose={() => setOpen(false)}
      />
    </>
  );
}

/* ───────── Tile 3: Health ───────── */
function HealthRing({ score, size = 96 }: { score: number; size?: number }) {
  const r = size / 2 - 6;
  const circ = 2 * Math.PI * r;
  const off = circ - (score / 100) * circ;
  const color = score >= 70 ? "#5C8A6E" : score >= 40 ? "#D4A017" : "#B85C5C";
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EDE8DF" strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6} strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" className="transition-all duration-500" />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central" transform={`rotate(90 ${size / 2} ${size / 2})`} className="font-display fill-ch" fontSize={size / 3.2}>{score}</text>
    </svg>
  );
}

function HealthPreview({ c }: { c: ReturnType<typeof calc> }) {
  const score = healthScore(c);
  return (
    <div className="flex items-center gap-5">
      <HealthRing score={score} size={84} />
      <div className="flex-1 space-y-2">
        <div className="flex justify-between text-xs"><span className="text-ch/60">Gross margin</span><span className="num text-ch">{fmtPct(c.grossMarginPct)}</span></div>
        <div className="flex justify-between text-xs"><span className="text-ch/60">Rate buffer</span><span className="num text-ch">{fmtPct(c.rateSafetyBuffer)}</span></div>
      </div>
    </div>
  );
}

export function HealthFull({ c }: { c: ReturnType<typeof calc> }) {
  const score = healthScore(c);
  const compPct = c.totalCost > 0 ? (c.compTotal / c.totalCost) * 100 : 0;
  const opexPct = c.totalCost > 0 ? ((c.opexRecurring + c.opexOneTime) / c.totalCost) * 100 : 0;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-6 rounded-xl border border-border bg-white p-6">
        <HealthRing score={score} size={120} />
        <div>
          <p className="text-[11px] uppercase tracking-wider text-gold">Overall</p>
          <p className="font-display text-2xl text-ch mt-1">{score >= 70 ? "Healthy" : score >= 40 ? "Watching" : "At risk"}</p>
          <p className="text-sm text-ch/60 mt-2 max-w-sm">Blended view of gross margin, rate safety buffer, and how your compensation share compares to opex.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Comp % of total cost" value={fmtPct(compPct)} />
        <Stat label="Opex % of total cost" value={fmtPct(opexPct)} />
        <Stat label="Break-even rate" value={`${fmtUsd(c.breakEvenRate, { decimals: 2 })}/hr`} tip={GLOSSARY.breakEvenRate} />
        <Stat label="Rate safety buffer" value={fmtPct(c.rateSafetyBuffer)} tip={GLOSSARY.rateSafetyBuffer} />
        <Stat label="Annual gross margin" value={fmtUsd(c.grossProfit)} />
        <Stat label="Gross margin %" value={fmtPct(c.grossMarginPct)} tip={GLOSSARY.grossMargin} />
      </div>
    </div>
  );
}

/* ───────── Tile 4: Scenarios ───────── */
function ScenarioPreview({ lastName }: { lastName?: string }) {
  return (
    <div className="flex h-full flex-col justify-between">
      <p className="text-sm text-ch/70 leading-relaxed">Model a hire, a rate change, or a new studio expense — see the impact before you commit.</p>
      <div className="mt-4 flex items-center gap-2 text-xs text-ch/50">
        <FlaskConical className="h-3.5 w-3.5" />
        {lastName ? <span>Last: <span className="text-ch">{lastName}</span></span> : <span>No scenarios yet</span>}
      </div>
    </div>
  );
}

export function ScenarioFull({ baseConfig, expenses }: { baseConfig: any; expenses: any[] }) {
  const [ov, setOv] = useState<{
    oneTime: number; oneTimeMonths: number; monthly: number; quarterly: number; annual: number;
    rateOverride: string; hrsOverride: string; payIncrease: number; name: string;
  }>({ oneTime: 0, oneTimeMonths: 12, monthly: 0, quarterly: 0, annual: 0, rateOverride: "", hrsOverride: "", payIncrease: 0, name: "" });

  const base = useMemo(() => calc(baseConfig, expenses), [baseConfig, expenses]);
  const overrides: RateOverrides = {
    extraOneTimeAnnual: ov.oneTimeMonths > 0 ? (ov.oneTime / ov.oneTimeMonths) * 12 : 0,
    extraRecurringAnnual: ov.monthly * 12 + ov.quarterly * 4 + ov.annual,
    rateOverride: ov.rateOverride ? Number(ov.rateOverride) : null,
    hrsOverride: ov.hrsOverride ? Number(ov.hrsOverride) : null,
    payIncreaseAnnual: ov.payIncrease,
  };
  const scenario = useMemo(() => calc(baseConfig, expenses, overrides), [baseConfig, expenses, ov]);

  const committedRate = base.breakEvenRate;
  const temporaryRate = (overrides.extraOneTimeAnnual ?? 0) / (scenario.annualBillableHrs || 1);

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <h3 className="font-display text-lg text-ch">What if you…</h3>
        <FieldRow label="Add a one-time investment ($)">
          <input type="number" min={0} className={inputCls} value={ov.oneTime || ""} onChange={(e) => setOv({ ...ov, oneTime: Number(e.target.value) })} />
        </FieldRow>
        <FieldRow label="Amortize over (months)">
          <input type="number" min={1} className={inputCls} value={ov.oneTimeMonths} onChange={(e) => setOv({ ...ov, oneTimeMonths: Number(e.target.value) || 1 })} />
        </FieldRow>
        <FieldRow label="Add monthly expense ($)">
          <input type="number" min={0} className={inputCls} value={ov.monthly || ""} onChange={(e) => setOv({ ...ov, monthly: Number(e.target.value) })} />
        </FieldRow>
        <FieldRow label="Override rate ($/hr)">
          <input type="number" min={0} className={inputCls} placeholder={base.billedRate ? base.billedRate.toFixed(0) : ""} value={ov.rateOverride} onChange={(e) => setOv({ ...ov, rateOverride: e.target.value })} />
        </FieldRow>
        <FieldRow label="Override billable hrs/wk">
          <input type="number" min={0} max={168} className={inputCls} placeholder={`${base.targetBillableHrsWeek}`} value={ov.hrsOverride} onChange={(e) => setOv({ ...ov, hrsOverride: e.target.value })} />
        </FieldRow>
        <FieldRow label="Annual pay increase ($)">
          <input type="number" min={0} className={inputCls} value={ov.payIncrease || ""} onChange={(e) => setOv({ ...ov, payIncrease: Number(e.target.value) })} />
        </FieldRow>
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <ScenarioCard label="Current" rate={base.alignedRate} margin={base.grossMarginPct} revenue={base.annualRevenue} />
          <ScenarioCard label="Scenario" rate={scenario.alignedRate} margin={scenario.grossMarginPct} revenue={scenario.annualRevenue} accent />
        </div>
        <div className="rounded-lg border border-border bg-white p-4 text-sm">
          <p className="text-[11px] uppercase tracking-wider text-ch/50 mb-2">Rate floor analysis</p>
          <div className="flex justify-between"><span className="text-ch/70">Committed (recurring)</span><span className="num text-ch">{fmtUsd(committedRate, { decimals: 2 })}/hr</span></div>
          <div className="flex justify-between mt-1"><span className="text-ch/70">Temporary (amortized)</span><span className="num text-ch">{fmtUsd(temporaryRate, { decimals: 2 })}/hr</span></div>
        </div>
        {ov.oneTime > 0 && (
          <div className="rounded-lg border border-goldp bg-goldp/30 p-4 text-xs text-ch/80">
            Cash availability: this scenario requires <span className="font-medium text-ch">{fmtUsd(ov.oneTime)}</span> in available cash up front, then <span className="font-medium text-ch">{fmtUsd(ov.oneTime / ov.oneTimeMonths)}</span> recovered per month over {ov.oneTimeMonths} months.
          </div>
        )}
      </div>
    </div>
  );
}

function ScenarioCard({ label, rate, margin, revenue, accent }: { label: string; rate: number; margin: number; revenue: number; accent?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-4", accent ? "border-gold bg-goldp/30" : "border-border bg-white")}>
      <p className="text-[10px] uppercase tracking-wider text-ch/50">{label}</p>
      <p className="font-display text-2xl text-ch mt-1 num">{fmtUsd(rate, { decimals: 0 })}<span className="text-xs text-ch/40">/hr</span></p>
      <p className="text-xs text-ch/60 mt-2">Margin <span className="num text-ch">{fmtPct(margin, 0)}</span></p>
      <p className="text-xs text-ch/60">Revenue <span className="num text-ch">{fmtUsd(revenue)}</span></p>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-ch/50 mb-1">{label}</label>
      {children}
    </div>
  );
}
const inputCls = "w-full rounded-md border border-input bg-white px-3 py-1.5 text-sm text-ch focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20";

/* ───────── Tile 5: Growth ───────── */
function GrowthPreview({ c }: { c: ReturnType<typeof calc> }) {
  const y1 = c.annualRevenue * 1.15;
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs"><span className="text-ch/60">Today</span><span className="num text-ch">{fmtUsd(c.annualRevenue)}</span></div>
      <div className="flex justify-between text-xs"><span className="text-ch/60">Year 1 projection</span><span className="num text-ch font-medium">{fmtUsd(y1)}</span></div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-creamd">
        <div className="h-full bg-gold" style={{ width: "60%" }} />
      </div>
    </div>
  );
}
export function GrowthFull({ c }: { c: ReturnType<typeof calc> }) {
  const years = [0, 0.15, 0.32, 0.51];
  return (
    <div className="space-y-4">
      <p className="text-sm text-ch/70">A simple growth projection assuming compounding revenue lift from rate, capacity, and team expansion.</p>
      {years.map((g, i) => (
        <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-white p-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gold">Year {i}</p>
            <p className="font-display text-2xl text-ch num">{fmtUsd(c.annualRevenue * (1 + g))}</p>
          </div>
          <div className="text-sm text-ch/60">+{(g * 100).toFixed(0)}%</div>
        </div>
      ))}
    </div>
  );
}

/* ───────── Tile 6: Knowledge ───────── */
function KnowledgePreview() {
  const fetchKb = useServerFn(listKnowledge);
  const { data } = useQuery({ queryKey: ["kb"], queryFn: () => fetchKb() });
  const latest = data?.[0];
  if (!latest) return <p className="text-sm text-ch/50">No articles yet.</p>;
  return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-goldp">
          {latest.kind === "video" ? <Play className="h-5 w-5 text-gold" /> : <BookOpen className="h-5 w-5 text-gold" />}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-ch/50">{categoryLabel(latest.category)}</p>
          <p className="font-display text-base text-ch mt-0.5 line-clamp-2">{latest.title}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-ch/50">{latest.read_minutes ?? 5} min · {data?.length ?? 0} more</p>
    </div>
  );
}
export function KnowledgeFull() {
  const fetchKb = useServerFn(listKnowledge);
  const { data } = useQuery({ queryKey: ["kb"], queryFn: () => fetchKb() });
  const [cat, setCat] = useState<string>("all");
  const cats = [
    { id: "all", label: "All" },
    { id: "rate_architecture", label: "Rate Architecture" },
    { id: "cash_management", label: "Cash Management" },
    { id: "team_growth", label: "Team & Growth" },
    { id: "using_sightline", label: "Using Sightline" },
  ];
  const items = (data ?? []).filter((a) => cat === "all" || a.category === cat);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1">
        {cats.map((c) => (
          <button key={c.id} onClick={() => setCat(c.id)} className={cn("rounded-full px-3 py-1 text-xs transition-colors", cat === c.id ? "bg-ch text-cream" : "border border-border bg-white text-ch/70 hover:bg-creamd")}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {items.map((a) => (
          <div key={a.id} className="rounded-lg border border-border bg-white p-5 hover:border-gold/40 transition-colors cursor-pointer">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-gold">
              {a.kind === "video" ? <Play className="h-3 w-3" /> : <BookOpen className="h-3 w-3" />}
              {categoryLabel(a.category)}
            </div>
            <h4 className="font-display text-lg text-ch mt-2">{a.title}</h4>
            {a.excerpt && <p className="mt-1.5 text-sm text-ch/70 leading-relaxed">{a.excerpt}</p>}
            <p className="mt-3 text-xs text-ch/40">{a.read_minutes ?? 5} min read</p>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-ch/50">Nothing in this category yet.</p>}
      </div>
    </div>
  );
}
function categoryLabel(c: string) {
  return { rate_architecture: "Rate Architecture", cash_management: "Cash Management", team_growth: "Team & Growth", using_sightline: "Using Sightline" }[c] ?? c;
}

/* ───────── Shared Stat ───────── */
function Stat({ label, value, tip }: { label: string; value: string; tip?: { term: string; definition: string; why?: string } }) {
  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-ch/50">
        {label}
        {tip && <InfoTip {...tip} />}
      </div>
      <div className="mt-1.5 num font-display text-2xl text-ch">{value}</div>
    </div>
  );
}