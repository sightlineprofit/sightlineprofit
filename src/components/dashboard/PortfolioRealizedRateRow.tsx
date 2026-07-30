import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { InfoTip } from "@/components/dashboard/InfoTip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getPortfolioRealizedRate,
  type PortfolioRealizedRateStatus,
} from "@/lib/finance";

const SAGE = "#5C8A6E";
const GOLD = "#B8860B";
const TERRA = "#C4714A";
const MUTED = "#6B6259";
const MUTED_LT = "#8A7F75";
const BORDER = "rgba(44,44,44,0.10)";

function statusColor(status: PortfolioRealizedRateStatus): string {
  if (status === "above_aligned") return SAGE;
  if (status === "above_breakeven") return GOLD;
  if (status === "below_breakeven") return TERRA;
  return MUTED_LT;
}

export function PortfolioRealizedRateRow({
  firmId,
  rateDefinition,
}: {
  firmId: string;
  rateDefinition?: string;
}) {
  const fetch = useServerFn(getPortfolioRealizedRate);
  const { data, isLoading } = useQuery({
    queryKey: ["portfolio-realized-rate", firmId],
    queryFn: () => fetch({ data: { firmId } }),
    staleTime: 60_000,
  });

  const color = data ? statusColor(data.status) : MUTED_LT;

  return (
    <>
      <div className="h-px shrink-0" style={{ background: BORDER, margin: "12px 0" }} />
      <div className="flex items-start justify-between gap-4 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-1">
            <p
              style={{
                fontFamily: "Jost, sans-serif",
                fontSize: 9,
                fontWeight: 500,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: MUTED_LT,
              }}
            >
              Portfolio realized rate
            </p>
            <InfoTip
              term="What this means"
              definition={
                rateDefinition ??
                "Your portfolio realized rate is the average revenue your firm generates per hour of work across all active projects. Compare it to your aligned floor for the pricing model you use in Settings → Rate."
              }
              why="If this number is above your aligned rate, your project mix is healthy. If it's below, something in your pricing, scope, or team hours needs attention."
              closingLine="Calculated from active projects with logged time this year."
            />
          </div>
          {isLoading ? (
            <Skeleton className="mt-1 h-4 max-w-[280px]" />
          ) : (
            <p
              className="max-w-[320px]"
              style={{
                fontFamily: "var(--font-voice, 'Cormorant Garamond', Georgia, serif)",
                fontSize: 13,
                fontStyle: "italic",
                color: MUTED,
                lineHeight: 1.65,
              }}
            >
              {data?.comparisonSentence ??
                "Log time on at least 2 active projects to see your portfolio rate."}
            </p>
          )}
        </div>

        <div className="shrink-0 text-right">
          {isLoading ? (
            <div className="flex flex-col items-end gap-1">
              <Skeleton className="h-7 w-[72px]" />
              <Skeleton className="h-3 w-[88px]" />
            </div>
          ) : data?.hasEnoughData && data.realizedRate != null ? (
            <>
              <p
                style={{
                  fontFamily: "var(--font-voice, 'Cormorant Garamond', Georgia, serif)",
                  fontSize: 28,
                  fontWeight: 400,
                  color,
                  lineHeight: 1.1,
                }}
              >
                ${data.realizedRate}/hr
              </p>
              <p
                style={{
                  fontFamily: "Jost, sans-serif",
                  fontSize: 10,
                  fontWeight: 500,
                  color,
                  marginTop: 2,
                }}
              >
                {data.statusLabel}
              </p>
            </>
          ) : (
            <>
              <p
                style={{
                  fontFamily: "Jost, sans-serif",
                  fontSize: 18,
                  color: MUTED_LT,
                }}
              >
                —
              </p>
              <p
                style={{
                  fontFamily: "Jost, sans-serif",
                  fontSize: 10,
                  color: MUTED_LT,
                  marginTop: 2,
                  maxWidth: 120,
                  lineHeight: 1.35,
                }}
              >
                Log time on 2+ projects to see this
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
