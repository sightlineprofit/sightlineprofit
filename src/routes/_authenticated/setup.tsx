import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { ModulePage } from "@/components/shell/ModulePage";
import { InfoTip, GLOSSARY } from "@/components/dashboard/InfoTip";
import { getMyContext, upsertFirmConfig, addExpense, deleteExpense, listExpenses } from "@/lib/firm.functions";
import { calc, fmtUsd, fmtPct, type Expense } from "@/lib/finance";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { cn } from "@/lib/utils";
import { RoleGuard } from "@/lib/role";

export const Route = createFileRoute("/_authenticated/setup")({
  head: () => ({ meta: [{ title: "Rate & Cost Architecture — Sightline" }] }),
  component: GuardedSetup,
});

function GuardedSetup() {
  return (
    <RoleGuard allow={["principal", "admin"]}>
      <SetupPage />
    </RoleGuard>
  );
}

type Section = "comp" | "opex" | "rate";
type Frequency = "annual" | "monthly" | "quarterly" | "onetime";

const sections: { id: Section; label: string }[] = [
  { id: "comp", label: "Owner compensation" },
  { id: "opex", label: "Operating expenses" },
  { id: "rate", label: "Capacity & rate" },
];

const inputCls =
  "w-full rounded-md border border-input bg-white px-3 py-2 text-sm text-ch placeholder:text-ch/30 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 tabular-nums";

