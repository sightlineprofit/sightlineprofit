import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardData } from "@/lib/dashboard.functions";
import {
  WeeklyPressureChart,
  ProjectTimeline,
  type CapacityExpandedData,
} from "@/components/capacity/CapacityExpanded";
import { computeCapacity, fmtHrs } from "@/lib/capacity-math";
import type { CapacityInputs } from "@/lib/capacity-math";
import { calc as calcFinance, effectivePrincipalBillableHrsWeek, firmHasProductiveCapacity } from "@/lib/finance";

export function CapacitySixteenWeekView() {
  const fetchDashboard = useServerFn(getDashboardData);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-capacity-inline"],
    queryFn: () => fetchDashboard(),
  });

  const capacityData = useMemo(() => {
    if (!data?.firm || !data?.config) return null;

    const cap: any = (data as any)?.capacity ?? {};
    const config = data.config as any;
    const expenses = data.expenses ?? [];
    const c = calcFinance(config, expenses as any, {
      ownerComp: data.ownerComp ?? [],
      teamProfiles: data.teamBurdens ?? [],
    });

    const targetHrs = effectivePrincipalBillableHrsWeek(config);
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekStartIso = weekStart.toISOString().slice(0, 10);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndIso = weekEnd.toISOString().slice(0, 10);

    const weeklyHoursByUser = new Map<string, number>();
    const weeklyBillableByUser = new Map<string, number>();
    const weeklyNonBillableByUser = new Map<string, number>();

    for (const t of (cap.trailingEntries ?? []) as Array<{
      user_id?: string;
      hrs: number | null;
      date: string;
      billable: boolean;
    }>) {
      if (!t.user_id) continue;
      if (t.date >= weekStartIso && t.date < weekEndIso) {
        const h = Number(t.hrs || 0);
        weeklyHoursByUser.set(t.user_id, (weeklyHoursByUser.get(t.user_id) ?? 0) + h);
        if (t.billable) {
          weeklyBillableByUser.set(t.user_id, (weeklyBillableByUser.get(t.user_id) ?? 0) + h);
        } else {
          weeklyNonBillableByUser.set(t.user_id, (weeklyNonBillableByUser.get(t.user_id) ?? 0) + h);
        }
      }
    }

    const inputs: CapacityInputs = {
      projects: cap.projects ?? [],
      phases: cap.phases ?? [],
      pipeline: cap.pipeline ?? [],
      trailingEntries: cap.trailingEntries ?? [],
      avgWeeklyNonBillable: Number(cap.avgWeeklyNonBillable ?? 0),
      targetHrsPerWeek: targetHrs,
      weeksPerYear: Number(config?.weeks_per_year ?? 48),
      ratePerHr: c.alignedRate,
      annualCapacityHrs: c.annualBillableHrs,
      milestones: cap.milestones ?? [],
    };

    const out: CapacityExpandedData = {
      inputs,
      weekHours: Number(data.weekHours ?? 0),
      bdWeekHours: Number((data as any).bdWeekHours ?? 0),
      team: cap.team ?? [],
      weeklyHoursByUser,
      weeklyBillableByUser,
      weeklyNonBillableByUser,
      sopTemplates: cap.sopTemplates ?? [],
      configSetup: firmHasProductiveCapacity(c.annualBillableHrs),
      annualRevenue: c.annualRevenue,
      alignedAnnualRevenue: c.alignedRate * targetHrs * Number(config?.weeks_per_year ?? 48),
      ytdHoursByUser: cap.ytdHoursByUser ?? {},
      lastEntryByUser: cap.lastEntryByUser ?? {},
      weeksElapsed: Number(cap.weeksElapsed ?? 1),
      principal: {
        id: data.profile?.id as string,
        name: (data.profile?.name || data.profile?.email || "You") as string,
        target: targetHrs,
      },
    };

    return out;
  }, [data]);

  if (isLoading) {
    return <p className="font-sans text-sm text-muted-foreground">Loading 16-week view…</p>;
  }

  if (!capacityData?.configSetup) {
    return (
      <p className="rounded-xl border border-border bg-white p-6 font-sans text-sm text-muted-foreground">
        Set your billable hours target in Rate & Cost Architecture to unlock the 16-week capacity view.
      </p>
    );
  }

  const summary = computeCapacity(capacityData.inputs);
  const target = capacityData.inputs.targetHrsPerWeek;
  const active = capacityData.inputs.projects.filter((p) => (p.status || "").toLowerCase() === "active");
  const withDates = active.filter((p) => p.start_date && p.end_date);

  return (
    <div className="space-y-6 rounded-xl border border-border bg-white p-6">
      <div>
        <h3 className="font-display text-base text-ch">Weekly pressure — next 16 weeks</h3>
        <p className="mt-1 font-sans text-[11px] text-muted-foreground">
          Hours committed per week against your {target.toFixed(0)}-hr target.
        </p>
        <WeeklyPressureChart weeks={summary.weeks} target={target} />
        <div className="mt-3 flex flex-wrap gap-4 font-sans text-[11px] text-muted-foreground">
          <Legend color="bg-success" label="Within target" />
          <Legend color="bg-gold" label="Approaching limit" />
          <Legend color="bg-terra" label="Over committed" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <MiniStat label="Billable committed" hrs={summary.committed} color="text-gold" />
        <MiniStat label="Billable available" hrs={summary.available} color="text-success" />
      </div>

      <div>
        <h3 className="font-display text-base text-ch">Active projects — when they run</h3>
        {withDates.length === 0 ? (
          <p className="mt-2 font-sans text-[11px] italic text-muted-foreground">
            Add start and end dates to active projects to map them here.
          </p>
        ) : (
          <ProjectTimeline projects={withDates} phases={capacityData.inputs.phases} />
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, hrs, color }: { label: string; hrs: number; color: string }) {
  return (
    <div className="rounded-lg bg-cream px-4 py-3">
      <p className="font-sans text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn(`font-display text-xl ${color}`)}>{fmtHrs(hrs)} hrs</p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("inline-block h-2 w-3", color)} />
      {label}
    </span>
  );
}

import { cn } from "@/lib/utils";
