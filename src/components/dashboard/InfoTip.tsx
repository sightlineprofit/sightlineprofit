import { Info, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useState } from "react";

/**
 * A stable, click-triggered insight panel. Replaces the previous hover
 * tooltip so the content can be read comfortably. The panel auto-flips
 * (right → left → bottom) via Radix's collision-aware positioning, and
 * closes on outside click, the × button, or clicking the trigger again.
 */
export type InsightRow = {
  label: string;
  /** Numeric weight used to render the proportion bar (0–1 of `max`). */
  proportion?: number;
  /** Formatted value string, e.g. "$142.00/hr". */
  value: string;
  /** Hex color for the proportion bar. Defaults to muted gold. */
  color?: string;
  /** Render as a dashed/ghost row (e.g. "gap" segments). */
  ghost?: boolean;
};

export function InfoTip({
  term,
  definition,
  why,
  rows,
  closingLine,
}: {
  term: string;
  definition?: string;
  why?: string;
  rows?: InsightRow[];
  closingLine?: string;
}) {
  const [open, setOpen] = useState(false);
  const hasBreakdown = rows && rows.length > 0;
  const maxProp = hasBreakdown
    ? Math.max(1, ...rows!.map((r) => Math.abs(r.proportion ?? 0)))
    : 1;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center text-ch/40 hover:text-gold transition-colors"
          aria-label={`Insight: ${term}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen((o) => !o);
          }}
        >
          <Info className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={12}
        collisionPadding={16}
        avoidCollisions
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="p-0 border-0 shadow-none bg-transparent w-auto max-w-[92vw]"
      >
        <div
          className="insight-panel"
          style={{
            width: 280,
            maxWidth: "92vw",
            background: "#2C2C2C",
            borderRadius: 6,
            boxShadow: "0 8px 32px rgba(44,44,44,0.25)",
            border: "0.5px solid rgba(255,255,255,0.08)",
            padding: 16,
            position: "relative",
            color: "#F4EFE8",
            fontFamily: "Jost, sans-serif",
          }}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "rgba(255,255,255,0.4)",
              padding: 2,
              lineHeight: 0,
            }}
            onMouseEnter={(e) => ((e.currentTarget.style.color = "rgba(255,255,255,0.85)"))}
            onMouseLeave={(e) => ((e.currentTarget.style.color = "rgba(255,255,255,0.4)"))}
          >
            <X style={{ width: 12, height: 12 }} />
          </button>
          <div
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 16,
              color: "#FFFFFF",
              marginBottom: 10,
              paddingRight: 18,
              lineHeight: 1.2,
            }}
          >
            {term}
          </div>
          {definition && (
            <div
              style={{
                fontSize: 12,
                lineHeight: 1.55,
                color: "rgba(244,239,232,0.85)",
                marginBottom: hasBreakdown || why || closingLine ? 10 : 0,
              }}
            >
              {definition}
            </div>
          )}
          {hasBreakdown && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rows!.map((r, i) => {
                const pct = Math.min(100, Math.max(0, (Math.abs(r.proportion ?? 0) / maxProp) * 100));
                const color = r.color ?? "#D4A017";
                return (
                  <div
                    key={`${r.label}-${i}`}
                    className="pop-row"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 60px auto",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: "rgba(244,239,232,0.75)" }}>{r.label}</span>
                    <span
                      aria-hidden
                      style={{
                        height: 4,
                        borderRadius: 2,
                        background: "rgba(255,255,255,0.08)",
                        overflow: "hidden",
                      }}
                    >
                      <span
                        style={{
                          display: "block",
                          height: "100%",
                          width: `${pct}%`,
                          background: r.ghost ? "transparent" : color,
                          backgroundImage: r.ghost
                            ? `repeating-linear-gradient(45deg, ${color}88 0 4px, transparent 4px 8px)`
                            : undefined,
                        }}
                      />
                    </span>
                    <span
                      style={{
                        fontVariantNumeric: "tabular-nums",
                        color: r.ghost ? "#E8A78E" : "#F4EFE8",
                        fontSize: 13,
                      }}
                    >
                      {r.value}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {why && (
            <div
              style={{
                fontSize: 12,
                color: "rgba(244,239,232,0.6)",
                fontStyle: "italic",
                marginTop: hasBreakdown ? 12 : 8,
                lineHeight: 1.5,
              }}
            >
              {why}
            </div>
          )}
          {closingLine && (
            <div
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontStyle: "italic",
                fontSize: 13,
                color: "rgba(244,239,232,0.6)",
                marginTop: 12,
                lineHeight: 1.4,
              }}
            >
              {closingLine}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export const GLOSSARY = {
  alignedRate: {
    term: "Aligned Rate",
    definition: "Your floor. Calculated from your total annual costs divided by your annual billable hours, adjusted for your target margin. The minimum you can charge and still run a financially healthy firm.",
    why: "Break-even is survival. This is health.",
  },
  breakEvenRate: {
    term: "Break-Even Rate",
    definition: "The absolute minimum hourly rate to cover your costs with nothing left over. Billing above break-even means you're not losing money — it does not mean you're meeting your financial goals.",
    why: "Your aligned rate is the number that actually matters.",
  },
  utilizationRate: {
    term: "Utilization Rate",
    definition: "The share of your available working hours that turn into billable client work.",
    why: "Most studios overestimate this. The honest number is usually 55–70%.",
  },
  marginAboveFloor: {
    term: "Margin Above Floor",
    definition: "The difference between what you bill and your aligned rate — the minimum your cost structure requires to hit your margin target. Different from break-even, which only covers costs; aligned rate covers costs AND target profit margin.",
    why: "True financial health requires billing above your aligned rate, not just above break-even.",
  },
  fullyBurdenedCost: {
    term: "Fully Burdened Cost",
    definition: "A team member's hourly cost including payroll taxes, benefits, retirement — not just salary.",
    why: "It's what someone really costs you per hour they're at the desk.",
  },
  amortizedContribution: {
    term: "Amortized Contribution",
    definition: "A one-time investment spread across the months it's expected to pay back, so it shows up in your rate evenly.",
    why: "Stops large purchases from distorting a single month's math.",
  },
  rateSafetyBuffer: {
    term: "Rate Safety Buffer",
    definition: "How much room your billed rate has above the break-even rate, as a percentage.",
    why: "Below 20% is fragile. Above 50% is healthy.",
  },
  grossMargin: {
    term: "Gross Margin",
    definition: "Revenue minus the direct cost of delivering the work, expressed as a percentage of revenue.",
    why: "The single number that tells you whether the business model works.",
  },
} as const;