import { fmtUsd } from "@/lib/finance";
import type { RetainerClientSummary, RetainerPortfolioMetrics } from "@/lib/retainer-metrics";

const CHARCOAL = "#2C2C2C";
const GOLD = "#B8860B";
const CREAM = "#FAF7F2";
const SAGE = "#5C8A6E";
const TERRA = "#C4714A";
const MUTED = "#6B6259";
const MUTED_LT = "#8A7F75";

function statusDotColor(status: RetainerClientSummary["status"]): string {
  if (status === "healthy") return SAGE;
  if (status === "watch") return GOLD;
  if (status === "concern") return TERRA;
  return MUTED_LT;
}

function clientDisplayName(c: RetainerClientSummary): string {
  return c.clientName?.trim() || c.projectName;
}

function PaceBanner({ m }: { m: RetainerPortfolioMetrics }) {
  const {
    revenueOnTrack,
    totalMonthlyRetainerRevenue,
    monthlyRevenueTarget,
    monthlyRevenueGap,
    clientsNeededToCloseGap,
    averageMonthlyFee,
    activeClientCount,
    availableMonthlyHrs,
  } = m;

  let text;

  if (revenueOnTrack) {
    const roomHrs = Math.round(availableMonthlyHrs);
    text = (
      <>
        Your retainer portfolio covers your annual revenue target.
        {roomHrs > 0 ? (
          <>
            {" "}
            You have room for about {roomHrs} more hours per month before capacity is full.
          </>
        ) : null}
      </>
    );
  } else {
    const perClientIncrease =
      activeClientCount > 0 ? monthlyRevenueGap / activeClientCount : monthlyRevenueGap;
    text = (
      <>
        Your retainers generate {fmtUsd(totalMonthlyRetainerRevenue)}/month. You need{" "}
        {fmtUsd(monthlyRevenueTarget)}/month. To close the gap: {clientsNeededToCloseGap} more client
        {clientsNeededToCloseGap === 1 ? "" : "s"} at your average {fmtUsd(averageMonthlyFee)}/month, or
        increase existing fees by {fmtUsd(perClientIncrease)}/month per client.
      </>
    );
  }

  return (
    <div
      style={{
        background: CREAM,
        borderLeft: `3px solid ${GOLD}`,
        borderRadius: 4,
        padding: "10px 12px",
        marginTop: 12,
      }}
    >
      <p
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 13,
          fontStyle: "italic",
          color: MUTED,
          lineHeight: 1.65,
        }}
      >
        {text}
      </p>
    </div>
  );
}

