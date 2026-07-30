import type { CapacityPlannerData } from "@/lib/capacity.functions";
import { monthCapacityFromBlocks, weeksInMonth } from "@/lib/schedule-blocks";

export function MonthWeekBreakdown({
  month,
  year,
  data,
  onClose,
}: {
  month: number;
  year: number;
  data: CapacityPlannerData;
  onClose: () => void;
}) {
  const monthName = new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const weeks = weeksInMonth(year, month);
  const fullWeekly = data.billableHrsPerWeek;

  return (
    <div className="mt-3 rounded-xl border border-border bg-white px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-sans text-sm font-medium text-ch">{monthName} — weekly breakdown</p>
        <button type="button" onClick={onClose} className="font-sans text-xs text-gold underline">
          Close
        </button>
      </div>

      <div className="space-y-3">
        {weeks.map((weekStart) => {
          const iso = weekStart.toISOString().slice(0, 10);
          const exception = data.scheduleExceptions.find(
            (ex) => ex.week_start.slice(0, 10) === iso,
          );

          const { availableHrs, capacityPct } = monthCapacityFromBlocks({
            events: data.effective.lifeEvents,
            exceptions: data.scheduleExceptions,
            year,
            month,
            hrsPerWeek: fullWeekly,
          });

          const weekCapacityPct = exception?.capacity_pct ?? capacityPct;
          const weekAvailable = fullWeekly * (weekCapacityPct / 100);
          const committed = 0;

          return (
            <div key={iso}>
              <div className="mb-1 flex items-baseline justify-between font-sans text-[11px]">
                <span className="text-muted-foreground">
                  Week of{" "}
                  {weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  {exception?.label && (
                    <span className="ml-1 text-gold">· {exception.label}</span>
                  )}
                </span>
                <span className="text-ch">{Math.round(weekAvailable)} hrs available</span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-sm bg-cream">
                <div
                  className="absolute inset-y-0 left-0 bg-success/30"
                  style={{ width: `${weekCapacityPct}%` }}
                />
                {committed > 0 && (
                  <div
                    className="absolute inset-y-0 left-0 bg-gold/60"
                    style={{ width: `${Math.min(100, (committed / fullWeekly) * 100)}%` }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 font-sans text-[10px] text-muted-foreground">
        Monthly total: {Math.round(data.effective.monthlyProfile[month - 1]?.availableHrs ?? 0)} hrs
        after life events and commitments
      </p>
    </div>
  );
}
