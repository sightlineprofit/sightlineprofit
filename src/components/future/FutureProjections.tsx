import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  calcBonusAffordability,
  calcFeeIncreaseScenario,
  calcRaiseImpact,
  calcTeamHireScenario,
  calcVolumeScenario,
} from "@/lib/goals";
import { fmtUsd } from "@/lib/finance";
import type { FutureProjectionInputs } from "@/lib/goals.functions";
import { cn } from "@/lib/utils";

type Props = {
  data: FutureProjectionInputs;
};

export function FutureProjections({ data }: Props) {
  const { calc: c, averageProjectFee, hoursPerProject, ytdRevenueCollected, teamMembers, ownerSalary } =
    data;
  const marginPct = Number(c.grossMarginPct) || 35;
  const targetMargin = marginPct > 0 ? marginPct : 35;
  const now = new Date();
  const currentMonth = now.getMonth() + 1;

  const [minFee, setMinFee] = useState(Math.min(75_000, Math.max(15_000, averageProjectFee)));
  const [volume, setVolume] = useState(8);
  const [hireCost, setHireCost] = useState(63_000);
  const [hireRole, setHireRole] = useState("Coordinator");

  const [bonusMode, setBonusMode] = useState<"team" | "owner">("team");
  const [bonusAmounts, setBonusAmounts] = useState<Record<string, number>>({});
  const [ownerBonus, setOwnerBonus] = useState(0);

  const [raiseMode, setRaiseMode] = useState<"team" | "owner">("team");
  const [raiseAmounts, setRaiseAmounts] = useState<Record<string, number>>({});
  const [ownerRaise, setOwnerRaise] = useState(0);
  const [raiseEffective, setRaiseEffective] = useState<"this_year" | "next_year">("next_year");

  const feeScenario = useMemo(
    () =>
      calcFeeIncreaseScenario({
        currentMinFee: averageProjectFee,
        newMinFee: minFee,
        projectsPerYear: volume,
        currentAnnualRevenue: c.annualRevenue,
        annualRevenueTarget: c.annualRevenue,
      }),
    [averageProjectFee, minFee, volume, c.annualRevenue],
  );

  const volumeScenario = useMemo(
    () =>
      calcVolumeScenario({
        projectsPerYear: volume,
        averageProjectFee: minFee,
        annualBillableHrs: c.annualBillableHrs,
        hoursPerProject,
      }),
    [volume, minFee, c.annualBillableHrs, hoursPerProject],
  );

  const hireScenario = useMemo(
    () =>
      calcTeamHireScenario({
        burdenedAnnualCost: hireCost,
        currentCostFloor: c.totalCost,
        annualBillableHrs: c.annualBillableHrs,
        targetMarginPct: targetMargin,
        averageProjectFee,
      }),
    [hireCost, c, targetMargin, averageProjectFee],
  );

  const bonusInput = useMemo(() => {
    const amounts =
      bonusMode === "owner"
        ? { owner: ownerBonus }
        : { ...bonusAmounts };
    return calcBonusAffordability({
      bonusAmounts: amounts,
      ytdRevenueCollected,
      totalAnnualCostFloor: c.totalCost,
      targetMarginPct: targetMargin,
      paymentTiming: "end_of_year",
    });
  }, [bonusMode, bonusAmounts, ownerBonus, ytdRevenueCollected, c.totalCost, targetMargin]);

  const raiseInput = useMemo(() => {
    const amounts =
      raiseMode === "owner" ? { owner: ownerRaise } : { ...raiseAmounts };
    const meta: Record<string, { name: string; salary: number }> = {};
    for (const m of teamMembers) meta[m.id] = { name: m.name, salary: m.salary };
    if (raiseMode === "owner") meta.owner = { name: "Owner", salary: ownerSalary };
    return calcRaiseImpact({
      raiseAmounts: amounts,
      currentCostFloor: c.totalCost,
      currentAlignedRate: c.alignedRate,
      annualBillableHrs: c.annualBillableHrs,
      targetMarginPct: targetMargin,
      averageProjectFee,
      effectiveDate: raiseEffective,
      currentMonth,
      memberMeta: meta,
    });
  }, [
    raiseMode,
    raiseAmounts,
    ownerRaise,
    teamMembers,
    ownerSalary,
    c,
    targetMargin,
    averageProjectFee,
    raiseEffective,
    currentMonth,
  ]);

  return (
    <div className="space-y-10 pt-2">
      <ScenarioBlock title="What if I raised my minimum project fee?">
        <SliderRow label="Minimum fee" min={15000} max={75000} step={1000} value={minFee} onChange={setMinFee} format={fmtUsd} />
        <ResultGrid
          rows={[
            ["Projected revenue", fmtUsd(feeScenario.projectedRevenue)],
            ["Change vs today", fmtUsd(feeScenario.delta)],
            ["Projects at this fee", String(volume)],
          ]}
        />
      </ScenarioBlock>

      <ScenarioBlock title="What if I took more or fewer projects?">
        <SliderRow label="Projects per year" min={4} max={20} step={1} value={volume} onChange={setVolume} />
        <ResultGrid
          rows={[
            ["Revenue", fmtUsd(volumeScenario.revenue)],
            ["Hours required", `${Math.round(volumeScenario.hoursRequired)} hrs`],
            [
              "Capacity",
              volumeScenario.overCapacity ? "Over annual capacity" : "Within capacity",
            ],
          ]}
        />
        {volumeScenario.overCapacity && (
          <p className="mt-2 font-sans text-xs text-terra">Projected hours exceed your annual productive hours.</p>
        )}
      </ScenarioBlock>

      <ScenarioBlock title="What if I hired a team member?">
        <input
          className="mb-2 w-full rounded-md border border-border px-3 py-2 font-sans text-sm"
          value={hireRole}
          onChange={(e) => setHireRole(e.target.value)}
          placeholder="Role name"
        />
        <SliderRow label="Burdened annual cost" min={40000} max={120000} step={1000} value={hireCost} onChange={setHireCost} format={fmtUsd} />
        <ResultGrid
          rows={[
            ["New cost floor", fmtUsd(hireScenario.newCostFloor)],
            ["New aligned rate", `${fmtUsd(hireScenario.newAlignedRate)}/hr`],
            ["Extra revenue needed", fmtUsd(hireScenario.additionalRevenue)],
            ["Equivalent projects", hireScenario.projects.toFixed(1)],
          ]}
        />
      </ScenarioBlock>

      <ScenarioBlock title="Year-end bonus" subtitle="See what the firm can responsibly pay as a bonus without eroding margin.">
        <TwoCol
          left={
            <>
              <PillToggle
                options={[
                  ["team", "My team"],
                  ["owner", "Just me (owner bonus)"],
                ]}
                value={bonusMode}
                onChange={(v) => setBonusMode(v as "team" | "owner")}
              />
              {bonusMode === "team" ? (
                <div className="mt-3 space-y-2">
                  {teamMembers.map((m) => (
                    <BonusRow
                      key={m.id}
                      name={m.name}
                      salary={m.salary}
                      value={bonusAmounts[m.id] ?? 0}
                      onChange={(amt) => setBonusAmounts((b) => ({ ...b, [m.id]: amt }))}
                    />
                  ))}
                  <p className="font-sans text-xs font-medium text-ch">
                    Total bonus payout: {fmtUsd(bonusInput.totalBonusAmount)}
                  </p>
                </div>
              ) : (
                <CurrencyInput label="Owner bonus amount" value={ownerBonus} onChange={setOwnerBonus} />
              )}
            </>
          }
          right={
            <>
              <p className="font-sans text-[9px] uppercase text-muted-lt">Can you afford this?</p>
              <ResultGrid
                className="mt-3"
                rows={[
                  ["Total bonus payout", fmtUsd(bonusInput.totalBonusAmount)],
                  [
                    "Available profit this year",
                    fmtUsd(bonusInput.availableProfit),
                    profitColor(bonusInput),
                  ],
                  ["Remaining after bonus", fmtUsd(bonusInput.remainingAfterBonus), profitColor(bonusInput)],
                ]}
              />
              <p className="mt-3 font-display text-[13px] italic leading-relaxed text-muted">
                {bonusVerdict(bonusInput)}
              </p>
              <p className="mt-2 font-sans text-[10px] italic text-muted-lt">
                Bonuses are taxable income. Budget ~7.65% employer payroll tax on team bonuses.
              </p>
            </>
          }
        />
        <p className="mt-3 font-sans text-[10px] italic text-muted-lt">
          Based on collected revenue and estimated costs — confirm with your bookkeeper before finalizing.
        </p>
      </ScenarioBlock>

      <ScenarioBlock title="Raise planning" subtitle="See how a raise affects cost floor and aligned rate.">
        <TwoCol
          left={
            <>
              <PillToggle
                options={[
                  ["team", "My team"],
                  ["owner", "My own salary"],
                ]}
                value={raiseMode}
                onChange={(v) => setRaiseMode(v as "team" | "owner")}
              />
              <PillToggle
                className="mt-2"
                options={[
                  ["this_year", "Immediately (this year)"],
                  ["next_year", "January (next year)"],
                ]}
                value={raiseEffective}
                onChange={(v) => setRaiseEffective(v as "this_year" | "next_year")}
              />
              {raiseMode === "team" ? (
                <div className="mt-3 space-y-3">
                  {teamMembers.map((m) => (
                    <RaiseRow
                      key={m.id}
                      name={m.name}
                      salary={m.salary}
                      value={raiseAmounts[m.id] ?? 0}
                      onChange={(amt) => setRaiseAmounts((r) => ({ ...r, [m.id]: amt }))}
                    />
                  ))}
                </div>
              ) : (
                <CurrencyInput label="Annual raise amount" value={ownerRaise} onChange={setOwnerRaise} className="mt-3" />
              )}
            </>
          }
          right={
            <>
              <p className="font-sans text-[9px] uppercase text-muted-lt">What this costs</p>
              <ResultGrid
                className="mt-3"
                rows={[
                  ["Annual cost increase", fmtUsd(raiseInput.burdenedRaiseCost)],
                  ["New cost floor", fmtUsd(raiseInput.newAnnualCostFloor)],
                  [
                    "New aligned rate",
                    `${fmtUsd(raiseInput.newAlignedRate)}/hr (+${fmtUsd(raiseInput.alignedRateDelta)}/hr)`,
                  ],
                  ["Additional revenue needed", fmtUsd(raiseInput.additionalRevenueNeeded)],
                  [
                    "Equivalent in projects",
                    raiseInput.equivalentProjects >= 1
                      ? `${raiseInput.equivalentProjects.toFixed(1)} projects`
                      : `${fmtUsd(raiseInput.additionalPerProject)} per project`,
                  ],
                ]}
              />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <CompareCard title="Current" cost={c.totalCost} rate={c.alignedRate} />
                <CompareCard title="After raise" cost={raiseInput.newAnnualCostFloor} rate={raiseInput.newAlignedRate} highlight />
              </div>
              {raiseInput.alignedRateDelta > 10 && (
                <div className="mt-3 border-l-2 border-gold bg-gold/5 px-3 py-2 font-sans text-xs leading-relaxed text-[#7a5c1e]">
                  At {fmtUsd(raiseInput.newAlignedRate)}/hr, review project fees below this rate after the raise.{" "}
                  <Link to="/sightline" className="underline">
                    Review project fees →
                  </Link>
                </div>
              )}
            </>
          }
        />
      </ScenarioBlock>
    </div>
  );
}

