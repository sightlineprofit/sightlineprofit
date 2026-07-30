import { Link } from "@tanstack/react-router";
import { fmtUsd, type calc } from "@/lib/finance";
import { InfoTip } from "@/components/dashboard/InfoTip";
import { RevenueArchitectureBreakdown } from "./RevenueArchitectureBreakdown";
import { YearToDateBody, type YearToDateRevenueProps } from "./YearToDateRevenue";
import { PortfolioRealizedRateRow } from "./PortfolioRealizedRateRow";
import { RetainerYearToDateBody } from "./RetainerYearToDateBody";
import { isRetainerFirm } from "@/lib/pricing-structure";
import type { RetainerPortfolioMetrics } from "@/lib/retainer-metrics";
import {
  annualRunRateFromYtd,
  getRevenueDashboardCopy,
  ytdAnnualPaceTarget,
} from "@/lib/revenue-framing";
import { Skeleton } from "@/components/ui/skeleton";

const CHARCOAL = "#2C2C2C";
const GOLD = "#B8860B";
const MUTED = "#6B6259";
const MUTED_LT = "#8A7F75";
const BORDER = "rgba(44,44,44,0.10)";

type Calc = ReturnType<typeof calc>;

export function RevenueProgressTile({
  c,
  targetMarginPct,
  ytd,
  firmId,
  expenseCount,
  teamMemberCount,
  className,
  pricingStructure,
  retainerMetrics,
  retainerMetricsLoading,
  targetUtilizationPct,
  actualWeekUtilizationPct,
}: {
  c: Calc;
  targetMarginPct: number;
  ytd: YearToDateRevenueProps;
  firmId?: string;
  expenseCount?: number;
  teamMemberCount?: number;
  className?: string;
  pricingStructure?: string | null;
  retainerMetrics?: RetainerPortfolioMetrics | null;
  retainerMetricsLoading?: boolean;
  /** From firm_config.target_utilization_pct (planning). */
  targetUtilizationPct?: number | null;
  /** Logged billable ÷ available this week, when available. */
  actualWeekUtilizationPct?: number | null;
}) {
  const isRetainer = isRetainerFirm(pricingStructure);
  const copy = getRevenueDashboardCopy(pricingStructure);
  const annualPaceTarget = ytdAnnualPaceTarget(c, pricingStructure);
  const runRate = annualRunRateFromYtd(ytd.totalRevenue, ytd.monthIndex);
  const onPace = ytd.totalRevenue >= ytd.ytdTarget * 0.9;

  let insight = "";
  let insightColor = MUTED;
  if (isRetainer && retainerMetrics) {
    if (retainerMetrics.revenueOnTrack) {
      insight = `Retainer portfolio ${fmtUsd(retainerMetrics.totalMonthlyRetainerRevenue)}/mo — compare to your ${copy.paceTargetNoun} in settings.`;
      insightColor = MUTED;
    } else {
      insight = `${fmtUsd(retainerMetrics.monthlyRevenueGap)}/mo below your ${copy.paceTargetNoun}.`;
      insightColor = MUTED;
    }
  } else if (ytd.monthIndex > 0 && ytd.totalRevenue <= 0) {
    insight = copy.emptyInsight;
    insightColor = MUTED;
  } else if (onPace) {
    insight = `Run rate ${fmtUsd(runRate)}/yr is at or above your prorated ${copy.paceTargetNoun} (${fmtUsd(ytd.ytdTarget)} YTD).`;
    insightColor = MUTED;
  } else {
    insight = `Run rate ${fmtUsd(runRate)}/yr vs ${fmtUsd(annualPaceTarget)}/yr ${copy.paceTargetNoun} — ${fmtUsd(Math.max(0, ytd.ytdTarget - ytd.totalRevenue))} behind YTD pace.`;
    insightColor = MUTED;
  }

  const utilTarget = targetUtilizationPct ?? c.targetUtilizationPct;
  const utilLine =
    utilTarget != null && utilTarget > 0
      ? `Planning utilization ${Math.round(utilTarget)}%${
          actualWeekUtilizationPct != null
            ? ` · logged ${Math.round(actualWeekUtilizationPct)}% this week`
            : ""
        }`
      : null;

  return (
    <div
      data-tour="revenue-panel"
      className={`border bg-white ${className ?? ""}`}
      style={{ borderColor: BORDER, borderRadius: 6, padding: "12px 16px" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <p
              style={{
                fontFamily: "Jost, sans-serif",
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                color: GOLD,
              }}
            >
              {copy.tileEyebrow}
            </p>
            <InfoTip term={copy.dualLensTitle} definition={copy.dualLensDefinition} />
          </div>
          <p
            style={{
              fontFamily: "var(--font-voice, 'Cormorant Garamond', Georgia, serif)",
              fontSize: 22,
              color: CHARCOAL,
              lineHeight: 1.1,
              marginTop: 2,
            }}
          >
            {fmtUsd(ytd.totalRevenue)}
          </p>
          <p
            style={{
              fontFamily: "Jost, sans-serif",
              fontSize: 10,
              color: MUTED_LT,
              marginTop: 2,
              lineHeight: 1.35,
            }}
          >
            Run rate {fmtUsd(runRate)}/yr · month {ytd.monthIndex} of 12
            {utilLine ? ` · ${utilLine}` : ""}
          </p>
        </div>
        <RevenueArchitectureBreakdown
          c={c}
          targetMarginPct={targetMarginPct}
          ytd={ytd}
          expenseCount={expenseCount}
          teamMemberCount={teamMemberCount}
          side="left"
        />
      </div>

      <p
        className="mt-1.5"
        style={{ fontFamily: "Jost, sans-serif", fontSize: 10, color: insightColor, lineHeight: 1.45 }}
      >
        {insight}
      </p>

      {copy.footerNote ? (
        <p
          className="mt-2"
          style={{ fontFamily: "Jost, sans-serif", fontSize: 10, color: MUTED, lineHeight: 1.55 }}
        >
          {copy.footerNote}{" "}
          <Link to="/settings" search={{ panel: "rate" }} className="hover:underline" style={{ color: GOLD }}>
            Model capacity →
          </Link>
        </p>
      ) : null}

      <div className="my-2.5 h-px shrink-0" style={{ background: BORDER }} />

      {isRetainer ? (
        retainerMetricsLoading && !retainerMetrics ? (
          <div className="space-y-2 py-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : retainerMetrics ? (
          <RetainerYearToDateBody metrics={retainerMetrics} compact />
        ) : null
      ) : (
        <>
          {firmId ? (
            <PortfolioRealizedRateRow firmId={firmId} rateDefinition={copy.portfolioRateDefinition} />
          ) : null}
          <div className="my-2.5 h-px shrink-0" style={{ background: BORDER }} />
          <YearToDateBody
            {...ytd}
            designFeesAnnualTarget={ytd.designFeesAnnualTarget ?? ytd.annualTarget}
            compact
            showAnnualTargetStat={false}
            feesProgressLabel={copy.feesProgressLabel}
          />
        </>
      )}
    </div>
  );
}
