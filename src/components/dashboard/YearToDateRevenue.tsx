import { InfoTip } from "@/components/dashboard/InfoTip";
import { fmtUsd } from "@/lib/finance";

const CHARCOAL = "#2C2C2C";
const GOLD = "#B8860B";
const CREAM = "#FAF7F2";
const SAGE = "#5C8A6E";
const TERRA = "#C4714A";
const MUTED = "#6B6259";
const MUTED_LT = "#8A7F75";
const BORDER = "rgba(44,44,44,0.10)";

export type YearToDateRevenueProps = {
  /** Design fees collected YTD (recorded payments). */
  ytdCollected: number;
  /** Prorated YTD revenue target (annual × months elapsed). */
  ytdTarget: number;
  annualTarget: number;
  monthLabel: string;
  monthIndex: number;
  monthsRemaining: number;
  /** Confirmed + projected total revenue YTD. */
  totalRevenue: number;
  projectedRevenue?: number;
  /** Annual design-fee portion of revenue target. Defaults to annualTarget. */
  designFeesAnnualTarget?: number;
  markupCollected?: number;
  markupAnnualTarget?: number;
};

function ProgressRow({
  label,
  collected,
  target,
  fillColor,
  striped,
  info,
  compact,
}: {
  label: string;
  collected: number;
  target: number;
  fillColor: string;
  striped?: boolean;
  info?: { term: string; definition: string };
  compact?: boolean;
}) {
  const pct = target > 0 ? Math.min(100, (collected / target) * 100) : 0;
  return (
    <div style={{ marginTop: compact ? 6 : 8 }}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1" style={{ fontSize: compact ? 10 : 11, color: MUTED }}>
          {label}
          {info ? <InfoTip term={info.term} definition={info.definition} /> : null}
        </span>
        <span style={{ fontSize: compact ? 10 : 11, color: MUTED_LT, flexShrink: 0 }}>
          {fmtUsd(collected)} of {fmtUsd(target)}
        </span>
      </div>
      <div className="overflow-hidden rounded-full" style={{ height: compact ? 4 : 6, background: CREAM }}>
        <div
          className="h-full rounded-full transition-all duration-150"
          style={{
            width: `${pct}%`,
            background: striped
              ? `repeating-linear-gradient(-45deg, ${GOLD}, ${GOLD} 2px, ${CREAM} 2px, ${CREAM} 4px)`
              : fillColor,
          }}
        />
      </div>
    </div>
  );
}

function StatBox({
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
      <p style={{ fontSize: compact ? 9 : 10, color: MUTED_LT, marginBottom: 2, lineHeight: 1.2 }}>{label}</p>
      <p
        style={{
          fontFamily: "Jost, sans-serif",
          fontSize: compact ? 12 : 14,
          fontWeight: 500,
          color: valueColor,
          lineHeight: 1.15,
        }}
      >
        {value}
      </p>
      <p style={{ fontSize: compact ? 9 : 10, color: MUTED_LT, marginTop: 2, lineHeight: 1.2 }}>{sub}</p>
    </div>
  );
}

