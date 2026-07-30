import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCapacityPlannerData } from "@/lib/capacity.functions";
import { formatHours } from "@/lib/finance";
import { capacityReductionHrs } from "@/lib/project-what-if";
import { AcceptingClientsStatus } from "@/components/capacity/AcceptingClientsStatus";
import { cn } from "@/lib/utils";

export function CapacityDashboardSummary({ firmId }: { firmId: string }) {
  const fetchPlanner = useServerFn(getCapacityPlannerData);
  const year = new Date().getFullYear();

  const { data, isLoading } = useQuery({
    queryKey: ["capacity-dashboard-summary", firmId, year],
    queryFn: () => fetchPlanner({ data: { firmId, year } }),
    staleTime: 60_000,
  });

  if (isLoading || !data) return null;

  const { effective, sayNo, committedHrs } = data;
  const effectiveHrs = Math.round(effective.effectiveHrs);
  const standardHrs = Math.round(effective.standardHrs);
  const reduced = capacityReductionHrs(effective);
  const committedPct =
    effective.effectiveHrs > 0 ? Math.round((committedHrs / effective.effectiveHrs) * 100) : 0;
  const revenuePct =
    sayNo.annualRevenueTarget > 0
      ? Math.round((sayNo.committedRevenue / sayNo.annualRevenueTarget) * 100)
      : 0;

  const revenueColor =
    revenuePct >= 75 ? "text-success" : revenuePct >= 50 ? "text-gold" : "text-ch";

  return (
    <div className="mt-4 rounded-xl border border-border bg-white px-[18px] py-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MiniStat
          label="Effective capacity"
          value={`${formatHours(effectiveHrs)} this year`}
          valueClassName={effectiveHrs < standardHrs ? "text-gold" : "text-ch"}
        />
        <MiniStat
          label="Hours committed"
          value={formatHours(Math.round(committedHrs))}
          sub={`${committedPct}% of capacity`}
        />
        <MiniStat
          label="Revenue toward goal"
          value={`${revenuePct}% of annual target`}
          valueClassName={revenueColor}
        />
      </div>

      {sayNo.thresholdReached && (
        <div className="mt-2.5 rounded-lg border border-success/25 bg-success/[0.06] px-3.5 py-2.5">
          <p className="font-sans text-xs text-success">
            Revenue goal met · You can say no to new work
          </p>
        </div>
      )}

      {effective.hasLifeEvents && reduced > 0 && (
        <p className="mt-2.5 font-sans text-[11px] italic text-gold">
          Life events reduce your capacity by {formatHours(Math.round(reduced))} hrs this year.
        </p>
      )}

      <AcceptingClientsStatus
        firmId={firmId}
        accepting={data.acceptingNewClients}
        until={data.acceptingNewClientsUntil}
        variant="dashboard"
      />

      <Link
        to="/capacity"
        className="mt-2.5 inline-block font-sans text-xs text-gold underline"
      >
        View capacity planner →
      </Link>
    </div>
  );
}

function MiniStat({
  label,
  value,
  sub,
  valueClassName,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg bg-cream px-3 py-2.5">
      <p className="font-sans text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 font-display text-base leading-tight", valueClassName ?? "text-ch")}>
        {value}
      </p>
      {sub && <p className="mt-0.5 font-sans text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
