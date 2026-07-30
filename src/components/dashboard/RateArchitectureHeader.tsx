import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { calc } from "@/lib/finance";
import { fmtUsd } from "@/lib/finance";
import { AlignedRateBreakdown } from "./AlignedRateBreakdown";
import { MetricBreakdown } from "./MetricBreakdown";
import { UnderstandYourNumbers, type UnderstandYourNumbersProps } from "./UnderstandYourNumbers";
import {
  normalizePricingStructure,
  referenceProjectHours,
  isRetainerFirm,
} from "@/lib/pricing-structure";
import { RetainerBenchmarkCard } from "./RetainerBenchmarkCard";
import type { RetainerPortfolioMetrics } from "@/lib/retainer-metrics";

type Calc = ReturnType<typeof calc>;

const CHARCOAL = "#2C2C2C";
const GOLD = "#B8860B";
const CREAM = "#FAF7F2";
const SAGE = "#5C8A6E";
const TERRA = "#C4714A";
const BORDER = "rgba(44,44,44,0.10)";
const MUTED = "rgba(44,44,44,0.55)";

const WEEKS_PER_YEAR = 48;

function pillFor(health: Calc["rateHealth"]) {
  if (health === "healthy")
    return { label: "Above floor", bg: "rgba(92,138,110,0.10)", color: SAGE };
  if (health === "below_floor")
    return { label: "Below floor", bg: "rgba(184,134,11,0.10)", color: GOLD };
  return { label: "Below break-even", bg: "rgba(196,113,74,0.12)", color: TERRA };
}

function rateColor(health: Calc["rateHealth"]) {
  return health === "healthy" ? SAGE : health === "below_floor" ? GOLD : TERRA;
}

