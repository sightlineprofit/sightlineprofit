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
import { RoleGuard } from "@/lib/role";

export const Route = createFileRoute("/_authenticated/growth-roadmap")({
  head: () => ({ meta: [{ title: "Growth Roadmap — Sightline" }] }),
  component: GuardedGrowthRoadmap,
});

function GuardedGrowthRoadmap() {
  return (
    <RoleGuard allow={["principal", "admin"]}>
      <GrowthRoadmap />
    </RoleGuard>
  );
}

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
  ownerComp: unknown[] = [],
  teamBurdens: unknown[] = [],
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
  const baseCalc = calc(baseConfig, expenses, {
    ownerComp: ownerComp as any,
    teamProfiles: teamBurdens as any,
  });
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

  const ownerComp = ((data as any)?.ownerComp ?? []) as unknown[];
  const teamBurdens = ((data as any)?.teamBurdens ?? []) as unknown[];
  const baseCalc = useMemo(
    () =>
      calc(config, expenses, {
        ownerComp: ownerComp as any,
        teamProfiles: teamBurdens as any,
      }),
    [config, expenses, ownerComp, teamBurdens],
  );
  const hireAnnualCost = hire.salary * (1 + hire.benefitsPct / 100);
  const hireWeeklyCost = hireAnnualCost / WEEKS_DEFAULT;
  const hireBillableHrsAnnual = hire.expectedHrsPerWeek * (hire.billablePct / 100) * WEEKS_DEFAULT;

  // Aligned rate after hire (recompute base calc treating hire cost as extra recurring)
  const calcAfterHire = useMemo(
    () =>
      calc(config, expenses, {
        extraRecurringAnnual: hireAnnualCost,
        ownerComp: ownerComp as any,
        teamProfiles: teamBurdens as any,
      }),
    [config, expenses, hireAnnualCost, ownerComp, teamBurdens],
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
      </Section>

      {/* SECTION 3 — Growth Signals */}
      <GrowthSignalsSection
        weeklyBuckets={weeklyBuckets}
        weeklyTargetTeam={weeklyTargetTeam}
        weeksWithData={weeksWithData}
        pipelineWeightedTotal={pipelineWeightedTotal}
        pipelineCount={pipeline.length}
        teamActual={teamTotals.actual}
        completedProjects={(data?.completedProjects ?? []) as CompletedProject[]}
        completedPhases={(data?.completedPhases ?? []) as { expectedHrs: number; actualHrs: number }[]}
        projectFlow={(data?.projectFlow ?? { started: 0, completed: 0 }) as { started: number; completed: number }}
        projectStartLag={(data?.projectStartLag ?? []) as { id: string; days: number }[]}
        teamUtil={teamUtil}
        nonBillablePctEstimate={
          teamTotals.expected > 0
            ? Math.max(0, 1 - teamTotals.actual / teamTotals.expected) * 100
            : 0
        }
        targetHrsPerWeek={Number(config?.target_billable_hrs_per_week) || 32}
        manualSignals={manualSignals}
        onPersist={persistSignals}
        onJumpToBuilder={() =>
          hireBuilderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
      />

      {/* SECTION 4 — Hire Scenario Builder */}
      <Section eyebrow="Section 04" title="Hire Scenario Builder">
        <Card>
          <div ref={hireBuilderRef} />
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
        </TabsContent>

        <TabsContent value="projection">
      {/* Financial Projection */}
      <Section eyebrow="Section 01" title="Financial Projection">
        <div className="mb-4 inline-flex rounded-md border border-border bg-white p-1 text-sm">
          {([3, 5, 7] as const).map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setHorizonYears(y)}
              className={`px-3 py-1.5 rounded ${
                horizonYears === y ? "bg-gold text-white" : "text-ch/70 hover:text-ch"
              }`}
            >
              {y} Years
            </button>
          ))}
        </div>
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

        <ProjectionTable
          rows={projection.slice(0, horizonYears + 1)}
          horizonYears={horizonYears}
        />
        {horizonYears === 7 && (
          <p className="mt-3 text-xs text-ch/55 italic max-w-2xl">
            7-year projections carry significant uncertainty. Treat as directional, not
            predictive. Review and recalibrate annually.
          </p>
        )}
      </Section>

      <Section eyebrow="Section 02" title="Scenario Comparison">
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
        </TabsContent>
      </Tabs>
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

