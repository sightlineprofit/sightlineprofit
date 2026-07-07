import { useMemo } from "react";
import { ArrowUpRight } from "lucide-react";
import { computeCapacity, fmtHrs, statusMeta } from "@/lib/capacity-math";
import {
  WeeklyPressureChart,
  ProjectTimeline,
  MemberCard,
  buildTeamRows,
  type CapacityExpandedData,
} from "@/components/capacity/CapacityExpanded";
import { Link } from "@tanstack/react-router";

/**
 * Dashboard-level Firm Capacity section. Reuses the same components/data as
 * the Capacity slide-over — no duplicate calc or fetch. Hours-only surface
 * (no dollar figures — those stay in the slide-over).
 */
export function FirmCapacitySection({
  data,
  onOpen,
}: {
  data: CapacityExpandedData;
  onOpen: () => void;
}) {
  const summary = useMemo(() => computeCapacity(data.inputs), [data.inputs]);
  const meta = statusMeta(summary.status);

  if (!data.configSetup) {
    return (
      <section
        className="mt-3 rounded-[6px] bg-white p-6"
        style={{ borderWidth: "0.5px", borderColor: "var(--border)", borderStyle: "solid" }}
      >
        <p className="text-[13px] font-light text-ch/70">
          Set your billable hours target in Rate & Cost Architecture to unlock capacity tracking.
        </p>
        <Link
          to="/settings"
          search={{ panel: "rate" }}
          className="mt-3 inline-block text-[11px] text-gold hover:underline"
        >
          Go to setup →
        </Link>
      </section>
    );
  }

  const target = data.inputs.targetHrsPerWeek;
  const active = data.inputs.projects.filter((p) => (p.status || "").toLowerCase() === "active");
  const withDates = active.filter((p) => p.start_date && p.end_date);
  const rows = buildTeamRows(data);

  return (
    <section
      className="mt-3 rounded-[6px] bg-white p-6"
      style={{ borderWidth: "0.5px", borderColor: "var(--border)", borderStyle: "solid" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-gold">Firm capacity</p>
          <h2
            className="mt-1 text-[24px] font-normal leading-tight"
            style={{ fontFamily: "Cormorant Garamond, serif", color: "#2C2C2C" }}
          >
            Workload ahead
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider"
            style={{ color: meta.color, background: meta.bg }}
          >
            {meta.label}
          </span>
          <button
            type="button"
            onClick={onOpen}
            aria-label="Open full capacity view"
            className="text-ch/40 transition-colors hover:text-gold"
          >
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Summary — hours only, no dollar figures */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <SummaryRow
          label="Committed"
          hrs={summary.committed}
          pct={summary.committedPct}
          color="#B8860B"
        />
        <SummaryRow
          label="Available"
          hrs={summary.available}
          pct={summary.availablePct}
          color="#5C8A6E"
        />
      </div>

      {/* Weekly pressure chart */}
      <div className="mt-6">
        <h3
          className="text-[16px] font-normal"
          style={{ fontFamily: "Cormorant Garamond, serif", color: "#2C2C2C" }}
        >
          Weekly pressure — next 16 weeks
        </h3>
        <p className="mt-1 text-[11px] font-light" style={{ color: "#aaa" }}>
          Hours committed per week against your {target.toFixed(0)}-hr target.
        </p>
        <WeeklyPressureChart weeks={summary.weeks} target={target} />
        <div className="mt-3 flex flex-wrap gap-4 text-[10px]" style={{ color: "#777" }}>
          <Legend color="#5C8A6E" label="Within target" />
          <Legend color="#B8860B" label="Approaching limit" />
          <Legend color="#C4714A" label="Over committed" />
        </div>
      </div>

      {/* Active projects timeline */}
      <div className="mt-6">
        <h3
          className="text-[16px] font-normal"
          style={{ fontFamily: "Cormorant Garamond, serif", color: "#2C2C2C" }}
        >
          Active projects — when they run
        </h3>
        <p className="mt-1 text-[11px] font-light" style={{ color: "#aaa" }}>
          Each bar spans the project's expected timeline.
        </p>
        {withDates.length === 0 ? (
          <p className="mt-3 text-[11px] italic" style={{ color: "#aaa" }}>
            Add start and end dates to active projects to map them here.
          </p>
        ) : (
          <ProjectTimeline projects={withDates} phases={data.inputs.phases} />
        )}
      </div>

      {/* Team breakdown */}
      <div className="mt-6">
        <h3
          className="text-[16px] font-normal"
          style={{ fontFamily: "Cormorant Garamond, serif", color: "#2C2C2C" }}
        >
          Team breakdown
        </h3>
        <p className="mt-1 mb-3 text-[11px] font-light" style={{ color: "#aaa" }}>
          Per-member target vs actual for this week.
        </p>
        {rows.map((r) => (
          <MemberCard
            key={r.key}
            row={r}
            logged={r.tracks ? data.weeklyHoursByUser.get(r.lookupId) ?? 0 : 0}
            lastEntry={(data.lastEntryByUser ?? {})[r.lookupId] ?? null}
            ytd={(data.ytdHoursByUser ?? {})[r.lookupId] ?? { billable: 0, nonBillable: 0 }}
            weeksElapsed={Math.max(1, data.weeksElapsed ?? 1)}
            weeksPerYear={data.inputs.weeksPerYear || 48}
          />
        ))}
      </div>
    </section>
  );
}

function SummaryRow({
  label,
  hrs,
  pct,
  color,
}: {
  label: string;
  hrs: number;
  pct: number;
  color: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.14em] text-ch/50">{label}</span>
        <span
          className="num"
          style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 20, color: "#2C2C2C" }}
        >
          {fmtHrs(hrs)} hrs{" "}
          <span style={{ fontSize: 12, color: "#8A8578" }}>({Math.round(pct)}%)</span>
        </span>
      </div>
      <div
        className="mt-2 h-1 w-full overflow-hidden rounded-sm"
        style={{ background: "rgba(44,44,44,0.08)" }}
      >
        <div style={{ width: `${clamped}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2 w-3" style={{ background: color }} />
      {label}
    </span>
  );
}