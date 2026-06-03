import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2, Check, AlertTriangle, X } from "lucide-react";
import { ModulePage } from "@/components/shell/ModulePage";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { calc, fmtPct, fmtUsd, type FirmConfig, type Expense } from "@/lib/finance";
import { InfoTip, GLOSSARY } from "@/components/dashboard/InfoTip";
import {
  getGrowthData,
  saveGrowthScenario,
  deleteScenario,
  saveCapacityIndicator,
  saveGrowthSignals,
} from "@/lib/growth.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/growth-roadmap")({
  head: () => ({ meta: [{ title: "Growth Roadmap — Sightline" }] }),
  component: GrowthRoadmap,
});

const WEEKS_DEFAULT = 48;

type TeamMember = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  billable_rate: number | null;
  cost_rate: number | null;
  expected_hrs_per_week: number | null;
  weeks_per_year: number | null;
  billable_pct: number | null;
};

type PipelineProject = {
  id: string;
  name: string;
  estimated_hrs: number | null;
  probability_pct: number | null;
  assigned_user_ids: string[] | null;
  estimated_start: string | null;
};

type Hire = {
  role: string;
  salary: number;
  benefitsPct: number;
  billablePct: number;
  billableRate: number;
  expectedHrsPerWeek: number;
  rampWeeks: number;
};

type ProjectionInputs = {
  revenueGoal: number;
  rateIncreasePct: number;
  expenseGrowthPct: number;
  utilizationPct: number;
  billedRate: number;
  hire?: Hire | null;
};

type YesNoSometimes = "yes" | "no" | "sometimes" | null;
type PipelineRecency = "lt2" | "lt6" | "gt6" | "unset" | null;
type MarketTiming = "durable" | "growing" | "seasonal" | "uncertain" | null;

type ManualSignals = {
  owner_actual_hrs: number | null;
  client_missing_responses: YesNoSometimes;
  client_milestone_delays: YesNoSometimes;
  client_below_standard: YesNoSometimes;
  owner_production_hrs: number | null;
  owner_leadership_hrs: number | null;
  pipeline_recency: PipelineRecency;
  market_timing: MarketTiming;
  updated_at?: string | null;
};