function SetupPage() {
  const qc = useQueryClient();
  const ctxFn = useServerFn(getMyContext);
  const expensesFn = useServerFn(listExpenses);
  const saveCfg = useServerFn(upsertFirmConfig);
  const addExp = useServerFn(addExpense);
  const delExp = useServerFn(deleteExpense);

  const { data: ctx } = useQuery({ queryKey: ["me"], queryFn: () => ctxFn() });
  const { data: expensesData } = useQuery({ queryKey: ["expenses"], queryFn: () => expensesFn() });

  // Live-refresh if firm_config or expenses change anywhere (other devices, etc.)
  useRealtimeInvalidate(
    "setup-live",
    [{ table: "firm_config" }, { table: "expenses" }],
    [["me"], ["expenses"], ["dashboard"]],
  );

  // Local draft state mirrors firm_config; debounced autosave.
  const cfg = ctx?.config;
  const [draft, setDraft] = useState({
    comp_draw_annual: "",
    comp_ptax_pct: "",
    comp_health_annual: "",
    comp_retire_annual: "",
    available_hrs_per_week: "",
    target_billable_hrs_per_week: "",
    target_gross_margin_pct: "",
    rate_billed: "",
  });
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!cfg || hydratedRef.current) return;
    setDraft({
      comp_draw_annual: cfg.comp_draw_annual?.toString() ?? "",
      comp_ptax_pct: cfg.comp_ptax_pct?.toString() ?? "",
      comp_health_annual: cfg.comp_health_annual?.toString() ?? "",
      comp_retire_annual: cfg.comp_retire_annual?.toString() ?? "",
      available_hrs_per_week: cfg.available_hrs_per_week?.toString() ?? "",
      target_billable_hrs_per_week: cfg.target_billable_hrs_per_week?.toString() ?? "",
      target_gross_margin_pct: cfg.target_gross_margin_pct?.toString() ?? "",
      rate_billed: cfg.rate_billed?.toString() ?? "",
    });
    hydratedRef.current = true;
  }, [cfg]);

  // Debounced autosave
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function patchDraft(p: Partial<typeof draft>) {
    setDraft((d) => ({ ...d, ...p }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const next = { ...draft, ...p };
      const payload: Record<string, number | null> = {};
      for (const [k, v] of Object.entries(next)) {
        payload[k] = v === "" ? null : Number(v);
        if (payload[k] !== null && !Number.isFinite(payload[k] as number)) payload[k] = null;
      }
      try {
        await saveCfg({ data: payload as never });
        qc.invalidateQueries({ queryKey: ["me"] });
        qc.invalidateQueries({ queryKey: ["dashboard"] });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed");
      }
    }, 800);
  }

  const expenses: Expense[] = (expensesData ?? []) as Expense[];

  // Build effective config object for live calc using draft numbers.
  const liveConfig = useMemo(() => {
    const n = (v: string) => (v === "" ? null : Number(v));
    return {
      comp_draw_annual: n(draft.comp_draw_annual),
      comp_ptax_pct: n(draft.comp_ptax_pct),
      comp_health_annual: n(draft.comp_health_annual),
      comp_retire_annual: n(draft.comp_retire_annual),
      available_hrs_per_week: n(draft.available_hrs_per_week),
      target_billable_hrs_per_week: n(draft.target_billable_hrs_per_week),
      target_gross_margin_pct: n(draft.target_gross_margin_pct),
      rate_billed: n(draft.rate_billed),
      actual_billed_rate: null,
    };
  }, [draft]);

  const c = useMemo(() => calc(liveConfig, expenses), [liveConfig, expenses]);

  const [active, setActive] = useState<Section>("comp");
  const [span, setSpan] = useState<"hr" | "day" | "week" | "month" | "year">("hr");

  const compSubtotal = c.compTotal;
  const opexRecurring = c.opexRecurring;
  const opexOneTime = c.opexOneTime;
  const opexTotal = opexRecurring + opexOneTime;
  const recurringPct = opexTotal > 0 ? (opexRecurring / opexTotal) * 100 : 0;

  const utilizationTarget =
    Number(draft.available_hrs_per_week) > 0
      ? (Number(draft.target_billable_hrs_per_week) / Number(draft.available_hrs_per_week)) * 100
      : 0;
  const budgetRevenue =
    Number(draft.target_billable_hrs_per_week) * 52 * Number(draft.rate_billed || 0);

  const marginAboveFloorHr = c.marginAboveFloor;
  const billableHrsWeek = Number(draft.target_billable_hrs_per_week) || 0;
  const spanFactor = { hr: 1, day: 8, week: billableHrsWeek, month: billableHrsWeek * 4.33, year: billableHrsWeek * 52 }[span];
  const marginAboveFloorSpan = marginAboveFloorHr * spanFactor;
  const targetMarginPct = Number(draft.target_gross_margin_pct) || 0;
  const annualBillableHrs = billableHrsWeek * 52;
  const gapAnnualLoss = c.gapToFloor * annualBillableHrs;

  return (
    <ModulePage
      eyebrow="Foundation"
      title="Rate & cost architecture"
      description="Every input here drives your aligned rate, your dashboard, and your project profitability. Saves automatically as you type."
    >
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* LEFT: inputs */}
        <div className="space-y-6">
          <div className="inline-flex rounded-full border border-border bg-white p-1 text-xs">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={cn(
                  "rounded-full px-4 py-1.5 transition-colors",
                  active === s.id ? "bg-ch text-cream" : "text-ch/70 hover:text-ch",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          {active === "comp" && (
            <Card title="Owner compensation" subtitle="Everything you take out of the firm in a year.">
              <NumberField
                label="Annual salary / owner draw"
                prefix="$"
                value={draft.comp_draw_annual}
                onChange={(v) => patchDraft({ comp_draw_annual: v })}
              />
              <NumberField
                label="Self-employment tax %"
                suffix="%"
                value={draft.comp_ptax_pct}
                onChange={(v) => patchDraft({ comp_ptax_pct: v })}
              />
              <NumberField
                label="Annual health insurance"
                prefix="$"
                value={draft.comp_health_annual}
                onChange={(v) => patchDraft({ comp_health_annual: v })}
              />
              <NumberField
                label="Annual retirement contribution"
                prefix="$"
                value={draft.comp_retire_annual}
                onChange={(v) => patchDraft({ comp_retire_annual: v })}
              />
              <Subtotal label="Compensation subtotal" value={fmtUsd(compSubtotal)} />
            </Card>
          )}

          {active === "opex" && (
            <Card title="Operating expenses" subtitle="Software, marketing, office, insurance — anything the firm pays for.">
              <ExpensesEditor
                expenses={expenses}
                onAdd={async (e) => {
                  try {
                    await addExp({ data: e });
                    qc.invalidateQueries({ queryKey: ["expenses"] });
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Failed");
                  }
                }}
                onDelete={async (id) => {
                  await delExp({ data: { id } });
                  qc.invalidateQueries({ queryKey: ["expenses"] });
                }}
              />
              <div className="mt-6 space-y-2">
                <Subtotal label="Recurring subtotal" value={fmtUsd(opexRecurring)} />
                <Subtotal label="One-time (amortized) subtotal" value={fmtUsd(opexOneTime)} />
                <Subtotal label="Total annual OpEx" value={fmtUsd(opexTotal)} bold />
              </div>
              {opexTotal > 0 && (
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-[11px] uppercase tracking-[0.15em] text-ch/50">
                    <span>Recurring {recurringPct.toFixed(0)}%</span>
                    <span>One-time {(100 - recurringPct).toFixed(0)}%</span>
                  </div>
                  <div className="flex h-2 w-full overflow-hidden rounded-full bg-creamd">
                    <div className="h-full bg-success transition-all" style={{ width: `${recurringPct}%` }} />
                    <div className="h-full bg-terra transition-all" style={{ width: `${100 - recurringPct}%` }} />
                  </div>
                </div>
              )}
            </Card>
          )}

          {active === "rate" && (
            <Card title="Capacity & rate" subtitle="The honest math: how many hours, what margin, and what you charge.">
              <NumberField
                label="Available hours per week"
                value={draft.available_hrs_per_week}
                onChange={(v) => patchDraft({ available_hrs_per_week: v })}
                helper="The total hours you want to work each week — design, admin, client calls, business development, all of it. This is your working week, not just your billable hours. Be honest rather than aspirational. If your realistic week is 40 hours, enter 40."
              />
              <NumberField
                label="Target billable hours per week"
                value={draft.target_billable_hrs_per_week}
                onChange={(v) => patchDraft({ target_billable_hrs_per_week: v })}
                helper="Of your total working hours, how many do you reasonably expect to bill to clients? Not your best week — your average, realistic week. Most designers find that 60–75% of available hours are billable once admin, business development, and non-client work are accounted for. The remaining hours are still real work — they just don't generate direct revenue."
                tip={{
                  term: "Target billable hours per week",
                  definition: "This number drives your aligned rate. Fewer billable hours means each hour has to carry more of the cost load — which raises your floor. Overestimating here produces an aligned rate that looks achievable but isn't, because the hours don't materialize.",
                  why: "When in doubt, enter the number you actually hit most weeks, not the number you're aiming for.",
                }}
              />
              <div>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <label className="block text-xs uppercase tracking-[0.15em] text-ch/50">Target gross margin %</label>
                  <InfoTip
                    term="Target gross margin %"
                    definition="Your aligned rate is calculated to cover your costs AND hit this margin target. Setting it to 0% gives you your break-even rate — enough to survive. Setting it to 30–40% gives you a rate that builds real profit."
                    why="The difference between break-even and your aligned rate is this number doing its job."
                  />
                </div>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={0}
                    value={draft.target_gross_margin_pct}
                    onChange={(e) => patchDraft({ target_gross_margin_pct: e.target.value })}
                    className={cn(inputCls, "pr-9")}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-ch/40">%</span>
                </div>
                <p
                  className="font-sans"
                  style={{ fontSize: "11px", fontWeight: 300, color: "#777", lineHeight: 1.6, marginTop: "4px" }}
                >
                  This builds your profit target into your aligned rate. At 45%, your aligned rate is
                  calculated so that — if you bill at exactly that rate — 45% becomes profit and 55%
                  covers costs. Your margin above floor is separate: it's the buffer between what you
                  charge and what you need to charge. A small buffer isn't a problem as long as your
                  aligned rate already reflects a healthy margin target.
                </p>
              </div>
              <NumberField
                label="Your billed rate ($/hr)"
                prefix="$"
                value={draft.rate_billed}
                onChange={(v) => patchDraft({ rate_billed: v })}
              />

            </Card>
          )}
        </div>

        {/* RIGHT: live output */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.22em] text-gold">Live output</p>
            <h2 className="mt-1 font-display text-2xl tracking-tight">Your numbers</h2>

            <OutputHero
              label="Aligned rate"
              tip={GLOSSARY.alignedRate}
              value={fmtUsd(c.alignedRate, { decimals: 0 })}
              note="Your floor. The minimum you can charge."
            />

            <OutputRow
              label="Billed rate"
              tip={{ term: "Billed rate", definition: "What you actually charge clients per hour." }}
              value={<span className="font-display text-2xl text-gold tabular-nums">{fmtUsd(c.billedRate, { decimals: 0 })}</span>}
            />

            <RateHealthBox
              health={c.rateHealth}
              billed={c.billedRate}
              breakEven={c.breakEvenRate}
              aligned={c.alignedRate}
              gapToBreakEven={c.gapToBreakEven}
              gapToFloor={c.gapToFloor}
              marginAboveFloorSpan={marginAboveFloorSpan}
              targetMarginPct={targetMarginPct}
              gapAnnualLoss={gapAnnualLoss}
              span={span}
              setSpan={setSpan}
            />

            <OutputRow
              label="Break-even rate"
              tip={GLOSSARY.breakEvenRate}
              value={`${fmtUsd(c.breakEvenRate, { decimals: 0 })}/hr`}
            />
            <OutputRow
              label="Annual cost floor"
              tip={{ term: "Annual cost floor", definition: "Total compensation plus operating expenses for one year." }}
              value={fmtUsd(c.totalCost)}
            />
            <OutputRow
              label="Utilization target"
              tip={GLOSSARY.utilizationRate}
              value={fmtPct(utilizationTarget, 0)}
            />
            <OutputRow
              label="Budget revenue"
              tip={{ term: "Budget revenue", definition: "Target billable hours × 52 weeks × billed rate." }}
              value={fmtUsd(budgetRevenue)}
            />
          </div>
          <p className="mt-3 text-xs text-ch/50">Changes save automatically. Dashboard updates immediately.</p>
        </aside>
      </div>
    </ModulePage>
  );
}

