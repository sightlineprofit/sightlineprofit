import { useMemo, useState } from "react";
import {
  fmtUsd,
  formatHours,
  type EffectiveCapacityResult,
  type SayNoThresholdResult,
  type calc,
} from "@/lib/finance";
import {
  DURATION_OPTIONS,
  effectiveRateTone,
  findLifeEventConflict,
  formatCurrencyInput,
  parseCurrencyInput,
  upcomingMonthOptionsForYear,
  type DurationOption,
} from "@/lib/project-what-if";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type CalcResult = ReturnType<typeof calc>;

export function NewProjectWhatIf({
  calcResult,
  effectiveCapacity,
  committedHrs,
  committedRevenue,
  sayNoThreshold,
  planningYear = new Date().getFullYear(),
}: {
  calcResult: CalcResult;
  effectiveCapacity: EffectiveCapacityResult;
  committedHrs: number;
  committedRevenue: number;
  sayNoThreshold: SayNoThresholdResult;
  firmId: string;
  planningYear?: number;
}) {
  const monthOptions = useMemo(
    () => upcomingMonthOptionsForYear(planningYear),
    [planningYear],
  );
  const defaultStart = monthOptions[0]?.value ?? "";

  const [feeInput, setFeeInput] = useState("");
  const [scopedHrs, setScopedHrs] = useState("");
  const [startKey, setStartKey] = useState(defaultStart);
  const [duration, setDuration] = useState<DurationOption>("3");

  const fee = parseCurrencyInput(feeInput);
  const hrs = Number(scopedHrs) || 0;
  const durationMonths = DURATION_OPTIONS.find((d) => d.value === duration)?.months ?? 3;
  const selectedMonth = monthOptions.find((m) => m.value === startKey) ?? monthOptions[0];

  const minFee = hrs > 0 ? calcResult.alignedRate * hrs : 0;
  const showMinFeePrompt = hrs > 0 && (fee <= 0 || fee < minFee);

  const rateHint = effectiveRateTone(
    fee,
    hrs,
    calcResult.alignedRate,
    calcResult.breakEvenRate,
  );

  const availableRemaining = effectiveCapacity.effectiveHrs - committedHrs - hrs;
  const overCapacity = availableRemaining < 0;

  const annualTarget = sayNoThreshold.annualRevenueTarget;
  const beforePct =
    annualTarget > 0 ? Math.min(100, (committedRevenue / annualTarget) * 100) : 0;
  const afterPct =
    annualTarget > 0 ? Math.min(100, ((committedRevenue + fee) / annualTarget) * 100) : 0;

  const wouldHitTarget =
    fee > 0 &&
    committedRevenue < annualTarget &&
    committedRevenue + fee >= annualTarget;

  const conflict = selectedMonth
    ? findLifeEventConflict(
        effectiveCapacity.lifeEvents,
        selectedMonth.month,
        selectedMonth.year,
        durationMonths,
      )
    : null;

  return (
    <section className="mt-6">
      <p className="mb-3 font-sans text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
        What if I take this project?
      </p>

      <div className="rounded-xl border border-border bg-white px-[22px] py-5">
        <div className="mb-4">
          <h3 className="font-sans text-sm font-medium text-ch">What if I take a new project?</h3>
          <p className="mt-0.5 font-sans text-xs text-muted-foreground">
            See how a new inquiry affects your capacity and revenue goal.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <Field label="Estimated project fee">
              <Input
                type="text"
                inputMode="decimal"
                placeholder="$0"
                value={feeInput}
                onChange={(e) => setFeeInput(e.target.value)}
                className="font-sans text-xs"
              />
              {showMinFeePrompt && (
                <div className="mt-2">
                  <p className="font-sans text-xs text-gold">
                    Minimum fee for {hrs} hours: {fmtUsd(minFee, { decimals: 0 })}
                  </p>
                  <p className="mt-0.5 font-sans text-[11px] italic text-muted-foreground">
                    This is the floor based on your cost structure. Price above this.
                  </p>
                  <button
                    type="button"
                    onClick={() => setFeeInput(formatCurrencyInput(Math.ceil(minFee)))}
                    className="mt-1 cursor-pointer font-sans text-[11px] text-gold underline"
                  >
                    Set to minimum →
                  </button>
                </div>
              )}
            </Field>

            <Field label="Scoped billable hours">
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={scopedHrs}
                onChange={(e) => setScopedHrs(e.target.value)}
                className="font-sans text-xs"
              />
              {rateHint && (
                <p className="mt-1.5 font-sans text-[11px] italic">
                  <span className="text-muted-foreground">
                    Effective rate: {fmtUsd(rateHint.rate, { decimals: 0 })}/hr —{" "}
                  </span>
                  <span
                    className={cn(
                      rateHint.tone === "above-aligned" && "text-success",
                      rateHint.tone === "above-break-even" && "text-gold",
                      rateHint.tone === "below-break-even" && "text-terra",
                    )}
                  >
                    {rateHint.label}
                  </span>
                </p>
              )}
            </Field>

            <Field label="When would this start?">
              <Select value={startKey} onValueChange={setStartKey}>
                <SelectTrigger className="h-9 font-sans text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((m) => (
                    <SelectItem key={m.value} value={m.value} className="font-sans text-xs">
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Estimated duration">
              <Select value={duration} onValueChange={(v) => setDuration(v as DurationOption)}>
                <SelectTrigger className="h-9 font-sans text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value} className="font-sans text-xs">
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="rounded-[10px] bg-cream px-[18px] py-4">
            <p className="mb-3 font-sans text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Project impact
            </p>

            <div className="divide-y divide-border/80">
              <ResultRow
                label="Hours added to capacity"
                value={`+${formatHours(hrs)}`}
                valueClassName="text-ch"
              />
              <ResultRow
                label="Available hours remaining"
                value={
                  overCapacity
                    ? `${formatHours(Math.round(Math.abs(availableRemaining)))} over capacity`
                    : formatHours(Math.round(availableRemaining))
                }
                valueClassName={
                  overCapacity
                    ? "text-terra"
                    : availableRemaining > 200
                      ? "text-success"
                      : availableRemaining >= 50
                        ? "text-gold"
                        : "text-terra"
                }
              />
              <ResultRow
                label="Revenue toward annual target"
                value={fee > 0 ? fmtUsd(fee, { decimals: 0 }) : "—"}
                valueClassName="text-success"
              />
              <div className="py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-sans text-[13px] text-muted-foreground">
                    Revenue target progress
                  </span>
                  <span className="font-sans text-[13px] font-medium text-ch">
                    {Math.round(beforePct)}% → {Math.round(afterPct)}%
                  </span>
                </div>
              </div>
            </div>

            {conflict && (
              <div className="mt-2.5 rounded-r-md border-l-2 border-terra bg-terra/[0.07] px-3 py-2.5">
                <p className="font-sans text-xs text-terra">
                  ⚠ {conflict.monthLabel} overlaps with {conflict.event.name}
                </p>
                <p className="mt-1 font-sans text-[11px] text-muted-foreground">
                  This project would run during your {conflict.event.name}. Consider starting after{" "}
                  {conflict.suggestAfter}.
                </p>
              </div>
            )}

            {wouldHitTarget && (
              <div className="mt-2.5 rounded-md border border-success/25 bg-success/[0.06] px-3 py-2.5">
                <p className="font-sans text-xs font-medium text-success">
                  Taking this project would hit your annual revenue target.
                </p>
                <p className="mt-1 font-sans text-[11px] text-success">
                  After this project you can say no to further work this year without impacting your
                  goals.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
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

function ResultRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="font-sans text-[13px] text-muted-foreground">{label}</span>
      <span className={cn("font-sans text-[13px] font-medium", valueClassName)}>{value}</span>
    </div>
  );
}