function ProjectionTable({ rows, horizonYears = 3 }: { rows: ProjRow[]; horizonYears?: 3 | 5 | 7 }) {
  const labels = ["Current", ...Array.from({ length: rows.length - 1 }, (_, i) => `Year ${i + 1}`)];
  const extended = horizonYears >= 5;
  let cumRev = 0;
  const cumulative = rows.map((r) => (cumRev += r.annualRevenue));
  const valuation = cumulative.map((c) => c * 2);
  type Metric = {
    key: keyof ProjRow | "cumulative" | "valuation";
    label: string;
    fmt: (v: number) => string;
    tip?: keyof typeof GLOSSARY;
    info?: { term: string; definition: string; why?: string };
  };
  const metrics: Metric[] = [
    { key: "alignedRate", label: "Aligned rate (floor)", fmt: (v) => fmtUsd(v, { decimals: 0 }), tip: "alignedRate" },
    { key: "billedRate", label: "Billed rate", fmt: (v) => fmtUsd(v, { decimals: 0 }) },
    { key: "weeklyBillable", label: "Billable hrs / week", fmt: (v) => v.toFixed(0) },
    { key: "annualRevenue", label: "Annual revenue", fmt: (v) => fmtUsd(v) },
    { key: "annualCost", label: "Annual cost floor", fmt: (v) => fmtUsd(v) },
    { key: "grossMargin", label: "Gross margin", fmt: (v) => fmtUsd(v), tip: "grossMargin" },
    { key: "marginPct", label: "Margin %", fmt: (v) => fmtPct(v, 1) },
    { key: "headcount", label: "Team headcount", fmt: (v) => v.toFixed(0) },
  ];
  if (extended) {
    metrics.push({ key: "cumulative", label: "Cumulative revenue", fmt: (v) => fmtUsd(v) });
    metrics.push({
      key: "valuation",
      label: "Indicative firm value (2× revenue)",
      fmt: (v) => fmtUsd(v),
      info: {
        term: "Indicative firm value",
        definition: "A rough valuation reference using a common service-business multiple (2× revenue).",
        why: "Actual valuation depends on profitability, client concentration, team stability, and other factors. Not a formal appraisal.",
      },
    });
  }
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
              <tr key={m.key}>
                <td className="py-3.5 text-sm text-ch/75">
                  <span className="inline-flex items-center gap-1.5">
                    {m.label}
                    {m.tip && <InfoTip {...GLOSSARY[m.tip]} />}
                    {m.info && <InfoTip {...m.info} />}
                  </span>
                </td>
                {rows.map((r, i) => {
                  const v =
                    m.key === "cumulative"
                      ? cumulative[i]
                      : m.key === "valuation"
                      ? valuation[i]
                      : (Number(r[m.key as keyof ProjRow]) || 0);
                  return (
                    <td
                      key={r.year}
                      className={`py-3.5 text-right num text-2xl ${i === 0 ? "text-ch/55" : "text-ch"}`}
                    >
                      {m.fmt(v)}
                    </td>
                  );
                })}
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

// ─── Growth Signals Assessment ───────────────────────────────────────────

type CompletedProject = {
  id: string;
  name: string;
  fee: number;
  timeCost: number;
  margin: number;
  expectedHrs: number;
  actualHrs: number;
  closedAt: string;
};

type SignalLevel = "active" | "watch" | "no" | "na";

function signalChrome(level: SignalLevel) {
  if (level === "active") return { bg: "bg-terra/15", text: "text-terra", label: "✓ Active signal" };
  if (level === "watch") return { bg: "bg-gold/15", text: "text-gold", label: "◎ Watch this" };
  if (level === "no") return { bg: "bg-cream/60", text: "text-ch/60", label: "— No signal" };
  return { bg: "bg-ch/10", text: "text-ch/60", label: "? Needs input" };
}

function SignalCardUI({
  letter, title, measures, level, primary, insight, children,
}: {
  letter: string;
  title: string;
  measures: string;
  level: SignalLevel;
  primary?: string;
  insight?: string;
  children?: React.ReactNode;
}) {
  const c = signalChrome(level);
  return (
    <div className="rounded-md border border-border bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-ch/40">Signal {letter}</div>
          <h4 className="mt-0.5 font-display text-lg text-ch">{title}</h4>
          <p className="text-xs text-ch/55 mt-1">{measures}</p>
        </div>
        <span className={`text-[11px] px-2 py-1 rounded ${c.bg} ${c.text} whitespace-nowrap`}>{c.label}</span>
      </div>
      {primary && <div className="mt-3 text-ch num text-base">{primary}</div>}
      {children && <div className="mt-3">{children}</div>}
      {insight && <p className="mt-3 text-xs text-ch/65 italic leading-relaxed">{insight}</p>}
    </div>
  );
}

function GrowthSignalsSection(props: {
  weeklyBuckets: { weekStart: string; billable: number; total: number }[];
  weeklyTargetTeam: number;
  weeksWithData: number;
  pipelineWeightedTotal: number;
  pipelineCount: number;
  teamActual: number;
  completedProjects: CompletedProject[];
  completedPhases: { expectedHrs: number; actualHrs: number }[];
  projectFlow: { started: number; completed: number };
  projectStartLag: { id: string; days: number }[];
  teamUtil: number;
  nonBillablePctEstimate: number;
  targetHrsPerWeek: number;
  manualSignals: ManualSignals;
  onPersist: (patch: Partial<ManualSignals>) => void;
  onJumpToBuilder: () => void;
}) {
  const {
    weeklyBuckets, weeklyTargetTeam, weeksWithData,
    pipelineWeightedTotal, pipelineCount, teamActual,
    completedProjects, completedPhases, projectFlow, projectStartLag,
    teamUtil, nonBillablePctEstimate, targetHrsPerWeek,
    manualSignals, onPersist, onJumpToBuilder,
  } = props;

  // A — Capacity Pressure
  const last8 = weeklyBuckets.slice(-8);
  const weeksOver85 = weeklyTargetTeam > 0
    ? last8.filter((w) => w.billable / weeklyTargetTeam > 0.85).length
    : 0;
  const aLevel: SignalLevel = weeksWithData < 4 || weeklyTargetTeam <= 0
    ? "na" : weeksOver85 >= 4 ? "active" : weeksOver85 >= 2 ? "watch" : "no";

  // B — Committed Workload Horizon
  const weeklySlack = Math.max(0, weeklyTargetTeam - teamActual);
  const crunchWeeks = pipelineWeightedTotal > 0 && weeklyTargetTeam > 0 && weeklySlack > 0
    ? pipelineWeightedTotal / weeklySlack : Infinity;
  const bLevel: SignalLevel = pipelineWeightedTotal <= 0 || weeklyTargetTeam <= 0
    ? "na"
    : crunchWeeks <= 8 ? "active" : crunchWeeks <= 16 ? "watch" : "no";

  // C — Project Profit Trend (by quarter)
  const byQuarter: Record<string, { fee: number; margin: number; n: number }> = {};
  for (const p of completedProjects) {
    if (!p.closedAt) continue;
    const d = new Date(p.closedAt + "T00:00:00Z");
    const q = `${d.getUTCFullYear()}Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
    if (!byQuarter[q]) byQuarter[q] = { fee: 0, margin: 0, n: 0 };
    byQuarter[q].fee += p.fee;
    byQuarter[q].margin += p.margin;
    byQuarter[q].n += 1;
  }
  const qSeries = Object.entries(byQuarter).sort(([a], [b]) => (a < b ? -1 : 1));
  let cTrend: "improving" | "stable" | "declining" = "stable";
  if (qSeries.length >= 2) {
    const margins = qSeries.map(([, v]) => (v.n > 0 ? v.margin / v.n : 0));
    const last = margins[margins.length - 1];
    const prev = margins[margins.length - 2];
    const prevPrev = margins[margins.length - 3] ?? null;
    if (last < prev && (prevPrev === null || prev < prevPrev)) cTrend = "declining";
    else if (last > prev) cTrend = "improving";
  }
  const avgMargin = completedProjects.length > 0
    ? completedProjects.reduce((s, p) => s + p.margin, 0) / completedProjects.length
    : 0;
  const avgFee = completedProjects.length > 0
    ? completedProjects.reduce((s, p) => s + p.fee, 0) / completedProjects.length
    : 0;
  const avgMarginPct = avgFee > 0 ? (avgMargin / avgFee) * 100 : 0;
  const cLevel: SignalLevel = completedProjects.length < 3
    ? "na" : cTrend === "declining" ? "active" : "no";

  // D — Scope creep
  const phaseExpected = completedPhases.reduce((s, p) => s + p.expectedHrs, 0);
  const phaseActual = completedPhases.reduce((s, p) => s + p.actualHrs, 0);
  const creepPct = phaseExpected > 0 ? (phaseActual / phaseExpected) * 100 : 0;
  const dLevel: SignalLevel = completedProjects.length < 3 || phaseExpected <= 0
    ? "na" : creepPct > 125 ? "active" : creepPct >= 110 ? "watch" : "no";

  // E — Revenue per available hour (12-week series)
  // Available hrs/week (firm-wide) = weeklyTargetTeam / (target_billable/total) — but we only have target. Approximate available = team weekly target / 0.65.
  const availableWeekly = weeklyTargetTeam > 0 ? weeklyTargetTeam / 0.65 : 0;
  const rphSeries: number[] = [];
  const billedRateApprox = avgFee > 0 && completedProjects.length > 0
    ? completedProjects.reduce((s, p) => s + (p.expectedHrs > 0 ? p.fee / p.expectedHrs : 0), 0) / completedProjects.length
    : 0;
  for (const w of weeklyBuckets.slice(-12)) {
    const rev = w.billable * billedRateApprox;
    rphSeries.push(availableWeekly > 0 ? rev / availableWeekly : 0);
  }
  let eTrend: "improving" | "stable" | "declining" = "stable";
  if (rphSeries.length >= 8) {
    const half = Math.floor(rphSeries.length / 2);
    const a = rphSeries.slice(0, half).reduce((s, v) => s + v, 0) / half;
    const b = rphSeries.slice(half).reduce((s, v) => s + v, 0) / (rphSeries.length - half);
    if (a > 0 && b < a * 0.95) eTrend = "declining";
    else if (a > 0 && b > a * 1.05) eTrend = "improving";
  }
  const rphLatest = rphSeries.length ? rphSeries[rphSeries.length - 1] : 0;
  const eLevel: SignalLevel = rphSeries.length < 8 || availableWeekly <= 0 || billedRateApprox <= 0
    ? "na" : eTrend === "declining" && teamUtil > 75 ? "active" : "no";

  // F — Project flow
  const flowDelta = projectFlow.started - projectFlow.completed;
  const fLevel: SignalLevel = weeksWithData < 12
    ? "na" : flowDelta >= 2 ? "active" : flowDelta === 1 ? "watch" : "no";

  // G — Contract → kickoff lag
  const avgLag = projectStartLag.length > 0
    ? projectStartLag.reduce((s, p) => s + p.days, 0) / projectStartLag.length
    : 0;
  const gLevel: SignalLevel = projectStartLag.length < 5
    ? "na" : avgLag > 28 ? "active" : avgLag >= 14 ? "watch" : "no";

  // H — Owner hours
  const ownerActual = manualSignals.owner_actual_hrs ?? 0;
  const totalTarget = targetHrsPerWeek * 1.2; // billable + 20% admin
  const ownerDelta = ownerActual - totalTarget;
  const ownerDeltaPct = totalTarget > 0 ? (ownerDelta / totalTarget) * 100 : 0;
  const hLevel: SignalLevel = ownerActual <= 0
    ? "na" : ownerDeltaPct >= 20 ? "active" : ownerDeltaPct >= 10 ? "watch" : "no";

  // I — Client experience
  const ce = [manualSignals.client_missing_responses, manualSignals.client_milestone_delays, manualSignals.client_below_standard];
  const ceAnyYes = ce.some((v) => v === "yes");
  const ceAnySometimes = ce.some((v) => v === "sometimes");
  const ceAllAnswered = ce.every((v) => v !== null);
  const iLevel: SignalLevel = !ceAllAnswered ? "na" : ceAnyYes ? "active" : ceAnySometimes ? "watch" : "no";

  // J — Owner role split
  const prod = manualSignals.owner_production_hrs ?? 0;
  const lead = manualSignals.owner_leadership_hrs ?? 0;
  const totalRole = prod + lead;
  const prodPct = totalRole > 0 ? (prod / totalRole) * 100 : 0;
  const jLevel: SignalLevel = totalRole <= 0
    ? "na" : prodPct > 60 ? "active" : prodPct >= 40 ? "watch" : "no";

  // K — Pipeline recency
  const kLevel: SignalLevel = manualSignals.pipeline_recency === "lt2"
    ? "no"
    : manualSignals.pipeline_recency === "lt6"
    ? "watch"
    : "na";

  // L — Market timing
  const lLevel: SignalLevel = manualSignals.market_timing === "durable" || manualSignals.market_timing === "growing"
    ? "active"
    : manualSignals.market_timing === "seasonal" ? "watch"
    : "na";

  const levels: SignalLevel[] = [aLevel, bLevel, cLevel, dLevel, eLevel, fLevel, gLevel, hLevel, iLevel, jLevel, kLevel, lLevel];
  const activeCount = levels.filter((l) => l === "active").length;
  const compositeMsg = activeCount <= 2
    ? "Early stage. Monitor these signals as your workload grows. No hire case yet."
    : activeCount <= 4
    ? "Growing case. Start defining what role would help most and what the hire would cost. Be ready to move when the financials align."
    : activeCount <= 7
    ? "Strong case. Multiple dimensions are pointing toward a hire. If the financial gate is met, this is the right window."
    : "Urgent signal. Your firm is showing strain across most dimensions. Delaying further risks quality, client relationships, and owner wellbeing.";

  // Type-of-hire recommendation
  let hireRec: { headline: string; body: string } | null = null;
  if (dLevel === "active" && jLevel === "active") {
    hireRec = {
      headline: "Consider a project coordinator or studio manager",
      body: "Your signals suggest a project coordinator or studio manager more than a designer. The capacity loss is in administration and oversight, not design hours.",
    };
  } else if (aLevel === "active" && dLevel !== "active") {
    hireRec = {
      headline: "Point toward a design hire",
      body: "Your signals point toward a design hire. Your team is executing efficiently — there simply isn't enough of you.",
    };
  } else if (hLevel === "active" && jLevel === "active") {
    hireRec = {
      headline: "Consider a senior designer to free you",
      body: "Consider whether a senior designer who can work independently would free you to lead rather than execute. The hire isn't about more capacity — it's about the right capacity.",
    };
  } else if (eLevel === "active" && nonBillablePctEstimate > 25) {
    hireRec = {
      headline: "Look at operations or admin first",
      body: "Before hiring, examine whether an operations or admin hire would recover more billable hours from your existing team. The capacity may already exist — it's buried in non-billable overhead.",
    };
  } else if (bLevel === "active" && aLevel !== "active") {
    hireRec = {
      headline: "Start hiring conversations now",
      body: "Your pipeline suggests future demand but your team has current capacity. Start hiring conversations now so you can onboard ahead of the work arriving — not after.",
    };
  }

  const updated = manualSignals.updated_at ? new Date(manualSignals.updated_at).toLocaleDateString() : null;

  return (
    <Section eyebrow="Section 03" title="Growth Signals">
      <p className="mt-[-12px] text-sm text-ch/70 max-w-3xl">
        The signals that tell you you're approaching the gate — before the financials confirm it.
      </p>
      <p className="mt-3 text-sm text-ch/65 max-w-3xl italic">
        The financial threshold tells you whether you can afford to hire. These signals tell you
        whether you need to. A strong hire decision has both.
      </p>

      <Card className="mt-6">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div className="font-display text-2xl text-ch">
            <span className="text-gold num">{activeCount}</span> of {levels.length} signals active
          </div>
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-cream/60 overflow-hidden">
          <div
            className="h-full bg-terra transition-all"
            style={{ width: `${(activeCount / levels.length) * 100}%` }}
          />
        </div>
        <p className="mt-4 text-sm text-ch/75 max-w-3xl">{compositeMsg}</p>
      </Card>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <SignalCardUI
          letter="A"
          title="Are you running out of hours?"
          measures="Weeks in the last 8 where billable utilization exceeded 85% of target."
          level={aLevel}
          primary={aLevel === "na"
            ? "Need 4+ weeks of time entries to assess this signal."
            : `${weeksOver85} of the last 8 weeks above 85% billable utilization`}
          insight={
            aLevel === "active" ? "Your team is consistently near full capacity. Taking on more work at this utilization risks quality and burnout."
            : aLevel === "watch" ? "Utilization is climbing. Worth monitoring week by week."
            : aLevel === "no" ? "Capacity is not currently a constraint."
            : undefined
          }
        />
        <SignalCardUI
          letter="B"
          title="Is work piling up ahead of you?"
          measures="Weeks until projected capacity crunch from active + weighted pipeline workload."
          level={bLevel}
          primary={bLevel === "na"
            ? "Add active projects with phase hours and timelines to assess this signal."
            : Number.isFinite(crunchWeeks) && crunchWeeks > 0
            ? `Capacity crunch projected in ${Math.round(crunchWeeks)} weeks`
            : "No crunch projected at current workload"}
          insight={
            bLevel === "active" ? "Your committed workload will exceed capacity within 2 months. A hire decision made now takes 8–16 weeks to take effect — you are already behind."
            : bLevel === "watch" ? "The crunch is coming but you have time to prepare. Start the hiring process now and you can onboard before it hits."
            : bLevel === "no" ? "Your forward workload is manageable at current team size."
            : undefined
          }
        />
        <SignalCardUI
          letter="C"
          title="Is each project earning less over time?"
          measures="Average profit per completed project, trended quarterly over the last 12 months."
          level={cLevel}
          primary={cLevel === "na"
            ? "Need 3+ completed projects to assess this signal."
            : `Average project margin: ${fmtUsd(avgMargin)} (${avgMarginPct.toFixed(0)}%) · Trend: ${cTrend}`}
          insight={
            cLevel === "active"
              ? "Your profit per project is falling. More projects without addressing the cause will accelerate the decline. Declining margins often indicate a scope, pricing, or systems problem before a staffing problem — resolve the cause before adding headcount."
              : cLevel === "no" ? "Project profitability is holding steady."
              : undefined
          }
        />
        <SignalCardUI
          letter="D"
          title="Is time slipping beyond what you scope?"
          measures="Average ratio of actual to scoped hours across completed phases, last 6 months."
          level={dLevel}
          primary={dLevel === "na"
            ? "Need 3+ completed projects with phase scope and actuals."
            : `Average: ${creepPct.toFixed(0)}% of scoped hours used across ${completedProjects.length} completed projects`}
          insight={
            dLevel === "active"
              ? "Your projects are consistently running over scope. This may mean under-pricing, under-scoping, or scope creep — more staff will not fix this on its own. Resolve the scope discipline first."
              : dLevel === "watch"
              ? "Slight scope creep. Worth reviewing whether it's systematic or project-specific."
              : dLevel === "no" ? "Projects are tracking close to scope. Capacity issues are genuine workload, not time management."
              : undefined
          }
        />
        <SignalCardUI
          letter="E"
          title="Is your time converting to revenue efficiently?"
          measures="Total revenue divided by total available hours (not just billable), trended over 12 weeks."
          level={eLevel}
          primary={eLevel === "na"
            ? "Need more time entries and completed projects to estimate."
            : `${fmtUsd(rphLatest)} per available hour (last 12 weeks) · Trend: ${eTrend}`}
          insight={
            eLevel === "active"
              ? "You're working hard but each hour of available capacity is generating less revenue. This can mean growing non-billable overhead — a systems or staffing structure issue."
              : eLevel === "no" ? "Revenue efficiency is holding steady."
              : undefined
          }
        />
        <SignalCardUI
          letter="F"
          title="Is your work in progress growing?"
          measures="Projects started minus projects completed over the last 90 days."
          level={fLevel}
          primary={fLevel === "na"
            ? "Need 3 months of project activity to assess."
            : `${projectFlow.started} started · ${projectFlow.completed} completed · WIP ${flowDelta > 0 ? "growing" : flowDelta < 0 ? "reducing" : "stable"}`}
          insight={
            fLevel === "active" ? "More work is starting than finishing. Your backlog is growing — either projects are stalling or the team cannot close at pace with new commitments."
            : fLevel === "watch" ? "Slight accumulation. Monitor whether this trend continues."
            : fLevel === "no" ? "Projects are starting and closing at a healthy pace."
            : undefined
          }
        />
        <SignalCardUI
          letter="G"
          title="How long before new projects can start?"
          measures="Average days between project creation and first time entry, last 6 months."
          level={gLevel}
          primary={gLevel === "na"
            ? "Need 5+ projects with logged time to assess."
            : `Average ${avgLag.toFixed(0)} days from contract to project start`}
          insight={
            gLevel === "active" ? "Clients are waiting more than a month before their project gets started. This signals a backlog and risks client satisfaction."
            : gLevel === "watch" ? "Start times are stretching. Worth tracking."
            : gLevel === "no" ? "Projects are starting promptly after contract."
            : undefined
          }
        />
      </div>

      <div className="mt-10">
        <h3 className="font-display text-2xl text-ch">The signals only you can see</h3>
        <p className="mt-1 text-sm text-ch/65 max-w-3xl">
          These factors don't appear in your data but are often the earliest and most reliable indicators.
        </p>
        {updated && (
          <p className="mt-1 text-xs text-ch/45 italic">Last updated {updated}</p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <SignalCardUI
          letter="H"
          title="Are you working beyond your own target?"
          measures="Your actual weekly hours compared to your target (billable + ~20% admin)."
          level={hLevel}
          primary={ownerActual > 0
            ? `You're working ${ownerDelta >= 0 ? "+" : ""}${ownerDelta.toFixed(0)} hrs above your ${totalTarget.toFixed(0)} hr target on average.`
            : undefined}
          insight={
            hLevel === "active" ? "You are personally absorbing the firm's capacity gap with your own time. This is unsustainable and invisible in your firm's metrics. A hire here isn't growth — it's returning you to a sustainable pace."
            : hLevel === "watch" ? "You're stretching but not yet in the danger zone. Monitor weekly."
            : undefined
          }
        >
          <div className="flex items-end gap-2">
            <NumberField
              label="Actual hrs/week"
              value={manualSignals.owner_actual_hrs ?? 0}
              onChange={(n) => onPersist({ owner_actual_hrs: n })}
              suffix="hrs"
            />
          </div>
        </SignalCardUI>

        <SignalCardUI
          letter="I"
          title="Is the quality of your client experience slipping?"
          measures="Three honest yes/no checks on responsiveness, delivery, and craft."
          level={iLevel}
          insight={
            iLevel === "active" ? "Client experience is already being affected by capacity. This is the signal that matters most for long-term firm health. Act before it affects your reputation."
            : iLevel === "watch" ? "Early signs of strain on quality and responsiveness."
            : undefined
          }
        >
          <div className="space-y-3">
            <YnsRow
              label="Missing or delaying responses to client communications?"
              value={manualSignals.client_missing_responses}
              onChange={(v) => onPersist({ client_missing_responses: v })}
            />
            <YnsRow
              label="Delivering milestones or presentations late?"
              value={manualSignals.client_milestone_delays}
              onChange={(v) => onPersist({ client_milestone_delays: v })}
            />
            <YnsRow
              label="Delivering work below your standard because of time pressure?"
              value={manualSignals.client_below_standard}
              onChange={(v) => onPersist({ client_below_standard: v })}
            />
          </div>
        </SignalCardUI>

        <SignalCardUI
          letter="J"
          title="Are you still doing the work instead of leading it?"
          measures="Split of your hours between production work and leading the business."
          level={jLevel}
          primary={totalRole > 0
            ? `Production ${prodPct.toFixed(0)}% · Leadership ${(100 - prodPct).toFixed(0)}%`
            : undefined}
          insight={
            jLevel === "active" ? "More than half your time is in production. Your firm needs you leading it — not executing within it. A hire at this stage is about unlocking your capacity for higher-value work, not just adding headcount."
            : jLevel === "watch" ? "You're split between roles. As the firm grows this balance needs to shift."
            : undefined
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Production hrs this week"
              value={manualSignals.owner_production_hrs ?? 0}
              onChange={(n) => onPersist({ owner_production_hrs: n })}
              suffix="hrs"
            />
            <NumberField
              label="Leadership hrs this week"
              value={manualSignals.owner_leadership_hrs ?? 0}
              onChange={(n) => onPersist({ owner_leadership_hrs: n })}
              suffix="hrs"
            />
          </div>
        </SignalCardUI>

        <SignalCardUI
          letter="K"
          title="Is your pipeline based on real probability?"
          measures="When you last reviewed and updated probabilities on each pipeline project."
          level={kLevel}
          primary={`Your pipeline currently shows ${pipelineCount} projects at a weighted total of ${pipelineWeightedTotal.toFixed(0)} hours.`}
          insight={
            kLevel === "na" ? "Pipeline data may be outdated. Review project probabilities before using pipeline as a growth signal."
            : undefined
          }
        >
          <div className="space-y-1.5 text-sm">
            {([
              ["lt2", "Within the last 2 weeks — current"],
              ["lt6", "2–6 weeks ago — possibly stale"],
              ["gt6", "Over 6 weeks ago — likely stale"],
              ["unset", "I haven't set probabilities yet"],
            ] as const).map(([v, lbl]) => (
              <label key={v} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="pipeline_recency"
                  checked={manualSignals.pipeline_recency === v}
                  onChange={() => onPersist({ pipeline_recency: v })}
                />
                <span className="text-ch/80">{lbl}</span>
              </label>
            ))}
          </div>
        </SignalCardUI>

        <SignalCardUI
          letter="L"
          title="Is demand a durable trend or a seasonal peak?"
          measures="Your read of current pipeline activity."
          level={lLevel}
          insight={
            lLevel === "watch" && manualSignals.market_timing === "seasonal"
              ? "Hiring into a seasonal peak is one of the most common growth mistakes. If demand is seasonal, consider contractors for peak periods before a permanent hire."
              : undefined
          }
        >
          <div className="space-y-1.5 text-sm">
            {([
              ["durable", "Durable — we consistently have more work than we can handle"],
              ["growing", "Growing — demand has been increasing steadily for 6+ months"],
              ["seasonal", "Seasonal — we're in a busy period that typically slows"],
              ["uncertain", "Uncertain — I'm not sure yet"],
            ] as const).map(([v, lbl]) => (
              <label key={v} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="market_timing"
                  checked={manualSignals.market_timing === v}
                  onChange={() => onPersist({ market_timing: v })}
                />
                <span className="text-ch/80">{lbl}</span>
              </label>
            ))}
          </div>
        </SignalCardUI>
      </div>

      {hireRec && (
        <Card className="mt-8 border-gold/40">
          <div className="text-[11px] uppercase tracking-[0.22em] text-gold">What kind of support do you need?</div>
          <h3 className="mt-1 font-display text-2xl text-ch">{hireRec.headline}</h3>
          <p className="mt-2 text-sm text-ch/75 max-w-3xl">{hireRec.body}</p>
          <Button
            onClick={onJumpToBuilder}
            className="mt-4 bg-gold hover:bg-goldl text-white"
          >
            Run a hire scenario →
          </Button>
        </Card>
      )}
    </Section>
  );
}

function YnsRow({
  label, value, onChange,
}: { label: string; value: YesNoSometimes; onChange: (v: YesNoSometimes) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-ch/80 flex-1">{label}</span>
      <div className="flex gap-1">
        {(["yes", "sometimes", "no"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`px-2 py-1 rounded text-xs capitalize border ${
              value === v
                ? "bg-ch text-cream border-ch"
                : "bg-white text-ch/70 border-border hover:border-ch/40"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}