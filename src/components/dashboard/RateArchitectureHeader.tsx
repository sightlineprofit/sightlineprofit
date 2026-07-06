import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { calc } from "@/lib/finance";
import { fmtUsd } from "@/lib/finance";
import { AlignedRateBreakdown } from "./AlignedRateBreakdown";
import { MetricBreakdown } from "./MetricBreakdown";
import { listRateHistory } from "@/lib/rate-history.functions";

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
}: {
  c: Calc;
  cfg: any;
  members: any[];
  expenses: any[];
  targetMarginPct: number;
  configUpdatedAt?: string | null;
}) {
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
  const budgetRevenue = c.annualRevenue || 0;
  const alignedRevenue = aligned * c.annualBillableHrs;
  const revShortfall = Math.max(0, costFloor - budgetRevenue);
  const revSurplusOverCost = Math.max(0, budgetRevenue - costFloor);
  const revGapToAligned = Math.max(0, alignedRevenue - budgetRevenue);
  const revSurplusOverAligned = Math.max(0, budgetRevenue - alignedRevenue);

  // Per-contributor revenue breakdown for popover + subline count.
  const weeksYr = c.weeksPerYear || WEEKS_PER_YEAR;
  const firmRate = Number(cfg?.rate_billed) || billed || 0;
  const principalHrs = c.principalBillableHrsWeek || Number(cfg?.target_billable_hrs_per_week) || 0;
  const principalMember = (members ?? []).find(
    (m: any) => m?.role_type === "principal",
  ) as any | undefined;
  const teamMembers = (members ?? []).filter(
    (m: any) => m?.role_type !== "principal" && Number(m?.expected_hrs_per_week) > 0,
  );
  const contributors: Array<{
    label: string;
    role: string;
    rate: number;
    hrs: number;
    weeks: number;
    revenue: number;
  }> = [];
  if (principalHrs > 0 && firmRate > 0) {
    contributors.push({
      label: (principalMember?.name as string) || "Principal",
      role: "PRINCIPAL",
      rate: firmRate,
      hrs: principalHrs,
      weeks: weeksYr,
      revenue: firmRate * principalHrs * weeksYr,
    });
  }
  for (const m of teamMembers as any[]) {
    const rRaw = Number(m.billed_rate);
    const rate = Number.isFinite(rRaw) && rRaw > 0 ? rRaw : firmRate;
    const hrs = Number(m.expected_hrs_per_week) || 0;
    const roleTag = String(m.role_type || "team").replace(/_/g, " ").toUpperCase();
    contributors.push({
      label: (m.name as string) || "Team member",
      role: `TEAM — ${roleTag}`,
      rate,
      hrs,
      weeks: weeksYr,
      revenue: rate * hrs * weeksYr,
    });
  }
  const contributorCount = contributors.length;

  // Position of billed indicator on bar (relative to aligned as 100%)
  const barMax = aligned > 0 ? aligned : 1;
  const bePct = Math.min(100, (be / barMax) * 100);
  const billedPct = Math.min(100, Math.max(0, (billed / barMax) * 100));

  // Rate history
  const fetchHistory = useServerFn(listRateHistory);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { data: history = [] } = useQuery({
    queryKey: ["rate-history"],
    queryFn: () => fetchHistory(),
  });

  // Annual gap for below_floor decision prompt
  const annualGap = gap * c.annualBillableHrs;
  const monthlyGap = annualGap / 12;
  const hoursNeeded = billed > 0 ? Math.max(0, costFloor / billed - c.annualBillableHrs) : 0;

  return (
    <div
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
              fontSize: 9,
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
          <span style={{ fontSize: 9, color: MUTED }}>{agoLabel(configUpdatedAt)}</span>
          <Link
            to="/settings"
            style={{ fontSize: 9, color: GOLD, letterSpacing: "0.06em" }}
            className="hover:underline"
          >
            Edit inputs →
          </Link>
        </div>
      </div>

      {/* Aligned rate primary display */}
      <div style={{ marginTop: 18 }}>
        <div
          style={{
            fontSize: 8,
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
          <span
            style={{
              marginLeft: 10,
              fontSize: 10,
              fontWeight: 500,
              padding: "3px 8px",
              borderRadius: 3,
              background: pill.bg,
              color: pill.color,
            }}
          >
            {pill.label}
          </span>
          <AlignedRateBreakdown c={c} targetMarginPct={targetMarginPct} side="bottom" />
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 300,
            color: MUTED,
            marginTop: 6,
          }}
        >
          Your floor. The minimum hourly rate your cost structure requires.
        </div>
      </div>

      {/* Three-number row */}
      <div
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
          {/* Billed indicator */}
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
              fontSize: 9,
              fontWeight: 500,
              color: rateColor(c.rateHealth),
              whiteSpace: "nowrap",
            }}
          >
            {fmtUsd(billed, { decimals: 0 })}/hr ▾
          </div>
        </div>
        <div className="flex justify-between" style={{ marginTop: 4, fontSize: 8, color: MUTED }}>
          <span>{fmtUsd(be, { decimals: 0 })}</span>
          <span style={{ color: GOLD }}>{fmtUsd(aligned, { decimals: 0 })}</span>
        </div>
      </div>

      {/* Annual impact row */}
      <div className="grid grid-cols-2 gap-6" style={{ marginTop: 22 }}>
        <div>
          <div style={{ fontSize: 8, letterSpacing: "0.2em", textTransform: "uppercase", color: MUTED, fontWeight: 600 }}>
            Cost floor (annual)
          </div>
          <div className="flex items-baseline gap-1" style={{ marginTop: 4 }}>
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: CHARCOAL }}>
              {fmtUsd(costFloor, { decimals: 0 })}
            </span>
            <MetricBreakdown
              metric="cost_floor"
              c={c}
              members={members}
              expenses={expenses}
              side="bottom"
              iconSize={12}
            />
          </div>
          <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>What the firm must earn</div>
        </div>
        <div>
          <div style={{ fontSize: 8, letterSpacing: "0.2em", textTransform: "uppercase", color: MUTED, fontWeight: 600 }}>
            Budget revenue (annual)
          </div>
          <div className="flex items-baseline gap-1" style={{ marginTop: 4 }}>
            <span
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 22,
                color:
                  budgetRevenue < costFloor ? TERRA : budgetRevenue < alignedRevenue ? GOLD : SAGE,
              }}
            >
              {fmtUsd(budgetRevenue, { decimals: 0 })}
            </span>
            <MetricBreakdown
              metric="budget_revenue"
              c={c}
              cfg={cfg}
              contributors={contributors}
              side="bottom"
              iconSize={12}
            />
          </div>
          {contributorCount > 0 && (
            <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
              {contributorCount} billable contributor{contributorCount === 1 ? "" : "s"} · see breakdown
            </div>
          )}
          <div style={{ fontSize: 10, marginTop: 2, lineHeight: 1.5 }}>
            {budgetRevenue < costFloor ? (
              <>
                <span style={{ color: TERRA }}>-{fmtUsd(revShortfall, { decimals: 0 })}/yr shortfall vs cost floor</span>
              </>
            ) : budgetRevenue < alignedRevenue ? (
              <>
                <span style={{ color: SAGE }}>+{fmtUsd(revSurplusOverCost, { decimals: 0 })}/yr above cost floor</span>
                <br />
                <span style={{ color: GOLD }}>{fmtUsd(revGapToAligned, { decimals: 0 })}/yr below target revenue</span>
              </>
            ) : (
              <span style={{ color: SAGE }}>+{fmtUsd(revSurplusOverAligned, { decimals: 0 })}/yr above target</span>
            )}
          </div>
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
            fontWeight: 300,
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

      {/* Rate history + "How is this built" */}
      <div className="flex items-center justify-between" style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          className="flex items-center gap-1 hover:opacity-80"
          style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED, fontWeight: 600 }}
        >
          {historyOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Rate history
        </button>
        <Link
          to="/knowledge-base/rate-architecture"
          style={{ fontSize: 10, color: GOLD }}
          className="hover:underline"
        >
          How is this built? →
        </Link>
      </div>

      <div className="flex items-center gap-4" style={{ marginTop: 8 }}>
        <Link
          to="/rate-architecture"
          style={{ fontSize: 10, color: GOLD, letterSpacing: "0.02em" }}
          className="hover:underline"
        >
          Understand my numbers →
        </Link>
        <Link
          to="/rate-architecture"
          search={{ tab: "model" } as any}
          style={{ fontSize: 10, color: GOLD, letterSpacing: "0.02em" }}
          className="hover:underline"
        >
          Model a change →
        </Link>
      </div>

      {historyOpen && (
        <div style={{ marginTop: 10, fontSize: 10, color: MUTED }}>
          {history.length === 0 ? (
            <div style={{ fontStyle: "italic" }}>No changes recorded yet.</div>
          ) : (
            <div className="space-y-1.5">
              {history.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3">
                  <span style={{ minWidth: 70 }}>
                    {new Date(r.changed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <span style={{ flex: 1 }}>
                    {r.previous_rate != null ? (
                      <>
                        {fmtUsd(Number(r.previous_rate), { decimals: 0 })} →{" "}
                        <strong style={{ color: CHARCOAL }}>{fmtUsd(Number(r.rate), { decimals: 0 })}</strong>
                      </>
                    ) : (
                      <strong style={{ color: CHARCOAL }}>{fmtUsd(Number(r.rate), { decimals: 0 })}</strong>
                    )}
                  </span>
                  <span style={{ opacity: 0.8 }}>{r.change_reason ?? "Updated"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
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
      <div style={{ fontSize: 8, letterSpacing: "0.2em", textTransform: "uppercase", color: MUTED, fontWeight: 600, textAlign: center ? "center" : undefined }}>
        {label}
      </div>
      <div className={`flex items-baseline gap-1 ${center ? "justify-center" : ""}`} style={{ marginTop: 4 }}>
        <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, color: valueColor, lineHeight: 1 }}>
          {value}
        </span>
        {trailing}
      </div>
      {hint && <div style={{ fontSize: 10, color: hintColor, marginTop: 4, textAlign: center ? "center" : undefined }}>{hint}</div>}
    </div>
  );
}

/* ─────────────────────────── Zone B ─────────────────────────── */

export function WeeklyPulse({
  weekBillable,
  targetHrs,
  rate,
  activeProjects,
}: {
  weekBillable: number;
  targetHrs: number;
  rate: number;
  activeProjects: Array<{ health: "healthy" | "watch" | "at_risk" }>;
}) {
  const remaining = Math.max(0, targetHrs - weekBillable);
  const hoursPct = targetHrs > 0 ? (weekBillable / targetHrs) * 100 : 0;
  const actualRev = weekBillable * rate;
  const targetRev = targetHrs * rate;
  const revPct = targetRev > 0 ? (actualRev / targetRev) * 100 : 0;
  const revGap = Math.max(0, targetRev - actualRev);
  const healthy = activeProjects.filter((p) => p.health === "healthy").length;
  const watch = activeProjects.filter((p) => p.health === "watch").length;
  const atRisk = activeProjects.filter((p) => p.health === "at_risk").length;

  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <PulseCard label="Hours this week">
        <div className="flex items-baseline justify-between">
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: CHARCOAL }}>
            {weekBillable.toFixed(1)}/{targetHrs} hrs
          </span>
          <Link to="/time-calendar" style={{ fontSize: 9, color: GOLD }} className="hover:underline">
            See capacity →
          </Link>
        </div>
        <MiniBar pct={hoursPct} />
        <div style={{ fontSize: 10, color: remaining <= 0 ? SAGE : MUTED, marginTop: 4 }}>
          {remaining <= 0 ? "Target reached" : `${remaining.toFixed(1)} hrs to target`}
        </div>
      </PulseCard>

      <PulseCard label="Revenue this week">
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: CHARCOAL }}>
          {fmtUsd(actualRev, { decimals: 0 })}/{fmtUsd(targetRev, { decimals: 0 })}
        </div>
        <MiniBar pct={revPct} />
        <div style={{ fontSize: 10, color: revGap <= 0 && targetRev > 0 ? SAGE : MUTED, marginTop: 4 }}>
          {revGap <= 0 && targetRev > 0
            ? "Weekly target met"
            : `${fmtUsd(revGap, { decimals: 0 })} to weekly target`}
        </div>
      </PulseCard>

      <PulseCard label="Active projects">
        <div className="flex items-baseline justify-between">
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: CHARCOAL }}>
            {activeProjects.length} projects
          </span>
          <Link to="/projects" style={{ fontSize: 9, color: GOLD }} className="hover:underline">
            See all →
          </Link>
        </div>
        <div className="flex items-center gap-3" style={{ fontSize: 10, color: MUTED, marginTop: 8 }}>
          <span className="flex items-center gap-1">
            <Dot color={SAGE} /> {healthy} healthy
          </span>
          <span className="flex items-center gap-1">
            <Dot color={GOLD} /> {watch} watch
          </span>
          <span className="flex items-center gap-1">
            <Dot color={TERRA} /> {atRisk} at risk
          </span>
        </div>
      </PulseCard>
    </div>
  );
}

function PulseCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "white",
        border: `0.5px solid ${BORDER}`,
        borderRadius: 6,
        padding: "14px 18px",
      }}
    >
      <div style={{ fontSize: 8, letterSpacing: "0.2em", textTransform: "uppercase", color: MUTED, fontWeight: 600, marginBottom: 6 }}>
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

function Dot({ color }: { color: string }) {
  return <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 999, background: color }} />;
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
        <div style={{ fontSize: 11, fontWeight: 300, color: MUTED, marginTop: 2 }}>
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
            <div style={{ fontSize: 9, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {t.name}
            </div>
            <div style={{ fontSize: 10, color: CHARCOAL, marginTop: 2 }}>~{Math.round(t.total_hrs)} hrs</div>
            <div style={{ fontSize: 10, color: GOLD }}>
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