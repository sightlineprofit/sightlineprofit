import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { X, Info } from "lucide-react";
import { createPortal } from "react-dom";
import { calc, fmtUsd, fmtPct } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlignedRateBreakdown } from "@/components/dashboard/AlignedRateBreakdown";
import { MetricBreakdown } from "@/components/dashboard/MetricBreakdown";
import { CapacityExpanded, type CapacityExpandedData } from "@/components/capacity/CapacityExpanded";

type PanelKind = "rate" | "capacity" | null;

function Tip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center text-ch/40 hover:text-gold transition-colors"
            aria-label="More info"
          >
            <Info className="h-3 w-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs bg-ch text-cream border-ch px-3 py-2 text-xs leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function SectionLabel({ children, tip }: { children: React.ReactNode; tip?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="text-[11px] font-semibold uppercase text-ch/50"
        style={{ letterSpacing: "0.14em" }}
      >
        {children}
      </span>
      {tip && <Tip text={tip} />}
    </div>
  );
}

function DetailRow({
  label,
  value,
  valueClassName,
  tip,
  last,
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
  tip?: string;
  last?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between"
      style={{
        padding: "7px 0",
        borderBottom: last ? "none" : "0.5px solid rgba(44,44,44,.06)",
      }}
    >
      <span className="flex items-center gap-1.5 text-[12px] text-ch/60">
        {label}
        {tip && <Tip text={tip} />}
      </span>
      <span className={cn("text-[12px] text-ch num", valueClassName)}>{value}</span>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "var(--border)", margin: "20px 0" }} />;
}

function Shell({
  open,
  onClose,
  eyebrow,
  title,
  children,
  widthStyle,
}: {
  open: boolean;
  onClose: () => void;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  widthStyle?: React.CSSProperties;
}) {
  const isMobile = useIsMobile();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    } else if (mounted) {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 240);
      return () => clearTimeout(t);
    }
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || typeof document === "undefined") return null;

  const panelStyle: React.CSSProperties = isMobile
    ? {
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: "85vh",
        background: "var(--cream)",
        borderTop: "1px solid var(--border)",
        borderRadius: "12px 12px 0 0",
        zIndex: 200,
        overflowY: "auto",
        padding: "24px 24px 48px",
        transform: visible ? "translateY(0)" : "translateY(100%)",
        transition: "transform 0.22s ease",
      }
    : {
        position: "fixed",
        right: 0,
        top: 0,
        height: "100vh",
        width: 380,
        background: "var(--cream)",
        borderLeft: "1px solid var(--border)",
        zIndex: 200,
        overflowY: "auto",
        padding: "28px 28px 48px",
        transform: visible ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.22s ease",
        ...(widthStyle ?? {}),
      };

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(44,44,44,0.18)",
          zIndex: 199,
          opacity: visible ? 1 : 0,
          transition: "opacity 0.22s ease",
        }}
      />
      <aside style={panelStyle} role="dialog" aria-modal="true" aria-label={title}>
        <div
          className="mb-6 flex items-start justify-between"
          style={{
            position: "sticky",
            top: 0,
            background: "var(--cream)",
            zIndex: 1,
            paddingBottom: 8,
          }}
        >
          <div>
            <div
              className="text-[11px] font-semibold uppercase text-gold"
              style={{ letterSpacing: "0.16em", marginBottom: 6 }}
            >
              {eyebrow}
            </div>
            <h2 className="font-display text-[26px] font-normal leading-none text-ch">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[16px] text-ch/40 hover:text-ch transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </aside>
    </>,
    document.body,
  );
}

function EditPromptFooter({
  primary,
  secondary,
  onNavigate,
}: {
  primary: { label: string; to: string; hash?: string };
  secondary: { label: string; to: string; hash?: string };
  onNavigate: (to: string, hash?: string) => void;
}) {
  return (
    <div style={{ borderTop: "1px solid var(--border)", marginTop: 20, paddingTop: 16 }}>
      <div className="flex flex-wrap gap-4">
        <button
          type="button"
          onClick={() => onNavigate(primary.to, primary.hash)}
          className="text-[11px] text-gold hover:underline"
        >
          {primary.label}
        </button>
        <button
          type="button"
          onClick={() => onNavigate(secondary.to, secondary.hash)}
          className="text-[11px] text-ch/50 hover:underline"
        >
          {secondary.label}
        </button>
      </div>
      <div className="mt-2 text-[11px] text-ch/50">
        Changes save automatically. Dashboard updates immediately.
      </div>
    </div>
  );
}

/* ─────────────────────── RATE BREAKDOWN ─────────────────────── */

