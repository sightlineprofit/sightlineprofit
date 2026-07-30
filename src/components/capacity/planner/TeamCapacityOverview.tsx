import { formatHours } from "@/lib/finance";
import type { MemberCapacitySummary } from "@/lib/capacity.functions";
import { cn } from "@/lib/utils";

export function TeamCapacityOverview({
  summaries,
}: {
  summaries: MemberCapacitySummary[];
}) {
  if (summaries.length === 0) return null;

  return (
    <section className="mb-5">
      <p className="mb-1 font-sans text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
        Team capacity
      </p>
      <p className="mb-3 font-sans text-xs text-muted-foreground">
        What team members have entered — commitments and time off that affect firm availability.
      </p>

      <div className="space-y-2">
        {summaries.map((m) => {
          const over = m.availableHrs < 0;
          return (
            <div
              key={m.firmMemberId}
              className="rounded-[10px] border border-border bg-white px-4 py-3.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-sans text-[13px] font-medium text-ch">{m.name}</p>
                  <p className="font-sans text-[11px] text-muted-foreground">
                    {m.billableHrsPerWeek} hrs/wk baseline
                    {m.eventCount > 0
                      ? ` · ${m.eventCount} time block${m.eventCount === 1 ? "" : "s"}`
                      : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={cn(
                      "font-sans text-[13px] font-medium",
                      over ? "text-terra" : "text-success",
                    )}
                  >
                    {over
                      ? `${formatHours(Math.round(Math.abs(m.availableHrs)))} over`
                      : `${formatHours(Math.round(m.availableHrs))} available`}
                  </p>
                  <p className="font-sans text-[10px] text-muted-foreground">
                    {formatHours(Math.round(m.effectiveHrs))} working ·{" "}
                    {formatHours(Math.round(m.committedHrs))} committed
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