export function RetainerYearToDateBody({
  metrics,
  compact,
}: {
  metrics: RetainerPortfolioMetrics;
  compact?: boolean;
}) {
  const {
    activeClientCount,
    revenueOnTrack,
    totalMonthlyRetainerRevenue,
    monthlyRevenueTarget,
    monthlyRevenueGap,
    annualRetainerRevenue,
    clients,
  } = metrics;

  const annualRequired = monthlyRevenueTarget * 12;
  const progressPct =
    annualRequired > 0 ? Math.min(100, (annualRetainerRevenue / annualRequired) * 100) : 0;
  const fillColor = revenueOnTrack ? SAGE : GOLD;

  return (
    <>
      <div
        className="flex items-center justify-between gap-2"
        style={{ marginBottom: compact ? 6 : 10 }}
      >
        <p
          style={{
            fontFamily: "Jost, sans-serif",
            fontSize: compact ? 12 : 13,
            color: MUTED,
            lineHeight: 1.3,
          }}
        >
          {activeClientCount} active retainer client{activeClientCount === 1 ? "" : "s"}
        </p>
        <span
          style={{
            fontFamily: "Jost, sans-serif",
            fontSize: compact ? 10 : 11,
            fontWeight: 500,
            color: revenueOnTrack ? SAGE : GOLD,
            flexShrink: 0,
          }}
        >
          {revenueOnTrack ? "On target ↑" : "Below target ↓"}
        </span>
      </div>

      <div
        className="grid grid-cols-3 gap-2.5"
        style={{ marginBottom: compact ? 6 : 14 }}
      >
        <StatTile
          label="Monthly revenue"
          value={fmtUsd(totalMonthlyRetainerRevenue)}
          valueColor={revenueOnTrack ? SAGE : GOLD}
          sub={`from ${activeClientCount} retainer client${activeClientCount === 1 ? "" : "s"}`}
          compact={compact}
        />
        <StatTile
          label="Monthly target"
          value={fmtUsd(monthlyRevenueTarget)}
          valueColor={CHARCOAL}
          sub="needed each month"
          compact={compact}
        />
        {revenueOnTrack ? (
          <StatTile
            label="Monthly surplus"
            value={fmtUsd(Math.abs(monthlyRevenueGap))}
            valueColor={SAGE}
            sub="above your target"
            compact={compact}
          />
        ) : (
          <StatTile
            label="Monthly gap"
            value={fmtUsd(monthlyRevenueGap)}
            valueColor={GOLD}
            sub="to close"
            compact={compact}
          />
        )}
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: MUTED }}>
            Annual retainer revenue
          </span>
          <span
            style={{
              fontFamily: "Jost, sans-serif",
              fontSize: 12,
              fontWeight: 500,
              color: fillColor,
              flexShrink: 0,
            }}
          >
            {fmtUsd(annualRetainerRevenue)} of {fmtUsd(annualRequired)}
          </span>
        </div>
        <div
          className="overflow-hidden rounded-full"
          style={{ height: 6, background: CREAM, borderRadius: 3 }}
        >
          <div
            className="h-full transition-all duration-150"
            style={{ width: `${progressPct}%`, background: fillColor, borderRadius: 3 }}
          />
        </div>
      </div>

      <p
        style={{
          fontFamily: "Jost, sans-serif",
          fontSize: 9,
          fontWeight: 500,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: MUTED_LT,
          marginTop: 14,
          marginBottom: 8,
        }}
      >
        Retainer clients
      </p>

      {clients.length === 0 ? (
        <div>
          <p
            style={{
              fontFamily: "Jost, sans-serif",
              fontSize: 12,
              color: MUTED_LT,
              fontStyle: "italic",
            }}
          >
            No retainer projects yet.
          </p>
          <p style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: MUTED_LT, marginTop: 4 }}>
            Create a retainer project to start tracking.
          </p>
        </div>
      ) : (
        <div>
          {clients.map((c) => {
            const dot = statusDotColor(c.status);
            const hasRate = c.realizedRateThisMonth != null;
            return (
              <div
                key={c.projectId}
                className="flex items-center gap-2.5"
                style={{
                  padding: "7px 0",
                  borderBottom: "0.5px solid rgba(44,44,44,0.07)",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: dot,
                    flexShrink: 0,
                  }}
                />
                <span
                  className="min-w-0 flex-1 truncate"
                  style={{
                    fontFamily: "Jost, sans-serif",
                    fontSize: 13,
                    fontWeight: 500,
                    color: CHARCOAL,
                  }}
                  title={clientDisplayName(c)}
                >
                  {clientDisplayName(c)}
                </span>
                <span
                  style={{
                    fontFamily: "Jost, sans-serif",
                    fontSize: 12,
                    color: MUTED,
                    flexShrink: 0,
                  }}
                >
                  {fmtUsd(c.monthlyFee)}/mo
                </span>
                <span
                  style={{
                    fontFamily: "Jost, sans-serif",
                    fontSize: 12,
                    fontWeight: 500,
                    color: hasRate ? dot : MUTED_LT,
                    flexShrink: 0,
                    minWidth: 52,
                    textAlign: "right",
                  }}
                >
                  {hasRate
                    ? `${fmtUsd(Math.round(c.realizedRateThisMonth!), { decimals: 0 })}/hr`
                    : "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <PaceBanner m={metrics} />
    </>
  );
}

function StatTile({
  label,
  value,
  sub,
  valueColor,
  compact,
}: {
  label: string;
  value: string;
  sub: string;
  valueColor: string;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        background: CREAM,
        borderRadius: 4,
        padding: compact ? "6px 8px" : "8px 10px",
        minWidth: 0,
      }}
    >
      <p
        style={{
          fontSize: compact ? 9 : 10,
          color: MUTED_LT,
          marginBottom: 2,
          lineHeight: 1.2,
          fontFamily: "Jost, sans-serif",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: compact ? 18 : 20,
          fontWeight: 400,
          color: valueColor,
          lineHeight: 1.15,
        }}
      >
        {value}
      </p>
      <p
        style={{
          fontSize: compact ? 9 : 10,
          color: MUTED_LT,
          marginTop: 2,
          lineHeight: 1.2,
          fontFamily: "Jost, sans-serif",
        }}
      >
        {sub}
      </p>
    </div>
  );
}
