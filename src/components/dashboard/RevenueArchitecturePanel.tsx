import { Link } from "@tanstack/react-router";
import { fmtUsd, type calc } from "@/lib/finance";
import { RevenueArchitectureBreakdown } from "./RevenueArchitectureBreakdown";
import type { YearToDateRevenueProps } from "./YearToDateRevenue";

const CHARCOAL = "#2C2C2C";
const GOLD = "#B8860B";
const SAGE = "#5C8A6E";
const TERRA = "#C4714A";
const MUTED = "#6B6259";
const MUTED_LT = "#8A7F75";
const BORDER = "rgba(44,44,44,0.10)";

type Calc = ReturnType<typeof calc>;

function InsightBubble({ text, tone }: { text: string; tone: "sage" | "gold" | "terra" }) {
  const colors = { sage: SAGE, gold: GOLD, terra: TERRA };
  const bg = { sage: "rgba(92,138,110,0.08)", gold: "rgba(184,134,11,0.08)", terra: "rgba(196,113,74,0.08)" };
  return (
    <div
      className="rounded-lg px-3.5 py-2.5"
      style={{
        background: bg[tone],
        borderLeft: `2px solid ${colors[tone]}`,
        fontFamily: "Jost, sans-serif",
        fontSize: 11,
        color: MUTED,
        lineHeight: 1.6,
      }}
    >
      {text}
    </div>
  );
}

export function RevenueArchitecturePanel({
  c,
  variant = "tile",
  className,
  targetMarginPct,
  ytd,
  expenseCount,
  teamMemberCount,
}: {
  c: Calc;
  variant?: "tile" | "panel";
  className?: string;
  targetMarginPct?: number;
  ytd?: YearToDateRevenueProps;
  expenseCount?: number;
  teamMemberCount?: number;
}) {
  const annualTarget = c.alignedRate * c.annualBillableHrs;
  const costFloor = c.totalCost || 0;
  const budgetRevenue = c.annualRevenue || 0;
  const shortfall = Math.max(0, costFloor - budgetRevenue);
  const gapToTarget = Math.max(0, annualTarget - budgetRevenue);

  const insights: Array<{ text: string; tone: "sage" | "gold" | "terra" }> = [];
  if (budgetRevenue < costFloor) {
    insights.push({
      tone: "terra",
      text: `At your current billed rate and hours, budget revenue is ${fmtUsd(shortfall)} below your ${fmtUsd(costFloor)} cost floor.`,
    });
  } else if (budgetRevenue < annualTarget) {
    insights.push({
      tone: "gold",
      text: `You cover costs, but you're ${fmtUsd(gapToTarget)} below your ${fmtUsd(annualTarget)} margin-inclusive revenue target.`,
    });
  } else {
    insights.push({
      tone: "sage",
      text: `Budget revenue meets your aligned target — ${fmtUsd(budgetRevenue - annualTarget)} above the margin floor.`,
    });
  }
  if (c.rateHealth === "critical") {
    insights.push({
      tone: "terra",
      text: `Your billed rate (${fmtUsd(c.billedRate, { decimals: 0 })}/hr) is below break-even. Raise rate or bill more hours to close the gap.`,
    });
  }

  const isTile = variant === "tile";
  const headlineSize = isTile ? 22 : 40;
  const showBreakdown = targetMarginPct != null && ytd != null;
  const marginPct = Math.round(targetMarginPct ?? 0);
  const targetCaption =
    marginPct > 0
      ? `Annual revenue required to cover costs and hit your ${marginPct}% profit target.`
      : "Annual revenue required to cover costs and hit your profit target.";

  return (
    <div data-tour="revenue-panel" className={isTile ? `h-full min-h-0 ${className ?? ""}` : undefined}>
      <div
        className={
          isTile
            ? "flex h-full min-h-0 flex-col border bg-white"
            : `rounded-xl border bg-white px-5 py-5 sm:px-[22px] ${className ?? ""}`
        }
        style={{
          borderColor: BORDER,
          padding: isTile ? "12px 16px" : undefined,
          borderRadius: isTile ? 6 : 12,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p
              style={{
                fontFamily: "Jost, sans-serif",
                fontSize: isTile ? 10 : 11,
                fontWeight: 500,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                color: GOLD,
              }}
            >
              Revenue architecture
            </p>
            {!isTile && (
              <p
                style={{
                  fontFamily: "var(--font-voice, 'Cormorant Garamond', Georgia, serif)",
                  fontSize: 18,
                  color: CHARCOAL,
                  marginTop: 2,
                }}
              >
                Annual revenue target
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {showBreakdown && (
              <RevenueArchitectureBreakdown
                c={c}
                targetMarginPct={targetMarginPct}
                ytd={ytd}
                expenseCount={expenseCount}
                teamMemberCount={teamMemberCount}
                side="left"
              />
            )}
            {!isTile && (
              <Link to="/settings" style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: GOLD }} className="hover:underline">
                Edit inputs →
              </Link>
            )}
          </div>
        </div>

        <div className={isTile ? "mt-2 flex min-h-0 flex-1 flex-col" : "mt-4"}>
          <p
            style={{
              fontFamily: "Jost, sans-serif",
              fontSize: isTile ? 10 : 11,
              color: MUTED_LT,
              lineHeight: 1.45,
              marginBottom: isTile ? 4 : 6,
            }}
          >
            {targetCaption}
          </p>
          <p
            style={{
              fontFamily: "var(--font-voice, 'Cormorant Garamond', Georgia, serif)",
              fontSize: headlineSize,
              color: CHARCOAL,
              lineHeight: 1.1,
            }}
          >
            {fmtUsd(annualTarget)}
          </p>
          <p style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: MUTED_LT, marginTop: 2 }}>
            at {fmtUsd(c.alignedRate, { decimals: 0 })}/hr × {Math.round(c.annualBillableHrs).toLocaleString()} billable hrs
          </p>
        </div>

        {insights.length > 0 && (
          <div className={isTile ? "mt-auto line-clamp-2 pt-2" : "mt-4 space-y-2"}>
            {(isTile ? insights.slice(0, 1) : insights).map((ins, i) =>
              isTile ? (
                <p
                  key={i}
                  style={{
                    fontFamily: "Jost, sans-serif",
                    fontSize: 11,
                    color: ins.tone === "sage" ? SAGE : ins.tone === "gold" ? GOLD : TERRA,
                    lineHeight: 1.45,
                  }}
                >
                  {ins.text}
                </p>
              ) : (
                <InsightBubble key={i} text={ins.text} tone={ins.tone} />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
