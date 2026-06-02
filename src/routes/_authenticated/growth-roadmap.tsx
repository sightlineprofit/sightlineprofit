import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2, Check, AlertTriangle, X } from "lucide-react";
import { ModulePage } from "@/components/shell/ModulePage";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { calc, fmtPct, fmtUsd, type FirmConfig, type Expense } from "@/lib/finance";
import { InfoTip, GLOSSARY } from "@/components/dashboard/InfoTip";
import {
  getGrowthData,
  saveGrowthScenario,
  deleteScenario,
  saveCapacityIndicator,
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
  // Months until hire: simple model based on pipeline horizon
  const monthlyTeamCapacity = teamTotals.target * 4.33;
  const monthlyPipelineLoad = monthlyTeamCapacity > 0 ? (pipelineWeightedTotal / monthlyTeamCapacity) : 0;
  const monthsToCapacity = teamUtil < 85
    ? Math.max(1, Math.round(((85 - teamUtil) / Math.max(1, monthlyPipelineLoad * 10)) * 6))
    : 0;

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
    return [0, 1, 2, 3].map((y) => ({
      year: y,
      ...projectYear(y, proj, config, expenses, team),
    }));
  }, [proj, config, expenses, team]);

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
          <p className="font-display text-2xl text-ch">
            At current trajectory you are approximately{" "}
            <span className="text-gold">{monthsToCapacity || "—"}</span> months from needing an additional hire.
          </p>
          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-ch/50">Billable capacity used</div>
              <div className="mt-1 num text-2xl text-ch">{fmtPct(teamUtil, 0)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-ch/50">Weighted pipeline</div>
              <div className="mt-1 num text-2xl text-ch">{pipelineWeightedTotal.toFixed(0)} hrs</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-ch/50">
                <span className="inline-flex items-center gap-1">
                  Margin runway <InfoTip term="Margin Runway" definition="How many months your current gross margin could cover a new hire's fully burdened cost." />
                </span>
              </div>
              <div className="mt-1 num text-2xl text-ch">{monthsRunway.toFixed(1)} mo</div>
            </div>
          </div>
          <p className="mt-5 text-xs text-ch/55 italic">
            Sustainable hire threshold: gross margin covers fully burdened hire cost for 6+ months.
          </p>
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

          <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-y-5 gap-x-8 border-t border-border pt-5">
            <Consequence label="Fully burdened weekly cost" value={fmtUsd(hireWeeklyCost)} />
            <Consequence label="New aligned rate" value={fmtUsd(calcAfterHire.alignedRate)} delta={calcAfterHire.alignedRate - baseCalc.alignedRate} />
            <Consequence label="Added billable capacity" value={`${hireBillableHrsAnnual.toFixed(0)} hrs/yr`} />
            <Consequence label="Revenue needed to sustain" value={fmtUsd(revenueNeeded)} />
            <Consequence label="Months of margin runway" value={`${monthsRunway.toFixed(1)} mo`} />
            <Consequence
              label="Break-even after hire"
              value={
                hireBillableHrsAnnual * hire.billableRate >= hireAnnualCost
                  ? `${(hireAnnualCost / (hireBillableHrsAnnual * hire.billableRate || 1) * 12).toFixed(1)} mo`
                  : "Doesn't break even"
              }
            />
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