/* ── pieces ── */

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-white p-6">
      <h2 className="font-display text-2xl tracking-tight text-ch">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-ch/60">{subtitle}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </div>
  );
}

function NumberField({
  label, value, onChange, prefix, suffix, helper, tip,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  helper?: string;
  tip?: { term: string; definition: string; why?: string };
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <label className="block text-xs uppercase tracking-[0.15em] text-ch/50">{label}</label>
        {tip && <InfoTip {...tip} />}
      </div>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-ch/40">{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          step="any"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputCls, prefix && "pl-7", suffix && "pr-9")}
        />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-ch/40">{suffix}</span>}
      </div>
      {helper && (
        <p
          className="font-sans"
          style={{ fontSize: "11px", fontWeight: 300, color: "#777", lineHeight: 1.6, marginTop: "4px" }}
        >
          {helper}
        </p>
      )}
    </div>
  );
}

function Subtotal({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between border-t border-border pt-3 text-sm", bold && "border-ch/20")}>
      <span className="text-ch/60">{label}</span>
      <span className={cn("tabular-nums", bold ? "font-display text-lg text-ch" : "text-ch")}>{value}</span>
    </div>
  );
}

function OutputHero({ label, tip, value, note }: { label: string; tip: { term: string; definition: string; why?: string }; value: string; note?: string }) {
  return (
    <div className="mt-5 border-b border-border pb-5">
      <div className="flex items-center gap-1.5">
        <span className="text-xs uppercase tracking-[0.18em] text-ch/55">{label}</span>
        <InfoTip {...tip} />
      </div>
      <div className="mt-1 font-display text-4xl tabular-nums text-ch">{value}</div>
      {note && <p className="mt-1 text-xs text-ch/55">{note}</p>}
    </div>
  );
}