export function YearToDateBody({
  ytdCollected,
  ytdTarget,
  annualTarget,
  monthLabel,
  monthIndex,
  monthsRemaining,
  totalRevenue,
  designFeesAnnualTarget,
  markupCollected = 0,
  markupAnnualTarget = 0,
  compact,
  showAnnualTargetStat = true,
  feesProgressLabel = "Design fees",
}: YearToDateRevenueProps & {
  compact?: boolean;
  designFeesAnnualTarget: number;
  showAnnualTargetStat?: boolean;
  feesProgressLabel?: string;
}) {
  const onTrack = totalRevenue >= ytdTarget * 0.9;
  const remaining = Math.max(0, annualTarget - totalRevenue);
  const monthlyNeeded = remaining / Math.max(1, monthsRemaining);
  const monthlyAvg = monthIndex > 0 ? totalRevenue / monthIndex : 0;
  const designFill = onTrack ? SAGE : ytdCollected >= designFeesAnnualTarget * (monthIndex / 12) * 0.75 ? GOLD : TERRA;
  const showMarkup = markupAnnualTarget > 0;

  return (
    <>
      <div className="flex items-center justify-between gap-2" style={{ marginBottom: compact ? 6 : 10 }}>
        <p style={{ fontFamily: "Jost, sans-serif", fontSize: compact ? 10 : 11, color: MUTED_LT, lineHeight: 1.3 }}>
          Year to date · {monthIndex} of 12 months
        </p>
        <span style={{ fontFamily: "Jost, sans-serif", fontSize: compact ? 10 : 11, fontWeight: 500, color: onTrack ? SAGE : GOLD, flexShrink: 0 }}>
          {onTrack ? "On pace ↑" : "Behind pace"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1.5" style={{ marginBottom: compact ? 6 : 10 }}>
        <StatBox
          label="Total revenue"
          value={fmtUsd(totalRevenue)}
          sub="confirmed + projected"
          valueColor={onTrack ? SAGE : CHARCOAL}
          compact={compact}
        />
        {showAnnualTargetStat ? (
          <StatBox
            label="Annual target"
            value={fmtUsd(annualTarget)}
            sub="needed by Dec"
            valueColor={CHARCOAL}
            compact={compact}
          />
        ) : (
          <StatBox
            label="Monthly pace"
            value={fmtUsd(monthlyNeeded)}
            sub="needed through Dec"
            valueColor={remaining > 0 ? GOLD : SAGE}
            compact={compact}
          />
        )}
        <StatBox
          label="Remaining"
          value={fmtUsd(remaining)}
          sub={`in ${monthsRemaining} month${monthsRemaining === 1 ? "" : "s"}`}
          valueColor={remaining > 0 ? GOLD : SAGE}
          compact={compact}
        />
      </div>

      <ProgressRow
        label={feesProgressLabel}
        collected={ytdCollected}
        target={designFeesAnnualTarget}
        fillColor={designFill}
        compact={compact}
      />

      {showMarkup && (
        <ProgressRow
          label="Procurement markup"
          collected={markupCollected}
          target={markupAnnualTarget}
          fillColor={GOLD}
          striped
          compact={compact}
          info={{
            term: "Procurement markup",
            definition:
              "Revenue from vendor markup on furniture, fixtures, and equipment sourced for clients — separate from design fees.",
          }}
        />
      )}

      <div
        className={compact ? "line-clamp-3" : "mt-3"}
        style={{
          background: CREAM,
          borderLeft: `3px solid ${GOLD}`,
          borderRadius: 4,
          padding: compact ? "8px 10px" : "10px 12px",
          marginTop: compact ? 8 : 12,
        }}
      >
        <p
          style={{
            fontFamily: "Jost, sans-serif",
            fontSize: compact ? 10 : 11,
            fontStyle: "italic",
            color: MUTED,
            lineHeight: 1.55,
          }}
        >
          {onTrack ? (
            <>
              At your current pace you need{" "}
              <strong style={{ fontWeight: 500, color: CHARCOAL }}>{fmtUsd(monthlyNeeded)}/month</strong> for the next{" "}
              {monthsRemaining} month{monthsRemaining === 1 ? "" : "s"}. Your monthly average this year is{" "}
              <strong style={{ fontWeight: 500, color: CHARCOAL }}>{fmtUsd(monthlyAvg)}</strong> — you&apos;re on track.
            </>
          ) : (
            <>
              To reach {fmtUsd(annualTarget)} by December you need{" "}
              <strong style={{ fontWeight: 500, color: CHARCOAL }}>{fmtUsd(remaining)}</strong> more — about{" "}
              <strong style={{ fontWeight: 500, color: CHARCOAL }}>{fmtUsd(monthlyNeeded)}/month</strong> through {monthLabel}.
            </>
          )}
        </p>
      </div>
    </>
  );
}

export function YearToDateRevenue({
  ytdCollected,
  ytdTarget,
  annualTarget,
  monthLabel,
  monthIndex,
  monthsRemaining,
  totalRevenue,
  projectedRevenue: _projectedRevenue,
  designFeesAnnualTarget,
  markupCollected,
  markupAnnualTarget,
  className,
  variant = "panel",
}: YearToDateRevenueProps & { className?: string; variant?: "tile" | "panel" }) {
  const isTile = variant === "tile";
  const designTarget = designFeesAnnualTarget ?? annualTarget;

  return (
    <div
      className={
        isTile
          ? `flex h-full min-h-0 flex-col border bg-white ${className ?? ""}`
          : `rounded-xl border bg-white px-5 py-5 sm:px-[22px] ${className ?? "mt-4"}`
      }
      style={{
        borderColor: BORDER,
        padding: isTile ? "12px 16px" : undefined,
        borderRadius: isTile ? 6 : undefined,
      }}
    >
      {!isTile && (
        <p
          style={{
            fontFamily: "Jost, sans-serif",
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: MUTED_LT,
            marginBottom: 12,
          }}
        >
          How you&apos;re getting there
        </p>
      )}

      <YearToDateBody
        ytdCollected={ytdCollected}
        ytdTarget={ytdTarget}
        annualTarget={annualTarget}
        monthLabel={monthLabel}
        monthIndex={monthIndex}
        monthsRemaining={monthsRemaining}
        totalRevenue={totalRevenue}
        designFeesAnnualTarget={designTarget}
        markupCollected={markupCollected}
        markupAnnualTarget={markupAnnualTarget}
        compact={isTile}
      />
    </div>
  );
}
