import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  addWeeks,
  computeCapacity,
  fmtHrs,
  startOfISOWeek,
  statusMeta,
  type CapacityInputs,
  type CapacitySummary,
  type CapacityWindow,
  type PhaseRow,
  type ProjRow,
} from "@/lib/capacity-math";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtUsd } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { useMe, effectiveRole } from "@/lib/role";
import { InfoTip } from "@/components/dashboard/InfoTip";
import { ProspectFormSheet } from "@/components/capacity/ProspectForm";

export type CapacityExpandedData = {
  inputs: CapacityInputs;
  weekHours: number;
  bdWeekHours: number;
  team: Array<{
    id: string;
    profile_id?: string | null;
    name: string | null;
    email: string | null;
    role_type?: string;
    is_platform_user?: boolean;
    expected_hrs_per_week: number | null;
    burdened_hourly_rate?: number | null;
  }>;
  weeklyHoursByUser: Map<string, number>;
  /** Weekly hours split by billable state (optional; falls back to weeklyHoursByUser as billable-only when absent). */
  weeklyBillableByUser?: Map<string, number>;
  weeklyNonBillableByUser?: Map<string, number>;
  sopTemplates: Array<{ id: string; name: string; total_hrs: number }>;
  configSetup: boolean;
  annualRevenue: number;
  alignedAnnualRevenue: number;
  ytdHoursByUser?: Record<string, { billable: number; nonBillable: number }>;
  lastEntryByUser?: Record<string, string>;
  weeksElapsed?: number;
  principal?: { id: string; name: string; target: number; totalWeekly?: number };
  /**
   * Firm default total working hours per week — used as the per-member
   * baseline for non-billable capacity when a member has no explicit total.
   * Non-billable weekly = max(0, totalWeekly - billableTarget).
   */
  defaultWorkingHrsPerWeek?: number;
};


const TAB_KEY = "sightline:capacity-tab";