function normaliseManualSignals(raw: Record<string, unknown>): ManualSignals {
  const num = (k: string): number | null => {
    const v = raw[k];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const str = <T extends string>(k: string, allowed: readonly T[]): T | null => {
    const v = raw[k];
    return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;
  };
  return {
    owner_actual_hrs: num("owner_actual_hrs"),
    client_missing_responses: str("client_missing_responses", ["yes", "no", "sometimes"] as const),
    client_milestone_delays: str("client_milestone_delays", ["yes", "no", "sometimes"] as const),
    client_below_standard: str("client_below_standard", ["yes", "no", "sometimes"] as const),
    owner_production_hrs: num("owner_production_hrs"),
    owner_leadership_hrs: num("owner_leadership_hrs"),
    pipeline_recency: str("pipeline_recency", ["lt2", "lt6", "gt6", "unset"] as const),
    market_timing: str("market_timing", ["durable", "growing", "seasonal", "uncertain"] as const),
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : null,
  };
}

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-14">
      <p className="text-[11px] uppercase tracking-[0.25em] text-gold">{eyebrow}</p>
      <h2 className="mt-1 font-display text-3xl text-ch">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-border bg-white p-6 ${className}`}>{children}</div>;
}

function NumberField({
  label, value, onChange, prefix, suffix, step = 1,
}: { label: string; value: number; onChange: (n: number) => void; prefix?: string; suffix?: string; step?: number }) {
  return (
    <div>
      <Label className="text-[11px] uppercase tracking-[0.18em] text-ch/60">{label}</Label>
      <div className="mt-1 flex items-center gap-1.5">
        {prefix && <span className="text-ch/50 text-sm">{prefix}</span>}
        <Input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          step={step}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="num"
        />
        {suffix && <span className="text-ch/50 text-sm">{suffix}</span>}
      </div>
    </div>
  );
}

function projectYear(
  year: number,
  inputs: ProjectionInputs,
  baseConfig: FirmConfig | null,
  expenses: Expense[],
  baseTeam: TeamMember[],
) {
  const billedRate = inputs.billedRate * Math.pow(1 + inputs.rateIncreasePct / 100, year);
  // capacity = sum(expected_hrs_per_week * utilization%) * weeks
  const team = [...baseTeam];
  let extraHireAnnualCost = 0;
  if (inputs.hire && year >= 1) {
    const h = inputs.hire;
    extraHireAnnualCost = h.salary * (1 + h.benefitsPct / 100);
    team.push({
      id: "hire",
      name: h.role,
      email: "",
      role: "team",
      billable_rate: h.billableRate,
      cost_rate: 0,
      expected_hrs_per_week: h.expectedHrsPerWeek,
      weeks_per_year: WEEKS_DEFAULT,
      billable_pct: h.billablePct,
    });
  }
  const totalWeeklyBillable = team.reduce(
    (s, m) => s + (Number(m.expected_hrs_per_week) || 0) * (inputs.utilizationPct / 100),
    0,
  );
  const annualBillableHrs = totalWeeklyBillable * WEEKS_DEFAULT;
  const annualRevenue = billedRate * annualBillableHrs;

  // Cost floor: scale base + add hire cost
  const baseCalc = calc(baseConfig, expenses, {});
  const baseAnnualCost = baseCalc.totalCost * Math.pow(1 + inputs.expenseGrowthPct / 100, year);
  const annualCost = baseAnnualCost + extraHireAnnualCost;
  const grossMargin = annualRevenue - annualCost;
  const marginPct = annualRevenue > 0 ? (grossMargin / annualRevenue) * 100 : 0;
  const targetGM = Number(baseConfig?.target_gross_margin_pct) || 0;
  const alignedRate =
    annualBillableHrs > 0 && targetGM < 100
      ? annualCost / annualBillableHrs / (1 - targetGM / 100)
      : 0;
  return {
    billedRate, annualBillableHrs, weeklyBillable: totalWeeklyBillable,
    annualRevenue, annualCost, grossMargin, marginPct, alignedRate,
    headcount: team.length, revenueGap: inputs.revenueGoal - annualRevenue,
  };
}

function GrowthRoadmap() {
  const qc = useQueryClient();
  const fetchData = useServerFn(getGrowthData);
  const saveFn = useServerFn(saveGrowthScenario);
  const deleteFn = useServerFn(deleteScenario);
  const { data, isLoading } = useQuery({ queryKey: ["growth"], queryFn: () => fetchData() });

  const team = (data?.team ?? []) as TeamMember[];
  const pipeline = (data?.pipeline ?? []) as PipelineProject[];
  const config = (data?.config ?? null) as FirmConfig | null;
  const expenses = (data?.expenses ?? []) as Expense[];
  const windowWeeks = data?.windowWeeks ?? 12;
  const usageByUser = (data?.usageByUser ?? {}) as Record<string, { billable: number; total: number }>;

  // Capacity rows
  const capacityRows = team.map((m) => {
    const expected = Number(m.expected_hrs_per_week) || 0;
    const billPct = Number(m.billable_pct) || 0;
    const billableTarget = (expected * billPct) / 100;
    const u = usageByUser[m.id];
    const actualWeekly = u ? u.billable / windowWeeks : 0;
    const util = billableTarget > 0 ? (actualWeekly / billableTarget) * 100 : 0;
    return { m, expected, billableTarget, actualWeekly, util };
  });
  const teamTotals = capacityRows.reduce(
    (s, r) => ({
      expected: s.expected + r.expected,
      target: s.target + r.billableTarget,
      actual: s.actual + r.actualWeekly,
    }),
    { expected: 0, target: 0, actual: 0 },
  );
  const teamUtil = teamTotals.target > 0 ? (teamTotals.actual / teamTotals.target) * 100 : 0;

  // Pipeline distribution
  const pipelinePerUser: Record<string, number> = {};
  let pipelineWeightedTotal = 0;
  for (const p of pipeline) {
    const weighted = (Number(p.estimated_hrs) || 0) * ((Number(p.probability_pct) || 0) / 100);
    pipelineWeightedTotal += weighted;
    const ids = p.assigned_user_ids ?? [];
    if (ids.length === 0) continue;
    const per = weighted / ids.length;
    for (const uid of ids) {
      pipelinePerUser[uid] = (pipelinePerUser[uid] || 0) + per;
    }
  }

  // Hiring threshold (interactive hire)
  const [hire, setHire] = useState<Hire>({
    role: "Junior Designer",
    salary: 75000,
    benefitsPct: 22,
    billablePct: 70,
    billableRate: 125,
    expectedHrsPerWeek: 40,
    rampWeeks: 12,
  });

  const baseCalc = useMemo(() => calc(config, expenses, {}), [config, expenses]);
  const hireAnnualCost = hire.salary * (1 + hire.benefitsPct / 100);
  const hireWeeklyCost = hireAnnualCost / WEEKS_DEFAULT;
  const hireBillableHrsAnnual = hire.expectedHrsPerWeek * (hire.billablePct / 100) * WEEKS_DEFAULT;

  // Aligned rate after hire (recompute base calc treating hire cost as extra recurring)
  const calcAfterHire = useMemo(
    () => calc(config, expenses, { extraRecurringAnnual: hireAnnualCost }),
    [config, expenses, hireAnnualCost],
  );
  const monthsRunway = baseCalc.grossProfit > 0 ? (baseCalc.grossProfit / hireAnnualCost) * 12 : 0;
  const revenueNeeded = hireAnnualCost / Math.max(0.0001, (Number(config?.target_gross_margin_pct) || 50) / 100);

  // ── Hiring threshold signal computations ──────────────────────────────
  const weeklyBuckets = (data?.weeklyBuckets ?? []) as Array<{
    weekStart: string; billable: number; total: number;
  }>;
  const weeksWithData = weeklyBuckets.length;
  const hasEnoughTimeData = weeksWithData >= 4;
  const hasActiveProject = pipeline.length > 0 || teamTotals.actual > 0;
  const dataSufficient = hasEnoughTimeData && hasActiveProject && teamUtil > 0;

  // Signal 2 — capacity pressure: last 8 weeks above 85% util
  const last8 = weeklyBuckets.slice(-8);
  const weeklyTargetTeam = teamTotals.target; // hrs/week firm-wide billable target
  const weeksOver85 = weeklyTargetTeam > 0
    ? last8.filter((w) => w.billable / weeklyTargetTeam > 0.85).length
    : 0;

  // Signal 3 — committed workload: weeks until crunch
  const weeklySlack = Math.max(0, weeklyTargetTeam - teamTotals.actual);
  const crunchWeeks = pipelineWeightedTotal > 0 && weeklyTargetTeam > 0
    ? (weeklySlack > 0 ? pipelineWeightedTotal / weeklySlack : 0)
    : Infinity;
  const hasCrunchData = pipelineWeightedTotal > 0 && weeklyTargetTeam > 0;

  // Signal 4 — revenue trajectory: compare first vs second half of last 12 weeks
  const billedRateForTrend = Number(config?.actual_billed_rate) || Number(config?.rate_billed) || 0;
  const trendWeeks = weeklyBuckets.slice(-12);
  let revenueTrendPct = 0;
  let hasTrendData = false;
  if (trendWeeks.length >= 8 && billedRateForTrend > 0) {
    const half = Math.floor(trendWeeks.length / 2);
    const a = trendWeeks.slice(0, half).reduce((s, w) => s + w.billable, 0) / Math.max(1, half);
    const b = trendWeeks.slice(half).reduce((s, w) => s + w.billable, 0) / Math.max(1, trendWeeks.length - half);
    if (a > 0) {
      revenueTrendPct = ((b - a) / a) * 100;
      hasTrendData = true;
    }
  }

  // Signal 5 — manual indicator from firm_config
  const indicatorFromConfig =
    ((config as unknown as { capacity_constrained_indicator?: string } | null)
      ?.capacity_constrained_indicator ?? "unset") as "yes" | "no" | "unsure" | "unset";
  const [indicator, setIndicator] = useState<"yes" | "no" | "unsure" | "unset">(indicatorFromConfig);
  const [syncedIndicator, setSyncedIndicator] = useState(false);
  if (!syncedIndicator && config) {
    setIndicator(indicatorFromConfig);
    setSyncedIndicator(true);
  }
  const saveIndicatorFn = useServerFn(saveCapacityIndicator);
  const indicatorMut = useMutation({
    mutationFn: (v: "yes" | "no" | "unsure") => saveIndicatorFn({ data: { value: v } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["growth"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  // Status helpers
  type SignalStatus = "ready" | "watch" | "no" | "na";
  const sig1Status: SignalStatus =
    monthsRunway >= 6 ? "ready" : monthsRunway >= 3 ? "watch" : "no";
  const sig2Status: SignalStatus = !hasEnoughTimeData || weeklyTargetTeam <= 0
    ? "na"
    : weeksOver85 >= 4 ? "ready" : weeksOver85 >= 2 ? "watch" : "no";
  const sig3Status: SignalStatus = !hasCrunchData
    ? "na"
    : crunchWeeks <= 8 ? "ready" : crunchWeeks <= 16 ? "watch" : "no";
  const sig4Status: SignalStatus = !hasTrendData
    ? "na"
    : revenueTrendPct >= 5 ? "ready" : revenueTrendPct > -5 ? "watch" : "no";
  const sig5Status: SignalStatus = indicator === "yes" ? "ready" : indicator === "unsure" ? "watch" : "no";

  const activeSignals = [sig1Status, sig2Status, sig3Status, sig4Status, sig5Status]
    .filter((s) => s === "ready").length;
  const operationalActive = [sig2Status, sig3Status, sig4Status, sig5Status]
    .filter((s) => s === "ready").length;
  const financiallyReady = sig1Status === "ready";

  // Projection inputs
  const [proj, setProj] = useState<ProjectionInputs>({
    revenueGoal: 500_000,
    rateIncreasePct: 5,
    expenseGrowthPct: 3,
    utilizationPct: 65,
    billedRate: Number(config?.rate_billed) || baseCalc.alignedRate || 150,
    hire: null,
  });

  // Sync the billed rate field when config loads, but only once
  const [syncedRate, setSyncedRate] = useState(false);
  if (!syncedRate && config && proj.billedRate === 150) {
    const r = Number(config.rate_billed) || baseCalc.alignedRate;
    if (r) {
      setProj((p) => ({ ...p, billedRate: r }));
      setSyncedRate(true);
    }
  }

  const projection = useMemo(() => {
    return Array.from({ length: 8 }, (_, y) => ({
      year: y,
      ...projectYear(y, proj, config, expenses, team),
    }));
  }, [proj, config, expenses, team]);

  // Horizon toggle for the financial projection tab
  const [horizonYears, setHorizonYears] = useState<3 | 5 | 7>(3);

  // Refs to scroll to Hire Scenario Builder when recommendation CTA is clicked
  const hireBuilderRef = useRef<HTMLDivElement | null>(null);

  // Growth signals (manual) — persisted in firm_config.growth_signals jsonb
  const persistedSignals =
    ((config as unknown as { growth_signals?: Record<string, unknown> } | null)
      ?.growth_signals ?? {}) as Record<string, unknown>;
  const [manualSignals, setManualSignals] = useState<ManualSignals>(() =>
    normaliseManualSignals(persistedSignals),
  );
  const [syncedManual, setSyncedManual] = useState(false);
  if (!syncedManual && config) {
    setManualSignals(normaliseManualSignals(persistedSignals));
    setSyncedManual(true);
  }
  const saveSignalsFn = useServerFn(saveGrowthSignals);
  const signalsMut = useMutation({
    mutationFn: (patch: Record<string, unknown>) => saveSignalsFn({ data: { patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["growth"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const persistSignals = (patch: Partial<ManualSignals>) => {
    setManualSignals((s) => ({ ...s, ...patch }));
    signalsMut.mutate(patch as Record<string, unknown>);
  };

  // Scenarios
  type ScenarioRow = { id: string; name: string; payload: ProjectionInputs & { kind?: string } };
  const growthScenarios = ((data?.scenarios ?? []) as unknown as ScenarioRow[]).filter(
    (s) => s.payload && s.payload.kind === "growth",
  );
  const [scenarioName, setScenarioName] = useState("");

  const saveMut = useMutation({
    mutationFn: () =>
      saveFn({ data: { name: scenarioName.trim() || `Scenario ${growthScenarios.length + 1}`, payload: { ...proj } } }),
    onSuccess: () => {
      setScenarioName("");
      toast.success("Scenario saved");
      qc.invalidateQueries({ queryKey: ["growth"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["growth"] }),
  });

  if (isLoading) {
    return (
      <ModulePage eyebrow="Roadmap" title="Growth Roadmap">
        <p className="text-ch/60">Loading…</p>
      </ModulePage>
    );
  }

  return (
    <ModulePage
      eyebrow="Roadmap"
      title="Growth Roadmap"
      description="Should we grow — and if so, when, and what does it cost?"
    >
      <Tabs defaultValue="hiring" className="mt-4">
        <TabsList className="bg-cream/40">
          <TabsTrigger value="hiring">Hiring & Growth</TabsTrigger>
          <TabsTrigger value="projection">Financial Projection</TabsTrigger>
        </TabsList>

        <TabsContent value="hiring">
      {/* SECTION 1 */}
      <Section eyebrow="Section 01" title="Capacity & Utilization">
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.18em] text-ch/50">
                  <th className="text-left py-2 font-normal">Member</th>
                  <th className="text-right py-2 font-normal">Hrs/wk</th>
                  <th className="text-right py-2 font-normal">Billable target</th>
                  <th className="text-right py-2 font-normal">Actual (avg)</th>
                  <th className="text-right py-2 font-normal">
                    <span className="inline-flex items-center gap-1">
                      Utilization <InfoTip {...GLOSSARY.utilizationRate} />
                    </span>
                  </th>
                  <th className="text-right py-2 font-normal">Pipeline (wks)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {capacityRows.map((r) => {
                  const pipeHrs = pipelinePerUser[r.m.id] || 0;
                  const pipeWks = r.billableTarget > 0 ? pipeHrs / r.billableTarget : 0;
                  return (
                    <tr key={r.m.id}>
                      <td className="py-3">
                        <div className="text-ch">{r.m.name || r.m.email}</div>
                        <div className="text-xs text-ch/50 capitalize">{r.m.role}</div>
                      </td>
                      <td className="py-3 text-right num">{r.expected.toFixed(0)}</td>
                      <td className="py-3 text-right num">{r.billableTarget.toFixed(1)}</td>
                      <td className="py-3 text-right num">{r.actualWeekly.toFixed(1)}</td>
                      <td className="py-3 text-right">
                        <span className={`num ${r.util > 90 ? "text-terra" : r.util > 60 ? "text-success" : "text-ch/60"}`}>
                          {fmtPct(r.util, 0)}
                        </span>
                      </td>
                      <td className="py-3 text-right num">{pipeWks.toFixed(1)}</td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-ch/20 font-display text-lg">
                  <td className="py-3 text-ch">Team total</td>
                  <td className="py-3 text-right num">{teamTotals.expected.toFixed(0)}</td>
                  <td className="py-3 text-right num">{teamTotals.target.toFixed(1)}</td>
                  <td className="py-3 text-right num">{teamTotals.actual.toFixed(1)}</td>
                  <td className="py-3 text-right num text-gold">{fmtPct(teamUtil, 0)}</td>
                  <td className="py-3 text-right num">
                    {teamTotals.target > 0 ? (pipelineWeightedTotal / teamTotals.target).toFixed(1) : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-ch/50 italic">
            Actuals averaged over the last {windowWeeks} weeks. Pipeline weighted by probability.
          </p>
        </Card>
      </Section>

      {/* SECTION 2 */}
      <Section eyebrow="Section 02" title="Hiring Threshold">
        <Card className="mb-6">
          {!dataSufficient ? (
            <div>
              <p className="font-display text-2xl text-ch">
                Not enough data to project a hiring timeline.
              </p>
              <p className="mt-2 text-sm text-ch/65 max-w-2xl">
                The hiring threshold calculation needs at least 4 weeks of time entries
                and at least one active project to produce a meaningful estimate.
              </p>
              <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-ch/50">
                    <span className="inline-flex items-center gap-1">
                      Margin runway
                      <InfoTip term="Margin Runway" definition="How many months your current gross margin could cover a new hire's fully burdened cost." />
                    </span>
                  </div>
                  <div className="mt-1 num text-2xl text-ch">
                    {baseCalc.grossProfit > 0 ? `${monthsRunway.toFixed(1)} mo` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-ch/50">Weeks of time entry data</div>
                  <div className="mt-1 num text-2xl text-ch">{weeksWithData}</div>
                </div>
              </div>
              <p className="mt-5 text-xs text-ch/55 italic">
                Sustainable hire threshold: gross margin covers fully burdened hire cost for 6+ months,
                supported by sustained operational pressure.
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-baseline justify-between gap-4 flex-wrap">
                <h3 className="font-display text-2xl text-ch">Hire readiness signals</h3>
                <div className="text-sm text-ch/60">
                  <span className="num text-gold text-2xl mr-2">{activeSignals}</span>
                  of 5 signals active
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <Signal
                  status={sig1Status}
                  label="Can you afford it?"
                  primary={`${monthsRunway.toFixed(1)} mo of margin runway`}
                  detail={
                    hire
                      ? `At est. ${fmtUsd(hireWeeklyCost, { decimals: 0 })}/wk for a ${hire.role}`
                      : "Add a hire scenario below to see the financial readiness signal."
                  }
                />
                <Signal
                  status={sig2Status}
                  label="Are you running out of hours?"
                  primary={
                    sig2Status === "na"
                      ? "Need 4+ weeks of time entries"
                      : `${weeksOver85} of last 8 weeks above 85%`
                  }
                  detail="Billable utilization across the team"
                />
                <Signal
                  status={sig3Status}
                  label="Is work piling up?"
                  primary={
                    sig3Status === "na"
                      ? "No pipeline projects assigned"
                      : Number.isFinite(crunchWeeks) && crunchWeeks > 0
                      ? `Capacity crunch projected in ${Math.round(crunchWeeks)} weeks`
                      : "No capacity crunch projected at current workload"
                  }
                  detail="Based on active and pipeline projects, weighted by probability"
                />
                <Signal
                  status={sig4Status}
                  label="Is revenue growing?"
                  primary={
                    sig4Status === "na"
                      ? "Insufficient data"
                      : `${revenueTrendPct >= 0 ? "+" : ""}${revenueTrendPct.toFixed(1)}% revenue change over last ${trendWeeks.length} weeks`
                  }
                  detail="Billable hours × rate, first half vs second half of window"
                />
              </div>

              {/* Signal 5 — manual toggle */}
              <div className="mt-4 rounded-md border border-border bg-cream/30 p-5">
                <div className="flex items-start gap-3">
                  <StatusBadge status={sig5Status} />
                  <div className="flex-1">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-ch/50">
                      Are you turning work away?
                    </div>
                    <div className="mt-1 text-sm text-ch">
                      Are you currently turning down projects or delaying client starts because
                      your team doesn't have capacity?
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-sm">
                      {(["yes", "no", "unsure"] as const).map((v) => (
                        <label key={v} className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="cap-indicator"
                            checked={indicator === v}
                            onChange={() => {
                              setIndicator(v);
                              indicatorMut.mutate(v);
                            }}
                          />
                          <span className="text-ch/80">
                            {v === "yes" ? "Yes — this is happening now"
                              : v === "no" ? "No — capacity isn't the constraint"
                              : "Not sure"}
                          </span>
                        </label>
                      ))}
                    </div>
                    {indicator === "yes" && (
                      <p className="mt-3 text-xs text-ch/65 italic">
                        You've indicated capacity is limiting your ability to take on work. This is
                        the strongest operational signal for a hire regardless of other metrics.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Composite */}
              <div className="mt-6 border-t border-border pt-5">
                <CompositeSummary
                  active={activeSignals}
                  financiallyReady={financiallyReady}
                  operationalActive={operationalActive}
                  strongest={
                    sig5Status === "ready" ? "capacity work being turned away"
                    : sig2Status === "ready" ? "sustained high utilization"
                    : sig3Status === "ready" ? "committed workload exceeding capacity"
                    : sig4Status === "ready" ? "revenue growth"
                    : "financial runway"
                  }
                />
              </div>
            </div>
          )}
        </Card>

        <Card>
          <h3 className="font-display text-xl text-ch mb-4">Model a hypothetical hire</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-[11px] uppercase tracking-[0.18em] text-ch/60">Role</Label>
              <Input value={hire.role} onChange={(e) => setHire({ ...hire, role: e.target.value })} className="mt-1" />
            </div>
            <NumberField label="Annual salary" value={hire.salary} onChange={(n) => setHire({ ...hire, salary: n })} prefix="$" step={1000} />
            <NumberField label="Benefits" value={hire.benefitsPct} onChange={(n) => setHire({ ...hire, benefitsPct: n })} suffix="%" />
            <NumberField label="Hrs/week" value={hire.expectedHrsPerWeek} onChange={(n) => setHire({ ...hire, expectedHrsPerWeek: n })} />
            <NumberField label="Billable" value={hire.billablePct} onChange={(n) => setHire({ ...hire, billablePct: n })} suffix="%" />
            <NumberField label="Billed rate" value={hire.billableRate} onChange={(n) => setHire({ ...hire, billableRate: n })} prefix="$" />
          </div>
          <div className="mt-4">
            <NumberField
              label="Ramp time to full productivity (weeks)"
              value={hire.rampWeeks}
              onChange={(n) => setHire({ ...hire, rampWeeks: Math.max(0, n) })}
            />
            <p className="mt-1 text-xs text-ch/55">
              How long before this person is independently billable? New hires typically take 8–16
              weeks to be fully productive. This affects how long you carry the cost before seeing
              revenue return.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-y-5 gap-x-8 border-t border-border pt-5">
            <Consequence label="Fully burdened weekly cost" value={fmtUsd(hireWeeklyCost)} />
            <Consequence label="New aligned rate" value={fmtUsd(calcAfterHire.alignedRate)} delta={calcAfterHire.alignedRate - baseCalc.alignedRate} />
            <Consequence label="Added billable capacity" value={`${hireBillableHrsAnnual.toFixed(0)} hrs/yr`} />
            <Consequence label="Revenue needed to sustain" value={fmtUsd(revenueNeeded)} />
            <Consequence label="Months of margin runway" value={`${monthsRunway.toFixed(1)} mo`} />
            <RampConsequences hire={hire} hireWeeklyCost={hireWeeklyCost} />
          </div>
        </Card>
      </Section>

      {/* SECTION 3 */}
      <Section eyebrow="Section 03" title="3-Year Projection">
        <Card className="mb-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <NumberField label="Revenue goal" value={proj.revenueGoal} onChange={(n) => setProj({ ...proj, revenueGoal: n })} prefix="$" step={10000} />
            <NumberField label="Rate growth /yr" value={proj.rateIncreasePct} onChange={(n) => setProj({ ...proj, rateIncreasePct: n })} suffix="%" />
            <NumberField label="Expense growth /yr" value={proj.expenseGrowthPct} onChange={(n) => setProj({ ...proj, expenseGrowthPct: n })} suffix="%" />
            <NumberField label="Target utilization" value={proj.utilizationPct} onChange={(n) => setProj({ ...proj, utilizationPct: n })} suffix="%" />
            <NumberField label="Billed rate" value={proj.billedRate} onChange={(n) => setProj({ ...proj, billedRate: n })} prefix="$" />
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-ch/70">
            <input
              type="checkbox"
              checked={!!proj.hire}
              onChange={(e) => setProj({ ...proj, hire: e.target.checked ? hire : null })}
            />
            Include modeled hire starting Year 1
          </label>
        </Card>

        <ProjectionTable rows={projection} />
      </Section>

      {/* SECTION 4 */}
      <Section eyebrow="Section 04" title="Scenario Comparison">
        <Card className="mb-6">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label className="text-[11px] uppercase tracking-[0.18em] text-ch/60">Scenario name</Label>
              <Input
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                placeholder='e.g. "Hire Y1 + 8% rate"'
                className="mt-1"
              />
            </div>
            <Button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || growthScenarios.length >= 3}
              className="bg-gold hover:bg-goldl text-white"
            >
              Save current as scenario
            </Button>
          </div>
          {growthScenarios.length >= 3 && (
            <p className="mt-2 text-xs text-terra">You can compare up to 3 scenarios. Delete one to add another.</p>
          )}
        </Card>

        {growthScenarios.length === 0 ? (
          <p className="text-ch/55 italic">No scenarios saved yet. Configure the inputs above, then save up to three to compare side-by-side.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {growthScenarios.slice(0, 3).map((s) => {
              const rows = [0, 1, 2, 3].map((y) => ({
                year: y,
                ...projectYear(y, s.payload, config, expenses, team),
              }));
              return (
                <div key={s.id} className="rounded-lg border border-border bg-white p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-gold">Scenario</div>
                      <h3 className="font-display text-2xl text-ch">{s.name}</h3>
                    </div>
                    <button
                      onClick={() => delMut.mutate(s.id)}
                      className="text-ch/40 hover:text-danger transition-colors p-1"
                      aria-label="Delete scenario"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <ScenarioMini rows={rows} />
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </ModulePage>
  );
}

function Consequence({ label, value, delta }: { label: string; value: string; delta?: number }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.18em] text-ch/50">{label}</div>
      <div className="mt-1 num text-xl text-ch">{value}</div>
      {delta !== undefined && Number.isFinite(delta) && delta !== 0 && (
        <div className={`text-xs num mt-0.5 ${delta > 0 ? "text-terra" : "text-success"}`}>
          {delta > 0 ? "+" : ""}{fmtUsd(delta)} vs today
        </div>
      )}
    </div>
  );
}

type SigStatus = "ready" | "watch" | "no" | "na";

function StatusBadge({ status }: { status: SigStatus }) {
  if (status === "ready") {
    return (
      <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-success/15 text-success shrink-0">
        <Check className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (status === "watch") {
    return (
      <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-gold/15 text-gold shrink-0">
        <AlertTriangle className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (status === "no") {
    return (
      <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-ch/10 text-ch/40 shrink-0">
        <X className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-ch/5 text-ch/30 shrink-0 text-xs">
      —
    </span>
  );
}

function Signal({
  status, label, primary, detail,
}: { status: SigStatus; label: string; primary: string; detail?: string }) {
  return (
    <div className="rounded-md border border-border bg-white p-4">
      <div className="flex items-start gap-3">
        <StatusBadge status={status} />
        <div className="flex-1">
          <div className="text-[11px] uppercase tracking-[0.18em] text-ch/50">{label}</div>
          <div className="mt-1 text-ch num text-base">{primary}</div>
          {detail && <div className="mt-1 text-xs text-ch/55">{detail}</div>}
        </div>
      </div>
    </div>
  );
}

function CompositeSummary({
  active, financiallyReady, operationalActive, strongest,
}: { active: number; financiallyReady: boolean; operationalActive: number; strongest: string }) {
  let body: React.ReactNode = null;
  if (!financiallyReady && operationalActive >= 3) {
    body = (
      <>
        Operationally you need support but the margin runway isn't there yet. Options:
        raise your rate to accelerate runway, bring in a contractor while you build margin,
        or review whether any current projects can be restructured to improve margin.
      </>
    );
  } else if (active <= 1) {
    body = (
      <>No strong hire signal yet. Monitor utilization and pipeline — revisit when 2 or more signals are active.</>
    );
  } else if (active <= 3) {
    body = (
      <>
        Growing case for a hire. Financially {financiallyReady ? "ready" : "not yet ready"}.
        The strongest signal is {strongest}. Start defining the role so you're ready when the
        remaining signals align.
      </>
    );
  } else {
    body = (
      <>
        Strong hire signal across multiple dimensions. If financially ready, this is the right
        window. Waiting longer risks burnout and lost revenue.
      </>
    );
  }
  return <p className="text-sm text-ch/75 max-w-3xl">{body}</p>;
}

function RampConsequences({
  hire, hireWeeklyCost,
}: { hire: Hire; hireWeeklyCost: number }) {
  const ramp = Math.max(0, hire.rampWeeks);
  const costDuringRamp = hireWeeklyCost * ramp;
  const weeklyRevenue = hire.expectedHrsPerWeek * (hire.billablePct / 100) * hire.billableRate;
  const weeklyNet = weeklyRevenue - hireWeeklyCost;
  const firstBillable = new Date();
  firstBillable.setDate(firstBillable.getDate() + ramp * 7);
  const breakEvenWeeks = weeklyNet > 0 ? ramp + costDuringRamp / weeklyNet : Infinity;
  const productiveWeeks6 = Math.max(0, 26 - ramp);
  const productiveWeeks12 = Math.max(0, 52 - ramp);
  const net6 = productiveWeeks6 * weeklyRevenue - 26 * hireWeeklyCost;
  const net12 = productiveWeeks12 * weeklyRevenue - 52 * hireWeeklyCost;
  return (
    <>
      <Consequence label="Non-productive carry (weeks)" value={`${ramp}`} />
      <Consequence label="Cost during ramp" value={fmtUsd(costDuringRamp)} />
      <Consequence label="First billable week" value={firstBillable.toLocaleDateString()} />
      <Consequence
        label="Break-even after hire"
        value={Number.isFinite(breakEvenWeeks) ? `${(breakEvenWeeks / 4.33).toFixed(1)} mo` : "Doesn't break even"}
      />
      <Consequence label="Net margin at 6 months" value={fmtUsd(net6)} />
      <Consequence label="Net margin at 12 months" value={fmtUsd(net12)} />
    </>
  );
}

type ProjRow = ReturnType<typeof projectYear> & { year: number };

function ProjectionTable({ rows }: { rows: ProjRow[] }) {
  const labels = ["Current", "Year 1", "Year 2", "Year 3"];
  const metrics: { key: keyof ProjRow; label: string; fmt: (v: number) => string; tip?: keyof typeof GLOSSARY }[] = [
    { key: "alignedRate", label: "Aligned rate (floor)", fmt: (v) => fmtUsd(v, { decimals: 0 }), tip: "alignedRate" },
    { key: "billedRate", label: "Billed rate", fmt: (v) => fmtUsd(v, { decimals: 0 }) },
    { key: "weeklyBillable", label: "Billable hrs / week", fmt: (v) => v.toFixed(0) },
    { key: "annualRevenue", label: "Annual revenue", fmt: (v) => fmtUsd(v) },
    { key: "annualCost", label: "Annual cost floor", fmt: (v) => fmtUsd(v) },
    { key: "grossMargin", label: "Gross margin", fmt: (v) => fmtUsd(v), tip: "grossMargin" },
    { key: "marginPct", label: "Margin %", fmt: (v) => fmtPct(v, 1) },
    { key: "headcount", label: "Team headcount", fmt: (v) => v.toFixed(0) },
  ];
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-left py-3 text-[11px] uppercase tracking-[0.18em] text-ch/50 font-normal">Metric</th>
              {labels.map((l, i) => (
                <th
                  key={l}
                  className={`text-right py-3 font-display text-xl ${i === 0 ? "text-ch/60" : "text-ch"}`}
                >
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {metrics.map((m) => (
              <tr key={m.key as string}>
                <td className="py-3.5 text-sm text-ch/75">
                  <span className="inline-flex items-center gap-1.5">
                    {m.label}
                    {m.tip && <InfoTip {...GLOSSARY[m.tip]} />}
                  </span>
                </td>
                {rows.map((r, i) => (
                  <td
                    key={r.year}
                    className={`py-3.5 text-right num text-2xl ${i === 0 ? "text-ch/55" : "text-ch"}`}
                  >
                    {m.fmt(Number(r[m.key]) || 0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ScenarioMini({ rows }: { rows: ProjRow[] }) {
  return (
    <div className="mt-4 space-y-3 text-sm">
      {rows.map((r, i) => (
        <div key={r.year} className="flex items-baseline justify-between border-b border-border pb-2 last:border-b-0">
          <span className="text-[11px] uppercase tracking-[0.18em] text-ch/50">
            {i === 0 ? "Current" : `Year ${i}`}
          </span>
          <div className="text-right">
            <div className="num text-lg text-ch">{fmtUsd(r.annualRevenue)}</div>
            <div className="text-xs text-ch/55 num">{fmtPct(r.marginPct, 0)} margin · {r.headcount} ppl</div>
          </div>
        </div>
      ))}
    </div>
  );
}