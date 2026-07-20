import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { getUtilizationReality, fmtUsd } from "@/lib/finance";

const GOLD = "#B8860B";
const CHARCOAL = "#2C2C2C";
const MUTED = "#6B6259";
const DISMISS_DAYS = 30;
const VARIANCE_THRESHOLD_PCT = 15;

function dismissKey(firmId: string) {
  return `utilization-check-dismissed-${firmId}`;
}

function isDismissed(firmId: string): boolean {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(dismissKey(firmId));
  if (!raw) return false;
  const expiresAt = Number(raw);
  if (!Number.isFinite(expiresAt)) {
    window.localStorage.removeItem(dismissKey(firmId));
    return false;
  }
  if (Date.now() > expiresAt) {
    window.localStorage.removeItem(dismissKey(firmId));
    return false;
  }
  return true;
}

function setDismissed(firmId: string) {
  const expiresAt = Date.now() + DISMISS_DAYS * 86400000;
  window.localStorage.setItem(dismissKey(firmId), String(expiresAt));
}

function fmtHrs(n: number): string {
  if (n === Math.floor(n)) return String(n);
  return n.toFixed(1);
}

export function UtilizationRealityCheck({ firmId }: { firmId: string }) {
  const fetchCheck = useServerFn(getUtilizationReality);
  const [dismissed, setDismissedState] = useState(() => isDismissed(firmId));
  const [expanded, setExpanded] = useState(false);

  const { data } = useQuery({
    queryKey: ["utilization-reality", firmId],
    queryFn: () => fetchCheck({ data: { firmId } }),
    enabled: !!firmId && !dismissed,
    staleTime: 5 * 60 * 1000,
  });

  const shouldShow = useMemo(() => {
    if (!data || dismissed) return false;
    if (!data.has_sufficient_data) return false;
    return data.variance_pct >= VARIANCE_THRESHOLD_PCT;
  }, [data, dismissed]);

  if (!shouldShow || !data) return null;

  const weeksPerYear =
    data.actual_weekly_avg > 0 ? data.actual_annual_hrs / data.actual_weekly_avg : 48;
  const targetAnnualHrs = data.target_weekly_hrs * weeksPerYear;

  return (
    <div
      style={{
        background: "rgba(184,134,11,0.07)",
        borderLeft: `3px solid ${GOLD}`,
        borderRadius: "0 8px 8px 0",
        padding: "16px 18px",
        marginTop: 12,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          style={{
            fontFamily: "Jost, sans-serif",
            fontSize: 9,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            color: GOLD,
          }}
        >
          Utilization reality check
        </div>
        <button
          type="button"
          aria-label="Dismiss utilization check"
          onClick={() => {
            setDismissed(firmId);
            setDismissedState(true);
          }}
          className="rounded p-0.5 text-ch/40 hover:text-ch/70"
        >
          <X size={14} />
        </button>
      </div>

      <h3
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 20,
          fontWeight: 300,
          color: CHARCOAL,
          marginTop: 8,
          marginBottom: 6,
        }}
      >
        Your actual billing rate differs from your target
      </h3>

      <p
        style={{
          fontFamily: "Jost, sans-serif",
          fontSize: 13,
          color: MUTED,
          lineHeight: 1.7,
        }}
      >
        You set a target of {fmtHrs(data.target_weekly_hrs)} billable hours per week. Your actual
        average over the last {data.weeks_of_data} weeks is {fmtHrs(data.actual_weekly_avg)} hours.
      </p>

      <p
        style={{
          fontFamily: "Jost, sans-serif",
          fontSize: 13,
          color: CHARCOAL,
          fontWeight: 500,
          lineHeight: 1.7,
          marginTop: 6,
        }}
      >
        Based on actual utilization, your aligned rate should be{" "}
        {fmtUsd(data.aligned_rate_at_actual, { decimals: 0 })}/hr —{" "}
        {fmtUsd(Math.abs(data.rate_difference), { decimals: 0 })}{" "}
        {data.rate_difference >= 0 ? "higher" : "lower"} than your current calculation.
      </p>

      <div className="flex flex-row flex-wrap gap-[10px]" style={{ marginTop: 14 }}>
        <Link
          to="/settings"
          search={{ panel: "rate" }}
          style={{
            padding: "9px 18px",
            background: CHARCOAL,
            color: "#FAF7F2",
            borderRadius: 6,
            fontFamily: "Jost, sans-serif",
            fontSize: 12,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          Update my target hours →
        </Link>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            padding: "9px 18px",
            background: "transparent",
            border: "0.5px solid rgba(44,44,44,0.18)",
            borderRadius: 6,
            fontFamily: "Jost, sans-serif",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          See the calculation →
        </button>
      </div>

      {expanded && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px solid rgba(44,44,44,0.10)",
            fontFamily: "Jost, sans-serif",
            fontSize: 12,
            color: MUTED,
            lineHeight: 1.8,
          }}
        >
          <div>Target hrs/yr: {Math.round(targetAnnualHrs).toLocaleString()}</div>
          <div>Actual hrs/yr (projected): {Math.round(data.actual_annual_hrs).toLocaleString()}</div>
          <div>Aligned rate at target: {fmtUsd(data.aligned_rate_at_target, { decimals: 0 })}/hr</div>
          <div>Aligned rate at actual: {fmtUsd(data.aligned_rate_at_actual, { decimals: 0 })}/hr</div>
          <div>
            Difference: {data.rate_difference >= 0 ? "+" : ""}
            {fmtUsd(data.rate_difference, { decimals: 0 })}/hr
          </div>
          <p style={{ marginTop: 8, color: CHARCOAL }}>
            Every project margin calculated over the last {data.weeks_of_data} weeks used{" "}
            {fmtUsd(data.aligned_rate_at_target, { decimals: 0 })}/hr as the cost floor. The accurate
            floor is {fmtUsd(data.aligned_rate_at_actual, { decimals: 0 })}/hr.
          </p>
        </div>
      )}
    </div>
  );
}