export function CapacityExpanded({ data }: { data: CapacityExpandedData }) {
  const summary = useMemo(() => computeCapacity(data.inputs), [data.inputs]);
  const meta = statusMeta(summary.status);
  const { data: meData } = useMe();
  const role = effectiveRole(meData?.profile);
  const canSeeTeam = role === "principal" || role === "admin";

  const defaultTab = summary.status === "comfortable" ? "overview" : "timeline";
  const [tab, setTab] = useState<string>(() => {
    if (typeof window === "undefined") return defaultTab;
    return window.sessionStorage.getItem(TAB_KEY) || defaultTab;
  });
  useEffect(() => {
    if (typeof window !== "undefined") window.sessionStorage.setItem(TAB_KEY, tab);
  }, [tab]);

  if (!data.configSetup) {
    return (
      <div className="rounded-xl border border-border bg-white p-8 text-center">
        <p className="text-sm text-ch/70">
          Set your billable hours target in Rate & Cost Architecture to unlock capacity tracking.
        </p>
        <Link
          to="/settings?panel=rate"
          className="mt-4 inline-block rounded-md bg-gold px-4 py-2 text-sm text-white"
        >
          Go to setup →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span
          className="rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider"
          style={{ color: meta.color, background: meta.bg }}
        >
          {meta.label}
        </span>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          {canSeeTeam && <TabsTrigger value="team">Team</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab data={data} summary={summary} />
        </TabsContent>
        <TabsContent value="timeline">
          <TimelineTab data={data} summary={summary} />
        </TabsContent>
        {canSeeTeam && (
          <TabsContent value="team">
            <TeamTab data={data} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

/* ───────── Overview ───────── */
function OverviewTab({ data, summary }: { data: CapacityExpandedData; summary: CapacitySummary }) {
  const target = data.inputs.targetHrsPerWeek;
  const annualTarget = summary.annualTarget;
  const rate = data.inputs.ratePerHr;

  const segs = (() => {
    if (annualTarget <= 0) return [];
    const total = annualTarget;
    return [
      { label: "Committed", hrs: summary.committed, pct: (summary.committed / total) * 100, color: "#B8860B" },
      { label: "Non-billable est.", hrs: summary.nonBillableEst, pct: (summary.nonBillableEst / total) * 100, color: "rgba(196,113,74,0.25)" },
      { label: "Available", hrs: summary.available, pct: (summary.available / total) * 100, color: "#FAF7F2" },
    ];
  })();

  return (
    <div className="space-y-5 pt-2">
      <div className="rounded-xl border border-border bg-white p-5">
        <h3 className="font-display text-lg text-ch">Planned capacity</h3>
        <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Target hrs / week" value={target.toFixed(1)} />
          <Stat label="Target hrs / year" value={annualTarget.toFixed(0)} />
          <Stat label="Logged this week" value={data.weekHours.toFixed(1)} />
          <Stat label="BD time this week" value={data.bdWeekHours.toFixed(1)} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-white p-5">
        <h3 className="font-display text-lg text-ch">Annual capacity</h3>
        <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full border border-border">
          {segs.map((s) => (
            <div key={s.label} style={{ width: `${Math.max(0, s.pct)}%`, background: s.color }} />
          ))}
        </div>
        <ul className="mt-4 space-y-1.5 text-xs text-ch/70">
          <li className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: "#B8860B" }} />
            <span>
              Committed:{" "}
              <span className="num text-ch">
                {fmtHrs(summary.committed)} hrs · {Math.round(summary.committedPct)}%
                {summary.committedDollarMode === "all-fixed" &&
                  ` · ${fmtUsd(summary.committedDollars)} in fees`}
                {summary.committedDollarMode === "all-estimated" &&
                  ` · ~${fmtUsd(summary.committedDollars)} potential`}
                {summary.committedDollarMode === "mixed" &&
                  ` · ~${fmtUsd(summary.committedDollars)} potential`}
              </span>
            </span>
            {summary.committedDollarMode !== "none" && (
              <InfoTip
                term="Committed value"
                definition="For fixed-fee projects this shows the agreed project fee. For hourly projects this estimates from quoted hours × your project rate."
              />
            )}
          </li>
          <li>
            <span className="inline-block h-2 w-2 mr-2 rounded-sm" style={{ background: "rgba(196,113,74,0.25)" }} />
            Non-billable est.: <span className="num text-ch">{fmtHrs(summary.nonBillableEst)} hrs · based on avg of last 4 weeks</span>
          </li>
          <li className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm border border-border bg-cream" />
            <span>
              Available:{" "}
              <span className="num text-ch">
                {fmtHrs(summary.available)} hrs · {Math.round(summary.availablePct)}% · ~
                {fmtUsd(summary.available * rate)} at your billed rate
              </span>
            </span>
            <InfoTip
              term="Available value"
              definition="Estimated revenue potential if all open capacity is filled at your current billed rate. Actual will depend on project type and rates."
            />
          </li>
        </ul>
      </div>

      <ProspectsSection prospects={data.inputs.pipeline} sopTemplates={data.sopTemplates} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KeyStat label="Open capacity" value={`${fmtHrs(summary.available)} hrs`} large gold />
        <KeyStat label="Committed" value={`${fmtHrs(summary.committed)} hrs`} />
        <KeyStat label="Prospects" value={`${fmtHrs(summary.prospectTotalHrs)} hrs`} />
        <KeyStat label="At your rate" value={fmtUsd(summary.available * rate)} />
      </div>

      <div className="rounded-xl border border-border bg-white p-5">
        <h3 className="font-display text-lg text-ch">Revenue picture</h3>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <Stat label="Annual revenue at billed rate" value={fmtUsd(data.annualRevenue)} />
          <Stat label="Annual revenue at aligned rate" value={fmtUsd(data.alignedAnnualRevenue)} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ch/50">{label}</div>
      <div className="num font-display text-2xl text-ch">{value}</div>
    </div>
  );
}
function KeyStat({ label, value, large, gold }: { label: string; value: string; large?: boolean; gold?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <div className="text-[10px] uppercase tracking-wider text-ch/50">{label}</div>
      <div
        className={cn("num font-display", large ? "text-3xl" : "text-2xl")}
        style={{ color: gold ? "#B8860B" : "#2C2C2C" }}
      >
        {value}
      </div>
    </div>
  );
}

/* ───────── Timeline ───────── */
function TimelineTab({ data, summary }: { data: CapacityExpandedData; summary: CapacitySummary }) {
  const target = data.inputs.targetHrsPerWeek;
  const active = data.inputs.projects.filter((p) => (p.status || "").toLowerCase() === "active");
  const withDates = active.filter((p) => p.start_date && p.end_date);
  const withoutDates = active.filter((p) => !p.start_date || !p.end_date);
  const projectsMissingPhases = active.filter(
    (p) => p.start_date && p.end_date && !data.inputs.phases.some((ph) => ph.project_id === p.id),
  ).length;

  const meta = statusMeta(summary.status);

  return (
    <div className="space-y-8 pt-4" style={{ fontFamily: "Jost, sans-serif" }}>
      {/* Section A: Framing */}
      <header>
        <div className="text-[9px] font-semibold uppercase" style={{ letterSpacing: "0.2em", color: "#B8860B" }}>
          Firm capacity
        </div>
        <h2 className="mt-2 text-[34px] font-normal leading-tight" style={{ fontFamily: "Cormorant Garamond, serif", color: "#2C2C2C" }}>
          Work <span className="italic" style={{ color: "#B8860B" }}>arriving</span> over time
        </h2>
        <p className="mt-2 text-[12px] font-light" style={{ color: "#aaa" }}>
          Not how full the bucket is — how close the pressure is, and when you have room
        </p>
        <div className="mt-3 flex items-center gap-2 text-[11px] font-light" style={{ color: "#777" }}>
          <span
            className="rounded-full px-2 py-0.5 text-[10px]"
            style={{ color: meta.color, background: meta.bg }}
          >
            {meta.label}
          </span>
          <span>
            {fmtHrs(summary.committed)} hrs committed · {fmtHrs(summary.available)} hrs open · {fmtHrs(summary.nonBillableEst)} hrs estimated non-billable
          </span>
        </div>
      </header>

      {/* Section B: Weekly pressure chart */}
      <section>
        <h3 className="text-[20px] font-normal" style={{ fontFamily: "Cormorant Garamond, serif", color: "#2C2C2C" }}>
          Weekly pressure — next 16 weeks
        </h3>
        <p className="mt-1 text-[11px] font-light" style={{ color: "#aaa" }}>
          Hours committed per week against your {target.toFixed(0)}-hr target. The shape of your workload ahead.
        </p>
        <WeeklyPressureChart weeks={summary.weeks} target={target} />
        <div className="mt-3 flex flex-wrap gap-4 text-[10px]" style={{ color: "#777" }}>
          <LegendSwatch color="#5C8A6E" label="Within target" />
          <LegendSwatch color="#B8860B" label="Approaching limit" />
          <LegendSwatch color="#C4714A" label="Over committed" />
        </div>
        {target === 0 && (
          <p className="mt-3 text-[11px] italic" style={{ color: "#aaa" }}>
            Bars will fill as you log time and add active projects with timelines.
          </p>
        )}
        {target > 0 && active.length === 0 && (
          <p className="mt-3 text-[11px] italic" style={{ color: "#aaa" }}>
            Add active projects to see your forward workload projected.
          </p>
        )}
        {projectsMissingPhases > 0 && (
          <p className="mt-3 text-[11px]" style={{ color: "#777" }}>
            <Link to="/projects" className="underline" style={{ color: "#B8860B" }}>
              Add phases to {projectsMissingPhases} project{projectsMissingPhases === 1 ? "" : "s"}
            </Link>{" "}
            for a more accurate weekly load estimate.
          </p>
        )}
      </section>

      {/* Section C: Project timeline */}
      <section>
        <h3 className="text-[20px] font-normal" style={{ fontFamily: "Cormorant Garamond, serif", color: "#2C2C2C" }}>
          Active projects — when they run
        </h3>
        <p className="mt-1 text-[11px] font-light" style={{ color: "#aaa" }}>
          Each bar spans the project's expected timeline. Width reflects duration, not hours.
        </p>
        {withDates.length === 0 ? (
          <div className="mt-4 rounded border border-border p-6 text-center">
            <p className="text-[12px]" style={{ color: "#777" }}>
              No active projects with timelines. Create a project with start and end dates to map your workload ahead.
            </p>
            <Link to="/projects" className="mt-3 inline-block text-[11px] underline" style={{ color: "#B8860B" }}>
              Add a project →
            </Link>
          </div>
        ) : (
          <ProjectTimeline projects={withDates} phases={data.inputs.phases} />
        )}
        {withoutDates.length > 0 && (
          <ul className="mt-3 space-y-1 text-[11px]" style={{ color: "#777" }}>
            {withoutDates.map((p) => (
              <li key={p.id}>
                {p.name} —{" "}
                <Link
                  to="/projects/$id"
                  params={{ id: p.id }}
                  className="underline"
                  style={{ color: "#B8860B" }}
                >
                  add dates to include on timeline →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Section D: Open windows */}
      <OpenWindowsSection windows={summary.windows} hasForwardData={withDates.length > 0} />

      {/* Section E: What-if */}
      <WhatIfTool windows={summary.windows} sopTemplates={data.sopTemplates} target={target} availableAnnual={summary.available} />
    </div>
  );
}

function LegendSwatch({ color, label, outline }: { color: string; label: string; outline?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-2 w-3"
        style={{
          background: outline ? "transparent" : color,
          border: outline ? `1px solid ${color}` : "none",
        }}
      />
      {label}
    </span>
  );
}

function ProspectsSection({
  prospects,
  sopTemplates,
}: {
  prospects: CapacityInputs["pipeline"];
  sopTemplates: CapacityExpandedData["sopTemplates"];
}) {
  const total = prospects.reduce((s, p) => s + Number(p.estimated_hrs || 0), 0);
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <div className="flex items-center justify-between">
        <h3
          className="text-[16px] font-normal"
          style={{ fontFamily: "Cormorant Garamond, serif", color: "#2C2C2C" }}
        >
          Prospects in your pipeline
        </h3>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[12px] font-medium hover:underline"
          style={{ color: "#B8860B" }}
        >
          + Add a prospect
        </button>
      </div>
      <ProspectFormSheet open={open} onOpenChange={setOpen} sopTemplates={sopTemplates} />
      {prospects.length === 0 ? (
        <p className="mt-2 text-[12px] font-light" style={{ color: "#aaa" }}>
          No prospects added yet.
        </p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-border">
            {prospects.map((p) => {
              const start = p.estimated_start
                ? new Date(p.estimated_start + "T00:00:00").toLocaleDateString("en-US", { month: "long" })
                : null;
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-[12px]">
                  <div className="min-w-0">
                    <div className="truncate text-ch">{p.name || "Unnamed prospect"}</div>
                    <div className="text-[11px] text-ch/50">
                      {p.estimated_hrs ? `${fmtHrs(Number(p.estimated_hrs))} hrs est.` : "Hours not set"}
                      {start ? ` · Starting ${start}` : ""}
                    </div>
                  </div>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                    style={{ color: "#B8860B", background: "#F5EDD6" }}
                  >
                    Prospect
                  </span>
                </li>
              );
            })}
          </ul>
          <p
            className="mt-3 text-[11px] font-light"
            style={{ color: "#777" }}
            title="This shows the full estimated hours for all prospects — not adjusted for probability. Use this as a planning ceiling: if everything converts, this is what your load would look like."
          >
            If all {prospects.length} prospect{prospects.length === 1 ? "" : "s"} convert, they would add{" "}
            <span className="num text-ch">{fmtHrs(total)} hrs</span> to your committed load.{" "}
            <span className="text-ch/40">ⓘ</span>
          </p>
        </>
      )}
    </div>
  );
}

export function WeeklyPressureChart({ weeks, target }: { weeks: CapacitySummary["weeks"]; target: number }) {
  const maxH = Math.max(target * 1.6, 1);
  return (
    <div className="mt-3">
      <div
        className="relative w-full"
        style={{ height: 88, background: "#F0EBE1", borderRadius: 3, overflow: "hidden" }}
      >
        {/* target line */}
        {target > 0 && (
          <div
            className="absolute left-0 right-0"
            style={{
              bottom: `${(target / maxH) * 88}px`,
              borderTop: "1px dashed rgba(44,44,44,0.2)",
            }}
          />
        )}
        <div className="flex items-end gap-[2px] px-[6px] pb-[6px] h-full">
          {weeks.map((w, i) => {
            const cHeight = (Math.min(w.committed, maxH) / maxH) * 82;
            const color =
              target > 0 && w.committed >= target
                ? "#C4714A"
                : target > 0 && w.committed >= target * 0.8
                  ? "#B8860B"
                  : "#5C8A6E";
            return (
              <div key={i} className="flex flex-1 flex-col justify-end">
                <div style={{ height: cHeight, background: color }} />
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-1 flex gap-[2px] px-[6px]">
        {weeks.map((_, i) => (
          <div key={i} className="flex-1 text-center" style={{ fontSize: 8, color: "#ccc" }}>
            W{i + 1}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProjectTimeline({ projects, phases }: { projects: ProjRow[]; phases: PhaseRow[] }) {
  const now = new Date();
  const windowStart = startOfISOWeek(now);
  const windowEnd = addWeeks(windowStart, 26); // 6 months
  const span = windowEnd.getTime() - windowStart.getTime();

  const palette = ["#B8860B", "#5C8A6E", "#C4714A", "#D4A017", "#8b7355", "#4a6741"];

  const months: Date[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push(d);
  }

  const rows = [...projects]
    .filter((p) => p.start_date && p.end_date)
    .sort((a, b) => (a.start_date! < b.start_date! ? -1 : 1));

  return (
    <div className="mt-3">
      {/* Month labels */}
      <div className="grid items-center text-[8px]" style={{ gridTemplateColumns: "160px 1fr 80px", color: "#ccc" }}>
        <div />
        <div className="grid" style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
          {months.map((m, i) => (
            <div key={i}>{m.toLocaleDateString("en-US", { month: "short" })}</div>
          ))}
        </div>
        <div />
      </div>

      <div className="mt-2 space-y-2">
        {rows.map((p, idx) => {
          const ps = new Date(p.start_date + "T00:00:00").getTime();
          const pe = new Date(p.end_date + "T00:00:00").getTime();
          const clampedStart = Math.max(ps, windowStart.getTime());
          const clampedEnd = Math.min(pe, windowEnd.getTime());
          if (clampedEnd < windowStart.getTime() || clampedStart > windowEnd.getTime()) return null;
          const leftPct = ((clampedStart - windowStart.getTime()) / span) * 100;
          const widthPct = Math.max(2, ((clampedEnd - clampedStart) / span) * 100);
          const color = palette[idx % palette.length];
          const hrs = phases
            .filter((ph) => ph.project_id === p.id)
            .reduce((s, ph) => s + Number(ph.expected_hrs || 0), 0) || Number(p.scoped_hrs || 0);
          return (
            <div key={p.id} className="grid items-center" style={{ gridTemplateColumns: "160px 1fr 80px" }}>
              <div className="truncate pr-2 text-[10px]" style={{ color: "#555" }}>
                {p.name}
              </div>
              <div className="relative h-3">
                <div
                  className="absolute top-0"
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    height: 12,
                    borderRadius: 2,
                    background: color,
                    opacity: 0.75,
                  }}
                >
                  {widthPct > 8 && (
                    <span className="block truncate px-1 text-[8px] text-white">{p.name}</span>
                  )}
                </div>
              </div>
              <div className="text-right num text-[13px]" style={{ fontFamily: "Cormorant Garamond, serif", color: "#aaa" }}>
                {fmtHrs(hrs)} hrs
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OpenWindowsSection({ windows, hasForwardData }: { windows: CapacityWindow[]; hasForwardData: boolean }) {
  if (!hasForwardData) {
    return (
      <section>
        <p className="text-[11px]" style={{ color: "#777" }}>
          Add project timelines spanning the next few months to see your open capacity windows calculated here.
        </p>
      </section>
    );
  }
  if (windows.length === 0) {
    return (
      <section>
        <h3 className="text-[20px] font-normal" style={{ fontFamily: "Cormorant Garamond, serif", color: "#2C2C2C" }}>
          Where there is room
        </h3>
        <p className="mt-2 text-[11px]" style={{ color: "#aaa" }}>
          No open windows detected in the next 16 weeks. You're booked.
        </p>
      </section>
    );
  }
  const description = (w: CapacityWindow) =>
    w.classification === "comfortable"
      ? "Room for a mid-size engagement or several smaller ones."
      : w.classification === "tight"
        ? "Limited availability. Small scope only or consider deferring."
        : "At or above capacity during this period. Avoid new commitments.";
  const colorOf = (w: CapacityWindow) =>
    w.classification === "comfortable" ? "#5C8A6E" : w.classification === "tight" ? "#B8860B" : "#C4714A";

  return (
    <section>
      <h3 className="text-[20px] font-normal" style={{ fontFamily: "Cormorant Garamond, serif", color: "#2C2C2C" }}>
        Where there is room
      </h3>
      <p className="mt-1 text-[11px] font-light" style={{ color: "#aaa" }}>
        Windows of meaningful open capacity in the next six months
      </p>
      <div className="mt-3 grid grid-cols-1 gap-[10px] md:grid-cols-3">
        {windows.slice(0, 3).map((w) => (
          <div
            key={w.id}
            className="bg-white p-[14px] transition-colors hover:border-gold"
            style={{ border: "0.5px solid rgba(44,44,44,0.1)", borderRadius: 4 }}
          >
            <div
              className="text-[9px] font-medium uppercase"
              style={{ letterSpacing: "0.1em", color: colorOf(w) }}
            >
              {w.label}
            </div>
            <div className="mt-2 text-[24px] font-normal" style={{ fontFamily: "Cormorant Garamond, serif", color: colorOf(w) }}>
              {w.available} hrs
            </div>
            <p className="mt-2 text-[10px] font-light leading-[1.5]" style={{ color: "#aaa" }}>
              {description(w)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function WhatIfTool({
  windows,
  sopTemplates,
  target,
  availableAnnual,
}: {
  windows: CapacityWindow[];
  sopTemplates: Array<{ id: string; name: string; total_hrs: number }>;
  target: number;
  availableAnnual: number;
}) {
  const [hrs, setHrs] = useState<number>(40);
  const [windowId, setWindowId] = useState<string>("asap");

  const noWindows = windows.length === 0;
  const selected = windows.find((w) => w.id === windowId) ?? windows[0];

  const result = (() => {
    if (noWindows) {
      const pct = availableAnnual > 0 ? (hrs / availableAnnual) * 100 : 0;
      return {
        color: "#5C8A6E",
        text: `A ${hrs}-hr project uses ${Math.round(pct)}% of your ${fmtHrs(availableAnnual)} annual available hours.`,
      };
    }
    const w = windowId === "asap" ? windows[0] : selected;
    if (!w) return null;
    const avail = w.available;
    const pct = avail > 0 ? (hrs / avail) * 100 : 0;
    const remaining = Math.max(0, avail - hrs);
    const next = windows[windows.indexOf(w) + 1];
    if (hrs <= avail && pct < 60) {
      return {
        color: "#5C8A6E",
        text: `Starting ${w.label}, a ${hrs}-hr project fits within your open window of ~${avail} hrs. It uses about ${Math.round(pct)}% of that window. You'd still have ~${remaining} hrs available.`,
      };
    }
    if (hrs <= avail) {
      return {
        color: "#B8860B",
        text: `Starting ${w.label}, a ${hrs}-hr project fills ${Math.round(pct)}% of your ~${avail}-hr window. Workable — but little room for scope changes or delays.`,
      };
    }
    const overage = hrs - avail;
    const nextText = next ? ` Consider a later start ${next.label} which opens ~${next.available} hrs, or split delivery across periods.` : " Consider deferring or splitting delivery across periods.";
    return {
      color: "#C4714A",
      text: `A ${hrs}-hr project exceeds the ~${avail}-hr window ${w.label} by ${overage} hrs.${nextText}`,
    };
  })();

  return (
    <section
      className="bg-white p-5"
      style={{ border: "0.5px solid rgba(44,44,44,0.1)", borderRadius: 4 }}
    >
      <h3 className="text-[18px] font-normal" style={{ fontFamily: "Cormorant Garamond, serif", color: "#2C2C2C" }}>
        If I take on a new project
      </h3>
      <div className="mt-[14px] flex flex-wrap gap-4">
        <div>
          <label className="block text-[11px]" style={{ color: "#777" }}>
            Estimated hours
          </label>
          <input
            type="number"
            value={hrs}
            onChange={(e) => setHrs(Number(e.target.value) || 0)}
            className="mt-1 px-2 py-1 text-[14px]"
            style={{ border: "0.5px solid rgba(44,44,44,0.2)", borderRadius: 3, width: 80, background: "#FAF7F2" }}
          />
        </div>
        {!noWindows && (
          <div>
            <label className="block text-[11px]" style={{ color: "#777" }}>
              When would it start?
            </label>
            <select
              value={windowId}
              onChange={(e) => setWindowId(e.target.value)}
              className="mt-1 px-2 py-1 text-[14px]"
              style={{ border: "0.5px solid rgba(44,44,44,0.2)", borderRadius: 3, background: "#FAF7F2" }}
            >
              <option value="asap">As soon as possible</option>
              {windows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {result && (
        <div
          className="mt-3 p-3"
          style={{
            borderLeft: `2px solid ${result.color}`,
            background: "#FAF7F2",
            borderRadius: 4,
            fontSize: 11,
            lineHeight: 1.8,
            color: "#555",
          }}
        >
          {result.text}
        </div>
      )}

      {sopTemplates.length > 0 && (
        <div className="mt-4">
          <div className="text-[9px] uppercase" style={{ letterSpacing: "0.12em", color: "#aaa", marginBottom: 10 }}>
            Quick reference — tap a project type
          </div>
          <div className="flex flex-wrap gap-[6px]">
            {sopTemplates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setHrs(Math.round(t.total_hrs))}
                className="cursor-pointer transition-colors hover:bg-[#F5EDD6]"
                style={{
                  padding: "4px 10px",
                  border: "0.5px solid rgba(44,44,44,0.1)",
                  borderRadius: 2,
                  background: "#FAF7F2",
                  fontSize: 10,
                  color: "#555",
                }}
              >
                {t.name} · ~{Math.round(t.total_hrs)} hrs
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] italic" style={{ color: "#aaa" }}>
            Hours are SOP benchmarks. Actual scope varies per project.
          </p>
        </div>
      )}
    </section>
  );
}

/* ───────── Team tab ───────── */
export type TeamMemberRow = {
  key: string;
  lookupId: string;
  name: string;
  roleLabel: string;
  isPrincipal: boolean;
  target: number;
  tracks: boolean;
};

export function colorFromName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const palette = ["#B8860B", "#5C8A6E", "#C4714A", "#8A7CB8", "#4A7A9C", "#B85C7C"];
  return palette[h % palette.length];
}

/**
 * Build the ordered member rows used by TeamTab / dashboard capacity section.
 * Principal first (dedup'd if also present in firm_members), team follows.
 */
export function buildTeamRows(data: CapacityExpandedData): TeamMemberRow[] {
  const principal = data.principal;
  const nonPrincipal = data.team.filter(
    (m) => !principal || (m.profile_id ?? m.id) !== principal.id,
  );
  const rows: TeamMemberRow[] = [];
  if (principal) {
    rows.push({
      key: `principal-${principal.id}`,
      lookupId: principal.id,
      name: principal.name,
      roleLabel: "PRINCIPAL",
      isPrincipal: true,
      target: Number(principal.target) || 0,
      tracks: true,
    });
  }
  for (const m of nonPrincipal) {
    rows.push({
      key: m.id,
      lookupId: m.profile_id ?? m.id,
      name: m.name || m.email || "Team member",
      roleLabel: (m.role_type || "TEAM").toUpperCase(),
      isPrincipal: false,
      target: Number(m.expected_hrs_per_week) || 0,
      tracks: m.is_platform_user !== false,
    });
  }
  return rows;
}

function TeamTab({ data }: { data: CapacityExpandedData }) {
  const firmTarget = data.inputs.targetHrsPerWeek;
  const weeksPerYear = data.inputs.weeksPerYear || 48;
  const weeksElapsed = Math.max(1, data.weeksElapsed ?? 1);
  const ytdMap = data.ytdHoursByUser ?? {};
  const lastEntryMap = data.lastEntryByUser ?? {};

  // Build member list — principal first, then non-principals in insertion order.
  // Dedupe principal if they also appear inside firm_members.
  const principal = data.principal;
  const nonPrincipal = data.team.filter(
    (m) => !principal || (m.profile_id ?? m.id) !== principal.id,
  );

  const rows: TeamMemberRow[] = [];
  if (principal) {
    rows.push({
      key: `principal-${principal.id}`,
      lookupId: principal.id,
      name: principal.name,
      roleLabel: "PRINCIPAL",
      isPrincipal: true,
      target: Number(principal.target) || 0,
      tracks: true,
    });
  }
  for (const m of nonPrincipal) {
    rows.push({
      key: m.id,
      lookupId: m.profile_id ?? m.id,
      name: m.name || m.email || "Team member",
      roleLabel: (m.role_type || "TEAM").toUpperCase(),
      isPrincipal: false,
      target: Number(m.expected_hrs_per_week) || 0,
      tracks: m.is_platform_user !== false,
    });
  }

  // Combined firm totals for the summary bar.
  const totalLogged = rows.reduce(
    (s, r) => s + (r.tracks ? data.weeklyHoursByUser.get(r.lookupId) ?? 0 : 0),
    0,
  );
  const totalTarget = rows.reduce((s, r) => s + r.target, 0);
  const summaryPct = totalTarget > 0 ? Math.min(100, (totalLogged / totalTarget) * 100) : 0;

  return (
    <div className="space-y-5 pt-4">
      {rows.map((r) => (
        <MemberCard
          key={r.key}
          row={r}
          logged={data.weeklyHoursByUser.get(r.lookupId) ?? 0}
          loggedBillable={
            data.weeklyBillableByUser?.get(r.lookupId) ??
            data.weeklyHoursByUser.get(r.lookupId) ??
            0
          }
          loggedNonBillable={data.weeklyNonBillableByUser?.get(r.lookupId) ?? 0}
          nonBillableWeeklyBudget={
            data.inputs.avgWeeklyNonBillable > 0
              ? data.inputs.avgWeeklyNonBillable /
                Math.max(1, rows.filter((x) => x.tracks).length)
              : 0
          }
          lastEntry={lastEntryMap[r.lookupId] ?? null}
          ytd={ytdMap[r.lookupId] ?? { billable: 0, nonBillable: 0 }}
          weeksElapsed={weeksElapsed}
          weeksPerYear={weeksPerYear}
        />
      ))}

      {nonPrincipal.length === 0 && (
        <div
          className="rounded-lg bg-white p-4 text-[12px] font-light"
          style={{ border: "0.5px solid var(--border)", color: "#777" }}
        >
          Add team members in{" "}
          <Link to="/settings" className="underline" style={{ color: "#B8860B" }}>
            settings
          </Link>{" "}
          to track their capacity here.
        </div>
      )}

      {/* Firm summary bar */}
      <div
        className="rounded-lg bg-white p-4"
        style={{ border: "0.5px solid var(--border)" }}
      >
        <div
          className="mb-2 text-[9px] uppercase"
          style={{ letterSpacing: "0.14em", color: "#8A8578", fontFamily: "Jost, sans-serif" }}
        >
          Firm this week — combined
        </div>
        <div
          className="h-1 w-full overflow-hidden rounded-sm"
          style={{ background: "var(--border)" }}
        >
          <div className="h-full" style={{ width: `${summaryPct}%`, background: "#5C8A6E" }} />
        </div>
        <div className="mt-2 text-[10px]" style={{ color: "#777", fontFamily: "Jost, sans-serif" }}>
          {totalLogged.toFixed(1)} of {totalTarget.toFixed(0)} hrs logged across {rows.length}{" "}
          {rows.length === 1 ? "person" : "people"} this week
        </div>
      </div>

      {/* Utilization table */}
      <div className="rounded-xl border border-border bg-white p-5">
        <h3 className="font-display text-lg text-ch">Utilization this week</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-ch/50">
              <tr>
                <th className="text-left py-1">Member</th>
                <th className="text-right py-1">Target/wk</th>
                <th className="text-right py-1">Logged</th>
                <th className="text-right py-1">Billable</th>
                <th className="text-right py-1">Non-billable</th>
                <th className="text-right py-1">Utilization</th>
                <th className="text-right py-1">YTD logged</th>
                <th className="text-right py-1">Annual target</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const logged = r.tracks ? data.weeklyHoursByUser.get(r.lookupId) ?? 0 : 0;
                const y = ytdMap[r.lookupId] ?? { billable: 0, nonBillable: 0 };
                const ytdTotal = y.billable + y.nonBillable;
                const annual = r.target * weeksPerYear;
                const util = r.target > 0 ? (logged / r.target) * 100 : 0;
                let border = "transparent";
                if (!r.tracks || logged === 0) border = "rgba(44,44,44,0.15)";
                else if (logged > r.target) border = "#5C8A6E";
                else if (util >= 90) border = "transparent";
                else if (util >= 80) border = "#B8860B";
                else border = "rgba(44,44,44,0.15)";
                return (
                  <tr key={r.key} style={{ borderLeft: `2px solid ${border}` }}>
                    <td className="py-1 pl-2 text-ch">{r.name}</td>
                    <td className="py-1 text-right num">{r.target.toFixed(0)}</td>
                    <td className="py-1 text-right num">{r.tracks ? logged.toFixed(1) : "—"}</td>
                    <td className="py-1 text-right num">{r.tracks ? y.billable.toFixed(0) : "—"}</td>
                    <td className="py-1 text-right num">{r.tracks ? y.nonBillable.toFixed(0) : "—"}</td>
                    <td className="py-1 text-right num">
                      {r.tracks && r.target > 0 ? `${Math.round(util)}%` : "—"}
                    </td>
                    <td className="py-1 text-right num">
                      {r.tracks ? ytdTotal.toFixed(0) : "—"}
                    </td>
                    <td className="py-1 text-right num">{annual.toFixed(0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function MemberCard({
  row,
  logged,
  loggedBillable,
  loggedNonBillable,
  nonBillableWeeklyBudget,
  lastEntry,
  ytd,
  weeksElapsed,
  weeksPerYear,
}: {
  row: TeamMemberRow;
  logged: number;
  /** Billable hours logged this week (defaults to `logged` if omitted). */
  loggedBillable?: number;
  /** Non-billable hours logged this week. */
  loggedNonBillable?: number;
  /** Firm-wide per-member non-billable weekly envelope for the gauge. */
  nonBillableWeeklyBudget?: number;
  lastEntry: string | null;
  ytd: { billable: number; nonBillable: number };
  weeksElapsed: number;
  weeksPerYear: number;
}) {
  const [showAnnual, setShowAnnual] = useState(false);
  const target = row.target;
  const needsSetup = row.isPrincipal && target <= 0;
  const billableLogged = loggedBillable ?? logged;
  const nbLogged = loggedNonBillable ?? 0;
  const nbBudget = nonBillableWeeklyBudget ?? 0;
  const nbPct = nbBudget > 0 ? (nbLogged / nbBudget) * 100 : 0;

  // Freshness pill
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = today.getDay();
  const startWeek = new Date(today);
  startWeek.setDate(today.getDate() - day);
  const todayIso = today.toISOString().slice(0, 10);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yIso = yesterday.toISOString().slice(0, 10);
  const weekStartIso = startWeek.toISOString().slice(0, 10);

  let freshLabel = "No entries yet";
  let freshBg = "rgba(44,44,44,0.07)";
  let freshColor = "#777";
  if (lastEntry) {
    if (lastEntry === todayIso || lastEntry === yIso) {
      freshLabel = "Up to date";
      freshBg = "rgba(92,138,110,0.10)";
      freshColor = "#27500A";
    } else if (lastEntry >= weekStartIso) {
      freshLabel = "Up to date";
      freshBg = "rgba(92,138,110,0.10)";
      freshColor = "#27500A";
    } else {
      freshLabel = "No entry this week";
      freshBg = "rgba(184,134,11,0.10)";
      freshColor = "#854F0B";
    }
  }
  if (!row.tracks) {
    freshLabel = "Not tracked";
  }

  // Value colors — measured against BILLABLE target vs BILLABLE logged.
  const pct = target > 0 ? (billableLogged / target) * 100 : 0;
  let valueColor = "#777";
  if (target > 0 && billableLogged > 0) {
    if (billableLogged >= target) valueColor = "#5C8A6E";
    else if (pct >= 50) valueColor = "#B8860B";
    else valueColor = "#C4714A";
  }

  // Status pill
  let statusLabel = "Not tracked";
  let statusBg = "rgba(44,44,44,0.07)";
  let statusColor = "#777";
  if (row.tracks && target > 0) {
    const halfWeek = day >= 3; // Wed or later
    if (pct >= 80) {
      statusLabel = "On track";
      statusBg = "rgba(92,138,110,0.10)";
      statusColor = "#27500A";
    } else if (pct >= 30) {
      statusLabel = "Behind";
      statusBg = "rgba(184,134,11,0.10)";
      statusColor = "#854F0B";
    } else if (pct < 30 && halfWeek) {
      statusLabel = "Not started";
      statusBg = "rgba(196,113,74,0.12)";
      statusColor = "#C4714A";
    } else {
      statusLabel = "Early in week";
      statusBg = "rgba(44,44,44,0.07)";
      statusColor = "#777";
    }
  }

  // Progress bar
  const barPct = target > 0 ? Math.min(100, pct) : 0;
  let barColor = "#C4714A";
  if (target > 0 && billableLogged >= target) barColor = "#5C8A6E";
  else if (pct >= 80) barColor = "#5C8A6E";
  else if (pct >= 30) barColor = "#B8860B";
  const overHrs = target > 0 && billableLogged > target ? billableLogged - target : 0;

  // Annual projection
  const ytdLogged = ytd.billable + ytd.nonBillable;
  const annualTarget = target * weeksPerYear;
  const projected = weeksElapsed > 0 ? (ytdLogged / weeksElapsed) * weeksPerYear : 0;
  const onPace = projected >= annualTarget;
  const gap = Math.max(0, annualTarget - projected);

  const dotColor = colorFromName(row.name);

  return (
    <div
      className="bg-white"
      style={{
        border: "0.5px solid var(--border)",
        borderRadius: 8,
        padding: "16px 18px",
        marginBottom: 10,
        fontFamily: "Jost, sans-serif",
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: dotColor }}
          />
          <div>
            <div
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: 16,
                color: "#2C2C2C",
                lineHeight: 1.1,
              }}
            >
              {row.name}
            </div>
            <div
              className="mt-0.5"
              style={{
                fontSize: 9,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#8A8578",
              }}
            >
              {row.roleLabel}
            </div>
          </div>
        </div>
        <span
          className="rounded-full px-2 py-0.5"
          style={{
            fontSize: 9,
            letterSpacing: "0.06em",
            background: freshBg,
            color: freshColor,
          }}
        >
          {freshLabel}
        </span>
      </div>

      {needsSetup ? (
        <div className="mt-4 text-[11px]" style={{ color: "#777" }}>
          Set your billable hours target in{" "}
          <Link to="/settings?panel=rate" className="underline" style={{ color: "#B8860B" }}>
            settings
          </Link>{" "}
          to track your capacity.
        </div>
      ) : (
        <>
          {/* Three-column stats */}
          <div
            className="mt-4 grid grid-cols-3"
            style={{ borderRadius: 4 }}
          >
            <StatCol
              label="BILLABLE TARGET"
              value={target > 0 ? `${target.toFixed(0)} hrs/wk` : "—"}
              sub={target > 0 ? `${(target * weeksPerYear).toFixed(0)} hrs/yr` : ""}
            />
            <div
              className="px-4"
              style={{ borderLeft: "0.5px solid var(--border)", borderRight: "0.5px solid var(--border)" }}
            >
              <StatCol
                label="BILLABLE THIS WEEK"
                value={row.tracks ? `${billableLogged.toFixed(1)} hrs logged` : "—"}
                valueColor={valueColor}
                sub={
                  !row.tracks
                    ? ""
                    : billableLogged === 0
                      ? "Nothing logged yet this week"
                      : billableLogged >= target
                        ? "Target reached"
                        : `${(target - billableLogged).toFixed(1)} hrs to target`
                }
                subColor={valueColor}
                inline
              />
            </div>
            <div className="pl-4">
              <div
                style={{
                  fontSize: 8,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "#8A8578",
                }}
              >
                STATUS
              </div>
              <div className="mt-2">
                <span
                  className="rounded-full px-2.5 py-1"
                  style={{
                    fontSize: 10,
                    background: statusBg,
                    color: statusColor,
                    fontWeight: 500,
                  }}
                >
                  {statusLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Non-billable gauge — capacity already priced into the rate. */}
          {row.tracks && (
            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <div>
                  <div
                    style={{
                      fontSize: 8,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "#8A8578",
                    }}
                  >
                    NON-BILLABLE THIS WEEK
                  </div>
                  <div style={{ fontSize: 10, color: "#8A8578" }}>
                    Ideation, admin, learning — already in your rate.
                  </div>
                </div>
                <div
                  className="num text-right"
                  style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 16, color: "#2C2C2C" }}
                >
                  {nbLogged.toFixed(1)}
                  {nbBudget > 0 && (
                    <span style={{ fontSize: 11, color: "#8A8578" }}>
                      {" "}
                      / {nbBudget.toFixed(1)} hrs
                    </span>
                  )}
                </div>
              </div>
              <div
                className="mt-1 w-full overflow-hidden"
                style={{ height: 3, background: "var(--border)", borderRadius: 2 }}
              >
                <div
                  style={{
                    width: `${Math.max(0, Math.min(100, nbPct))}%`,
                    height: "100%",
                    background: nbPct > 110 ? "#C4714A" : "#8A7CB8",
                    borderRadius: 2,
                  }}
                />
              </div>
            </div>
          )}

          {/* Progress bar */}
          <div className="mt-4">
            <div
              className="w-full overflow-hidden"
              style={{ height: 4, background: "var(--border)", borderRadius: 2 }}
            >
              <div
                className="h-full"
                style={{
                  width: `${barPct}%`,
                  background: barColor,
                  borderRadius: 2,
                }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span style={{ fontSize: 8, color: "#8A8578" }}>0 hrs</span>
              <div className="flex items-center gap-2">
                {overHrs > 0 && (
                  <span style={{ fontSize: 9, color: "#5C8A6E" }}>
                    +{overHrs.toFixed(1)} hrs over
                  </span>
                )}
                <span style={{ fontSize: 8, color: "#8A8578" }}>
                  {target > 0 ? `${target.toFixed(0)} hrs target` : "no target set"}
                </span>
              </div>
            </div>
          </div>

          {/* Annual snapshot toggle */}
          <button
            type="button"
            onClick={() => setShowAnnual((v) => !v)}
            className="mt-3 cursor-pointer"
            style={{ fontSize: 9, color: "#B8860B", background: "transparent" }}
          >
            {showAnnual ? "Hide annual picture ›" : "See annual picture ›"}
          </button>
          {showAnnual && (
            <div
              className="mt-3 pt-3"
              style={{ borderTop: "0.5px dashed var(--border)" }}
            >
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div
                    style={{
                      fontSize: 8,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "#8A8578",
                    }}
                  >
                    YTD LOGGED
                  </div>
                  <div
                    style={{
                      fontFamily: "Cormorant Garamond, serif",
                      fontSize: 18,
                      color: "#2C2C2C",
                    }}
                  >
                    {ytdLogged.toFixed(0)}{" "}
                    <span style={{ fontSize: 11, color: "#8A8578" }}>hrs logged this year</span>
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 8,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "#8A8578",
                    }}
                  >
                    ANNUAL TARGET
                  </div>
                  <div
                    style={{
                      fontFamily: "Cormorant Garamond, serif",
                      fontSize: 18,
                      color: "#2C2C2C",
                    }}
                  >
                    {annualTarget.toFixed(0)}{" "}
                    <span style={{ fontSize: 11, color: "#8A8578" }}>hrs target this year</span>
                  </div>
                </div>
              </div>
              <div
                className="mt-2"
                style={{
                  fontSize: 10,
                  fontWeight: 300,
                  color: onPace ? "#5C8A6E" : "#B8860B",
                }}
              >
                {onPace
                  ? `On pace for ${projected.toFixed(0)} hrs this year.`
                  : `At current pace: ${projected.toFixed(0)} hrs by year end. ${gap.toFixed(0)} hrs short of target.`}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCol({
  label,
  value,
  sub,
  valueColor,
  subColor,
  inline,
}: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
  subColor?: string;
  inline?: boolean;
}) {
  return (
    <div className={inline ? "text-center" : ""}>
      <div
        style={{
          fontSize: 8,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#8A8578",
        }}
      >
        {label}
      </div>
      <div
        className="mt-1"
        style={{
          fontFamily: "Cormorant Garamond, serif",
          fontSize: 22,
          color: valueColor ?? "#2C2C2C",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          className="mt-0.5"
          style={{ fontSize: 10, color: subColor ?? "#8A8578" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}