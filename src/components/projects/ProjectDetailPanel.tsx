import { useState } from "react";
import { getProjectFinancials, type ProjectCostSnapshot, type ProjectPricingMethod } from "@/lib/finance";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";

const SAGE = "#5C8A6E";
const GOLD = "#B8860B";
const TERRA = "#C4714A";
const MUTED = "#8A7F75";
const CHARCOAL = "#2C2C2C";

function money(n: number, opts: { compact?: boolean } = {}) {
  if (!Number.isFinite(n)) return "$0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (opts.compact && abs >= 10000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}
function moneyExact(n: number) {
  if (!Number.isFinite(n)) return "$0";
  const sign = n < 0 ? "−" : "";
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
}
function pct1(n: number) {
  return `${(Math.round((Number.isFinite(n) ? n : 0) * 10) / 10).toFixed(1)}%`;
}
function rate(n: number) {
  return `$${Math.round(n).toLocaleString("en-US")}/hr`;
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

type ProjectShape = {
  id: string;
  name?: string | null;
  client_name?: string | null;
  pricing_method?: ProjectPricingMethod | string | null;
  flat_fee_amount?: number | null;
  fixed_fee?: number | null;
  scoped_rate?: number | null;
  scoped_hrs?: number | null;
  hourly_scoped_hours?: number | null;
};

export function ProjectDetailPanel({
  project,
  snapshot,
  hoursLogged,
  lastEntryDate,
}: {
  project: ProjectShape;
  snapshot: ProjectCostSnapshot | null;
  hoursLogged: number;
  lastEntryDate: Date | string | null;
}) {
  const [snapshotOpen, setSnapshotOpen] = useState(false);

  if (!snapshot) {
    return (
      <div
        style={{
          background: "rgba(44,44,44,0.03)",
          border: "0.5px solid rgba(44,44,44,0.10)",
          borderRadius: 8,
          padding: "14px 16px",
          fontFamily: "'Jost', sans-serif",
          fontSize: 12,
          color: MUTED,
        }}
      >
        Cost snapshot not yet captured for this project. Snapshot data loads on first open.
      </div>
    );
  }

  const projectForCalc = {
    ...project,
    flat_fee_amount:
      project.flat_fee_amount != null
        ? project.flat_fee_amount
        : (project.pricing_method === "flat_fee" || !project.pricing_method) && project.fixed_fee
          ? project.fixed_fee
          : project.flat_fee_amount,
  };
  const fin = getProjectFinancials({
    project: projectForCalc,
    snapshot,
    hoursLogged,
    lastEntryDate: lastEntryDate ?? null,
  });

  const isRetro = !!snapshot.is_retroactive;
  const isCritical = fin.freshnessState === "critical" && hoursLogged > 0;
  const health =
    hoursLogged === 0
      ? MUTED
      : fin.marginRemaining < 0 || fin.marginRemainingPct < fin.targetMarginPct * 0.5
        ? TERRA
        : fin.marginRemainingPct < fin.targetMarginPct
          ? GOLD
          : SAGE;

  const pricingLabel =
    fin.pricingMethod === "hourly" ? "Hourly" : fin.pricingMethod === "hybrid" ? "Hybrid" : "Flat fee";

  const rev = Math.max(fin.totalRevenue, 1);
  const seg = (v: number) => Math.max(0, (v / rev) * 100);
  const marginSegPct = fin.marginRemaining > 0 ? seg(fin.marginRemaining) : 0;
  const staleDim = fin.freshnessState !== "current" && hoursLogged > 0;
  const staleOpacity = staleDim ? 0.6 : 1;

  const targetDollar = (fin.totalRevenue * fin.targetMarginPct) / 100;

  // Effective rate range bar positions
  const alignedR = Number(snapshot.aligned_rate) || 0;
  const breakEvenR = Number(snapshot.break_even_rate) || 0;
  const maxRate = Math.max(alignedR * 1.3, breakEvenR * 1.5, fin.effectiveRate ?? 0, 1);
  const bePct = Math.min(100, (breakEvenR / maxRate) * 100);
  const alPct = Math.min(100, (alignedR / maxRate) * 100);
  const efPct = fin.effectiveRate == null ? 0 : Math.min(100, (fin.effectiveRate / maxRate) * 100);

  const effRateColor =
    fin.effectiveRate == null
      ? CHARCOAL
      : fin.effectiveRate >= alignedR
        ? SAGE
        : fin.effectiveRate >= breakEvenR
          ? GOLD
          : TERRA;

  const stripeOverlay = staleDim ? (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 6,
        pointerEvents: "none",
        backgroundImage:
          "repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.25) 5px, rgba(255,255,255,0.25) 10px)",
      }}
    />
  ) : null;

  const panelStyle: React.CSSProperties = {
    background: "white",
    border: "0.5px solid rgba(44,44,44,0.10)",
    borderRadius: 8,
    padding: "20px 22px",
    marginTop: 12,
  };
  const headingStyle: React.CSSProperties = {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 18,
    fontWeight: 400,
    color: CHARCOAL,
    marginBottom: 14,
  };
  const eyebrow: React.CSSProperties = {
    fontFamily: "'Jost', sans-serif",
    fontSize: 8,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: MUTED,
  };

  return (
    <div style={{ fontFamily: "'Jost', sans-serif" }}>
      {/* ─── SECTION 1 — Header ─── */}
      <div style={{ padding: "0 0 18px 0", borderBottom: "0.5px solid rgba(44,44,44,0.10)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, color: CHARCOAL, lineHeight: 1.2, marginBottom: 4 }}>
              {project.name}
            </div>
            {project.client_name && (
              <div style={{ fontSize: 13, color: MUTED }}>{project.client_name}</div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
            <span
              style={{
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
            {hoursLogged > 0 && (
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: fin.freshnessState === "current" ? SAGE : fin.freshnessState === "stale" ? GOLD : TERRA,
                  }}
                />
                {fin.freshnessState !== "current" && (
                  <span style={{ fontSize: 9, color: fin.freshnessState === "stale" ? GOLD : TERRA, fontWeight: 500 }}>
                    {fin.freshnessState === "stale" ? "Est." : "Stale"}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              color: isRetro ? GOLD : MUTED,
              fontStyle: "italic",
            }}
          >
            {isRetro
              ? `Cost structure captured ${fmtDate(snapshot.snapshotted_at)} using current rate architecture (retroactive)`
              : `Cost structure locked at project creation — ${fmtDate(snapshot.snapshotted_at)}`}
          </span>
          <button
            type="button"
            onClick={() => setSnapshotOpen((v) => !v)}
            style={{ fontSize: 11, color: GOLD, marginLeft: 4, background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            {snapshotOpen ? "Hide snapshot" : "View snapshot →"}
          </button>
        </div>
        {snapshotOpen && (
          <div
            style={{
              background: "rgba(44,44,44,0.03)",
              border: "0.5px solid rgba(44,44,44,0.10)",
              borderRadius: 6,
              padding: "16px 18px",
              marginTop: 10,
            }}
          >
            <div style={{ ...eyebrow, fontSize: 9, letterSpacing: "0.14em", marginBottom: 10 }}>
              RATE ARCHITECTURE AT TIME OF QUOTE
            </div>
            {[
              ["Break-even rate at quote", `$${(Number(snapshot.break_even_rate) || 0).toFixed(2)}/hr`],
              ["Aligned rate at quote", `$${(Number(snapshot.aligned_rate) || 0).toFixed(2)}/hr`],
              ["Target margin at quote", `${Number(snapshot.target_margin_pct) || 0}%`],
              ["Annual billable hrs at quote", `${Math.round(Number(snapshot.annual_billable_hrs) || 0)} hrs`],
            ].map(([label, val]) => (
              <div
                key={label}
                style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "0.5px solid rgba(44,44,44,0.06)" }}
              >
                <span style={{ fontSize: 12, color: MUTED }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: CHARCOAL }}>{val}</span>
              </div>
            ))}
            <div style={{ fontSize: 11, color: MUTED, fontStyle: "italic", marginTop: 10 }}>
              These figures are locked and will not change even if your rate architecture is updated.
            </div>
          </div>
        )}
      </div>

      {/* ─── SECTION 2 — Revenue Breakdown ─── */}
      <div style={panelStyle}>
        <div style={headingStyle}>Project Revenue</div>
        {fin.pricingMethod === "flat_fee" && (
          <>
            <BreakdownRow label="Project fee" value={moneyExact(fin.flatFeeAmount)} />
            <BreakdownRow label="Scoped hours" value={`${fin.scopedHours} hrs`} />
            <Divider />
            <BreakdownRow
              label="Effective hourly rate (if all hours used)"
              value={fin.scopedHours > 0 ? rate(fin.flatFeeAmount / fin.scopedHours) : "—"}
            />
            <div style={{ fontSize: 11, color: MUTED, fontStyle: "italic", marginTop: 8 }}>
              This project is priced as a flat fee. The effective rate assumes all scoped hours are used.
            </div>
          </>
        )}
        {fin.pricingMethod === "hourly" && (
          <>
            <BreakdownRow label="Scoped hours" value={`${fin.scopedHours} hrs`} />
            <BreakdownRow label="Billed rate" value={rate(Number(project.scoped_rate) || 0)} />
            <Divider />
            <BreakdownRow label="Total revenue (if fully billed)" value={moneyExact(fin.totalRevenue)} strong />
            <div style={{ fontSize: 11, color: MUTED, fontStyle: "italic", marginTop: 8 }}>
              Revenue assumes all scoped hours are billed at the rate above.
            </div>
          </>
        )}
        {fin.pricingMethod === "hybrid" && (
          <>
            <div style={{ ...eyebrow, marginBottom: 6, marginTop: 4 }}>DESIGN PHASE (FLAT FEE)</div>
            <BreakdownRow label="Flat fee amount" value={moneyExact(fin.flatFeeAmount)} />
            <div style={{ ...eyebrow, marginBottom: 6, marginTop: 12 }}>COORDINATION PHASE (HOURLY)</div>
            <BreakdownRow
              label="Estimated hours"
              value={
                Number(project.hourly_scoped_hours) > 0
                  ? `${Number(project.hourly_scoped_hours)} hrs`
                  : "Not set"
              }
            />
            <BreakdownRow label="Hourly rate" value={rate(Number(project.scoped_rate) || 0)} />
            <BreakdownRow
              label="Phase revenue"
              value={
                Number(project.hourly_scoped_hours) > 0
                  ? moneyExact(fin.hourlyRevenue)
                  : "— (set hourly hours to calculate)"
              }
            />
            <Divider />
            <BreakdownRow label="Total revenue" value={moneyExact(fin.totalRevenue)} strong />
          </>
        )}
      </div>

      {/* ─── SECTION 3 — Cost Allocation ─── */}
      <div style={panelStyle}>
        <div style={{ ...headingStyle, marginBottom: 4 }}>How this revenue is allocated</div>
        <div style={{ fontSize: 12, color: MUTED, fontStyle: "italic", marginBottom: 16 }}>
          Based on your cost structure at the time this project was quoted.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 100px", gap: 12, alignItems: "center", paddingBottom: 6 }}>
          <div />
          <div style={{ ...eyebrow, textAlign: "right" }}>% OF FEE</div>
          <div style={{ ...eyebrow, textAlign: "right" }}>AMOUNT</div>
        </div>
        <AllocRow
          label="Owner compensation"
          sub={`$${(Number(snapshot.comp_per_hour) || 0).toFixed(2)}/hr × ${fin.scopedHours} hrs`}
          pct={fin.totalRevenue > 0 ? (fin.compAllocation / fin.totalRevenue) * 100 : 0}
          amount={fin.compAllocation}
        />
        <AllocRow
          label="Operating expenses"
          sub={`$${(Number(snapshot.opex_per_hour) || 0).toFixed(2)}/hr × ${fin.scopedHours} hrs`}
          pct={fin.totalRevenue > 0 ? (fin.opexAllocation / fin.totalRevenue) * 100 : 0}
          amount={fin.opexAllocation}
        />
        {fin.teamAllocation > 0 && (
          <AllocRow
            label="Team cost"
            sub={`$${(Number(snapshot.team_per_hour) || 0).toFixed(2)}/hr × ${fin.scopedHours} hrs`}
            pct={fin.totalRevenue > 0 ? (fin.teamAllocation / fin.totalRevenue) * 100 : 0}
            amount={fin.teamAllocation}
          />
        )}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 60px 100px",
            gap: 12,
            padding: "9px 6px",
            background: "rgba(44,44,44,0.03)",
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 500, color: CHARCOAL }}>Total obligations</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: CHARCOAL, textAlign: "right" }}>
            {pct1(fin.totalRevenue > 0 ? (fin.totalCostAllocation / fin.totalRevenue) * 100 : 0)}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: CHARCOAL, textAlign: "right" }}>
            {moneyExact(fin.totalCostAllocation)}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 100px", gap: 12, padding: "10px 0", borderBottom: "0.5px solid rgba(44,44,44,0.06)" }}>
          <div>
            <div style={{ fontSize: 13, color: MUTED, display: "flex", alignItems: "center", gap: 4 }}>
              Tax reserve (est.)
              <HoverCard>
                <HoverCardTrigger asChild>
                  <span style={{ fontSize: 11, color: GOLD, cursor: "pointer" }}>ⓘ</span>
                </HoverCardTrigger>
                <HoverCardContent side="top" className="max-w-[260px] text-[12px]" style={{ color: "#6B6259" }}>
                  Estimated at 25% of gross margin — the profit remaining after your cost obligations are met. Tax is owed on profit, not on total revenue. Consult your accountant for the exact figure.
                </HoverCardContent>
              </HoverCard>
            </div>
            <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>~25% of gross margin</div>
          </div>
          <span style={{ fontSize: 12, color: MUTED, textAlign: "right" }}>
            ~{pct1(fin.totalRevenue > 0 ? (fin.taxReserve / fin.totalRevenue) * 100 : 0)}
          </span>
          <span style={{ fontSize: 12, color: MUTED, textAlign: "right" }}>
            ~{moneyExact(fin.taxReserve)}
          </span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 60px 100px",
            gap: 12,
            alignItems: "center",
            padding: "10px 8px",
            marginTop: 4,
            background:
              health === SAGE
                ? "rgba(92,138,110,0.06)"
                : health === GOLD
                  ? "rgba(184,134,11,0.06)"
                  : health === TERRA
                    ? "rgba(196,113,74,0.06)"
                    : "rgba(44,44,44,0.03)",
            borderRadius: 4,
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: health }}>Profit built into scope</div>
            <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>Erodes if hours exceed scope</div>
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: health, textAlign: "right" }}>
            {pct1(fin.lockedMarginPct)}
          </span>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 300, color: health, textAlign: "right" }}>
            {moneyExact(fin.lockedMargin)}
          </span>
        </div>

        {/* Tall stacked bar */}
        <div style={{ position: "relative", marginTop: 16 }}>
          <div style={{ height: 16, borderRadius: 6, overflow: "hidden", display: "flex", width: "100%", opacity: staleOpacity }}>
            {fin.compAllocation > 0 && (
              <BarSeg color="#2C2C2C" pct={seg(fin.compAllocation)} label="Comp" />
            )}
            {fin.opexAllocation > 0 && (
              <BarSeg color="#6B6259" pct={seg(fin.opexAllocation)} label="Op Ex" />
            )}
            {fin.teamAllocation > 0 && (
              <BarSeg color="#8A7F75" pct={seg(fin.teamAllocation)} label="Team" />
            )}
            {fin.taxReserve > 0 && (
              <BarSeg color="#C4C0BB" pct={seg(fin.taxReserve)} label="Tax" />
            )}
            {marginSegPct > 0 && (
              <BarSeg color={health} pct={marginSegPct} label="Profit" />
            )}
          </div>
          {stripeOverlay}
        </div>
      </div>

      {/* ─── SECTION 4 — Margin Status ─── */}
      <div style={panelStyle}>
        <div style={headingStyle}>Profit status</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 1,
            background: "rgba(44,44,44,0.10)",
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          <StatCol
            label="LOCKED AT QUOTE"
            value={moneyExact(fin.lockedMargin)}
            pct={pct1(fin.lockedMarginPct)}
            sub="Profit built into scope"
            subColor={MUTED}
            valueColor={MUTED}
          />
          <StatCol
            label="REMAINING NOW"
            value={`${staleDim ? "~" : ""}${moneyExact(fin.marginRemaining)}${isCritical ? "?" : ""}`}
            pct={pct1(fin.marginRemainingPct)}
            sub={
              hoursLogged === 0
                ? "No hours logged yet"
                : fin.overHours > 0
                  ? `After ${fin.overHours} hrs over scope`
                  : "On track"
            }
            subColor={hoursLogged === 0 ? MUTED : fin.overHours > 0 ? TERRA : SAGE}
            valueColor={health}
            valueOpacity={staleDim ? 0.7 : 1}
            strike={isCritical}
          />
          <StatCol
            label="TARGET"
            value={`${Math.round(fin.targetMarginPct)}%`}
            pct={moneyExact(targetDollar)}
            sub="Your rate architecture goal"
            subColor={MUTED}
            valueColor={MUTED}
          />
        </div>
        {hoursLogged > 0 && (
          <div
            style={{
              marginTop: 12,
              borderRadius: "0 6px 6px 0",
              padding: "12px 14px",
              fontSize: 13,
              lineHeight: 1.6,
              ...(fin.marginRemaining < 0
                ? { background: "rgba(196,113,74,0.07)", borderLeft: `3px solid ${TERRA}`, color: TERRA, fontWeight: 500 }
                : fin.isAboveTarget
                  ? { background: "rgba(92,138,110,0.07)", borderLeft: `3px solid ${SAGE}`, color: CHARCOAL }
                  : fin.isBelowTarget
                    ? { background: "rgba(184,134,11,0.07)", borderLeft: `3px solid ${GOLD}`, color: CHARCOAL }
                    : { background: "rgba(44,44,44,0.03)", borderLeft: `3px solid ${MUTED}`, color: MUTED }),
            }}
          >
            {fin.marginRemaining < 0
              ? `This project is no longer profitable. The firm has absorbed ${moneyExact(Math.abs(fin.marginRemaining))} in unrecovered costs.`
              : fin.isAboveTarget
                ? `↑ ${Math.abs(Math.round(fin.marginVariance * 10) / 10).toFixed(1)}% above your target margin. This project is performing above expectations.`
                : fin.isBelowTarget
                  ? `↓ ${Math.abs(Math.round(fin.marginVariance * 10) / 10).toFixed(1)}% below your target margin. This project was priced below your aligned rate or has absorbed over-scope hours.`
                  : "At target margin."}
          </div>
        )}
      </div>

      {/* ─── SECTION 5 — Hours Detail ─── */}
      <div style={panelStyle}>
        <div style={headingStyle}>Hours</div>
        <div style={{ position: "relative", height: 10, background: "rgba(44,44,44,0.08)", borderRadius: 5, marginBottom: 24 }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              height: 10,
              width: `${Math.min(100, fin.pctConsumed)}%`,
              background: health,
              borderRadius: 5,
              transition: "width 0.4s ease",
            }}
          />
          {fin.overHours > 0 && fin.scopedHours > 0 && (
            <div
              style={{
                position: "absolute",
                left: "100%",
                top: -2,
                height: 14,
                background: TERRA,
                borderRadius: "0 5px 5px 0",
                minWidth: 6,
                width: `${Math.min(30, (fin.overHours / fin.scopedHours) * 100)}%`,
              }}
            />
          )}
          {[25, 50, 75, 100].map((tick) => (
            <div key={tick}>
              <div
                style={{
                  position: "absolute",
                  left: `${tick}%`,
                  top: -2,
                  height: 14,
                  width: 1,
                  background: "rgba(44,44,44,0.15)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: `${tick}%`,
                  top: 15,
                  transform: "translateX(-50%)",
                  fontSize: 9,
                  color: MUTED,
                }}
              >
                {tick}%
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 1,
            background: "rgba(44,44,44,0.10)",
            borderRadius: 6,
            overflow: "hidden",
            marginTop: 20,
          }}
        >
          <StatCell label="Scoped" value={`${fin.scopedHours} hrs`} />
          <StatCell
            label="Logged"
            value={`${Math.round(hoursLogged)} hrs (${pct1(fin.pctConsumed)})`}
            valueColor={health}
          />
          <StatCell
            label="Remaining"
            value={`${Math.round(fin.hoursRemaining)} hrs`}
            valueColor={fin.hoursRemaining > 0 ? SAGE : MUTED}
          />
          <StatCell
            label="Over scope"
            value={fin.overHours > 0 ? `${Math.round(fin.overHours)} hrs` : "—"}
            valueColor={fin.overHours > 0 ? TERRA : MUTED}
            valueWeight={fin.overHours > 0 ? 600 : 400}
          />
        </div>
        {fin.overHours > 0 && (
          <div
            style={{
              marginTop: 14,
              background: "rgba(196,113,74,0.06)",
              borderLeft: `2px solid ${TERRA}`,
              borderRadius: "0 6px 6px 0",
              padding: "14px 16px",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 500, color: TERRA, marginBottom: 6 }}>
              {Math.round(fin.overHours)} hours over scope
            </div>
            <div style={{ fontSize: 13, color: "#6B6259", lineHeight: 1.6 }}>
              At your break-even rate of ${(Number(snapshot.break_even_rate) || 0).toFixed(2)}/hr, this has cost {moneyExact(fin.marginErosion)} in profit margin.
            </div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>
              Each additional hour logged costs ${(Number(snapshot.break_even_rate) || 0).toFixed(2)} in profit.
            </div>
          </div>
        )}
      </div>

      {/* ─── SECTION 6 — Effective Rate ─── */}
      {hoursLogged > 0 && fin.effectiveRate != null && (
        <div style={panelStyle}>
          <div style={headingStyle}>Effective rate</div>
          <div
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 52,
              fontWeight: 300,
              color: effRateColor,
              textAlign: "center",
              marginBottom: 16,
              lineHeight: 1,
            }}
          >
            ${Math.round(fin.effectiveRate).toLocaleString("en-US")}/hr
          </div>
          <div style={{ position: "relative", height: 60, marginTop: 20 }}>
            {/* Track with zones */}
            <div
              style={{
                position: "absolute",
                top: 28,
                left: 0,
                right: 0,
                height: 4,
                borderRadius: 2,
                background: "rgba(44,44,44,0.08)",
                overflow: "hidden",
                display: "flex",
              }}
            >
              <div style={{ width: `${bePct}%`, background: "rgba(196,113,74,0.25)" }} />
              <div style={{ width: `${Math.max(0, alPct - bePct)}%`, background: "rgba(184,134,11,0.20)" }} />
              <div style={{ width: `${Math.max(0, 100 - alPct)}%`, background: "rgba(92,138,110,0.20)" }} />
            </div>
            {/* Break-even marker */}
            <Marker leftPct={bePct} color={TERRA} rateLabel={rate(breakEvenR)} nameLabel="Break-even" />
            {/* Aligned marker */}
            <Marker leftPct={alPct} color={GOLD} rateLabel={rate(alignedR)} nameLabel="Aligned rate" />
            {/* Effective marker */}
            <Marker leftPct={efPct} color={effRateColor} rateLabel={rate(fin.effectiveRate)} nameLabel="Your effective rate" thick emphasis />
          </div>
          <div
            style={{
              marginTop: 20,
              padding: "12px 14px",
              borderRadius: 6,
              fontSize: 13,
              lineHeight: 1.5,
              ...(fin.effectiveRate >= alignedR
                ? { background: "rgba(92,138,110,0.07)", color: CHARCOAL }
                : fin.effectiveRate >= breakEvenR
                  ? { background: "rgba(184,134,11,0.07)", color: CHARCOAL }
                  : { background: "rgba(196,113,74,0.07)", color: TERRA, fontWeight: 500 }),
            }}
          >
            {fin.effectiveRate >= alignedR
              ? "This project's hourly return exceeds your aligned rate. Profitability is intact and margin is protected."
              : fin.effectiveRate >= breakEvenR
                ? `This project is covering costs but delivering below your target margin. You are ${money(alignedR - fin.effectiveRate)}/hr below your aligned rate — the gap closes if remaining hours stay within scope.`
                : `This project is no longer covering the firm's cost floor. Every additional hour logged deepens the loss at $${(breakEvenR).toFixed(2)}/hr.`}
          </div>
        </div>
      )}
    </div>
  );
}

function BreakdownRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
      <span style={{ fontSize: 13, color: MUTED }}>{label}</span>
      <span style={{ fontSize: strong ? 14 : 13, fontWeight: strong ? 600 : 500, color: CHARCOAL }}>{value}</span>
    </div>
  );
}
function Divider() {
  return <div style={{ borderTop: "0.5px solid rgba(44,44,44,0.08)", margin: "4px 0" }} />;
}

function AllocRow({ label, sub, pct, amount }: { label: string; sub: string; pct: number; amount: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 60px 100px",
        gap: 12,
        padding: "9px 0",
        borderBottom: "0.5px solid rgba(44,44,44,0.06)",
      }}
    >
      <div>
        <div style={{ fontSize: 13, color: CHARCOAL }}>{label}</div>
        <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{sub}</div>
      </div>
      <span style={{ fontSize: 12, color: MUTED, textAlign: "right" }}>{pct1(pct)}</span>
      <span style={{ fontSize: 12, fontWeight: 500, color: CHARCOAL, textAlign: "right" }}>
        {moneyExact(amount)}
      </span>
    </div>
  );
}

function BarSeg({ color, pct, label }: { color: string; pct: number; label: string }) {
  return (
    <div
      style={{
        background: color,
        flexBasis: `${pct}%`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      {pct > 8 && (
        <span style={{ fontSize: 9, color: "white", fontFamily: "'Jost', sans-serif" }}>{label}</span>
      )}
    </div>
  );
}

function StatCol({
  label,
  value,
  pct,
  sub,
  subColor,
  valueColor,
  valueOpacity = 1,
  strike,
}: {
  label: string;
  value: string;
  pct: string;
  sub: string;
  subColor: string;
  valueColor: string;
  valueOpacity?: number;
  strike?: boolean;
}) {
  return (
    <div style={{ background: "white", padding: "16px 14px", textAlign: "center" }}>
      <div style={{ fontSize: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: MUTED, marginBottom: 6 }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 26,
          fontWeight: 300,
          color: valueColor,
          opacity: valueOpacity,
          textDecoration: strike ? "line-through" : undefined,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: valueColor, opacity: valueOpacity * 0.9, marginTop: 3 }}>{pct}</div>
      <div style={{ fontSize: 10, color: subColor, fontStyle: "italic", marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function StatCell({
  label,
  value,
  valueColor = CHARCOAL,
  valueWeight = 500,
}: {
  label: string;
  value: string;
  valueColor?: string;
  valueWeight?: number;
}) {
  return (
    <div style={{ background: "white", padding: "12px 10px", textAlign: "center" }}>
      <div style={{ fontSize: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: MUTED, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: valueWeight, color: valueColor }}>{value}</div>
    </div>
  );
}

function Marker({
  leftPct,
  color,
  rateLabel,
  nameLabel,
  thick,
  emphasis,
}: {
  leftPct: number;
  color: string;
  rateLabel: string;
  nameLabel: string;
  thick?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div style={{ position: "absolute", left: `${leftPct}%`, top: 0, height: "100%", transform: "translateX(-50%)" }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: emphasis ? 10 : 9,
          fontWeight: emphasis ? 600 : 400,
          color,
          whiteSpace: "nowrap",
        }}
      >
        {rateLabel}
      </div>
      <div
        style={{
          position: "absolute",
          top: 18,
          left: "50%",
          transform: "translateX(-50%)",
          width: thick ? 3 : 2,
          height: 24,
          background: color,
          borderRadius: 1,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 46,
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: 9,
          color: MUTED,
          whiteSpace: "nowrap",
        }}
      >
        {nameLabel}
      </div>
    </div>
  );
}

export default ProjectDetailPanel;