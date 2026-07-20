import { useState } from "react";
import { getProjectFinancials, type ProjectCostSnapshot, type ProjectPricingMethod } from "@/lib/finance";
import { useNavigate } from "@tanstack/react-router";

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

  // ─── Empty scope card ──────────────────────────────────────────────────
  const noScope = fin.scopedHours === 0;

  const pricingLabel =
    fin.pricingMethod === "hourly" ? "Hourly" : fin.pricingMethod === "hybrid" ? "Hybrid" : "Flat fee";

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

  const marginColor =
    fin.marginRemaining <= 0 ? TERRA : fin.isBelowTarget ? GOLD : SAGE;

  const profitPool = fin.netProfit;
  const hoursOver = fin.overHours > 0;
  const inScopePct =
    fin.scopedHours > 0
      ? hoursOver
        ? (fin.scopedHours / hoursLogged) * 100
        : Math.min(100, fin.pctConsumed)
      : 0;
  const overPct = hoursOver && hoursLogged > 0 ? (fin.overHours / hoursLogged) * 100 : 0;

  const daysAgoLabel = (n: number) => (n === 1 ? "1 day ago" : `${n} days ago`);

  // ─── Retroactive banner dismiss ─────────────────────────────────────────
  const banKey = `retroactive-banner-dismissed-${project.id}`;
  const [retroDismissed, setRetroDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(banKey) === "1";
  });
  const navigate = useNavigate();
  const showRetroBanner = !!snapshot.is_retroactive && !retroDismissed;

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

      {showRetroBanner && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "rgba(184,134,11,0.07)",
            borderLeft: `2px solid ${GOLD}`,
            borderRadius: "0 4px 4px 0",
            padding: "8px 12px",
            marginBottom: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, color: CHARCOAL, lineHeight: 1.5 }}>
              Cost structure captured today using current rate architecture. For accuracy, update to reflect what your costs were when this project was quoted.
            </div>
            <span
              role="link"
              onClick={(e) => {
                e.stopPropagation();
                navigate({ to: "/settings" });
              }}
              style={{ display: "inline-block", marginTop: 4, fontFamily: "'Jost', sans-serif", fontSize: 11, color: GOLD, cursor: "pointer" }}
            >
              Update in settings →
            </span>
          </div>
          <span
            role="button"
            aria-label="Dismiss"
            onClick={(e) => {
              e.stopPropagation();
              if (typeof window !== "undefined") window.localStorage.setItem(banKey, "1");
              setRetroDismissed(true);
            }}
            style={{ fontFamily: "'Jost', sans-serif", fontSize: 14, color: MUTED, cursor: "pointer", padding: "0 4px", lineHeight: 1 }}
          >
            ×
          </span>
        </div>
      )}

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
          {/* ─── Three headline metrics ─── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 12,
              paddingBottom: 14,
              borderBottom: "0.5px solid rgba(44,44,44,0.07)",
              marginBottom: 14,
            }}
          >
            <MetricCol
              label="Profit pool"
              value={fmtMoney(profitPool)}
              sub={fin.totalRevenue > 0 ? `from ${fmtMoney(fin.totalRevenue)} fee` : undefined}
              valueColor={SAGE}
            />
            <MetricCol
              label="Remaining profit"
              value={`${fmtMoney(fin.marginRemaining)}${isCritical ? "?" : ""}`}
              sub={hoursLogged > 0 ? fmtPct1(fin.marginRemainingPct) : "No hours logged"}
              valueColor={marginColor}
              strike={isCritical}
              faded={fin.freshnessState !== "current" && hoursLogged > 0}
            />
            <MetricCol
              label="Hours available"
              value={
                fin.scopedHours === 0
                  ? "—"
                  : hoursOver
                    ? `${formatHoursShort(fin.overHours)} over`
                    : formatHoursShort(fin.hoursRemaining)
              }
              sub={
                fin.scopedHours === 0
                  ? "No scope set"
                  : `${formatHoursShort(hoursLogged)} of ${formatHoursShort(fin.scopedHours)} logged`
              }
              valueColor={hoursOver ? TERRA : fin.hoursRemaining > 0 ? SAGE : MUTED}
            />
          </div>

          {/* ─── Hours bar (contained — no overflow past card edge) ─── */}
          {fin.scopedHours > 0 && (
            <div style={{ marginBottom: hoursLogged > 0 && fin.freshnessState !== "current" ? 10 : 0 }}>
              <div
                style={{
                  position: "relative",
                  height: 6,
                  background: "rgba(44,44,44,0.08)",
                  borderRadius: 3,
                  overflow: "hidden",
                  width: "100%",
                }}
              >
                {hoursLogged > 0 && (
                  <>
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        height: 6,
                        width: `${inScopePct}%`,
                        background: hoursOver ? health : health,
                        transition: "width 0.4s ease",
                      }}
                    />
                    {hoursOver && (
                      <div
                        style={{
                          position: "absolute",
                          left: `${inScopePct}%`,
                          top: 0,
                          height: 6,
                          width: `${overPct}%`,
                          background: TERRA,
                          transition: "width 0.4s ease",
                        }}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ─── Stale / critical one-liner ─── */}
          {hoursLogged > 0 && fin.freshnessState === "stale" && (
            <div
              style={{
                background: "rgba(184,134,11,0.07)",
                borderLeft: `2px solid ${GOLD}`,
                borderRadius: "0 4px 4px 0",
                padding: "8px 10px",
                marginTop: 4,
              }}
            >
              <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, color: CHARCOAL, lineHeight: 1.5 }}>
                Last entry {daysAgoLabel(fin.daysSinceEntry)} — figures are estimates. Log time to restore accuracy.
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
                marginTop: 4,
              }}
            >
              <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, color: TERRA, lineHeight: 1.5 }}>
                No time logged in {daysAgoLabel(fin.daysSinceEntry)}. Profit figures cannot be trusted.
              </div>
            </div>
          )}
        </>
      )}
    </button>
  );
}

function formatHoursShort(n: number): string {
  const v = Math.round(n * 10) / 10;
  return `${v}`.replace(/\.0$/, "");
}

function MetricCol({
  label,
  value,
  sub,
  valueColor,
  strike,
  faded,
}: {
  label: string;
  value: string;
  sub?: string;
  valueColor: string;
  strike?: boolean;
  faded?: boolean;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: MUTED, marginBottom: 3 }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 22,
          fontWeight: 300,
          color: valueColor,
          lineHeight: 1.05,
          opacity: faded ? 0.7 : 1,
          textDecoration: strike ? "line-through" : undefined,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, color: MUTED, marginTop: 2, lineHeight: 1.3 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default ProjectCard;