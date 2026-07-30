import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  fmtUsd,
  formatHours,
  getLeaveScenario,
  calc,
  type FirmLifeEvent,
} from "@/lib/finance";
import { saveMaternityLeaveSavings } from "@/lib/capacity.functions";
import {
  defaultLeaveStartMonth,
  eventLeaveMonths,
  eventLeaveStartMonth,
  getLeaveInsight,
  leaveStartMonthLabel,
  LEAVE_MONTH_NAMES,
  monthsUntilLeaveStart,
  buildLeaveImpactBreakdowns,
  maternityPresetPhases,
  defaultLeavePhases,
  describeLeaveTimeline,
  type LeaveScenarioPhases,
} from "@/lib/leave-insight";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type CalcResult = ReturnType<typeof calc>;

const DEFAULT_SAVINGS = 4000;
const CAPACITY_PRESETS = [25, 50, 75] as const;

type ScenarioSource = "custom" | string;

export function LeaveScenarioTool({
  calcResult,
  existingLeaveEvents,
  firmId,
  savedSavingsPerMonth,
}: {
  calcResult: CalcResult;
  existingLeaveEvents: FirmLifeEvent[];
  firmId: string;
  savedSavingsPerMonth: number | null;
}) {
  const initialSavings = savedSavingsPerMonth ?? DEFAULT_SAVINGS;

  const [source, setSource] = useState<ScenarioSource>("custom");
  const [phases, setPhases] = useState<LeaveScenarioPhases>(() => defaultLeavePhases());
  const [savingsPerMonth, setSavingsPerMonth] = useState(initialSavings);
  const [leaveStartMonth, setLeaveStartMonth] = useState(defaultLeaveStartMonth());
  const [savedSavings, setSavedSavings] = useState(savedSavingsPerMonth);

  const updatePhases = (patch: Partial<LeaveScenarioPhases>) => {
    setSource("custom");
    setPhases((prev) => ({ ...prev, ...patch }));
  };

  const qc = useQueryClient();
  const saveFn = useServerFn(saveMaternityLeaveSavings);

  const saveMutation = useMutation({
    mutationFn: () => saveFn({ data: { firmId, amount: savingsPerMonth } }),
    onSuccess: () => {
      setSavedSavings(savingsPerMonth);
      qc.invalidateQueries({ queryKey: ["capacity-planner", firmId] });
      toast.success("Savings target saved.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const monthsUntilLeave = useMemo(
    () => monthsUntilLeaveStart(leaveStartMonth),
    [leaveStartMonth],
  );

  const result = useMemo(
    () =>
      getLeaveScenario({
        rampDownMonths: phases.rampDownMonths,
        rampDownCapacityPct: phases.rampDownCapacityPct,
        fullLeaveMonths: phases.fullLeaveMonths,
        returnMonths: phases.returnMonths,
        returnCapacityPct: phases.returnCapacityPct,
        savingsPerMonth,
        firmCalcResult: calcResult,
        monthsUntilLeaveStart: monthsUntilLeave,
      }),
    [phases, savingsPerMonth, calcResult, monthsUntilLeave],
  );

  const insight = useMemo(
    () =>
      getLeaveInsight(result, {
        phases,
        savingsPerMonth,
        leaveStartMonth,
      }),
    [result, phases, savingsPerMonth, leaveStartMonth],
  );

  const showSaveLink =
    savedSavings == null || Math.round(savingsPerMonth) !== Math.round(savedSavings);

  const selectSource = (value: ScenarioSource) => {
    setSource(value);
    if (value === "custom") {
      setPhases(defaultLeavePhases());
      setSavingsPerMonth(savedSavings ?? DEFAULT_SAVINGS);
      setLeaveStartMonth(defaultLeaveStartMonth());
      return;
    }
    const event = existingLeaveEvents.find((e) => e.id === value);
    if (!event) return;
    const span = eventLeaveMonths(event);
    setPhases({
      rampDownMonths: 0,
      rampDownCapacityPct: 50,
      fullLeaveMonths: span,
      returnMonths: 0,
      returnCapacityPct: 50,
    });
    setLeaveStartMonth(eventLeaveStartMonth(event));
  };

  return (
    <section className="mt-6">
      <p className="mb-3 font-sans text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
        Leave scenario
      </p>

      <div className="rounded-xl border border-border bg-white px-[22px] py-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="font-sans text-sm font-medium text-ch">
              What does time off cost your firm?
            </h3>
            <p className="mt-0.5 font-sans text-xs text-muted-foreground">
              Adjust the scenario to see the financial impact and what to do now.
            </p>
          </div>

          {existingLeaveEvents.length > 0 && (
            <EventSourceToggle
              source={source}
              events={existingLeaveEvents}
              onChange={selectSource}
            />
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            <LeavePhaseTimeline phases={phases} />
            <button
              type="button"
              onClick={() => {
                setSource("custom");
                setPhases(maternityPresetPhases());
              }}
              className="cursor-pointer font-sans text-[11px] text-gold underline"
            >
              Use maternity leave example (1 mo half-time → 2 mo full → 2 mo half-time)
            </button>

            <SliderField
              label="Wind-down before leave"
              valueLabel={`${phases.rampDownMonths} month${phases.rampDownMonths === 1 ? "" : "s"}`}
              sub="Reduced capacity as you transition out — e.g. half time before maternity"
            >
              <input
                type="range"
                min={0}
                max={3}
                step={1}
                value={phases.rampDownMonths}
                onChange={(e) => updatePhases({ rampDownMonths: Number(e.target.value) })}
                className="w-full accent-ch"
              />
              {phases.rampDownMonths > 0 && (
                <CapacityPresetRow
                  label="Wind-down capacity"
                  value={phases.rampDownCapacityPct}
                  onChange={(pct) => updatePhases({ rampDownCapacityPct: pct })}
                />
              )}
            </SliderField>

            <SliderField
              label="Full leave"
              valueLabel={`${phases.fullLeaveMonths} month${phases.fullLeaveMonths === 1 ? "" : "s"}`}
              sub="No billable work — 0% capacity"
            >
              <input
                type="range"
                min={0}
                max={12}
                step={1}
                value={phases.fullLeaveMonths}
                onChange={(e) => updatePhases({ fullLeaveMonths: Number(e.target.value) })}
                className="w-full accent-ch"
              />
            </SliderField>

            <SliderField
              label="Gradual return"
              valueLabel={`${phases.returnMonths} month${phases.returnMonths === 1 ? "" : "s"}`}
              sub="Reduced capacity while ramping back — e.g. half time after leave"
            >
              <input
                type="range"
                min={0}
                max={6}
                step={1}
                value={phases.returnMonths}
                onChange={(e) => updatePhases({ returnMonths: Number(e.target.value) })}
                className="w-full accent-ch"
              />
              {phases.returnMonths > 0 && (
                <CapacityPresetRow
                  label="Return capacity"
                  value={phases.returnCapacityPct}
                  onChange={(pct) => updatePhases({ returnCapacityPct: pct })}
                />
              )}
            </SliderField>

            <SliderField
              label="Monthly savings target"
              valueLabel={fmtUsd(savingsPerMonth, { decimals: 0 })}
              sub="Amount set aside each month toward leave reserves"
            >
              <input
                type="range"
                min={500}
                max={15000}
                step={500}
                value={savingsPerMonth}
                onChange={(e) => {
                  setSource("custom");
                  setSavingsPerMonth(Number(e.target.value));
                }}
                className="w-full accent-ch"
              />
              {showSaveLink && (
                <button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="mt-2 cursor-pointer font-sans text-[11px] text-gold underline"
                >
                  Save this as my savings target →
                </button>
              )}
            </SliderField>

            <div>
              <label className="mb-1.5 block font-sans text-xs text-muted-foreground">
                Leave starts
              </label>
              <Select
                value={String(leaveStartMonth)}
                onValueChange={(v) => {
                  setSource("custom");
                  setLeaveStartMonth(Number(v));
                }}
              >
                <SelectTrigger className="h-9 font-sans text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAVE_MONTH_NAMES.map((name, i) => (
                    <SelectItem key={name} value={String(i + 1)} className="font-sans text-xs">
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <ResultsPanel
            result={result}
            calcResult={calcResult}
            phases={phases}
            savingsPerMonth={savingsPerMonth}
            monthsUntilLeave={monthsUntilLeave}
            leaveStartMonth={leaveStartMonth}
          />
        </div>

        <p className="mt-3.5 rounded-lg bg-cream px-3.5 py-3 font-display text-[13px] italic leading-relaxed text-muted-foreground">
          {insight}
        </p>
      </div>
    </section>
  );
}

function EventSourceToggle({
  source,
  events,
  onChange,
}: {
  source: ScenarioSource;
  events: FirmLifeEvent[];
  onChange: (value: ScenarioSource) => void;
}) {
  return (
    <div
      className="inline-flex max-w-full flex-wrap"
      style={{
        background: "var(--cream)",
        border: "0.5px solid rgba(44,44,44,0.12)",
        borderRadius: 20,
        padding: 3,
      }}
    >
      <SourcePill active={source === "custom"} onClick={() => onChange("custom")} label="Custom" />
      {events.map((e) => (
        <SourcePill
          key={e.id}
          active={source === e.id}
          onClick={() => onChange(e.id)}
          label={e.name}
        />
      ))}
    </div>
  );
}

function SourcePill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "max-w-[140px] truncate cursor-pointer border-none transition-all duration-150",
        active ? "bg-white text-ch shadow-sm" : "bg-transparent text-muted-foreground",
      )}
      style={{
        fontFamily: "Jost, sans-serif",
        fontSize: 11,
        fontWeight: 500,
        padding: "5px 12px",
        borderRadius: 17,
      }}
      title={label}
    >
      {label}
    </button>
  );
}

function SliderField({
  label,
  valueLabel,
  sub,
  children,
}: {
  label: string;
  valueLabel: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="font-sans text-xs text-muted-foreground">{label}</span>
        <span className="font-sans text-xs font-medium text-ch">{valueLabel}</span>
      </div>
      {children}
      <p className="mt-1 font-sans text-[11px] italic text-muted-foreground">{sub}</p>
    </div>
  );
}

function LeavePhaseTimeline({ phases }: { phases: LeaveScenarioPhases }) {
  const total =
    phases.rampDownMonths + phases.fullLeaveMonths + phases.returnMonths || 1;

  const segments: Array<{ key: string; months: number; label: string; className: string }> = [];
  if (phases.rampDownMonths > 0) {
    segments.push({
      key: "ramp-down",
      months: phases.rampDownMonths,
      label: `Wind-down ${phases.rampDownCapacityPct}%`,
      className: "bg-gold/35",
    });
  }
  if (phases.fullLeaveMonths > 0) {
    segments.push({
      key: "full",
      months: phases.fullLeaveMonths,
      label: "Full leave",
      className: "bg-terra/40",
    });
  }
  if (phases.returnMonths > 0) {
    segments.push({
      key: "return",
      months: phases.returnMonths,
      label: `Return ${phases.returnCapacityPct}%`,
      className: "bg-gold/25",
    });
  }

  return (
    <div className="rounded-lg border border-border bg-cream/50 px-3.5 py-3">
      <p className="mb-2 font-sans text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Leave timeline
      </p>
      {segments.length === 0 ? (
        <p className="font-sans text-[11px] text-muted-foreground">Set at least one phase to model impact.</p>
      ) : (
        <>
          <div className="flex h-3 overflow-hidden rounded-full bg-border/40">
            {segments.map((seg) => (
              <div
                key={seg.key}
                className={cn("h-full", seg.className)}
                style={{ width: `${(seg.months / total) * 100}%` }}
                title={`${seg.label} — ${seg.months} mo`}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {segments.map((seg) => (
              <span key={seg.key} className="font-sans text-[10px] text-muted-foreground">
                {seg.label} ({seg.months} mo)
              </span>
            ))}
          </div>
          <p className="mt-1.5 font-sans text-[10px] italic text-muted-foreground">
            {describeLeaveTimeline(phases)}
          </p>
        </>
      )}
    </div>
  );
}

function CapacityPresetRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (pct: number) => void;
}) {
  return (
    <div className="mt-2">
      <p className="mb-1 font-sans text-[10px] text-muted-foreground">{label}</p>
      <div className="flex gap-1">
        {CAPACITY_PRESETS.map((pct) => (
          <button
            key={pct}
            type="button"
            onClick={() => onChange(pct)}
            className={cn(
              "cursor-pointer rounded-md border px-2 py-0.5 font-sans text-[10px]",
              value === pct
                ? "border-ch bg-ch text-white"
                : "border-border bg-white text-muted-foreground",
            )}
          >
            {pct}%
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultsPanel({
  result,
  calcResult,
  phases,
  savingsPerMonth,
  monthsUntilLeave,
  leaveStartMonth,
}: {
  result: ReturnType<typeof getLeaveScenario>;
  calcResult: CalcResult;
  phases: LeaveScenarioPhases;
  savingsPerMonth: number;
  monthsUntilLeave: number;
  leaveStartMonth: number;
}) {
  const breakdowns = useMemo(
    () =>
      buildLeaveImpactBreakdowns(result, {
        phases,
        savingsPerMonth,
        monthsUntilLeave,
        leaveStartMonth,
        calcResult,
      }),
    [result, phases, savingsPerMonth, monthsUntilLeave, leaveStartMonth, calcResult],
  );

  const monthsColor =
    result.monthsToSave <= 12
      ? "text-ch"
      : result.monthsToSave <= 24
        ? "text-gold"
        : "text-terra";

  const savingByColor = result.isAlreadyLate
    ? "text-terra"
    : result.monthsToSave <= 12
      ? "text-success"
      : "text-gold";

  return (
    <div className="rounded-[10px] bg-cream px-[18px] py-4">
      <p className="mb-3 font-sans text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        Leave impact
      </p>

      <div className="divide-y divide-border/80">
        <ResultRow
          label="Hours lost"
          value={formatHours(Math.round(result.hoursLost))}
          valueClassName="text-gold"
          breakdown={breakdowns.hoursLost}
        />
        <ResultRow
          label="Revenue impact"
          value={fmtUsd(result.revenueGap, { decimals: 0 })}
          valueClassName="text-gold"
          breakdown={breakdowns.revenueImpact}
        />
        <ResultRow
          label="Reserve needed"
          value={fmtUsd(result.reserveNeeded, { decimals: 0 })}
          valueClassName="text-terra"
          breakdown={breakdowns.reserveNeeded}
        />
        <ResultRow
          label="Months to save at your rate"
          value={`${result.monthsToSave.toFixed(1)} months`}
          valueClassName={monthsColor}
          breakdown={breakdowns.monthsToSave}
        />
        <ResultRow
          label="Start saving by"
          value={result.isAlreadyLate ? "Start now" : result.startSavingByStr}
          valueClassName={cn("font-medium", savingByColor)}
          breakdown={breakdowns.startSavingBy}
          sub={
            result.isAlreadyLate
              ? "Begin this month to catch up"
              : `Plan to begin before ${leaveStartMonthLabel(leaveStartMonth)}`
          }
        />
      </div>

      <div className="mt-3 space-y-2 border-t border-border/80 pt-3">
        <ResultRow
          label="Projects needed to offset gap"
          value={`~${result.additionalProjectsNeeded} projects`}
          valueClassName="text-ch"
          breakdown={breakdowns.projectsNeeded}
          sub="at your average project size"
          subAlign="right"
        />

        {result.additionalRevenuePerMonth > 0 && (
          <ResultRow
            label="Additional revenue/month needed"
            value={`${fmtUsd(result.additionalRevenuePerMonth, { decimals: 0 })}/mo`}
            valueClassName="text-ch"
            breakdown={breakdowns.additionalRevenuePerMonth}
            sub={`in the ${monthsUntilLeave} month${monthsUntilLeave === 1 ? "" : "s"} before leave starts`}
            subAlign="right"
          />
        )}
      </div>
    </div>
  );
}

function ResultRow({
  label,
  value,
  valueClassName,
  sub,
  subAlign = "right",
  breakdown,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  sub?: string;
  subAlign?: "left" | "right";
  breakdown?: string[];
}) {
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 font-sans text-[13px] text-muted-foreground">
          {label}
          {breakdown && breakdown.length > 0 && <FigureInsight lines={breakdown} />}
        </span>
        <span className={cn("font-sans text-[13px] font-medium", valueClassName)}>{value}</span>
      </div>
      {sub && (
        <p
          className={cn(
            "mt-0.5 font-sans text-[11px] text-muted-foreground",
            subAlign === "right" ? "text-right" : "text-left",
          )}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

function FigureInsight({ lines }: { lines: string[] }) {
  return (
    <HoverCard openDelay={100} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="inline-flex cursor-help items-center justify-center rounded-full font-sans text-[11px] leading-none text-gold"
          aria-label="How this figure is calculated"
        >
          ⓘ
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="start"
        className="w-[280px] border-border bg-white px-3.5 py-3"
      >
        <p className="mb-1.5 font-sans text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          How this is calculated
        </p>
        <ul className="space-y-1 font-sans text-[11px] leading-relaxed text-ch">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </HoverCardContent>
    </HoverCard>
  );
}
