import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Info } from "lucide-react";
import type { calc } from "@/lib/finance";
import { fmtUsd } from "@/lib/finance";

type Calc = ReturnType<typeof calc>;

export function AlignedRateBreakdown({
  c,
  targetMarginPct,
  onSeeAnnualImpact,
  side = "left",
}: {
  c: Calc;
  targetMarginPct: number;
  onSeeAnnualImpact?: () => void;
  side?: "left" | "bottom";
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  };

  const scheduleOpen = () => {
    clearTimers();
    openTimer.current = setTimeout(() => setOpen(true), 200);
  };
  const scheduleClose = () => {
    clearTimers();
    closeTimer.current = setTimeout(() => setOpen(false), 300);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  useEffect(() => () => clearTimers(), []);

  const hrs = c.annualBillableHrs || 0;
  const ownerAnn = c.compTotal || 0;
  const teamAnn = c.teamCostTotal || 0;
  const opexAnn = (c.opexRecurring || 0) + (c.opexOneTime || 0);
  const ownerPerHr = hrs > 0 ? ownerAnn / hrs : 0;
  const teamPerHr = hrs > 0 ? teamAnn / hrs : 0;
  const opexPerHr = hrs > 0 ? opexAnn / hrs : 0;
  const breakEven = c.breakEvenRate || 0;
  const aligned = c.alignedRate || 0;
  const billed = c.billedRate || 0;
  const marginPerHr = Math.max(0, aligned - breakEven);

  const bar = (per: number, base: number) => {
    const pct = base > 0 ? Math.min(100, (per / base) * 100) : 0;
    return Math.max(8, Math.round((pct / 100) * 80));
  };

  const ownerBar = bar(ownerPerHr, breakEven);
  const teamBar = bar(teamPerHr, breakEven);
  const opexBar = bar(opexPerHr, breakEven);
  const marginBar = bar(marginPerHr, aligned);

  const posClass =
    side === "left"
      ? "right-full mr-2 top-0"
      : "left-0 top-full mt-2";

  const caret =
    side === "left"
      ? { right: -5, top: 14, borderLeft: "5px solid #2C2C2C", borderTop: "5px solid transparent", borderBottom: "5px solid transparent" }
      : { top: -5, left: 14, borderBottom: "5px solid #2C2C2C", borderLeft: "5px solid transparent", borderRight: "5px solid transparent" };

  const rowBorder = "border-b border-white/[0.06]";
  const labelCls = "flex-1";
  const valCls = "text-right min-w-[52px]";

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex items-center align-middle"
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        aria-label="Aligned rate breakdown"
        onClick={(e) => {
          e.stopPropagation();
          clearTimers();
          setOpen((v) => !v);
        }}
        className="ml-1.5 inline-flex cursor-pointer items-center text-gold hover:opacity-80"
        style={{ color: "#C59845" }}
      >
        <Info size={14} />
      </button>

      {open && (
        <div
          role="dialog"
          onMouseEnter={clearTimers}
          onMouseLeave={scheduleClose}
          className={`absolute ${posClass} z-50`}
          style={{
            width: 320,
            background: "#2C2C2C",
            border: "1px solid rgba(184,134,11,0.25)",
            borderRadius: 6,
            padding: "18px 20px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
            color: "white",
            fontFamily: "Jost, sans-serif",
            animation: "arb-fade 150ms ease both",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="absolute w-0 h-0" style={caret} />
          <style>{`@keyframes arb-fade { from { opacity: 0; transform: translateY(4px);} to { opacity: 1; transform: translateY(0);} }`}</style>

          <div
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 18,
              fontWeight: 400,
              color: "white",
              marginBottom: 16,
            }}
          >
            Where {fmtUsd(aligned)}/hr comes from
          </div>

          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.35)",
              marginBottom: 10,
            }}
          >
            Each billable hour covers:
          </div>

          {/* Owner comp */}
          <div className={`flex items-center gap-2 py-[5px] ${teamAnn > 0 || opexAnn >= 0 ? rowBorder : ""}`} style={{ fontSize: 11 }}>
            <span className={labelCls} style={{ color: "rgba(255,255,255,0.65)", fontWeight: 400 }}>
              Your compensation
            </span>
            <span
              style={{
                height: 3,
                borderRadius: 2,
                background: "rgba(184,134,11,0.5)",
                width: ownerBar,
                flex: "none",
              }}
            />
            <span className={valCls} style={{ color: "white", fontWeight: 500 }}>
              {ownerAnn > 0 ? `${fmtUsd(ownerPerHr)}/hr` : "—"}
            </span>
          </div>

          {/* Team */}
          {teamAnn > 0 && (
            <div className={`flex items-center gap-2 py-[5px] ${rowBorder}`} style={{ fontSize: 11 }}>
              <span className={labelCls} style={{ color: "rgba(255,255,255,0.65)", fontWeight: 400 }}>
                Team cost
              </span>
              <span
                style={{
                  height: 3,
                  borderRadius: 2,
                  background: "rgba(184,134,11,0.5)",
                  width: teamBar,
                  flex: "none",
                }}
              />
              <span className={valCls} style={{ color: "white", fontWeight: 500 }}>
                {fmtUsd(teamPerHr)}/hr
              </span>
            </div>
          )}

          {/* Opex */}
          <div className="flex items-center gap-2 py-[5px]" style={{ fontSize: 11 }}>
            <span className={labelCls} style={{ color: "rgba(255,255,255,0.65)", fontWeight: 400 }}>
              Operating expenses
            </span>
            <span
              style={{
                height: 3,
                borderRadius: 2,
                background: "rgba(184,134,11,0.5)",
                width: opexBar,
                flex: "none",
              }}
            />
            <span className={valCls} style={{ color: "white", fontWeight: 500 }}>
              {fmtUsd(opexPerHr)}/hr
            </span>
          </div>
          {opexAnn === 0 && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
              No expenses added yet.
            </div>
          )}

          {/* Break-even subtotal */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.15)", margin: "8px 0" }} />
          <div className="flex justify-between items-baseline" style={{ padding: "6px 0" }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.85)" }}>Break-even</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: "white" }}>{fmtUsd(breakEven)}/hr</span>
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>
            The minimum rate to cover all firm costs.
          </div>

          {/* Margin */}
          <div className={`flex items-center gap-2 py-[6px] ${rowBorder}`} style={{ fontSize: 11 }}>
            <span className={labelCls} style={{ color: "rgba(255,255,255,0.65)", fontWeight: 400 }}>
              Margin ({Math.round(targetMarginPct || 0)}% target)
            </span>
            <span
              style={{
                height: 3,
                borderRadius: 2,
                background: "rgba(92,138,110,0.6)",
                width: marginBar,
                flex: "none",
              }}
            />
            <span className={valCls} style={{ color: "#7AB890", fontWeight: 500 }}>
              +{fmtUsd(marginPerHr)}/hr
            </span>
          </div>

          {/* Aligned total */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.25)", margin: "10px 0 8px" }} />
          <div className="flex justify-between items-baseline">
            <span style={{ fontSize: 12, fontWeight: 500, color: "white" }}>Aligned rate</span>
            <span
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 22,
                fontWeight: 400,
                color: "#D4A017",
              }}
            >
              {fmtUsd(aligned)}/hr
            </span>
          </div>

          {/* Health callout */}
          <RateCallout billed={billed} breakEven={breakEven} aligned={aligned} targetMarginPct={targetMarginPct} health={c.rateHealth} />

          {/* Empty-state hint */}
          {ownerAnn <= 0 && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 8 }}>
              Complete your compensation setup for a full breakdown.{" "}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate({ to: "/settings", search: { panel: "comp" } as any } as any);
                }}
                style={{ color: "rgba(184,134,11,0.9)", textDecoration: "underline" }}
              >
                Open owner compensation
              </button>
            </div>
          )}

          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                if (onSeeAnnualImpact) onSeeAnnualImpact();
                else navigate({ to: "/dashboard" } as any);
              }}
              className="hover:!text-[rgba(184,134,11,0.8)]"
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.3)",
                cursor: "pointer",
                background: "transparent",
                border: 0,
                padding: 0,
              }}
            >
              See annual impact →
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

