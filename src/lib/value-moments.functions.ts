import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calc } from "@/lib/finance";

/** Moment 1 — flip rate_insight_shown to true. */
export const dismissRateInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) throw new Error("No firm");
    const { error } = await supabase
      .from("firm_config")
      .update({ rate_insight_shown: true })
      .eq("firm_id", profile.firm_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Moment 3 — variance summary for a project before closing it. */
export const getProjectCloseSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) throw new Error("No firm");
    const [{ data: project }, { data: phases }, { data: entries }, { data: config }, { data: expenses }] =
      await Promise.all([
        supabase.from("projects").select("*").eq("id", data.projectId).eq("firm_id", profile.firm_id).single(),
        supabase.from("project_phases").select("*").eq("project_id", data.projectId),
        supabase.from("time_entries").select("hrs, billable").eq("project_id", data.projectId),
        supabase.from("firm_config").select("*").eq("firm_id", profile.firm_id).maybeSingle(),
        supabase.from("expenses").select("*").eq("firm_id", profile.firm_id),
      ]);
    if (!project) throw new Error("Project not found");
    const fc = calc((config as any) ?? null, (expenses as any[]) ?? []);
    const scopedHrs = (phases ?? []).reduce((s, p) => s + Number(p.expected_hrs || 0), 0);
    const actualHrs = (entries ?? []).reduce((s, e) => s + Number(e.hrs || 0), 0);
    const isFixedFee = Number(project.fixed_fee || 0) > 0;
    const projectRate = Number(project.scoped_rate) || fc.billedRate || 0;
    const plannedFee = isFixedFee ? Number(project.fixed_fee || 0) : scopedHrs * projectRate;
    const actualFee = plannedFee; // unchanged at close (revenue is what was agreed)
    const plannedRate = scopedHrs > 0 ? plannedFee / scopedHrs : projectRate;
    const actualRate = actualHrs > 0 ? actualFee / actualHrs : 0;
    const avgCostRate = fc.totalCost > 0 && fc.annualBillableHrs > 0
      ? fc.totalCost / fc.annualBillableHrs
      : 0;
    const plannedCost = scopedHrs * avgCostRate;
    const actualCost = actualHrs * avgCostRate;
    const plannedMarginPct = plannedFee > 0 ? ((plannedFee - plannedCost) / plannedFee) * 100 : 0;
    const actualMarginPct = actualFee > 0 ? ((actualFee - actualCost) / actualFee) * 100 : 0;
    const overHrs = Math.max(0, actualHrs - scopedHrs);
    const overCost = overHrs * (projectRate || fc.billedRate || 0);
    return {
      projectName: project.name as string,
      isFixedFee,
      plannedFee,
      actualFee,
      plannedHrs: scopedHrs,
      actualHrs,
      plannedRate,
      actualRate,
      plannedMarginPct,
      actualMarginPct,
      overHrs,
      overCost,
    };
  });

