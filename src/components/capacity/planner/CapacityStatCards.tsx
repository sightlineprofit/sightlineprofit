import { fmtUsd, formatHours } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { isRetainerFirm } from "@/lib/pricing-structure";
import type { CapacityPlannerData } from "@/lib/capacity.functions";

export function CapacityStatCards({ data }: { data: CapacityPlannerData }) {
  if (data.scope === "firm" && isRetainerFirm(data.pricingStructure) && data.retainerMetrics) {
    return <RetainerCapacityStatCards data={data} metrics={data.retainerMetrics} />;
  }

  const { effective, sayNo, committedHrs, activeProjectCount, hasLeaveEvents, monthsOfLeave, projectsNeeded } =
    data;

  const isMember = data.scope === "member";
  const availableHrs = effective.effectiveHrs - committedHrs;
  const overcommitted = availableHrs < 0;

  const capacityLabel = isMember ? "Your working capacity this year" : "Working capacity this year";
  const committedLabel = isMember ? "Your hours committed" : "Hours committed";
  const availableLabel = isMember ? "Your hours still available" : "Hours still available";

  return (
    <div className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label={capacityLabel}
        value={formatHours(Math.round(effective.effectiveHrs))}
        valueClassName={
          effective.effectiveHrs < effective.standardHrs ? "text-gold" : "text-ch"
        }
        sub={
          effective.hasLifeEvents
            ? `of ${formatHours(Math.round(effective.standardHrs))} standard`
            : isMember
              ? "Based on your expected hours"
              : "Full capacity year"
        }
      />

      <StatCard
        label={committedLabel}
        value={formatHours(Math.round(committedHrs))}
        valueClassName="text-ch"
        sub={`across ${activeProjectCount} active project${activeProjectCount === 1 ? "" : "s"}`}
      />

      <StatCard
        label={availableLabel}
        value={
          overcommitted
            ? `−${formatHours(Math.round(Math.abs(availableHrs)))} over`
            : formatHours(Math.round(availableHrs))
        }
        valueClassName={
          overcommitted ? "text-terra" : availableHrs > 200 ? "text-success" : availableHrs >= 50 ? "text-gold" : "text-terra"
        }
        sub={overcommitted ? "overcommitted this year" : "before capacity is full"}
      />

      {data.hideFinancials ? (
        hasLeaveEvents ? (
          <StatCard
            label="Reduced capacity months"
            value={`${monthsOfLeave} month${monthsOfLeave === 1 ? "" : "s"}`}
            valueClassName="text-gold"
            sub="From your time blocks this year"
          />
        ) : (
          <StatCard
            label="Time blocks"
            value={`${data.effective.lifeEvents.length}`}
            valueClassName="text-ch"
            sub="Commitments and time off you've entered"
          />
        )
      ) : hasLeaveEvents ? (
        <StatCard
          label="Reserve for leave"
          value={fmtUsd(effective.reserveNeeded, { decimals: 0 })}
          valueClassName="text-terra"
          sub={`${monthsOfLeave} month${monthsOfLeave === 1 ? "" : "s"} of obligations`}
        />
      ) : (
        <StatCard
          label="New client capacity"
          value={
            sayNo.thresholdReached
              ? "Revenue goal met"
              : `${projectsNeeded} more project${projectsNeeded === 1 ? "" : "s"}`
          }
          valueClassName="text-ch"
          sub={
            sayNo.thresholdReached
              ? "You can say no to new work"
              : "to hit annual target"
          }
        />
      )}
    </div>
  );
}

function RetainerCapacityStatCards({
  data,
  metrics,
}: {
  data: CapacityPlannerData;
  metrics: NonNullable<CapacityPlannerData["retainerMetrics"]>;
}) {
  const reducedCapacity = data.effective.effectiveHrs < data.effective.standardHrs;
  const {
    totalFirmMonthlyHrs,
    committedMonthlyHrs,
    availableMonthlyHrs,
    hasHoursData,
    activeClientCount,
    revenueOnTrack,
    monthlyRevenueGap,
  } = metrics;

  let availableColor = "text-ch";
  if (hasHoursData) {
    if (availableMonthlyHrs > 40) availableColor = "text-success";
    else if (availableMonthlyHrs >= 10) availableColor = "text-gold";
    else availableColor = "text-terra";
  }

  return (
    <div className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Monthly firm capacity"
        value={`${Math.round(totalFirmMonthlyHrs)} hrs`}
        valueClassName={reducedCapacity ? "text-gold" : "text-ch"}
        sub="available per month across your firm"
      />

      <StatCard
        label="Committed to clients"
        value={
          hasHoursData
            ? `~${Math.round(committedMonthlyHrs)} hrs/mo`
            : "Log time to see this"
        }
        valueClassName={hasHoursData ? "text-ch" : "text-muted-foreground"}
        sub={
          hasHoursData
            ? `avg across ${activeClientCount} retainer client${activeClientCount === 1 ? "" : "s"}`
            : "based on last 30 days"
        }
      />

      <StatCard
        label="Available capacity"
        value={
          hasHoursData ? `${Math.round(availableMonthlyHrs)} hrs/mo` : "—"
        }
        valueClassName={hasHoursData ? availableColor : "text-muted-foreground"}
        sub="before capacity is full"
      />

      {revenueOnTrack ? (
        <StatCard
          label="Revenue status"
          value="On target"
          valueClassName="text-success"
          sub={`${fmtUsd(Math.abs(monthlyRevenueGap))}/mo above goal`}
        />
      ) : (
        <StatCard
          label="Revenue gap"
          value={`${fmtUsd(monthlyRevenueGap)}/mo`}
          valueClassName="text-gold"
          sub="below monthly target"
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  valueClassName,
}: {
  label: string;
  value: string;
  sub: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-[10px] bg-cream px-4 py-3.5">
      <p className="mb-1.5 font-sans text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("font-display text-[22px] font-normal leading-tight", valueClassName ?? "text-ch")}>
        {value}
      </p>
      <p className="mt-0.5 font-sans text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}