function agoLabel(ts: string | null | undefined) {
  if (!ts) return "Updated just now";
  const then = new Date(ts).getTime();
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "Updated just now";
  if (mins < 60) return `Updated ${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Updated ${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `Updated ${days} day${days === 1 ? "" : "s"} ago`;
}

/* ─────────────────────────── Zone A ─────────────────────────── */

export function RateArchitecturePanel({
  c,
  cfg,
  members,
  expenses,
  targetMarginPct,
  configUpdatedAt,
  projectScopedHours = [],
  understandProps,
  className,
  retainerMetrics,
}: {
  c: Calc;
  cfg: any;
  members: any[];
  expenses: any[];
  targetMarginPct: number;
  configUpdatedAt?: string | null;
  projectScopedHours?: number[];
  understandProps?: UnderstandYourNumbersProps;
  className?: string;
  retainerMetrics?: RetainerPortfolioMetrics | null;
}) {
  const pricingStructure = normalizePricingStructure(cfg?.pricing_structure);
  const isFlatFeePricing = pricingStructure === "flat_fee";
  const isRetainerPricing = isRetainerFirm(pricingStructure);
  const pill = pillFor(c.rateHealth);
  const aligned = c.alignedRate || 0;
  const billed = c.billedRate || 0;
  const be = c.breakEvenRate || 0;
  const gap = Math.max(0, aligned - billed);
  const surplus = Math.max(0, billed - aligned);
  const toBreakeven = Math.max(0, be - billed);
  const marginPerHr = (targetMarginPct / 100) * aligned;

  // Annual figures
  const costFloor = c.totalCost || 0;

  // Position of billed indicator on bar (relative to aligned as 100%)
  const barMax = aligned > 0 ? aligned : 1;
  const bePct = Math.min(100, (be / barMax) * 100);
  const billedPct = Math.min(100, Math.max(0, (billed / barMax) * 100));

  const [understandOpen, setUnderstandOpen] = useState(false);

  // Annual gap for below_floor decision prompt
  const annualGap = gap * c.annualBillableHrs;
  const monthlyGap = annualGap / 12;
  const hoursNeeded = billed > 0 ? Math.max(0, costFloor / billed - c.annualBillableHrs) : 0;
  const referenceHours = referenceProjectHours(projectScopedHours);

  return (
    <div
      data-tour="rate-panel"
      className={className}
      style={{
        background: "white",
        border: `0.5px solid ${BORDER}`,
        borderRadius: 8,
        padding: "24px 28px",
        fontFamily: "Jost, sans-serif",
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: GOLD,
            }}
          >
            Rate architecture
          </div>
          <div
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 18,
              color: CHARCOAL,
              marginTop: 2,
            }}
          >
            Your financial floor
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 11, color: MUTED }}>{agoLabel(configUpdatedAt)}</span>
          <Link
            to="/settings"
            style={{ fontSize: 11, color: GOLD, letterSpacing: "0.06em" }}
            className="hover:underline"
          >
            Edit inputs →
          </Link>
        </div>
      </div>

      {/* Aligned rate primary display */}
      <div style={{ marginTop: 18 }}>
        {isFlatFeePricing ? (
          <>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: MUTED,
              }}
            >
              Your aligned rate
            </div>
            <div className="flex items-baseline gap-2 flex-wrap" style={{ marginTop: 4 }}>
              <span
                data-tour="aligned-rate-value"
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 36,
                  lineHeight: 1,
                  color: CHARCOAL,
                  fontWeight: 400,
                }}
              >
                {fmtUsd(aligned, { decimals: 0 })}
              </span>
              <span style={{ fontSize: 14, color: MUTED }}>/hr</span>
              <AlignedRateBreakdown c={c} targetMarginPct={targetMarginPct} side="bottom" />
            </div>
            <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
              {referenceHours.map((hrs) => (
                <div
                  key={hrs}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    fontFamily: "Jost, sans-serif",
                    fontSize: 13,
                    color: "#6B6259",
                  }}
                >
                  <span>{hrs}-hour project:</span>
                  <span style={{ color: CHARCOAL, fontWeight: 500 }}>
                    min fee {fmtUsd(aligned * hrs, { decimals: 0 })}
                  </span>
                </div>
              ))}
            </div>
            <p
              style={{
                marginTop: 12,
                fontFamily: "Jost, sans-serif",
                fontSize: 11,
                fontStyle: "italic",
                color: MUTED,
                lineHeight: 1.6,
              }}
            >
              These are minimum fees at your aligned rate. Add your target margin to get your quoted fee.
            </p>
          </>
        ) : (
          <>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: MUTED,
              }}
            >
              Aligned rate
            </div>
            <div className="flex items-baseline gap-2 flex-wrap" style={{ marginTop: 4 }}>
              <span
                data-tour="aligned-rate-value"
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: "clamp(44px, 6vw, 56px)",
                  lineHeight: 1,
                  color: CHARCOAL,
                  fontWeight: 400,
                }}
              >
                {fmtUsd(aligned, { decimals: 0 })}
              </span>
              <span style={{ fontSize: 14, color: MUTED }}>/hr</span>
              {!isRetainerPricing ? (
                <span
                  style={{
                    marginLeft: 10,
                    fontSize: 11,
                    fontWeight: 500,
                    padding: "3px 8px",
                    borderRadius: 3,
                    background: pill.bg,
                    color: pill.color,
                  }}
                >
                  {pill.label}
                </span>
              ) : null}
              <AlignedRateBreakdown c={c} targetMarginPct={targetMarginPct} side="bottom" />
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 400,
                color: MUTED,
                marginTop: 6,
              }}
            >
              Your floor. The minimum hourly rate your cost structure requires.
            </div>
          </>
        )}
      </div>

      {!isFlatFeePricing && !isRetainerPricing ? (
        <>
          {/* Three-number row */}
          <div
            data-tour="rate-stats-row"
            className="grid grid-cols-3"
            style={{ marginTop: 22, borderTop: `1px solid ${BORDER}`, paddingTop: 18 }}
          >
            <NumCell
              label="Your rate"
              value={fmtUsd(billed, { decimals: 0 }) + "/hr"}
              valueColor={rateColor(c.rateHealth)}
              hint={
                billed <= 0 ? null : billed < aligned
                  ? `-${fmtUsd(gap, { decimals: 0 })}/hr below floor`
                  : `+${fmtUsd(surplus, { decimals: 0 })}/hr above floor`
              }
              hintColor={billed < aligned ? (c.rateHealth === "critical" ? TERRA : GOLD) : SAGE}
              trailing={
                <MetricBreakdown metric="billed" c={c} targetMarginPct={targetMarginPct} side="bottom" iconSize={12} />
              }
              divider
            />
            <NumCell
              label="Break-even"
              value={fmtUsd(be, { decimals: 0 }) + "/hr"}
              valueColor={CHARCOAL}
              hint="Cost-only floor"
              hintColor={MUTED}
              trailing={
                <MetricBreakdown metric="breakeven" c={c} cfg={cfg} side="bottom" iconSize={12} />
              }
              divider
              center
            />
            <NumCell
              label="Margin target"
              value={`${(targetMarginPct || 0).toFixed(0)}%`}
              valueColor={billed >= aligned ? SAGE : GOLD}
              hint={`${fmtUsd(marginPerHr, { decimals: 0 })}/hr per billable hour`}
              hintColor={MUTED}
              trailing={
                <MetricBreakdown metric="margin" c={c} targetMarginPct={targetMarginPct} side="bottom" iconSize={12} />
              }
            />
          </div>

          {/* Rate position bar */}
          <div style={{ marginTop: 20 }}>
            <div
              data-tour="rate-bar"
              style={{
                position: "relative",
                height: 8,
                borderRadius: 4,
                overflow: "visible",
                background: "transparent",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 4,
                  display: "flex",
                  overflow: "hidden",
                }}
              >
                <div style={{ width: `${bePct}%`, background: "rgba(44,44,44,0.08)" }} />
                <div style={{ flex: 1, background: "rgba(184,134,11,0.10)" }} />
              </div>
              <div
                style={{
                  position: "absolute",
                  left: `${billedPct}%`,
                  top: -5,
                  height: 18,
                  width: 2,
                  background: rateColor(c.rateHealth),
                  transform: "translateX(-1px)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: `${billedPct}%`,
                  top: -22,
                  transform: "translateX(-50%)",
                  fontSize: 11,
                  fontWeight: 500,
                  color: rateColor(c.rateHealth),
                  whiteSpace: "nowrap",
                }}
              >
                {fmtUsd(billed, { decimals: 0 })}/hr ▾
              </div>
            </div>
            <div className="flex justify-between" style={{ marginTop: 4, fontSize: 11, color: MUTED }}>
              <span>{fmtUsd(be, { decimals: 0 })}</span>
              <span style={{ color: GOLD }}>{fmtUsd(aligned, { decimals: 0 })}</span>
            </div>
          </div>

          {/* Decision prompt */}
          {billed > 0 && billed < aligned && (
            <div
              style={{
                marginTop: 14,
                padding: "10px 14px",
                borderRadius: "0 4px 4px 0",
                fontSize: 11,
                fontWeight: 400,
                lineHeight: 1.7,
                background:
                  c.rateHealth === "critical" ? "rgba(196,113,74,0.06)" : "rgba(184,134,11,0.06)",
                borderLeft: `2px solid ${c.rateHealth === "critical" ? TERRA : GOLD}`,
              }}
            >
              {c.rateHealth === "critical" ? (
                <>
                  At {fmtUsd(billed, { decimals: 0 })}/hr you need to raise your rate by{" "}
                  <strong>{fmtUsd(toBreakeven, { decimals: 0 })}/hr</strong> just to cover costs — or bill{" "}
                  <strong>{Math.round(hoursNeeded)}</strong> more hours per year at your current rate.
                </>
              ) : (
                <>
                  At {fmtUsd(billed, { decimals: 0 })}/hr you're leaving{" "}
                  <strong>{fmtUsd(annualGap, { decimals: 0 })}/yr</strong> in margin on the table. That's{" "}
                  <strong>{fmtUsd(monthlyGap, { decimals: 0 })}/mo</strong> in uncaptured profit.
                </>
              )}
              <div className="flex gap-4" style={{ marginTop: 6 }}>
                <Link to="/settings" style={{ color: GOLD }} className="hover:underline">
                  Model a rate increase →
                </Link>
                <Link to="/projects" style={{ color: GOLD }} className="hover:underline">
                  {c.rateHealth === "critical" ? "See what this rate looks like on a project →" : "Apply to an active project →"}
                </Link>
              </div>
            </div>
          )}
        </>
      ) : null}

      {isRetainerPricing && retainerMetrics ? (
        <RetainerBenchmarkCard metrics={retainerMetrics} />
      ) : null}

      {/* Annual impact row */}
      <div
        className="grid grid-cols-2 gap-6"
        style={{
          marginTop: 22,
          ...(isFlatFeePricing ? { borderTop: `1px solid ${BORDER}`, paddingTop: 18 } : {}),
        }}
      >
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: MUTED, fontWeight: 600 }}>
            Cost floor (annual)
          </div>
          <div className="flex items-baseline gap-1" style={{ marginTop: 4 }}>
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: CHARCOAL }}>
              {fmtUsd(costFloor, { decimals: 0 })}
            </span>
            <span data-tour="cost-floor-icon" style={{ display: "inline-flex" }}>
              <MetricBreakdown
                metric="cost_floor"
                c={c}
                members={members}
                expenses={expenses}
                side="bottom"
                iconSize={12}
              />
            </span>
          </div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>What the firm must earn</div>
        </div>
        <div
          style={{
            background: CREAM,
            borderRadius: 6,
            padding: "10px 12px",
            border: `1px solid ${BORDER}`,
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: MUTED,
              fontWeight: 600,
            }}
          >
            Revenue capacity (planning)
          </div>
          <p style={{ fontSize: 11, color: MUTED, marginTop: 6, lineHeight: 1.55 }}>
            Scenario math from rates and hours — not what you&apos;ve collected. YTD and realized rate are on the
            revenue tile.
          </p>
          <Link
            to="/settings"
            search={{ panel: "rate" }}
            style={{ fontSize: 11, color: GOLD, marginTop: 8, display: "inline-block" }}
            className="hover:underline"
          >
            Model capacity & utilization →
          </Link>
        </div>
      </div>

      {/* Understand your numbers (collapsible) */}
      {understandProps && (
        <>
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
            <button
              type="button"
              onClick={() => setUnderstandOpen((v) => !v)}
              className="flex items-center gap-1 hover:opacity-80"
              style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED, fontWeight: 600 }}
            >
              {understandOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Understand your numbers
            </button>
          </div>

          {understandOpen && (
            <div style={{ marginTop: 10 }}>
              <UnderstandYourNumbers {...understandProps} variant="embedded" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NumCell({
  label,
  value,
  valueColor,
  hint,
  hintColor,
  trailing,
  divider,
  center,
}: {
  label: string;
  value: string;
  valueColor: string;
  hint: string | null;
  hintColor: string;
  trailing?: React.ReactNode;
  divider?: boolean;
  center?: boolean;
}) {
  return (
    <div style={divider ? { borderRight: `1px solid ${BORDER}`, paddingRight: 16 } : { paddingLeft: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: MUTED, fontWeight: 600, textAlign: center ? "center" : undefined }}>
        {label}
      </div>
      <div className={`flex items-baseline gap-1 ${center ? "justify-center" : ""}`} style={{ marginTop: 4 }}>
        <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, color: valueColor, lineHeight: 1 }}>
          {value}
        </span>
        {trailing}
      </div>
      {hint && <div style={{ fontSize: 11, color: hintColor, marginTop: 4, textAlign: center ? "center" : undefined }}>{hint}</div>}
    </div>
  );
}

/* ─────────────────────────── Zone B ─────────────────────────── */

export function HoursThisWeekTile({
  weekBillable,
  targetHrs,
  className,
}: {
  weekBillable: number;
  targetHrs: number;
  className?: string;
}) {
  const remaining = Math.max(0, targetHrs - weekBillable);
  const hoursPct = targetHrs > 0 ? (weekBillable / targetHrs) * 100 : 0;

  return (
    <PulseCard label="Hours this week" className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: CHARCOAL, lineHeight: 1.1 }}>
          {weekBillable.toFixed(1)}/{targetHrs} hrs
        </span>
        <Link to="/time-calendar" style={{ fontSize: 11, color: GOLD, flexShrink: 0 }} className="hover:underline">
          Enter hours →
        </Link>
      </div>
      <div className="pt-2">
        <MiniBar pct={hoursPct} />
        <div style={{ fontSize: 11, color: remaining <= 0 ? SAGE : MUTED, marginTop: 4 }}>
          {remaining <= 0 ? "Target reached" : `${remaining.toFixed(1)} hrs to target`}
        </div>
      </div>
    </PulseCard>
  );
}

export function FourWeekTrendTile({
  trend,
  targetHrs,
  className,
}: {
  trend: Array<{ billable: number; total: number }>;
  targetHrs: number;
  className?: string;
}) {
  const trendAvg = trend.length > 0 ? trend.reduce((s, w) => s + w.billable, 0) / trend.length : 0;
  const trendUtil = targetHrs > 0 ? (trendAvg / targetHrs) * 100 : 0;
  const weeksOnTarget = trend.filter((w) => targetHrs > 0 && w.billable >= targetHrs).length;
  const trendColor = weeksOnTarget >= 3 ? SAGE : weeksOnTarget === 2 ? GOLD : TERRA;

  return (
    <PulseCard label="4-week trend" className={className}>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: CHARCOAL, lineHeight: 1.1 }}>
        {trendAvg.toFixed(1)}/{targetHrs} hrs/wk
      </div>
      <div className="pt-2">
        <MiniBar pct={trendUtil} />
        <div className="mt-1 flex items-center justify-between" style={{ fontSize: 11, color: MUTED }}>
          <span>Utilization {Math.round(trendUtil)}%</span>
          <span style={{ color: trendColor }}>{weeksOnTarget} of 4 on target</span>
        </div>
      </div>
    </PulseCard>
  );
}

/** @deprecated Use HoursThisWeekTile + FourWeekTrendTile in the architecture row grid. */
export function WeeklyPulse({
  weekBillable,
  targetHrs,
  trend,
}: {
  weekBillable: number;
  targetHrs: number;
  trend: Array<{ billable: number; total: number }>;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <HoursThisWeekTile weekBillable={weekBillable} targetHrs={targetHrs} />
      <FourWeekTrendTile trend={trend} targetHrs={targetHrs} />
    </div>
  );
}

function PulseCard({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={className ?? ""}
      style={{
        background: "white",
        border: `0.5px solid ${BORDER}`,
        borderRadius: 6,
        padding: "12px 16px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: MUTED,
          fontWeight: 500,
          marginBottom: 6,
          flexShrink: 0,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function MiniBar({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, pct));
  const fill = p >= 100 ? SAGE : p >= 60 ? GOLD : TERRA;
  return (
    <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: "rgba(44,44,44,0.06)", overflow: "hidden" }}>
      <div style={{ width: `${p}%`, height: "100%", background: fill, transition: "width 400ms ease" }} />
    </div>
  );
}

/* ─────────────────────────── Part C — Pricing Strip ─────────────────────────── */

export function PricingStrip({
  aligned,
  templates,
}: {
  aligned: number;
  templates: Array<{ id: string; name: string; total_hrs: number }>;
}) {
  const chips = useMemo(() => {
    const source = templates.slice(0, 3);
    if (source.length > 0) return source;
    return [
      { id: "fr", name: "Full Residential", total_hrs: 220 },
      { id: "ko", name: "Kitchen-Only", total_hrs: 90 },
      { id: "ff", name: "FF&E Procurement", total_hrs: 60 },
    ];
  }, [templates]);

  return (
    <div
      style={{
        background: CREAM,
        border: `0.5px solid ${BORDER}`,
        borderRadius: 6,
        padding: "14px 20px",
        marginBottom: 16,
        fontFamily: "Jost, sans-serif",
      }}
      className="flex flex-col md:flex-row md:items-center gap-4"
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, color: CHARCOAL }}>
          Your aligned rate is {fmtUsd(aligned, { decimals: 0 })}/hr.
        </div>
        <div style={{ fontSize: 11, fontWeight: 400, color: MUTED, marginTop: 2 }}>
          Any project priced below this rate costs you money to deliver.
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {chips.map((t) => (
          <div
            key={t.id}
            style={{
              background: "white",
              border: `0.5px solid ${BORDER}`,
              borderRadius: 4,
              padding: "8px 12px",
              minWidth: 130,
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {t.name}
            </div>
            <div style={{ fontSize: 11, color: CHARCOAL, marginTop: 2 }}>~{Math.round(t.total_hrs)} hrs</div>
            <div style={{ fontSize: 11, color: GOLD }}>
              = {fmtUsd(t.total_hrs * aligned, { decimals: 0 })} at floor
            </div>
          </div>
        ))}
      </div>
      <Link
        to="/projects"
        style={{
          background: CHARCOAL,
          color: "white",
          borderRadius: 4,
          padding: "8px 16px",
          fontSize: 11,
          fontWeight: 500,
          whiteSpace: "nowrap",
        }}
        className="hover:opacity-90"
      >
        Price a project →
      </Link>
    </div>
  );
}

/* Toast-on-health-change tracker (returned as hook for parent to mount) */
export function useHealthChangeToast(current: Calc["rateHealth"]) {
  const prev = useRef<Calc["rateHealth"] | null>(null);
  useEffect(() => {
    if (prev.current !== null && prev.current !== current) {
      import("sonner").then(({ toast }) => toast("Rate health updated", { duration: 1500 }));
    }
    prev.current = current;
  }, [current]);
}