/** Moment 4 — full year-in-review aggregate. */
export const getAnnualSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) throw new Error("No firm");
    const [{ data: firm }, { data: config }, { data: expenses }, { data: projects }, { data: phases }, { data: entries }] =
      await Promise.all([
        supabase.from("firms").select("*").eq("id", profile.firm_id).single(),
        supabase.from("firm_config").select("*").eq("firm_id", profile.firm_id).maybeSingle(),
        supabase.from("expenses").select("*").eq("firm_id", profile.firm_id),
        supabase.from("projects").select("*").eq("firm_id", profile.firm_id),
        supabase.from("project_phases").select("*"),
        supabase.from("time_entries").select("hrs, billable, date, project_id").eq("firm_id", profile.firm_id),
      ]);
    const fc = calc((config as any) ?? null, (expenses as any[]) ?? []);

    // Capture aligned_rate_at_signup lazily if not yet set.
    const cfg = (config as any) ?? {};
    let alignedAtSignup = Number(cfg.aligned_rate_at_signup);
    if (!Number.isFinite(alignedAtSignup) || alignedAtSignup <= 0) {
      alignedAtSignup = fc.alignedRate;
      if (config) {
        await supabase
          .from("firm_config")
          .update({ aligned_rate_at_signup: alignedAtSignup })
          .eq("firm_id", profile.firm_id);
      }
    }

    const yearStart = new Date();
    yearStart.setFullYear(yearStart.getFullYear() - 1);
    const isoYearStart = yearStart.toISOString().slice(0, 10);

    const projectIds = new Set((projects ?? []).map((p) => p.id));
    const phasesByProject = new Map<string, { scoped: number; actual: number }>();
    for (const ph of phases ?? []) {
      if (!projectIds.has(ph.project_id as string)) continue;
      const t = phasesByProject.get(ph.project_id as string) ?? { scoped: 0, actual: 0 };
      t.scoped += Number(ph.expected_hrs || 0);
      t.actual += Number(ph.actual_hrs || 0);
      phasesByProject.set(ph.project_id as string, t);
    }

    const completed = (projects ?? []).filter((p) => p.status === "completed" || p.status === "collected");
    let totalFees = 0;
    let creepHrsTotal = 0;
    let creepValueTotal = 0;
    let creepPctSum = 0;
    let creepPctCount = 0;
    for (const p of completed) {
      const t = phasesByProject.get(p.id as string) ?? { scoped: 0, actual: 0 };
      const isFF = Number(p.fixed_fee || 0) > 0;
      const rate = Number(p.scoped_rate) || fc.billedRate || 0;
      const fee = isFF ? Number(p.fixed_fee || 0) : t.scoped * rate;
      totalFees += fee;
      const over = Math.max(0, t.actual - t.scoped);
      creepHrsTotal += over;
      creepValueTotal += over * rate;
      if (t.scoped > 0) {
        creepPctSum += (over / t.scoped) * 100;
        creepPctCount += 1;
      }
    }

    // Capacity: weeks above 85% utilization in the last year (target_billable_hrs_per_week).
    const targetHrs = fc.targetBillableHrsWeek;
    const weekMap = new Map<string, number>();
    for (const e of entries ?? []) {
      if (!e.billable) continue;
      if ((e.date as string) < isoYearStart) continue;
      const d = new Date(e.date as string);
      // ISO week-start (Sunday)
      d.setDate(d.getDate() - d.getDay());
      const k = d.toISOString().slice(0, 10);
      weekMap.set(k, (weekMap.get(k) ?? 0) + Number(e.hrs || 0));
    }
    let weeksOver85 = 0;
    for (const hrs of weekMap.values()) {
      if (targetHrs > 0 && hrs >= targetHrs * 0.85) weeksOver85 += 1;
    }

    // Rate progress
    const billed = Number(cfg.rate_billed) || 0;
    const gapClosed = Math.max(0, billed - alignedAtSignup);
    const annualRevImpact = gapClosed * fc.annualBillableHrs;

    // Subscription cost (simple by tier)
    const tier = (firm?.subscription_tier as string) ?? "foundation";
    const tierMonthly: Record<string, number> = { foundation: 49, studio: 99, practice: 199 };
    const subAnnual = (tierMonthly[tier] ?? 0) * 12;

    const conservativeValue = (fc.gapToFloor * fc.annualBillableHrs) + creepValueTotal;
    const ratio = subAnnual > 0 ? conservativeValue / subAnnual : 0;

    return {
      firmName: firm?.name ?? "",
      alignedAtSignup,
      alignedNow: fc.alignedRate,
      billedNow: billed,
      gapClosed,
      annualRevImpact,
      completedCount: completed.length,
      totalFees,
      avgCreepPct: creepPctCount > 0 ? creepPctSum / creepPctCount : 0,
      creepHrsTotal,
      creepValueTotal,
      weeksOver85,
      capacityWarnings: weeksOver85, // proxy
      growthSignals: Array.isArray(cfg.growth_signals) ? (cfg.growth_signals as unknown[]).length : 0,
      subAnnual,
      conservativeValue,
      ratio,
      tier,
    };
  });