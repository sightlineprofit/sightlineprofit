import { useMemo } from "react";
import { fmtUsd } from "@/lib/finance";

export type NarrativeInput = {
  weekHours: number;
  targetHrs: number;
  billedRate: number;
  scopeWarningProjectName: string | null;
  utilizationPct: number;
};

// Light deterministic-rotation: pick phrasing variant from a hash of facts + day.
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function NarrativeStrip(input: NarrativeInput) {
  const text = useMemo(() => {
    const { weekHours, targetHrs, billedRate, scopeWarningProjectName, utilizationPct } = input;
    const day = new Date().toISOString().slice(0, 10);
    const factsKey = `${Math.round(weekHours)}|${targetHrs}|${Math.round(billedRate)}|${scopeWarningProjectName ?? ""}|${Math.round(utilizationPct)}|${day}`;
    const variant = hash(factsKey) % 2;

    // Priority: under-target → scope pressure → over-utilized → healthy
    if (targetHrs > 0 && weekHours < targetHrs) {
      const gap = targetHrs - weekHours;
      const dollar = gap * billedRate;
      if (variant === 0) {
        return `This week: ${weekHours.toFixed(1)} billable hrs logged, ${gap.toFixed(1)} hrs short of your ${targetHrs} hr target. At ${fmtUsd(billedRate)} that's ${fmtUsd(dollar)} below your weekly revenue target.`;
      }
      return `You're ${gap.toFixed(1)} hrs under your ${targetHrs} hr weekly target — ${fmtUsd(dollar)} of weekly revenue still on the table at ${fmtUsd(billedRate)}/hr.`;
    }
    if (scopeWarningProjectName) {
      if (variant === 0) {
        return `${scopeWarningProjectName} is showing scope pressure. Every hour over scope on a fixed-fee project reduces your effective rate.`;
      }
      return `Scope pressure on ${scopeWarningProjectName} — hours past budget come out of margin, not revenue.`;
    }
    if (utilizationPct > 85) {
      if (variant === 0) {
        return `You're at ${Math.round(utilizationPct)}% utilization — above the threshold where capacity starts affecting quality. Watch your pipeline before committing to new work.`;
      }
      return `Utilization is running at ${Math.round(utilizationPct)}%. Past 85% is where capacity starts costing quality — pace the pipeline.`;
    }
    if (variant === 0) {
      return `Your rate is above your floor, your projects are within scope, and your capacity has room. This is what a healthy week looks like.`;
    }
    return `Rate above floor, projects on scope, capacity intact. A healthy week — keep the rhythm.`;
  }, [input]);

  return (
    <div
      style={{
        fontFamily: "'Jost', sans-serif",
        fontSize: 12,
        fontWeight: 400,
        color: "#555",
        lineHeight: 1.8,
        maxWidth: 600,
        background: "var(--cream)",
        borderRadius: 4,
        padding: "14px 16px",
        marginBottom: 16,
      }}
    >
      {text}
    </div>
  );
}