function RateCallout({
  billed,
  breakEven,
  aligned,
  targetMarginPct,
  health,
}: {
  billed: number;
  breakEven: number;
  aligned: number;
  targetMarginPct: number;
  health: "critical" | "below_floor" | "healthy";
}) {
  let color = "#5C8A6E";
  let text = "";
  if (health === "critical") {
    color = "#C4714A";
    const gap = Math.max(0, breakEven - billed);
    text = `Your billed rate of ${fmtUsd(billed)}/hr doesn't cover your cost floor of ${fmtUsd(breakEven)}/hr. Every hour you bill loses ${fmtUsd(gap)}/hr.`;
  } else if (health === "below_floor") {
    color = "#B8860B";
    const gap = Math.max(0, aligned - billed);
    text = `Your billed rate covers costs but falls ${fmtUsd(gap)}/hr short of your ${Math.round(targetMarginPct || 0)}% margin target.`;
  } else {
    color = "#5C8A6E";
    const margin = Math.max(0, billed - aligned);
    text = `Your billed rate is ${fmtUsd(margin)}/hr above your aligned rate. You're billing with a healthy margin.`;
  }
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.05)",
        borderRadius: 3,
        padding: "8px 10px",
        marginTop: 10,
        color,
        fontSize: 11,
        fontWeight: 400,
        lineHeight: 1.5,
      }}
    >
      {text}
    </div>
  );
}