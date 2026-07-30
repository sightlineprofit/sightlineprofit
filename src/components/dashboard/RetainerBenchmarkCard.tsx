import { fmtUsd } from "@/lib/finance";
import type { RetainerPortfolioMetrics } from "@/lib/retainer-metrics";

const CHARCOAL = "#2C2C2C";
const GOLD = "#B8860B";
const CREAM = "#FAF7F2";
const SAGE = "#5C8A6E";
const TERRA = "#C4714A";
const MUTED = "#6B6259";
const MUTED_LT = "#8A7F75";
const BORDER = "rgba(44,44,44,0.10)";

function portfolioRateColor(
  rate: number | null,
  aligned: number,
  breakEven: number,
): string {
  if (rate == null) return MUTED_LT;
  if (rate >= aligned) return SAGE;
  if (rate >= breakEven) return GOLD;
  return TERRA;
}

function portfolioInterpretation(m: RetainerPortfolioMetrics): string {
  const { portfolioRealizedRate: rate, alignedRate, breakEvenRate } = m;
  if (rate == null) {
    return "Log time on your retainer clients to see this.";
  }
  const rounded = Math.round(rate);
  const aligned = Math.round(alignedRate);
  const breakEven = Math.round(breakEvenRate);
  if (rate >= alignedRate) {
    return `On average, each hour your firm works across all your retainer clients is generating ${fmtUsd(rounded, { decimals: 0 })}/hr — above your ${fmtUsd(aligned, { decimals: 0 })}/hr target.`;
  }
  if (rate >= breakEvenRate) {
    const gap = Math.round(alignedRate - rate);
    return `On average, each hour your firm works is generating ${fmtUsd(rounded, { decimals: 0 })}/hr — covering costs but ${fmtUsd(gap, { decimals: 0 })}/hr below your target.`;
  }
  return `On average, each hour your firm works is generating ${fmtUsd(rounded, { decimals: 0 })}/hr — below the ${fmtUsd(breakEven, { decimals: 0 })}/hr needed to cover costs.`;
}

export function RetainerBenchmarkCard({
  metrics,
  className,
}: {
  metrics: RetainerPortfolioMetrics;
  className?: string;
}) {
  const {
    breakEvenRate,
    alignedRate,
    portfolioRealizedRate,
    targetMarginPct,
  } = metrics;
  const rateColor = portfolioRateColor(
    portfolioRealizedRate,
    alignedRate,
    breakEvenRate,
  );

  return (
    <div
      className={className}
      style={{
        marginTop: 22,
        borderTop: `1px solid ${BORDER}`,
        paddingTop: 18,
      }}
    >
      <p
        style={{
          fontFamily: "Jost, sans-serif",
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          color: MUTED_LT,
          marginBottom: 10,
        }}
      >
        Your hourly benchmark
      </p>

      <div className="grid grid-cols-2 gap-2.5">
        <div
          style={{
            background: CREAM,
            borderRadius: 10,
            padding: "14px 16px",
          }}
        >
          <p style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: MUTED_LT, marginBottom: 4 }}>
            Break-even
          </p>
          <p
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 28,
              fontWeight: 400,
              color: CHARCOAL,
              lineHeight: 1.1,
            }}
          >
            {fmtUsd(breakEvenRate, { decimals: 0 })}/hr
          </p>
          <p style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: MUTED_LT, marginTop: 3 }}>
            minimum to cover costs
          </p>
        </div>

        <div
          style={{
            background: "rgba(92,138,110,0.06)",
            borderRadius: 10,
            padding: "14px 16px",
          }}
        >
          <p style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: MUTED_LT, marginBottom: 4 }}>
            Aligned rate
          </p>
          <p
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 28,
              fontWeight: 400,
              color: SAGE,
              lineHeight: 1.1,
            }}
          >
            {fmtUsd(alignedRate, { decimals: 0 })}/hr
          </p>
          <p
            style={{
              fontFamily: "Jost, sans-serif",
              fontSize: 11,
              color: SAGE,
              opacity: 0.8,
              marginTop: 3,
            }}
          >
            costs + {Math.round(targetMarginPct)}% margin
          </p>
        </div>
      </div>

      <p
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 13,
          fontStyle: "italic",
          color: MUTED,
          lineHeight: 1.75,
          marginTop: 12,
        }}
      >
        These aren&apos;t rates you charge — they&apos;re the benchmarks your firm needs to hit. Every
        productive hour across your firm should generate at least {fmtUsd(breakEvenRate, { decimals: 0 })} to
        cover costs. Above {fmtUsd(alignedRate, { decimals: 0 })} and your firm is hitting its goals.
      </p>

      <div style={{ height: 0.5, background: BORDER, margin: "14px 0" }} />

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p
            style={{
              fontFamily: "Jost, sans-serif",
              fontSize: 9,
              fontWeight: 500,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: MUTED_LT,
              marginBottom: 4,
            }}
          >
            Revenue each hour produced
          </p>
          <p
            style={{
              fontFamily: "Jost, sans-serif",
              fontSize: 12,
              fontStyle: "italic",
              color: MUTED,
              lineHeight: 1.55,
            }}
          >
            {portfolioInterpretation(metrics)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {portfolioRealizedRate != null ? (
            <p
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 28,
                fontWeight: 400,
                color: rateColor,
                lineHeight: 1.1,
              }}
            >
              {fmtUsd(Math.round(portfolioRealizedRate), { decimals: 0 })}/hr
            </p>
          ) : (
            <p style={{ fontFamily: "Jost, sans-serif", fontSize: 18, color: MUTED_LT }}>—</p>
          )}
        </div>
      </div>
    </div>
  );
}
