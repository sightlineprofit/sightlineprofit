import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlignedRatePanel } from "./AlignedRatePanel";
import { RevenueProgressTile } from "./RevenueProgressTile";
import { UtilizationRealityCheck } from "./UtilizationRealityCheck";
import { HoursPulseTile } from "./HoursPulseTile";
import type { TeamHoursMember } from "./TeamHoursTile";
import type { YearToDateRevenueProps } from "./YearToDateRevenue";
import type { UnderstandYourNumbersProps } from "./UnderstandYourNumbers";
import type { calc } from "@/lib/finance";
import type { ReactNode } from "react";
import { isRetainerFirm } from "@/lib/pricing-structure";
import { getRetainerPortfolioMetrics } from "@/lib/retainer-metrics";

type Calc = ReturnType<typeof calc>;

/** Rate architecture (left) + revenue/hours/pay tiles (right), then full-width capacity. */
export function DashboardArchitectureRow({
  c,
  cfg,
  members,
  expenses,
  targetMarginPct,
  configUpdatedAt,
  projectScopedHours,
  firmId,
  ytd,
  weekBillable,
  targetHrs,
  trend,
  understandProps,
  teamMembers,
  trailingEntries,
  weekStartIso,
  weekEndIso,
  firmName,
  principalName,
  targetUtilizationPct,
  actualWeekUtilizationPct,
  fullWidthSection,
}: {
  c: Calc;
  cfg: any;
  members: any[];
  expenses: any[];
  targetMarginPct: number;
  configUpdatedAt?: string | null;
  projectScopedHours?: number[];
  firmId?: string;
  ytd: YearToDateRevenueProps;
  weekBillable: number;
  targetHrs: number;
  trend: Array<{ billable: number; total: number }>;
  understandProps: UnderstandYourNumbersProps;
  teamMembers: TeamHoursMember[];
  trailingEntries: Array<{ user_id?: string | null; hrs: number | null; date: string }>;
  weekStartIso: string;
  weekEndIso: string;
  firmName: string;
  principalName: string;
  targetUtilizationPct?: number | null;
  actualWeekUtilizationPct?: number | null;
  fullWidthSection?: ReactNode;
}) {
  const pricingStructure = (cfg as { pricing_structure?: string } | null)?.pricing_structure;
  const isRetainer = isRetainerFirm(pricingStructure);
  const fetchRetainerMetrics = useServerFn(getRetainerPortfolioMetrics);
  const { data: retainerMetrics, isLoading: retainerMetricsLoading } = useQuery({
    queryKey: ["retainer-portfolio-metrics", firmId],
    queryFn: () => fetchRetainerMetrics({ data: { firmId: firmId! } }),
    enabled: Boolean(firmId && isRetainer),
    staleTime: 60_000,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-2.5">
          <AlignedRatePanel
            c={c}
            cfg={cfg}
            members={members}
            expenses={expenses}
            targetMarginPct={targetMarginPct}
            configUpdatedAt={configUpdatedAt}
            projectScopedHours={projectScopedHours}
            understandProps={understandProps}
            retainerMetrics={isRetainer ? (retainerMetrics ?? null) : null}
          />
          {firmId ? <UtilizationRealityCheck firmId={firmId} /> : null}
        </div>
        <div className="flex min-h-0 flex-col gap-2.5">
          <RevenueProgressTile
            c={c}
            targetMarginPct={targetMarginPct}
            ytd={ytd}
            firmId={firmId}
            expenseCount={expenses.length}
            teamMemberCount={members.filter((m: any) => m?.role_type !== "principal" && m?.is_active !== false).length}
            pricingStructure={pricingStructure}
            retainerMetrics={isRetainer ? (retainerMetrics ?? null) : null}
            retainerMetricsLoading={isRetainer && retainerMetricsLoading}
            targetUtilizationPct={targetUtilizationPct}
            actualWeekUtilizationPct={actualWeekUtilizationPct}
          />
          <div className="flex min-h-0 flex-1 flex-col">
            <HoursPulseTile
              className="min-h-0 flex-1"
              weekBillable={weekBillable}
              targetHrs={targetHrs}
              trend={trend}
              members={teamMembers}
              trailingEntries={trailingEntries}
              weekStartIso={weekStartIso}
              weekEndIso={weekEndIso}
              firmName={firmName}
              principalName={principalName}
            />
          </div>
        </div>
      </div>
      {fullWidthSection}
    </div>
  );
}
