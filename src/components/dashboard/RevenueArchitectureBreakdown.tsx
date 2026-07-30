import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import type { calc } from "@/lib/finance";
import { fmtUsd } from "@/lib/finance";
import type { YearToDateRevenueProps } from "./YearToDateRevenue";

type Calc = ReturnType<typeof calc>;

const GOLD = "#B8860B";
const SAGE = "#5C8A6E";
const CREAM = "#FAF7F2";

function pctOf(n: number, total: number) {
  if (total <= 0) return "0";
  return ((n / total) * 100).toFixed(1);
}

function FloorRow({
  label,
  amount,
  floor,
  hint,
}: {
  label: string;
  amount: number;
  floor: number;
  hint?: string;
}) {
  if (amount <= 0) return null;
  return (
    <div style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex items-baseline justify-between gap-3">
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 11, color: "white", fontWeight: 500, flexShrink: 0 }}>
          {fmtUsd(amount)}{" "}
          <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>({pctOf(amount, floor)}%)</span>
        </span>
      </div>
      {hint ? (
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 3, lineHeight: 1.4 }}>{hint}</p>
      ) : null}
    </div>
  );
}

export function RevenueArchitectureBreakdown({
  c,
  targetMarginPct,
  ytd,
  expenseCount = 0,
  teamMemberCount = 0,
  side = "left",
}: {
  c: Calc;
  targetMarginPct: number;
  ytd: YearToDateRevenueProps;
  expenseCount?: number;
  teamMemberCount?: number;
  side?: "left" | "bottom";
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const annualTarget = c.alignedRate * c.annualBillableHrs;
  const owner = c.compTotal || 0;
  const team = c.teamCostTotal || 0;
  const opex = (c.opexRecurring || 0) + (c.opexOneTime || 0);
  const costFloor = c.totalCost || 0;
  const marginAnnual = Math.max(0, annualTarget - costFloor);

  const now = new Date();
  const month = now.getMonth() + 1;
  const monthsRemaining = Math.max(1, 12 - month);
  const { ytdCollected, ytdTarget, monthLabel } = ytd;
  const remaining = Math.max(0, annualTarget - ytd.totalRevenue);
  const monthlyNeeded = remaining / monthsRemaining;
  const monthlyAvg = month > 0 ? ytd.totalRevenue / month : 0;
  const onTrack = ytd.totalRevenue >= ytdTarget * 0.9;
  const ytdPct = ytdTarget > 0 ? Math.min(100, (ytdCollected / ytdTarget) * 100) : 0;
  const fillColor = onTrack ? SAGE : ytdCollected >= ytdTarget * 0.75 ? GOLD : "#C4714A";

  const posClass = side === "left" ? "right-full mr-2 top-0" : "left-0 top-full mt-2";
  const caret =
    side === "left"
      ? {
          right: -5,
          top: 14,
          borderLeft: "5px solid #2C2C2C",
          borderTop: "5px solid transparent",
          borderBottom: "5px solid transparent",
        }
      : {
          top: -5,
          left: 14,
          borderBottom: "5px solid #2C2C2C",
          borderLeft: "5px solid transparent",
          borderRight: "5px solid transparent",
        };

  const opexHint =
    expenseCount > 0 ? `${expenseCount} item${expenseCount === 1 ? "" : "s"} entered` : "No expenses added yet";
  const teamHint =
    teamMemberCount > 0
      ? `${teamMemberCount} member${teamMemberCount === 1 ? "" : "s"}, fully burdened`
      : undefined;

  return (
    <span ref={wrapRef} className="relative inline-flex shrink-0 items-center">
      <button
        type="button"
        aria-label="Revenue architecture breakdown"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex cursor-pointer items-center text-gold hover:opacity-80"
        style={{ color: GOLD }}
      >
        <Info size={14} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Revenue architecture breakdown"
          className={`absolute ${posClass} z-50 max-h-[min(80vh,640px)] overflow-y-auto`}
          style={{
            width: 340,
            background: "#2C2C2C",
            border: "1px solid rgba(184,134,11,0.25)",
            borderRadius: 6,
            padding: "18px 20px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
            color: "white",
            fontFamily: "Jost, sans-serif",
            animation: "rab-fade 150ms ease both",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="absolute h-0 w-0" style={caret} />
          <style>{`@keyframes rab-fade { from { opacity: 0; transform: translateY(4px);} to { opacity: 1; transform: translateY(0);} }`}</style>

          <p
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 18,
              fontWeight: 400,
              color: "white",
              marginBottom: 4,
              lineHeight: 1.2,
            }}
          >
            What your firm needs to generate
          </p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.5, marginBottom: 14 }}>
            Annual revenue required to cover costs and hit your {Math.round(targetMarginPct || 0)}% profit target.
          </p>

          <p
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 28,
              color: CREAM,
              lineHeight: 1.1,
              marginBottom: 12,
            }}
          >
            {fmtUsd(annualTarget)}
          </p>

          <p
            style={{
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.35)",
              marginBottom: 6,
            }}
          >
            Cost floor breakdown
          </p>

          <FloorRow
            label="Owner compensation"
            amount={owner}
            floor={costFloor}
            hint="Salary, distributions, health, retirement"
          />
          <FloorRow label="Operating expenses" amount={opex} floor={costFloor} hint={opexHint} />
          <FloorRow label="Team cost" amount={team} floor={costFloor} hint={teamHint} />

          <div
            className="flex items-baseline justify-between"
            style={{ padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.15)" }}
          >
            <span style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.85)" }}>Total cost floor</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: "white" }}>{fmtUsd(costFloor)}/yr</span>
          </div>

          {marginAnnual > 0 && (
            <div className="flex items-baseline justify-between" style={{ padding: "6px 0 10px" }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.65)" }}>
                Margin ({Math.round(targetMarginPct || 0)}% target)
              </span>
              <span style={{ fontSize: 11, fontWeight: 500, color: SAGE }}>+{fmtUsd(marginAnnual)}/yr</span>
            </div>
          )}

          <div
            className="flex items-baseline justify-between"
            style={{ borderTop: "1px solid rgba(255,255,255,0.25)", paddingTop: 10, marginBottom: 16 }}
          >
            <span style={{ fontSize: 12, fontWeight: 500, color: "white" }}>Annual revenue target</span>
            <span
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 22,
                fontWeight: 400,
                color: GOLD,
              }}
            >
              {fmtUsd(annualTarget)}
            </span>
          </div>

          <p
            style={{
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.35)",
              marginBottom: 8,
            }}
          >
            How you&apos;re getting there
          </p>

          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
              Year to date · {month} of 12 months · through {monthLabel}
            </span>
            <span style={{ fontSize: 11, fontWeight: 500, color: onTrack ? SAGE : GOLD }}>
              {onTrack ? "On pace ↑" : "Behind pace"}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2" style={{ marginBottom: 10 }}>
            {[
              { label: "Total revenue", value: fmtUsd(ytd.totalRevenue), color: onTrack ? SAGE : "white" },
              { label: "Annual target", value: fmtUsd(annualTarget), color: "white" },
              { label: "Remaining", value: fmtUsd(remaining), color: remaining > 0 ? GOLD : SAGE },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  background: "rgba(255,255,255,0.05)",
                  borderRadius: 4,
                  padding: "8px 10px",
                }}
              >
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>{stat.label}</p>
                <p style={{ fontSize: 12, fontWeight: 500, color: stat.color, lineHeight: 1.2 }}>{stat.value}</p>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 4 }}>
            <div className="mb-1.5 flex items-center justify-between">
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>Design fees progress</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
                {fmtUsd(ytdCollected)} of {fmtUsd(ytdTarget)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div
                className="h-full rounded-full transition-all duration-150"
                style={{ width: `${ytdPct}%`, background: fillColor }}
              />
            </div>
          </div>

          <div
            style={{
              background: "rgba(255,255,255,0.05)",
              borderRadius: 4,
              padding: "10px 12px",
              marginTop: 10,
              fontSize: 11,
              color: onTrack ? SAGE : GOLD,
              lineHeight: 1.55,
              fontStyle: "italic",
            }}
          >
            {onTrack
              ? `At your current pace you need ${fmtUsd(monthlyNeeded)}/month for the next ${monthsRemaining} month${monthsRemaining === 1 ? "" : "s"}. Your monthly average is ${fmtUsd(monthlyAvg)} — you're on track toward ${fmtUsd(annualTarget)}.`
              : `To reach ${fmtUsd(annualTarget)} you need ${fmtUsd(Math.max(0, ytdTarget - ytdCollected))} more in collected fees by ${monthLabel}, about ${fmtUsd(monthlyNeeded)}/month for the remaining ${monthsRemaining} month${monthsRemaining === 1 ? "" : "s"}.`}
          </div>

          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 12, lineHeight: 1.5 }}>
            At {fmtUsd(c.alignedRate, { decimals: 0 })}/hr × {Math.round(c.annualBillableHrs).toLocaleString()} billable
            hrs/year
          </p>
        </div>
      )}
    </span>
  );
}