function ScenarioBlock({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-white p-5 shadow-sm">
      <h3 className="font-sans text-sm font-medium text-ch">{title}</h3>
      {subtitle && <p className="mt-1 font-sans text-xs italic text-muted-lt">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format = (n: number) => String(n),
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (n: number) => void;
  format?: (n: number) => string;
}) {
  return (
    <div className="mb-3">
      <div className="flex justify-between font-sans text-xs text-muted">
        <span>{label}</span>
        <span className="text-ch">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full"
      />
    </div>
  );
}

function ResultGrid({
  rows,
  className,
}: {
  rows: [string, string, string?][];
  className?: string;
}) {
  return (
    <div className={cn("space-y-2 rounded-lg border border-border bg-white px-4 py-3", className)}>
      {rows.map(([label, value, colorClass]) => (
        <div key={label} className="flex justify-between gap-4 font-sans text-xs">
          <span className="text-ch/70">{label}</span>
          <span className={cn("font-display text-sm font-normal text-ch", colorClass)}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function TwoCol({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>{left}</div>
      <div className="rounded-lg bg-cream p-4">{right}</div>
    </div>
  );
}

function PillToggle({
  options,
  value,
  onChange,
  className,
}: {
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "rounded-full px-3 py-1 font-sans text-[11px]",
            value === v ? "bg-ch text-cream" : "border border-border text-muted",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function CurrencyInput({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  className?: string;
}) {
  return (
    <label className={cn("block font-sans text-xs", className)}>
      {label}
      <input
        type="number"
        className="mt-1 w-full rounded-md border border-border px-2 py-1.5"
        value={value || ""}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </label>
  );
}

function BonusRow({
  name,
  salary,
  value,
  onChange,
}: {
  name: string;
  salary: number;
  value: number;
  onChange: (n: number) => void;
}) {
  const [pctMode, setPctMode] = useState(false);
  const [pct, setPct] = useState(0);
  return (
    <div className="flex items-center justify-between gap-2 font-sans text-xs">
      <span className="text-ch">{name}</span>
      <button type="button" className="text-muted-lt underline" onClick={() => setPctMode((p) => !p)}>
        {pctMode ? "$" : "%"}
      </button>
      {pctMode ? (
        <input
          type="number"
          className="w-20 rounded border border-border px-1 py-0.5"
          value={pct || ""}
          onChange={(e) => {
            const p = Number(e.target.value) || 0;
            setPct(p);
            onChange((salary * p) / 100);
          }}
        />
      ) : (
        <input
          type="number"
          className="w-24 rounded border border-border px-1 py-0.5"
          value={value || ""}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
        />
      )}
    </div>
  );
}

function RaiseRow({
  name,
  salary,
  value,
  onChange,
}: {
  name: string;
  salary: number;
  value: number;
  onChange: (n: number) => void;
}) {
  const [pctMode, setPctMode] = useState(false);
  return (
    <div className="font-sans text-xs">
      <div className="flex justify-between">
        <span className="font-medium text-ch">{name}</span>
        <button type="button" className="text-muted-lt underline" onClick={() => setPctMode((p) => !p)}>
          {pctMode ? "$ increase" : "% increase"}
        </button>
      </div>
      <p className="text-muted-lt">Current: {fmtUsd(salary)}/yr</p>
      {pctMode ? (
        <input
          type="number"
          className="mt-1 w-full rounded border border-border px-2 py-1"
          placeholder="%"
          onChange={(e) => onChange((salary * (Number(e.target.value) || 0)) / 100)}
        />
      ) : (
        <input
          type="number"
          className="mt-1 w-full rounded border border-border px-2 py-1"
          value={value || ""}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
        />
      )}
      <p className="text-success">→ {fmtUsd(salary + value)}/yr</p>
    </div>
  );
}

function CompareCard({
  title,
  cost,
  rate,
  highlight,
}: {
  title: string;
  cost: number;
  rate: number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg bg-cream p-3 font-sans text-xs text-muted">
      <p className="font-medium text-ch">{title}</p>
      <p>Cost floor: {fmtUsd(cost)}</p>
      <p className={highlight ? "text-gold" : ""}>Aligned rate: {fmtUsd(rate)}/hr</p>
    </div>
  );
}

function profitColor(r: ReturnType<typeof calcBonusAffordability>): string | undefined {
  if (r.totalBonusAmount <= 0) return undefined;
  if (r.availableProfit >= r.totalBonusAmount) return "text-success";
  if (r.affordabilityPct > 0.8) return "text-gold";
  return "text-terra";
}

function bonusVerdict(r: ReturnType<typeof calcBonusAffordability>): string {
  if (r.totalBonusAmount <= 0) return "Enter bonus amounts above to see what the firm can support.";
  if (r.availableProfit <= 0) {
    return "Your firm hasn't generated surplus profit yet this year. Consider timing a bonus after your next project payment clears.";
  }
  if (r.verdictKey === "exceeds") {
    return `A ${fmtUsd(r.totalBonusAmount)} bonus exceeds surplus by ${fmtUsd(r.totalBonusAmount - r.availableProfit)}. You'd need about ${fmtUsd(r.additionalRevenueNeeded)} more in collected revenue.`;
  }
  if (r.verdictKey === "tight") {
    return `This bonus uses ${Math.round(r.affordabilityPct * 100)}% of available profit — doable but thin. Consider ${fmtUsd(r.suggestedAmount)} for a buffer.`;
  }
  return `A ${fmtUsd(r.totalBonusAmount)} bonus is comfortably covered — you'd retain ${fmtUsd(r.remainingAfterBonus)} in surplus.`;
}