function OutputRow({ label, tip, value }: { label: string; tip: { term: string; definition: string; why?: string }; value: React.ReactNode }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5">
        <span className="text-xs uppercase tracking-[0.16em] text-ch/55">{label}</span>
        <InfoTip {...tip} />
      </div>
      <div className="text-sm font-medium tabular-nums text-ch">{value}</div>
    </div>
  );
}

type SpanT = "hr" | "day" | "week" | "month" | "year";
function RateHealthBox({
  health, billed, breakEven, aligned,
  gapToBreakEven, gapToFloor,
  marginAboveFloorSpan, targetMarginPct, gapAnnualLoss,
  span, setSpan,
}: {
  health: "critical" | "below_floor" | "healthy";
  billed: number; breakEven: number; aligned: number;
  gapToBreakEven: number; gapToFloor: number;
  marginAboveFloorSpan: number; targetMarginPct: number; gapAnnualLoss: number;
  span: SpanT; setSpan: (s: SpanT) => void;
}) {
  const pill =
    health === "critical"
      ? { dot: "bg-danger", text: "text-terra", label: "Critical" }
      : health === "below_floor"
        ? { dot: "bg-gold", text: "text-gold", label: "Below your floor" }
        : { dot: "bg-success", text: "text-success", label: "Above your floor" };

  return (
    <div className="mt-4 rounded-md border border-border/60 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-[0.18em] text-ch/50">Rate health</span>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]", pill.text)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", pill.dot)} />
          {pill.label}
        </span>
      </div>

      {health === "critical" && (
        <div className="mt-3 border-l-2 border-terra/70 bg-terra/5 p-3 text-xs text-ch/80 leading-relaxed">
          Your billed rate (<span className="num text-ch">{fmtUsd(billed, { decimals: 0 })}/hr</span>) is
          below your break-even rate (<span className="num text-ch">{fmtUsd(breakEven, { decimals: 0 })}/hr</span>).
          You are not covering your costs. Every hour you bill at this rate costs your business money.
        </div>
      )}
      {health === "below_floor" && (
        <div className="mt-3 border-l-2 border-gold/70 bg-gold/5 p-3 text-xs text-ch/80 leading-relaxed">
          Your billed rate (<span className="num text-ch">{fmtUsd(billed, { decimals: 0 })}/hr</span>) covers your costs
          but falls short of your aligned rate (<span className="num text-ch">{fmtUsd(aligned, { decimals: 0 })}/hr</span>) —
          the minimum needed to reach your {targetMarginPct}% margin target. The gap costs you{" "}
          <span className="num text-terra">{fmtUsd(gapAnnualLoss)}</span> in unreached potential every year.
        </div>
      )}

      {health === "critical" && (
        <div className="mt-3 space-y-1.5 text-sm">
          <Row label="Below break-even by" value={`−${fmtUsd(gapToBreakEven, { decimals: 0 })}/hr`} valueClass="text-terra" />
          <Row label="Below your floor by" value={`−${fmtUsd(gapToFloor, { decimals: 0 })}/hr`} valueClass="text-terra" />
        </div>
      )}
      {health === "below_floor" && (
        <div className="mt-3 space-y-1.5 text-sm">
          <Row label="Break-even rate" value={`${fmtUsd(breakEven, { decimals: 0 })}/hr`} valueClass="text-ch/55" />
          <Row label="Your floor" value={`${fmtUsd(aligned, { decimals: 0 })}/hr`} valueClass="text-gold" />
          <Row label="You're billing" value={`${fmtUsd(billed, { decimals: 0 })}/hr`} valueClass="text-ch" />
          <Row label="Gap to floor" value={`−${fmtUsd(gapToFloor, { decimals: 0 })}/hr`} valueClass="text-terra" />
          <p className="mt-2 text-[11px] text-ch/60 leading-relaxed">
            To reach your {targetMarginPct}% margin target you need to raise your rate by{" "}
            <span className="num text-ch">{fmtUsd(gapToFloor, { decimals: 0 })}/hr</span> or reduce your cost floor.
          </p>
        </div>
      )}
      {health === "healthy" && (
        <>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-[11px] uppercase tracking-[0.16em] text-ch/50">Margin above floor</span>
            <InfoTip {...GLOSSARY.marginAboveFloor} />
            <select
              value={span}
              onChange={(e) => setSpan(e.target.value as SpanT)}
              className="ml-auto rounded border border-border bg-white px-1.5 py-0.5 text-xs text-ch/70"
            >
              <option value="hr">/hr</option>
              <option value="day">/day</option>
              <option value="week">/week</option>
              <option value="month">/month</option>
              <option value="year">/year</option>
            </select>
          </div>
          <div className="mt-1 font-display text-2xl tabular-nums text-success">
            +{fmtUsd(marginAboveFloorSpan)}
          </div>
          <div className="mt-3 space-y-1.5 text-sm">
            <Row label="Break-even rate" value={`${fmtUsd(breakEven, { decimals: 0 })}/hr`} valueClass="text-ch/55" />
            <Row label="Your floor" value={`${fmtUsd(aligned, { decimals: 0 })}/hr`} valueClass="text-ch/55" />
            <Row label="You're billing" value={`${fmtUsd(billed, { decimals: 0 })}/hr`} valueClass="text-ch/55" />
            <Row label="Buffer above floor" value={`+${fmtUsd(billed - aligned, { decimals: 0 })}/hr`} valueClass="text-success" />
          </div>
        </>
      )}
    </div>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ch/65">{label}</span>
      <span className={cn("num tabular-nums", valueClass)}>{value}</span>
    </div>
  );
}

