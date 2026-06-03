import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getDashboardData, updateMetricPrefs, listKnowledge } from "@/lib/dashboard.functions";
import { addExpense, upsertFirmConfig } from "@/lib/firm.functions";
import {
  calc,
  fmtUsd,
  fmtPct,
  healthScore,
  cashRecovery,
  oneTimePerHr,
  marginBreakdown,
  type RateOverrides,
} from "@/lib/finance";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import { RoleGuard } from "@/lib/role";
import { CapacityTile, type CapacityTileData } from "@/components/capacity/CapacityTile";
import { CapacityExpanded, type CapacityExpandedData } from "@/components/capacity/CapacityExpanded";
import type { CapacityInputs } from "@/lib/capacity-math";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Sightline" }] }),
  component: GuardedDashboard,
});

function GuardedDashboard() {
  return (
    <RoleGuard allow={["principal", "admin"]}>
      <Dashboard />
    </RoleGuard>
  );
}

type TileId = "bva" | "allocation" | "scenario" | "capacity" | "kb" | null;

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

  // Build capacity payload (memo so both tile + expanded see the same instance)
  const capacity = useMemo<{ tile: CapacityTileData; expanded: CapacityExpandedData } | null>(() => {
    if (!data) return null;
    const cap = (data as any).capacity;
    if (!cap) return null;
    const targetHrs = Number(data.config?.target_billable_hrs_per_week ?? 0) || 0;
    const ratePerHr = Number(data.config?.rate_billed ?? 0) || 0;
    const inputs: CapacityInputs = {
      projects: cap.projects ?? [],
      phases: cap.phases ?? [],
      pipeline: cap.pipeline ?? [],
      trailingEntries: cap.trailingEntries ?? [],
      avgWeeklyNonBillable: Number(cap.avgWeeklyNonBillable ?? 0),
      targetHrsPerWeek: targetHrs,
      weeksPerYear: 48,
      ratePerHr,
    };
    // Weekly hours per user (current week, billable only, non-BD)
    const weeklyHoursByUser = new Map<string, number>();
    // We don't have per-user current-week split in the existing payload; derive from trailingEntries
    const startOfWeek = new Date();
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const iso = startOfWeek.toISOString().slice(0, 10);
    for (const t of cap.trailingEntries ?? []) {
      if (t.billable && t.date >= iso && t.user_id) {
        weeklyHoursByUser.set(t.user_id, (weeklyHoursByUser.get(t.user_id) ?? 0) + Number(t.hrs || 0));
      }
    }
    return {
      tile: {
        inputs,
        weekHours: data.weekHours ?? 0,
        team: cap.team ?? [],
        weeklyHoursByUser,
        configSetup: targetHrs > 0,
      },
      expanded: {
        inputs,
        weekHours: data.weekHours ?? 0,
        bdWeekHours: data.bdWeekHours ?? 0,
        team: cap.team ?? [],
        weeklyHoursByUser,
        sopTemplates: cap.sopTemplates ?? [],
        configSetup: targetHrs > 0,
        annualRevenue: c.annualRevenue,
        alignedAnnualRevenue: c.alignedRate * c.annualBillableHrs,
      },
    };
  }, [data, c]);

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
        <Tile eyebrow="Budget vs Actual" title="This week" onOpen={() => setOpen("bva")}>
          <BvAPreview
            c={c}
            weekHours={data?.weekHours ?? 0}
            committed={data?.committedRevenue ?? 0}
            collected={data?.collectedRevenue ?? 0}
            basis={(data?.config?.accounting_basis as "cash" | "accrual") ?? "cash"}
          />
        </Tile>
        <Tile eyebrow="Rate" title="Rate Allocation" onOpen={() => setOpen("allocation")} accent>
          <AllocationPreview c={c} />
        </Tile>
        <Tile eyebrow="Scenarios" title="Model a decision" onOpen={() => setOpen("scenario")}>
          <ScenarioPreview lastName={data?.scenarios?.[0]?.name} />
        </Tile>
        {capacity ? (
          <CapacityTile data={capacity.tile} onOpen={() => setOpen("capacity")} />
        ) : (
          <Tile eyebrow="Capacity" title="Firm capacity" onOpen={() => setOpen("capacity")}>
            <div className="text-sm text-ch/50">Loading…</div>
          </Tile>
        )}
        <Tile eyebrow="Learn" title="Knowledge Base" onOpen={() => setOpen("kb")}>
          <KnowledgePreview />
        </Tile>
      </div>

      {/* Full views */}
      <FullViewDialog open={open === "bva"} onClose={() => setOpen(null)} title="Budget vs Actual" wide>
        <BvAFull
          c={c}
          weekHours={data?.weekHours ?? 0}
          prefs={data?.prefs.hidden_metrics ?? []}
          tier={(data?.firm?.subscription_tier as "foundation" | "studio" | "practice") ?? "foundation"}
          firmId={firmId}
          committed={data?.committedRevenue ?? 0}
          collected={data?.collectedRevenue ?? 0}
          basis={(data?.config?.accounting_basis as "cash" | "accrual") ?? "cash"}
        />
      </FullViewDialog>
      <FullViewDialog open={open === "allocation"} onClose={() => setOpen(null)} title="Rate Allocation" wide>
        <AllocationFull c={c} expenses={data?.expenses ?? []} />
      </FullViewDialog>
      <FullViewDialog open={open === "scenario"} onClose={() => setOpen(null)} title="Scenario Planning" wide><ScenarioFull baseConfig={data?.config ?? null} expenses={data?.expenses ?? []} /></FullViewDialog>
      <FullViewDialog open={open === "capacity"} onClose={() => setOpen(null)} title="Firm Capacity" wide>
        {capacity && <CapacityExpanded data={capacity.expanded} />}
      </FullViewDialog>
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
function BvAPreview({
  c,
  weekHours,
  committed,
  collected,
  basis,
}: {
  c: ReturnType<typeof calc>;
  weekHours: number;
  committed: number;
  collected: number;
  basis: "cash" | "accrual";
}) {
  const target = c.targetBillableHrsWeek;
  const pct = target > 0 ? Math.min(100, (weekHours / target) * 100) : 0;
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
      <div className="space-y-1.5 text-sm">
        <div className="flex items-baseline justify-between">
          <span className="flex items-center gap-1 text-ch/60">
            Committed
            <InfoTip
              term="Committed revenue"
              definition="Scoped revenue from Active and Invoiced projects."
            />
          </span>
          <span className="num text-ch">{fmtUsd(committed)}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="flex items-center gap-1 text-ch/60">
            {basis === "cash" ? "Revenue collected" : "Revenue earned (accrual)"}
            <InfoTip
              term={basis === "cash" ? "Cash basis" : "Accrual basis"}
              definition={
                basis === "cash"
                  ? "Counted when payment is received. Invoices sent but unpaid are shown separately as committed revenue."
                  : "Counted when work is delivered or invoiced, whether or not payment has arrived yet."
              }
            />
          </span>
          <span className="num text-ch">
            {fmtUsd(basis === "cash" ? collected : collected + committed)}
          </span>
        </div>
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
  committed = 0,
  collected = 0,
  basis = "cash",
}: {
  c: ReturnType<typeof calc>;
  weekHours: number;
  prefs: string[];
  tier?: "foundation" | "studio" | "practice";
  firmId?: string;
  committed?: number;
  collected?: number;
  basis?: "cash" | "accrual";
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

/* ───────── (Legacy Health helpers — kept for /dashboard/health route) ───────── */
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  const qc = useQueryClient();
  const addExp = useServerFn(addExpense);
  const saveCfg = useServerFn(upsertFirmConfig);
  const [committing, setCommitting] = useState(false);
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

  // Buffer-aware intelligence: does current margin absorb the new aligned-rate increase?
  const alignedDelta = scenario.alignedRate - base.alignedRate;
  const bufferCovers = base.marginBuffer >= alignedDelta && alignedDelta > 0;
  const recovery = ov.oneTime > 0
    ? cashRecovery({
        amount: ov.oneTime,
        marginPerHr: base.perHour.marginAbove,
        billableHrsPerWeek: base.targetBillableHrsWeek,
      })
    : null;

  const canCommit =
    ov.oneTime > 0 || ov.monthly > 0 || ov.quarterly > 0 || ov.annual > 0 || ov.payIncrease > 0;

  async function commitToCostArchitecture() {
    setCommitting(true);
    try {
      const tasks: Promise<unknown>[] = [];
      const label = ov.name?.trim() || "Scenario expense";
      if (ov.monthly > 0)
        tasks.push(addExp({ data: { name: `${label} (monthly)`, amount: ov.monthly, frequency: "monthly", recurring: true } as any }));
      if (ov.quarterly > 0)
        tasks.push(addExp({ data: { name: `${label} (quarterly)`, amount: ov.quarterly, frequency: "quarterly", recurring: true } as any }));
      if (ov.annual > 0)
        tasks.push(addExp({ data: { name: `${label} (annual)`, amount: ov.annual, frequency: "annual", recurring: true } as any }));
      if (ov.oneTime > 0)
        tasks.push(addExp({ data: { name: `${label} (one-time)`, amount: ov.oneTime, frequency: "onetime", recurring: false, amort_months: ov.oneTimeMonths } as any }));
      if (ov.payIncrease > 0 && baseConfig) {
        const nextDraw = Number(baseConfig.comp_draw_annual || 0) + ov.payIncrease;
        tasks.push(saveCfg({ data: { comp_draw_annual: nextDraw } as any }));
      }
      await Promise.all(tasks);
      toast.success("Added to your cost architecture");
      setOv({ oneTime: 0, oneTimeMonths: 12, monthly: 0, quarterly: 0, annual: 0, rateOverride: "", hrsOverride: "", payIncrease: 0, name: "" });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <h3 className="font-display text-lg text-ch">What if you…</h3>
        <FieldRow label="Add a one-time investment ($)">
          <input type="number" min={0} className={inputCls} value={ov.oneTime || ""} onChange={(e) => setOv({ ...ov, oneTime: Number(e.target.value) })} />
        </FieldRow>
        <FieldRow label="Spread cost over (months)">
          <input type="number" min={1} className={inputCls} value={ov.oneTimeMonths} onChange={(e) => setOv({ ...ov, oneTimeMonths: Number(e.target.value) || 1 })} />
        </FieldRow>
        {ov.oneTime > 0 && (
          <div className="rounded-md border border-border bg-cream/40 p-3 text-xs text-ch/70 leading-relaxed">
            You're spending <span className="num text-ch">{fmtUsd(ov.oneTime)}</span> once.
            Spread over <span className="num text-ch">{ov.oneTimeMonths}</span> months, that's{" "}
            <span className="num text-ch">{fmtUsd(ov.oneTime / ov.oneTimeMonths)}</span>/month — or
            about{" "}
            <span className="num text-ch">
              {fmtUsd(
                oneTimePerHr({
                  amount: ov.oneTime,
                  months: ov.oneTimeMonths,
                  annualBillableHrs: base.annualBillableHrs,
                }),
                { decimals: 2 },
              )}
            </span>
            /hr of every hour you bill during that time. After {ov.oneTimeMonths} months, this
            cost disappears from your rate.
          </div>
        )}
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
        {alignedDelta > 0 && (
          <div
            className={cn(
              "rounded-lg border p-4 text-sm leading-relaxed",
              bufferCovers ? "border-success/40 bg-success/5 text-ch/80" : "border-danger/40 bg-danger/5 text-ch/80",
            )}
          >
            {bufferCovers ? (
              <>
                Your current margin of{" "}
                <span className="num text-ch">{fmtUsd(base.marginBuffer, { decimals: 2 })}/hr</span>{" "}
                covers this. Your aligned floor rises by{" "}
                <span className="num text-ch">{fmtUsd(alignedDelta, { decimals: 2 })}/hr</span>{" "}
                but your pricing remains comfortable. No rate change needed.
              </>
            ) : (
              <>
                This raises your aligned floor above your current rate. To maintain your{" "}
                {fmtPct(scenario.grossMarginPct, 0)} margin target, either raise your rate by{" "}
                <span className="num text-ch">
                  {fmtUsd(scenario.alignedRate - base.billedRate, { decimals: 2 })}/hr
                </span>{" "}
                or add hours.
              </>
            )}
          </div>
        )}
        <div className="rounded-lg border border-border bg-white p-4 text-sm">
          <p className="text-[11px] uppercase tracking-wider text-ch/50 mb-2">Rate floor analysis</p>
          <div className="flex justify-between"><span className="text-ch/70">Committed (recurring)</span><span className="num text-ch">{fmtUsd(committedRate, { decimals: 2 })}/hr</span></div>
          <div className="flex justify-between mt-1"><span className="text-ch/70">Temporary (one-time spread)</span><span className="num text-ch">{fmtUsd(temporaryRate, { decimals: 2 })}/hr</span></div>
        </div>
        {recovery && Number.isFinite(recovery.weeks) && (
          <div className="rounded-lg border border-goldp bg-goldp/30 p-4 text-xs text-ch/80 leading-relaxed">
            You're spending <span className="font-medium text-ch">{fmtUsd(ov.oneTime)}</span> once.
            Upfront: you need that available today. At your current above-floor margin of{" "}
            <span className="font-medium text-ch">
              {fmtUsd(base.perHour.marginAbove, { decimals: 2 })}/hr
            </span>
            , you recover this in <span className="font-medium text-ch">{recovery.weeks.toFixed(1)}</span>{" "}
            weeks of billable work. After {ov.oneTimeMonths} months, this cost disappears and your
            margin returns.
          </div>
        )}
        {canCommit && (
          <div className="rounded-lg border border-border bg-white p-4 space-y-3">
            <p className="text-[11px] uppercase tracking-wider text-ch/50">Make it real</p>
            <input
              className={inputCls}
              placeholder="Label (e.g. New laptop, Raise)"
              value={ov.name}
              onChange={(e) => setOv({ ...ov, name: e.target.value })}
            />
            <button
              type="button"
              disabled={committing}
              onClick={commitToCostArchitecture}
              className="w-full rounded-md bg-ch px-3 py-2 text-sm text-cream hover:bg-ch/90 disabled:opacity-50"
            >
              {committing ? "Adding…" : "Add to cost architecture"}
            </button>
            <p className="text-[11px] text-ch/50 leading-relaxed">
              This commits the expense or pay change to your firm. Your aligned floor and rate
              recommendations update everywhere — Sightline projects already below the new floor
              will be flagged.
            </p>
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

/* ───────── Tile: Capacity (replaces Growth Roadmap) ───────── */
function CapacityPreview({
  c,
  weekHours,
  bdHours,
}: {
  c: ReturnType<typeof calc>;
  weekHours: number;
  bdHours: number;
}) {
  const target = c.targetBillableHrsWeek || 0;
  const committed = weekHours;
  const pct = target > 0 ? Math.min(100, (committed / target) * 100) : 0;
  const remaining = Math.max(0, target - committed);
  const over = committed > target;
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-baseline justify-between text-xs text-ch/60">
          <span>{Math.round(pct)}% committed</span>
          <span className="num text-ch">{remaining.toFixed(1)} hrs free</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-creamd">
          <div
            className={cn("h-full transition-all", over ? "bg-danger" : "bg-gold")}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <div className="uppercase tracking-wider text-ch/50">Available</div>
          <div className="num text-ch">{target.toFixed(0)} hrs</div>
        </div>
        <div>
          <div className="uppercase tracking-wider text-ch/50">Committed</div>
          <div className="num text-ch">{committed.toFixed(1)} hrs</div>
        </div>
        <div>
          <div className="uppercase tracking-wider text-ch/50">BD time</div>
          <div className="num text-ch">{bdHours.toFixed(1)} hrs</div>
        </div>
      </div>
      {over && (
        <div className="text-xs text-danger">● Over capacity by {(committed - target).toFixed(1)} hrs</div>
      )}
    </div>
  );
}

export function CapacityFull({
  c,
  weekHours,
  bdHours,
}: {
  c: ReturnType<typeof calc>;
  weekHours: number;
  bdHours: number;
}) {
  const target = c.targetBillableHrsWeek || 0;
  const annualTarget = target * (c.weeksPerYear || 48);
  const remaining = Math.max(0, target - weekHours);
  const annualRevenue = c.annualRevenue;
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-white p-5">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-lg text-ch">Planned capacity</h3>
          <span className="text-xs text-ch/50">{(c.weeksPerYear || 48)} weeks / year</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Target hrs / week" value={target.toFixed(1)} />
          <Stat label="Target hrs / year" value={annualTarget.toFixed(0)} />
          <Stat label="Logged this week" value={weekHours.toFixed(1)} />
          <Stat label="BD time this week" value={bdHours.toFixed(1)} />
        </div>
      </div>
      <div className="rounded-xl border border-border bg-white p-5">
        <h3 className="font-display text-lg text-ch">Billable vs non-billable</h3>
        <p className="mt-1 text-sm text-ch/60">
          Business development (Pursuit / Pipeline) time is shown separately. It's the cost of
          winning new work — not counted against your billable utilization.
        </p>
        <div className="mt-3 flex justify-between text-sm">
          <span className="text-ch/70">Billable this week</span>
          <span className="num text-ch">{weekHours.toFixed(1)} hrs</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-ch/70">Business development this week</span>
          <span className="num text-ch">{bdHours.toFixed(1)} hrs</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-ch/70">Remaining capacity this week</span>
          <span className="num text-ch">{remaining.toFixed(1)} hrs</span>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-white p-5">
        <h3 className="font-display text-lg text-ch">Revenue picture</h3>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <Stat label="Annual revenue at billed rate" value={fmtUsd(annualRevenue)} />
          <Stat label="Annual revenue at aligned rate" value={fmtUsd(c.alignedRate * c.annualBillableHrs)} />
        </div>
        <p className="mt-3 text-xs text-ch/50">
          Multi-tab Team / What-if / Project Commitment views are coming next. For now this
          shows planned vs logged at the firm level.
        </p>
      </div>
    </div>
  );
}

/* ───────── Tile: Where Your Rate Goes (Rate Allocation) ───────── */
function AllocationPreview({ c }: { c: ReturnType<typeof calc> }) {
  const total =
    c.perHour.comp +
    c.perHour.opexRecurring +
    c.perHour.opexOneTime +
    c.perHour.marginAbove;
  const segs = [
    { label: "Comp", val: c.perHour.comp, color: "#B8860B" },
    { label: "Recurring", val: c.perHour.opexRecurring, color: "#5C8A6E" },
    { label: "One-time", val: c.perHour.opexOneTime, color: "#C4714A" },
    { label: "Margin", val: c.perHour.marginAbove, color: "#D4A017" },
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-ch/60">Every dollar of {fmtUsd(c.billedRate)}/hr</span>
        <span className="num font-display text-2xl text-ch">{fmtUsd(total)}<span className="text-xs text-ch/40">/hr</span></span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full border border-border">
        {segs.map((s) => (
          <div
            key={s.label}
            title={`${s.label}: ${fmtUsd(s.val, { decimals: 2 })}/hr`}
            style={{ width: total > 0 ? `${(s.val / total) * 100}%` : "0%", backgroundColor: s.color }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-[10px]">
        {segs.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1 text-ch/70">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function AllocationFull({
  c,
  expenses,
}: {
  c: ReturnType<typeof calc>;
  expenses: any[];
}) {
  const segs = [
    { label: "Owner Compensation", val: c.perHour.comp, color: "#B8860B" },
    { label: "Recurring Expenses", val: c.perHour.opexRecurring, color: "#5C8A6E" },
    { label: "One-Time Purchases", val: c.perHour.opexOneTime, color: "#C4714A" },
    { label: "Above-Floor Margin", val: c.perHour.marginAbove, color: "#D4A017" },
  ].filter((s) => s.val > 0);
  const total = segs.reduce((s, x) => s + x.val, 0);
  const oneTimeExpenses = (expenses ?? []).filter((e) => e.frequency === "onetime");
  const breakdown = marginBreakdown(c.perHour.marginAbove);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-white p-6">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-xl text-ch">
            Every {fmtUsd(c.billedRate)} you bill goes to
          </h3>
          <span className="num text-sm text-ch/60">{fmtUsd(total, { decimals: 2 })}/hr accounted</span>
        </div>
        <div className="mt-4 flex h-4 overflow-hidden rounded-full border border-border">
          {segs.map((s) => (
            <div
              key={s.label}
              title={`${s.label}: ${fmtUsd(s.val, { decimals: 2 })}/hr`}
              style={{ width: total > 0 ? `${(s.val / total) * 100}%` : "0%", backgroundColor: s.color }}
            />
          ))}
        </div>
        <ul className="mt-5 space-y-2.5 text-sm">
          {segs.map((s) => (
            <li key={s.label} className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-ch/80">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label}
              </span>
              <span className="num text-ch">
                {fmtUsd(s.val, { decimals: 2 })}/hr
                <span className="ml-2 text-xs text-ch/50">{((s.val / total) * 100).toFixed(0)}%</span>
              </span>
            </li>
          ))}
        </ul>
        {oneTimeExpenses.length > 0 && (
          <div className="mt-5 space-y-1 border-t border-border pt-4 text-xs text-ch/60">
            {oneTimeExpenses.map((e) => {
              const months = e.amort_months ?? 12;
              const perHr = oneTimePerHr({
                amount: Number(e.amount),
                months,
                annualBillableHrs: c.annualBillableHrs,
              });
              return (
                <div key={e.id}>
                  When <span className="text-ch">{e.name}</span> is fully recovered in{" "}
                  <span className="num text-ch">{months}</span> months, your margin increases by{" "}
                  <span className="num text-ch">{fmtUsd(perHr, { decimals: 2 })}/hr</span>.
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-white p-6">
        <h3 className="font-display text-lg text-ch">What your margin can do</h3>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-ch/70">Above-floor margin</span>
            <span className="num text-ch">{fmtUsd(c.perHour.marginAbove, { decimals: 2 })}/hr</span>
          </div>
          <div className="border-t border-border pt-2 text-xs uppercase tracking-wider text-ch/50">
            Suggested use of margin
          </div>
          <BreakdownRow
            label="Tax on profit (est. 25%)"
            value={breakdown.tax}
            tip={{
              term: "Tax on profit",
              definition:
                "A rough estimate for taxes on business profit. Your actual rate depends on your structure and tax bracket. Confirm with your accountant.",
            }}
          />
          <BreakdownRow
            label="Business reserve (10%)"
            value={breakdown.reserve}
            tip={{
              term: "Business reserve",
              definition:
                "Money kept in the business for slow periods, equipment, or unexpected costs. A common target is 3–6 months of operating expenses.",
            }}
          />
          <BreakdownRow
            label="Growth / discretionary"
            value={breakdown.growth}
            tip={{
              term: "Growth / discretionary",
              definition:
                "What's left for one-time investments, growth spending, or additional owner draw. Check this number before committing to a new expense.",
            }}
          />
          <div className="flex justify-between border-t border-border pt-2 font-medium">
            <span className="text-ch">True available profit</span>
            <span className="num font-display text-lg text-ch">
              {fmtUsd(breakdown.available, { decimals: 2 })}/hr
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  tip,
}: {
  label: string;
  value: number;
  tip: { term: string; definition: string };
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-1 text-ch/70">
        {label} <InfoTip {...tip} />
      </span>
      <span className="num text-ch">{fmtUsd(value, { decimals: 2 })}/hr</span>
    </div>
  );
}

/* ───────── (Legacy Growth — kept exported for /dashboard/growth route compatibility) ───────── */
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