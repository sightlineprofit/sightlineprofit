import { useMemo } from "react";
import { ArrowUpRight } from "lucide-react";
import { computeCapacity, statusMeta, fmtHrs, type CapacityInputs } from "@/lib/capacity-math";
import { cn } from "@/lib/utils";

export type CapacityTileData = {
  inputs: CapacityInputs;
  weekHours: number;
  team: Array<{ id: string; name: string; expected_hrs_per_week: number | null }>;
  weeklyHoursByUser: Map<string, number>;
  configSetup: boolean;
};

export function CapacityTile({
  data,
  onOpen,
}: {
  data: CapacityTileData;
  onOpen: () => void;
}) {
  const summary = useMemo(() => computeCapacity(data.inputs), [data.inputs]);
  const meta = statusMeta(summary.status);

  if (!data.configSetup) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="group relative flex h-full flex-col rounded-2xl border border-border bg-white p-6 text-left transition-all hover:border-gold/40"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-gold">Capacity</p>
            <h3 className="mt-1 font-display text-xl tracking-tight text-ch">Firm capacity</h3>
          </div>
          <ArrowUpRight className="h-4 w-4 text-ch/30 group-hover:text-gold" />
        </div>
        <p className="text-sm text-ch/60">
          Set your billable hours target in Rate & Cost Architecture to unlock capacity tracking.
        </p>
      </button>
    );
  }

  const committedPct = Math.max(0, Math.min(100, summary.committedPct));
  const pipelinePct = summary.annualTarget > 0
    ? Math.max(0, Math.min(100 - committedPct, (summary.pipelineWeighted / summary.annualTarget) * 100))
    : 0;

  // Active flags
  const overMembers = data.team
    .filter((m) => (m.expected_hrs_per_week ?? 0) > 0)
    .filter((m) => (data.weeklyHoursByUser.get(m.id) ?? 0) > (m.expected_hrs_per_week ?? 0));

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex h-full flex-col rounded-2xl border border-border bg-white p-6 text-left transition-all hover:border-gold/40 hover:shadow-[0_8px_30px_-12px_rgba(184,134,11,0.18)]"
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className="rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider"
          style={{ color: meta.color, background: meta.bg }}
        >
          {meta.label}
        </span>
        <ArrowUpRight className="h-4 w-4 text-ch/30 group-hover:text-gold group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
      </div>
      <div className="mt-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-gold">Capacity</p>
        <h3 className="mt-1 font-display text-xl tracking-tight text-ch">Firm capacity</h3>
      </div>

      {/* Mini annual bar */}
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-cream">
        <div className="flex h-full">
          <div style={{ width: `${committedPct}%`, background: "#B8860B" }} />
          <div style={{ width: `${pipelinePct}%`, background: "rgba(184,134,11,0.4)" }} />
        </div>
      </div>

      {/* Three numbers */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <div className="uppercase tracking-wider text-ch/50">Committed</div>
          <div className="num text-ch">
            {fmtHrs(summary.committed)} hrs <span className="text-ch/40">({Math.round(summary.committedPct)}%)</span>
          </div>
        </div>
        <div>
          <div className="uppercase tracking-wider text-ch/50">Available</div>
          <div className="num text-ch">
            {fmtHrs(summary.available)} hrs <span className="text-ch/40">({Math.round(summary.availablePct)}%)</span>
          </div>
        </div>
        <div>
          <div className="uppercase tracking-wider text-ch/50">Logged this wk</div>
          <div className="num text-ch">{fmtHrs(data.weekHours)} hrs</div>
        </div>
      </div>

      {overMembers.length > 0 && (
        <div className={cn("mt-3 text-[11px]")} style={{ color: "#C4714A" }}>
          ● {overMembers[0].name || "Team member"} is over capacity this week
        </div>
      )}
    </button>
  );
}

export { computeCapacity, statusMeta };