/* ── expenses editor ── */

const CATEGORIES = ["Software", "Marketing", "Office", "Insurance", "Professional", "Team", "Other"] as const;
const FREQS: { value: Frequency; label: string }[] = [
  { value: "annual", label: "Annual" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "onetime", label: "One-time" },
];

function ExpensesEditor({
  expenses, onAdd, onDelete,
}: {
  expenses: Expense[];
  onAdd: (e: { name: string; amount: number; frequency: Frequency; category: string | null; recurring: boolean; amort_months: number | null }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    amount: "",
    frequency: "monthly" as Frequency,
    category: "Software",
    amort_months: "12",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim() || !draft.amount) return;
    const recurring = draft.frequency !== "onetime";
    await onAdd({
      name: draft.name.trim(),
      amount: Number(draft.amount),
      frequency: draft.frequency,
      category: draft.category,
      recurring,
      amort_months: recurring ? null : Number(draft.amort_months) || 12,
    });
    setDraft({ name: "", amount: "", frequency: "monthly", category: "Software", amort_months: "12" });
    setAdding(false);
  }

  return (
    <div>
      <div className="divide-y divide-border rounded-md border border-border">
        {expenses.length === 0 && !adding && (
          <div className="px-4 py-6 text-center text-sm text-ch/50">No expenses yet. Add the first.</div>
        )}
        {expenses.map((e) => {
          const isRecurring = e.frequency !== "onetime";
          return (
            <div key={e.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-ch">{e.name}</div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-ch/55">
                  <span className="capitalize">{e.frequency}</span>
                  {(e as Expense & { category?: string }).category && (
                    <>
                      <span>·</span>
                      <span>{(e as Expense & { category?: string }).category}</span>
                    </>
                  )}
                  {!isRecurring && e.amort_months && <><span>·</span><span>amortized {e.amort_months}mo</span></>}
                </div>
              </div>
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.15em]",
                isRecurring ? "bg-success/10 text-success" : "bg-terra/10 text-terra",
              )}>
                {isRecurring ? "Recurring" : "One-time"}
              </span>
              <span className="w-24 text-right font-display text-base text-ch tabular-nums">{fmtUsd(Number(e.amount))}</span>
              <button onClick={() => onDelete(e.id)} className="text-ch/30 hover:text-danger">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        {adding && (
          <form onSubmit={submit} className="grid grid-cols-12 gap-2 bg-creamd/40 px-4 py-3 text-sm">
            <input
              className={cn(inputCls, "col-span-4")}
              placeholder="Name (e.g. Adobe CC)"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              autoFocus
              required
            />
            <input
              type="number" step="any" min={0}
              className={cn(inputCls, "col-span-2")}
              placeholder="Amount"
              value={draft.amount}
              onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
              required
            />
            <select
              className={cn(inputCls, "col-span-2")}
              value={draft.frequency}
              onChange={(e) => setDraft({ ...draft, frequency: e.target.value as Frequency })}
            >
              {FREQS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <select
              className={cn(inputCls, "col-span-2")}
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {draft.frequency === "onetime" ? (
              <input
                type="number" min={1} max={360}
                className={cn(inputCls, "col-span-1")}
                placeholder="mo"
                title="Amortize over (months)"
                value={draft.amort_months}
                onChange={(e) => setDraft({ ...draft, amort_months: e.target.value })}
              />
            ) : <div className="col-span-1" />}
            <button type="submit" className="col-span-1 rounded-md bg-gold px-2 text-xs font-medium text-white hover:bg-goldl">
              Add
            </button>
          </form>
        )}
      </div>
      {!adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-gold hover:text-goldl"
        >
          <Plus className="h-4 w-4" /> Add expense
        </button>
      )}
    </div>
  );
}