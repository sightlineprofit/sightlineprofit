import { useEffect, useRef, useState } from "react";
import { getProjectFinancials, type ProjectCostSnapshot, type ProjectPricingMethod } from "@/lib/finance";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";

// ─── Formatting helpers ────────────────────────────────────────────────────
function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 10000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}
function fmtPct1(n: number): string {
  return `${(Math.round(n * 10) / 10).toFixed(1)}%`;
}
function fmtHours(n: number): string {
  if (n < 10 && n % 1 !== 0) return `${(Math.round(n * 10) / 10).toFixed(1)} hrs`;
  return `${Math.round(n)} hrs`;
}
function fmtRate(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}/hr`;
}

// ─── Colors ────────────────────────────────────────────────────────────────
const SAGE = "#5C8A6E";
const GOLD = "#B8860B";
const TERRA = "#C4714A";
const MUTED = "#8A7F75";
const CHARCOAL = "#2C2C2C";

type CardProject = {
  id: string;
  name: string;
  client_name?: string | null;
  pricing_method: ProjectPricingMethod | string | null | undefined;
  flat_fee_amount?: number | null;
  fixed_fee?: number | null;
  scoped_rate?: number | null;
  scoped_hrs?: number | null;
  hourly_scoped_hours?: number | null;
};

export type ProjectCardProps = {
  project: CardProject;
  snapshot: ProjectCostSnapshot | null;
  hoursLogged: number;
  lastEntryDate: Date | string | null;
  onClick: () => void;
};

function healthColorFor(
  marginRemainingPct: number,
  marginRemaining: number,
  targetPct: number,
  hoursLogged: number,
): string {
  if (hoursLogged === 0) return MUTED;
  if (marginRemaining < 0) return TERRA;
  if (marginRemainingPct < targetPct * 0.5) return TERRA;
  if (marginRemainingPct < targetPct) return GOLD;
  return SAGE;
}

export function ProjectCard({ project, snapshot, hoursLogged, lastEntryDate, onClick }: ProjectCardProps) {
  // ─── Missing snapshot: minimal card ────────────────────────────────────
  if (!snapshot) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group relative w-full overflow-hidden rounded-lg bg-white p-[18px_20px] text-left transition-shadow hover:shadow-md"
        style={{ border: "0.5px solid rgba(44,44,44,0.10)" }}
      >
        <div
          style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: CHARCOAL, lineHeight: 1.2 }}
        >
          {project.name}
        </div>
        {project.client_name && (
          <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, color: MUTED, marginTop: 2 }}>
            {project.client_name}
          </div>
        )}
        <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 12, color: MUTED, marginTop: 10 }}>
          Cost structure not yet captured. Open this project to complete setup.
        </div>
      </button>
    );
  }

  const project_for_calc = {
    ...project,
    // Backwards compat: fall back to `fixed_fee` when `flat_fee_amount` unset.
    flat_fee_amount:
      project.flat_fee_amount != null
        ? project.flat_fee_amount
        : (project.pricing_method === "flat_fee" || !project.pricing_method) && project.fixed_fee
          ? project.fixed_fee
          : project.flat_fee_amount,
  };

  const fin = getProjectFinancials({
    project: project_for_calc,
    snapshot,
    hoursLogged,
    lastEntryDate: lastEntryDate ?? null,
  });

  const health = healthColorFor(fin.marginRemainingPct, fin.marginRemaining, fin.targetMarginPct, hoursLogged);
  const isCritical = fin.freshnessState === "critical" && hoursLogged > 0;

  // ─── Effective rate drop animation ─────────────────────────────────────
  const prevRateRef = useRef<number | null>(null);
  const [rateDropped, setRateDropped] = useState(false);
  useEffect(() => {
    if (fin.effectiveRate == null) return;
    const prev = prevRateRef.current;
    prevRateRef.current = fin.effectiveRate;
    if (prev != null && fin.effectiveRate < prev) {
      setRateDropped(true);
      const t = setTimeout(() => setRateDropped(false), 620);
      return () => clearTimeout(t);
    }
  }, [fin.effectiveRate]);

  // ─── Empty scope card ──────────────────────────────────────────────────
  const noScope = fin.scopedHours === 0;

  const pricingLabel =
    fin.pricingMethod === "hourly" ? "Hourly" : fin.pricingMethod === "hybrid" ? "Hybrid" : "Flat fee";

  // Sub-label describing revenue calc
  let revenueSubLabel = "";
  let revenueSubColor = MUTED;
  if (fin.pricingMethod === "flat_fee") {
    revenueSubLabel = "Fixed project fee";
  } else if (fin.pricingMethod === "hourly") {
    revenueSubLabel = `${fmtHours(fin.scopedHours)} × $${Math.round(Number(project.scoped_rate || 0))}/hr`;
  } else {
    const hrs = Number(project.hourly_scoped_hours);
    if (!hrs) {
      revenueSubLabel = "Hourly hours not set";
      revenueSubColor = GOLD;
    } else {
      revenueSubLabel = `$${Math.round(fin.flatFeeAmount).toLocaleString("en-US")} + ${fmtHours(hrs)} × $${Math.round(Number(project.scoped_rate || 0))}/hr`;
    }
  }

  const stripeStyle: React.CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderRadius: "8px 0 0 8px",
    background: health,
  };
  if (isCritical) {
    stripeStyle.backgroundImage = `repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.3) 4px, rgba(255,255,255,0.3) 8px)`;
  }

  // Freshness dot / badge
  const showFreshness = hoursLogged > 0;
  const freshDot =
    fin.freshnessState === "current"
      ? SAGE
      : fin.freshnessState === "stale"
        ? GOLD
        : TERRA;

  // Margin color
  const marginColor =
    fin.marginRemaining <= 0 ? TERRA : fin.isBelowTarget ? GOLD : SAGE;

  // Effective rate color
  const effRateColor =
    fin.effectiveRate == null
      ? CHARCOAL
      : fin.effectiveRate >= (Number(snapshot.aligned_rate) || 0)
        ? SAGE
        : fin.effectiveRate >= (Number(snapshot.break_even_rate) || 0)
          ? GOLD
          : TERRA;

  // Cost allocation shares
  const rev = Math.max(fin.totalRevenue, 1);
  const seg = (v: number) => Math.max(0, (v / rev) * 100);
  const marginSegPct = fin.marginRemaining > 0 ? seg(fin.marginRemaining) : 0;
  const staleOverlayOpacity = fin.freshnessState !== "current" && hoursLogged > 0 ? 0.6 : 1;

  const daysAgoLabel = (n: number) => (n === 1 ? "1 day ago" : `${n} days ago`);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative w-full overflow-hidden rounded-lg bg-white text-left transition-all"
      style={{
        border: "0.5px solid rgba(44,44,44,0.10)",
        padding: "18px 20px",
        boxShadow: undefined,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 4px 16px rgba(44,44,44,0.10)";
        e.currentTarget.style.borderColor = "rgba(44,44,44,0.20)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "";
        e.currentTarget.style.borderColor = "rgba(44,44,44,0.10)";
      }}
    >
      <span aria-hidden style={stripeStyle} />

      {/* ─── Row 1 — Name + badges ─── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 400, color: CHARCOAL, lineHeight: 1.2, marginBottom: 2 }}
          >
            {project.name}
          </div>
          {project.client_name && (
            <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, color: MUTED, marginTop: 2 }}>
              {project.client_name}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <span
            style={{
              fontFamily: "'Jost', sans-serif",
              fontSize: 9,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.10em",
              padding: "2px 7px",
              borderRadius: 3,
              background: "rgba(44,44,44,0.06)",
              color: MUTED,
            }}
          >
            {pricingLabel}
          </span>
          {showFreshness && fin.freshnessState === "current" && (
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: freshDot }} />
          )}
          {showFreshness && fin.freshnessState === "stale" && (
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: freshDot }} />
              <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 9, color: GOLD }}>Est.</span>
            </span>
          )}
          {showFreshness && fin.freshnessState === "critical" && (
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: freshDot }} />
              <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 9, color: TERRA, fontWeight: 500 }}>Stale</span>
            </span>
          )}
        </div>
      </div>

      {noScope ? (
        <div
          style={{
            background: "rgba(44,44,44,0.03)",
            borderRadius: 4,
            padding: "12px 14px",
            marginTop: 4,
            textAlign: "center",
          }}
        >
          <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 13, fontWeight: 500, color: CHARCOAL, marginBottom: 4 }}>
            Scope not set
          </div>
          <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
            Attach an SOP workflow or add phases to calculate revenue and margin.
          </div>
        </div>
      ) : (
        <>
          {/* ─── Row 2 — Revenue + Margin ─── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              paddingBottom: 14,
              borderBottom: "0.5px solid rgba(44,44,44,0.07)",
              marginBottom: 14,
            }}
          >
            <div>
              <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: MUTED, marginBottom: 3 }}>
                TOTAL REVENUE
              </div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 300, color: CHARCOAL, lineHeight: 1.05 }}>
                {fin.totalRevenue > 0 ? fmtMoney(fin.totalRevenue) : "$0"}
              </div>
              <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, color: revenueSubColor, marginTop: 2 }}>
                {revenueSubLabel}
              </div>
              {fin.pricingMethod === "flat_fee" && fin.totalRevenue === 0 && (
                <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, color: GOLD, marginTop: 2 }}>
                  Project fee not entered. Edit project to set fee.
                </div>
              )}
            </div>
            <div>
              <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: MUTED, marginBottom: 3 }}>
                PROFIT REMAINING
              </div>
              <div
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 24,
                  fontWeight: 300,
                  color: marginColor,
                  lineHeight: 1.05,
                  opacity: fin.freshnessState !== "current" && hoursLogged > 0 ? 0.7 : 1,
                  textDecoration: isCritical ? "line-through" : undefined,
                }}
              >
                {fin.freshnessState !== "current" && hoursLogged > 0 ? "~" : ""}
                {fmtMoney(fin.marginRemaining)}
                {isCritical ? "?" : ""}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 3 }}>
                <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, fontWeight: 500, color: marginColor }}>
                  {fmtPct1(fin.marginRemainingPct)}
                </span>
                {hoursLogged > 0 && (fin.isAboveTarget || fin.isBelowTarget) && (
                  <span
                    style={{
                      fontFamily: "'Jost', sans-serif",
                      fontSize: 9,
                      padding: "1px 5px",
                      borderRadius: 2,
                      background: fin.isAboveTarget ? "rgba(92,138,110,0.10)" : "rgba(196,113,74,0.10)",
                      color: fin.isAboveTarget ? SAGE : TERRA,
                    }}
                  >
                    {fin.isAboveTarget ? "↑" : "↓"}
                    {Math.abs(Math.round(fin.marginVariance * 10) / 10).toFixed(1)}% vs target
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ─── Row 3 — Hours progress ─── */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
              <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: MUTED }}>
                HOURS
              </span>
              <span
                style={{
                  fontFamily: "'Jost', sans-serif",
                  fontSize: 11,
                  fontWeight: 500,
                  color: fin.scopedHours === 0 ? MUTED : CHARCOAL,
                }}
              >
                {fin.scopedHours === 0
                  ? "No scope set"
                  : `${fmtHours(hoursLogged).replace(" hrs", "")} of ${fmtHours(fin.scopedHours)}`}
              </span>
            </div>
            <div style={{ position: "relative", height: 6, background: "rgba(44,44,44,0.08)", borderRadius: 3, overflow: "visible" }}>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  height: 6,
                  width: `${Math.min(100, fin.pctConsumed)}%`,
                  borderRadius: 3,
                  background: health,
                  transition: "width 0.4s ease",
                }}
              />
              {fin.overHours > 0 && fin.scopedHours > 0 && (
                <div
                  style={{
                    position: "absolute",
                    left: "100%",
                    top: -1,
                    height: 8,
                    background: TERRA,
                    borderRadius: "0 3px 3px 0",
                    minWidth: 4,
                    width: `${Math.min(40, (fin.overHours / fin.scopedHours) * 100)}%`,
                  }}
                />
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 5 }}>
              <span
                style={{
                  fontFamily: "'Jost', sans-serif",
                  fontSize: 10,
                  fontWeight: fin.overHours > 0 ? 500 : 400,
                  color: fin.overHours > 0 ? TERRA : MUTED,
                }}
              >
                {hoursLogged === 0
                  ? "No time logged yet"
                  : fin.overHours > 0
                    ? `${fmtHours(fin.overHours)} over scope`
                    : `${fmtHours(fin.hoursRemaining)} remaining`}
              </span>
              {fin.overHours > 0 && (
                <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, fontWeight: 500, color: TERRA }}>
                  −{fmtMoney(fin.marginErosion)} margin
                </span>
              )}
            </div>
          </div>

          {/* ─── Row 4 — Cost allocation ─── */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: MUTED, marginBottom: 5 }}>
              REVENUE ALLOCATION
            </div>
            <div style={{ height: 10, borderRadius: 4, overflow: "hidden", display: "flex", width: "100%", opacity: staleOverlayOpacity }}>
              {fin.compAllocation > 0 && (
                <span style={{ background: "#2C2C2C", flexBasis: `${seg(fin.compAllocation)}%`, minWidth: 2 }} />
              )}
              {fin.opexAllocation > 0 && (
                <span style={{ background: "#6B6259", flexBasis: `${seg(fin.opexAllocation)}%` }} />
              )}
              {fin.teamAllocation > 0 && (
                <span style={{ background: "#8A7F75", flexBasis: `${seg(fin.teamAllocation)}%` }} />
              )}
              {fin.taxReserve > 0 && (
                <span
                  style={{
                    background: "#C4C0BB",
                    flexBasis: `${seg(fin.taxReserve)}%`,
                    backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.2) 3px, rgba(255,255,255,0.2) 6px)`,
                  }}
                />
              )}
              {marginSegPct > 0 && (
                <span style={{ background: health, flexBasis: `${marginSegPct}%` }} />
              )}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px", marginTop: 6 }}>
              {fin.compAllocation > 0 && <LegendItem color="#2C2C2C" label="Comp" amount={fmtMoney(fin.compAllocation)} />}
              {fin.opexAllocation > 0 && <LegendItem color="#6B6259" label="Op Ex" amount={fmtMoney(fin.opexAllocation)} />}
              {fin.teamAllocation > 0 && <LegendItem color="#8A7F75" label="Team" amount={fmtMoney(fin.teamAllocation)} />}
              {fin.taxReserve > 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: "#C4C0BB", display: "inline-block" }} />
                  <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 9, color: MUTED }}>Tax</span>
                  <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 9, fontWeight: 500, color: CHARCOAL }}>
                    ~{fmtMoney(fin.taxReserve)}
                  </span>
                  <HoverCard>
                    <HoverCardTrigger asChild>
                      <span
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: 9, color: GOLD, cursor: "pointer" }}
                      >
                        ⓘ
                      </span>
                    </HoverCardTrigger>
                    <HoverCardContent
                      side="top"
                      className="max-w-[240px] text-[12px]"
                      style={{ fontFamily: "'Jost', sans-serif", color: "#6B6259" }}
                    >
                      Estimated at 25% of gross margin — the profit remaining after your cost obligations are met. Tax is owed on profit, not on total revenue. Consult your accountant for the exact figure for your situation.
                    </HoverCardContent>
                  </HoverCard>
                </span>
              )}
              <LegendItem
                color={fin.marginRemaining > 0 ? health : TERRA}
                label="Profit"
                amount={fin.marginRemaining > 0 ? fmtMoney(fin.marginRemaining) : "$0"}
              />
            </div>
          </div>

          {/* ─── Row 5 — Effective rate ─── */}
          {hoursLogged > 0 && fin.effectiveRate != null && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                borderTop: "0.5px solid rgba(44,44,44,0.07)",
                paddingTop: 12,
                marginTop: 2,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: MUTED, marginBottom: 2 }}>
                  EFFECTIVE RATE
                </div>
                <div
                  key={String(fin.effectiveRate)}
                  style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: 20,
                    fontWeight: 300,
                    color: effRateColor,
                    animation: rateDropped ? "sightlineRateDrop 600ms ease-out" : undefined,
                  }}
                >
                  {fmtRate(fin.effectiveRate)}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, marginLeft: "auto", textAlign: "right" }}>
                <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, color: MUTED }}>
                  vs {fmtRate(Number(snapshot.aligned_rate) || 0)} aligned
                </span>
                {(() => {
                  const alignedRate = Number(snapshot.aligned_rate) || 0;
                  const breakEvenRate = Number(snapshot.break_even_rate) || 0;
                  const diff = Math.abs(fin.effectiveRate! - alignedRate);
                  if (fin.effectiveRate! < breakEvenRate) {
                    return (
                      <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, fontWeight: 500, color: TERRA }}>
                        ⚠ Below break-even
                      </span>
                    );
                  }
                  if (fin.effectiveRate! >= alignedRate) {
                    return (
                      <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, color: SAGE }}>
                        ↑ {fmtMoney(diff)} above aligned
                      </span>
                    );
                  }
                  return (
                    <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, color: GOLD }}>
                      ↓ {fmtMoney(diff)} below aligned
                    </span>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ─── Row 6 — Stale warning ─── */}
          {hoursLogged > 0 && fin.freshnessState === "stale" && (
            <div
              style={{
                background: "rgba(184,134,11,0.07)",
                borderLeft: `2px solid ${GOLD}`,
                borderRadius: "0 4px 4px 0",
                padding: "8px 10px",
                marginTop: 10,
              }}
            >
              <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, color: CHARCOAL, lineHeight: 1.5 }}>
                ⚠ Last entry {daysAgoLabel(fin.daysSinceEntry)} — figures are estimates. Log time to restore accuracy.
              </div>
            </div>
          )}
          {hoursLogged > 0 && fin.freshnessState === "critical" && (
            <div
              style={{
                background: "rgba(196,113,74,0.07)",
                borderLeft: `2px solid ${TERRA}`,
                borderRadius: "0 4px 4px 0",
                padding: "8px 10px",
                marginTop: 10,
              }}
            >
              <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, color: TERRA, lineHeight: 1.5 }}>
                ⚠ No time logged in {daysAgoLabel(fin.daysSinceEntry)}. Profit figures cannot be trusted.
              </div>
            </div>
          )}
        </>
      )}
      <style>{`
        @keyframes sightlineRateDrop {
          0%   { transform: scale(1); }
          30%  { color: ${TERRA}; transform: scale(0.95); }
          100% { transform: scale(1); }
        }
      `}</style>
    </button>
  );
}

function LegendItem({ color, label, amount }: { color: string; label: string; amount: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block" }} />
      <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 9, color: MUTED }}>{label}</span>
      <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 9, fontWeight: 500, color: CHARCOAL }}>{amount}</span>
    </span>
  );
}

export default ProjectCard;