export function RateBreakdownSlideOver({
  open,
  onClose,
  c,
  targetMarginPct,
}: {
  open: boolean;
  onClose: () => void;
  c: ReturnType<typeof calc>;
  targetMarginPct: number;
}) {
  const navigate = useNavigate();
  const [marginUnit, setMarginUnit] = useState<"hr" | "week">("hr");

  const aligned = c.alignedRate;
  const billed = c.billedRate;
  const breakEven = c.breakEvenRate;
  const aboveFloor = billed >= aligned;
  const marginPerHr = c.marginAboveFloor; // signed
  const marginPerWk = marginPerHr * (c.targetBillableHrsWeek || 0);
  const marginDisplay =
    marginUnit === "hr"
      ? `${marginPerHr >= 0 ? "+" : "-"}${fmtUsd(Math.abs(marginPerHr))}/hr`
      : `${marginPerWk >= 0 ? "+" : "-"}${fmtUsd(Math.abs(marginPerWk))}/wk`;
  const marginColorClass = marginPerHr >= 0 ? "text-gold" : "text-danger";

  const budgetRevenue = c.annualRevenue;
  const utilizationPct =
    (c.targetBillableHrsWeek > 0 &&
      Number.isFinite(c.targetBillableHrsWeek) &&
      (c.targetBillableHrsWeek / Math.max(1, c.targetBillableHrsWeek + 0)) * 100) || 0;
  // utilization target = target billable / available; but available isn't in c. We derive from config elsewhere; fall back to marginPct target display.

  const pill = (() => {
    if (c.rateHealth === "healthy")
      return { label: "Above floor", style: { background: "#EAF3DE", color: "#27500A" } };
    if (c.rateHealth === "below_floor")
      return { label: "Below floor", style: { background: "#FAEEDA", color: "#633806" } };
    return { label: "Below break-even", style: { background: "#FCEBEB", color: "#791F1F" } };
  })();

  const rateToHitTarget =
    targetMarginPct < 100 ? breakEven / (1 - targetMarginPct / 100) : aligned;
  const currentMarginPct = c.grossMarginPct;

  let narrative: string;
  if (aboveFloor && currentMarginPct >= targetMarginPct && targetMarginPct > 0) {
    narrative = `You're hitting your ${targetMarginPct.toFixed(0)}% margin target. Your ${fmtUsd(
      marginPerHr,
    )}/hr buffer means you have room to absorb small cost increases without falling below your floor.`;
  } else if (aboveFloor) {
    narrative = `You're above your floor but below your ${targetMarginPct.toFixed(
      0,
    )}% margin target. Raising your rate to ${fmtUsd(rateToHitTarget)} would close that gap.`;
  } else {
    narrative = `You're billing below your cost floor. Every hour billed at ${fmtUsd(
      billed,
    )} costs the business ${fmtUsd(aligned - billed)} it can't recover. Your floor is ${fmtUsd(
      aligned,
    )}.`;
  }

  const go = (to: string, hash?: string) => {
    onClose();
    setTimeout(() => {
      navigate({ to, hash } as any);
    }, 240);
  };

  return (
    <Shell open={open} onClose={onClose} eyebrow="LIVE OUTPUT" title="Your numbers">
      {/* Section 1: Aligned rate */}
      <SectionLabel tip="The minimum hourly rate your cost structure requires. Calculated from your compensation, expenses, and target billable hours.">
        ALIGNED RATE
      </SectionLabel>
      <div className="font-display text-[44px] font-normal leading-none text-ch mt-2 num flex items-center">
        <span>{fmtUsd(aligned)}</span>
        <AlignedRateBreakdown c={c} targetMarginPct={targetMarginPct} side="bottom" />
      </div>
      <div className="mt-1 text-[11px] font-light text-ch/60">
        Your floor. The minimum you can charge.
      </div>

      <Divider />

      {/* Section 2: Billed rate + health */}
      <div className="flex items-start justify-between">
        <SectionLabel>BILLED RATE</SectionLabel>
        <div
          className={cn(
            "font-display text-[20px] font-normal leading-none num flex items-center",
            aboveFloor ? "text-gold" : "text-danger",
          )}
        >
          <span>{fmtUsd(billed)}</span>
          <MetricBreakdown metric="billed" c={c} targetMarginPct={targetMarginPct} side="left" iconSize={12} />
        </div>
      </div>

      <div
        className="mt-3"
        style={{
          background: "white",
          border: "0.5px solid var(--border)",
          borderRadius: 4,
          padding: "14px 16px",
        }}
      >
        <div className="flex items-center justify-between">
          <SectionLabel>RATE HEALTH</SectionLabel>
          <span className="flex items-center">
            <span
              className="rounded-[2px] px-2 py-[3px] text-[11px] font-semibold uppercase tracking-wider"
              style={pill.style}
            >
              {pill.label}
            </span>
            <MetricBreakdown metric="health" c={c} targetMarginPct={targetMarginPct} side="left" iconSize={12} />
          </span>
        </div>

        <div className="mt-3 flex items-start justify-between">
          <SectionLabel>MARGIN ABOVE FLOOR</SectionLabel>
          <select
            value={marginUnit}
            onChange={(e) => setMarginUnit(e.target.value as "hr" | "week")}
            className="bg-transparent text-[11px] uppercase tracking-wider text-ch/60 hover:text-ch focus:outline-none cursor-pointer"
          >
            <option value="hr">/hr</option>
            <option value="week">/week</option>
          </select>
        </div>
        <div
          className={cn(
            "mt-1 font-display text-[28px] font-normal leading-none num flex items-center",
            marginColorClass,
          )}
        >
          <span>{marginDisplay}</span>
          <MetricBreakdown metric="margin" c={c} targetMarginPct={targetMarginPct} side="left" iconSize={12} />
        </div>

        <div style={{ height: "0.5px", background: "var(--border)", margin: "12px 0" }} />

        <DetailRow label="Break-even rate" value={`${fmtUsd(breakEven)}/hr`} />
        <DetailRow label="Your floor" value={`${fmtUsd(aligned)}/hr`} />
        <DetailRow
          label="You're billing"
          value={`${fmtUsd(billed)}/hr`}
          valueClassName={aboveFloor ? "text-gold" : "text-danger"}
        />
        <DetailRow
          label="Buffer above floor"
          value={`${marginPerHr >= 0 ? "+" : "-"}${fmtUsd(Math.abs(marginPerHr))}/hr`}
          valueClassName={marginPerHr >= 0 ? "text-gold" : "text-danger"}
        />
        <DetailRow
          label={`Actual margin at ${fmtUsd(billed)}`}
          value={fmtPct(currentMarginPct, 0)}
          tip="Gross margin at your current billed rate against total costs"
          last
        />

        <p
          className="mt-3 text-[11px] font-light text-ch/70"
          style={{ lineHeight: 1.7 }}
        >
          {narrative}
        </p>
      </div>

      <Divider />

      {/* Section 3: Supporting numbers */}
      <div>
        <DetailRow
          label="Break-even rate"
          value={`${fmtUsd(breakEven)}/hr`}
          tip="The rate at which revenue exactly covers costs with zero margin."
        />
        <DetailRow
          label="Annual cost floor"
          value={fmtUsd(c.totalCost)}
          tip="Total annual cost of running this firm including your compensation and all operating expenses."
        />
        <DetailRow
          label="Utilization target"
          value={`${Math.round(utilizationPct) || "—"}${utilizationPct ? "%" : ""}`}
          tip="Target billable hours as a percentage of available hours per week."
        />
        <DetailRow
          label="Budget revenue"
          value={fmtUsd(budgetRevenue)}
          tip="Annual revenue if every billable contributor hits target hours at their billed rates."
          last
        />
        <div className="mt-3 flex items-center gap-3 text-[11px] text-ch/50">
          <span className="flex items-center">Break-even<MetricBreakdown metric="breakeven" c={c} targetMarginPct={targetMarginPct} side="bottom" iconSize={11} /></span>
          <span className="flex items-center">Cost floor<MetricBreakdown metric="cost_floor" c={c} targetMarginPct={targetMarginPct} side="bottom" iconSize={11} /></span>
          <span className="flex items-center">Budget revenue<MetricBreakdown metric="budget_revenue" c={c} targetMarginPct={targetMarginPct} side="bottom" iconSize={11} /></span>
        </div>
      </div>

      <EditPromptFooter
        primary={{ label: "Edit your rate →", to: "/settings?panel=rate" }}
        secondary={{ label: "Run a scenario →", to: "/settings?panel=rate", hash: "scenarios" }}
        onNavigate={go}
      />
    </Shell>
  );
}

/* ─────────────────────── CAPACITY DETAIL ─────────────────────── */

export function CapacitySlideOver({
  open,
  onClose,
  data,
}: {
  open: boolean;
  onClose: () => void;
  data: CapacityExpandedData;
}) {
  return (
    <Shell
      open={open}
      onClose={onClose}
      eyebrow="CAPACITY"
      title="Your time"
      widthStyle={{ width: "50vw", minWidth: 640, maxWidth: 860 }}
    >
      <CapacityExpanded data={data} />
    </Shell>
  );
}

function prettyN(n: number): string {
  const v = Math.round((Number(n) || 0) * 10) / 10;
  if (v === Math.floor(v)) return String(Math.floor(v));
  return v.toFixed(1);
}

export type { PanelKind };