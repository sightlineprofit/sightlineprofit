import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calc as calcFinance, type Expense, type FirmConfig } from "@/lib/finance";
import { z } from "zod";

type Profile = "underpriced" | "low_utilization" | "cost_creep" | "committed";
type Action = { priority: 1 | 2 | 3; text: string; why: string; linkLabel: string; linkTo: string; actionType: string };
type Signal = { key: string; value: string; flagged?: boolean };

export type ActionEngineState = {
  visible: boolean;
  profile: Profile;
  pricingGapPct: number;
  utilGapPct: number;
  costGapPct: number;
  headline: string;
  actions: Action[];
  signals: Signal[];
  rotationNote: string;
  openCommitment: null | {
    id: string;
    committedRate: number | null;
    daysSince: number;
    currentBilledRate: number;
  };
  alignedRate: number;
  billedRate: number;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    Number.isFinite(n) ? n : 0,
  );

export const getActionEngineState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ActionEngineState | { visible: false }> => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id, role, is_super_admin")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) return { visible: false };

    // Role gate — principals and admins only
    const role = profile.role;
    const allowed = profile.is_super_admin || role === "principal" || role === "admin";
    if (!allowed) return { visible: false };

    const firmId = profile.firm_id as string;
    const [
      { data: config },
      { data: expenses },
      { data: ownerComp },
      { data: teamBurdens },
      { data: openCommitmentRows },
      { data: signalState },
      { data: rateHistory },
      { data: activeProjects },
    ] = await Promise.all([
      supabase.from("firm_config").select("*").eq("firm_id", firmId).maybeSingle(),
      supabase.from("expenses").select("*").eq("firm_id", firmId),
      supabase.from("owner_compensation").select("*").eq("firm_id", firmId),
      supabase
        .from("firm_members")
        .select("id, role_type, burdened_weekly_cost, weeks_per_year")
        .eq("firm_id", firmId)
        .eq("is_active", true)
        .neq("role_type", "principal"),
      supabase
        .from("firm_action_commitments")
        .select("*")
        .eq("firm_id", firmId)
        .is("resolved_at", null)
        .gte("committed_at", new Date(Date.now() - 120 * 24 * 3600 * 1000).toISOString())
        .order("committed_at", { ascending: false })
        .limit(1),
      supabase.from("firm_signal_state").select("*").eq("firm_id", firmId).maybeSingle(),
      supabase
        .from("aligned_rate_history")
        .select("aligned_rate, snapshot_at")
        .eq("firm_id", firmId)
        .gte("snapshot_at", new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString())
        .order("snapshot_at", { ascending: true }),
      supabase
        .from("projects")
        .select("id, status")
        .eq("firm_id", firmId)
        .eq("status", "active"),
    ]);

    const c = calcFinance(config as FirmConfig | null, (expenses ?? []) as unknown as Expense[], {
      ownerComp: (ownerComp ?? []) as any,
      teamProfiles: (teamBurdens ?? []) as any,
    });

    const rateBilled = Number((config as any)?.rate_billed) || 0;
    const alignedRate = c.alignedRate || 0;
    const gapTotal = Math.max(0, alignedRate - rateBilled);
    const targetHrs = Number((config as any)?.target_billable_hrs_per_week) || 0;
    const currentHrs = Number((config as any)?.actual_billable_hrs_per_week) || targetHrs;

    // Compute aligned rate at target utilization: rerun calc with hrsOverride = target
    const alignedAtTarget = calcFinance(config as FirmConfig | null, (expenses ?? []) as unknown as Expense[], {
      ownerComp: (ownerComp ?? []) as any,
      teamProfiles: (teamBurdens ?? []) as any,
      hrsOverride: targetHrs || currentHrs,
    }).alignedRate || alignedRate;

    // Gap composition
    const pricingContribution = Math.max(0, alignedAtTarget - rateBilled);
    const utilContribution = Math.max(0, alignedRate - alignedAtTarget);
    // cost creep: aligned rate growth over last 180 days
    const rh = rateHistory ?? [];
    const oldestAligned = rh.length > 0 ? Number(rh[0].aligned_rate) : alignedRate;
    const costContribution = Math.max(0, alignedRate - oldestAligned);

    const compTotal = pricingContribution + utilContribution + costContribution || 1;
    const pricingGapPct = (pricingContribution / compTotal) * 100;
    const utilGapPct = (utilContribution / compTotal) * 100;
    const costGapPct = (costContribution / compTotal) * 100;

    const openCommitment = openCommitmentRows?.[0] ?? null;

    let primaryProfile: Profile;
    if (openCommitment) primaryProfile = "committed";
    else if (pricingGapPct > 50) primaryProfile = "underpriced";
    else if (utilGapPct > 45) primaryProfile = "low_utilization";
    else if (costGapPct > 45 && costContribution > 0) primaryProfile = "cost_creep";
    else primaryProfile = "underpriced"; // default to pricing when nothing dominant

    // Build action set
    const activeProjectCount = (activeProjects ?? []).length;
    let headline = "";
    let actions: Action[] = [];
    let signals: Signal[] = [];

    if (primaryProfile === "committed" && openCommitment) {
      const committedRate = Number((openCommitment as any).committed_rate) || 0;
      const daysSince = Math.floor(
        (Date.now() - new Date((openCommitment as any).committed_at).getTime()) / (24 * 3600 * 1000),
      );
      headline = `You committed to a rate change ${daysSince} days ago`;
      actions = [
        {
          priority: 1,
          text: `Has your billed rate in settings been updated to ${fmt(committedRate)}/hr?`,
          why: `You committed to raising your rate ${daysSince} days ago. Your settings still show ${fmt(rateBilled)}/hr. Either the rate was raised in practice but not updated here, or the commitment hasn't been acted on yet. Update the number so your dashboard reflects reality.`,
          linkLabel: "Update my billed rate in settings →",
          linkTo: "/settings?panel=rate",
          actionType: "commit_verify_settings",
        },
        {
          priority: 2,
          text: "Have you sent a proposal at the new rate? If yes — log it.",
          why: `The commitment was to send one proposal at ${fmt(committedRate)}/hr. If that's happened, mark it done and your next action set will reflect the new baseline.`,
          linkLabel: "Mark the first proposal sent →",
          linkTo: "/rate-architecture",
          actionType: "commit_mark_proposal",
        },
        {
          priority: 3,
          text: "If the rate increase didn't happen — tell us why",
          why: "Uncommitted commitments aren't failures. They're information. If timing felt wrong, if the gap felt too large — that context changes what action makes sense next.",
          linkLabel: "Tell us what happened →",
          linkTo: "/rate-architecture",
          actionType: "commit_reconsider",
        },
      ];
      signals = [
        { key: "Committed rate", value: fmt(committedRate) },
        { key: "Current billed rate", value: fmt(rateBilled), flagged: rateBilled < committedRate },
        { key: "Days since commitment", value: `${daysSince} days` },
      ];
    } else if (primaryProfile === "underpriced") {
      const increment = Math.max(10, Math.min(c.gapToBreakEven || gapTotal, gapTotal * 0.3));
      const newRate = rateBilled + increment;
      headline = "Your rate is the primary gap driver";
      actions = [
        {
          priority: 1,
          text: `Raise your rate to ${fmt(newRate)}/hr on your next new client proposal`,
          why: `Your billed rate is ${fmt(rateBilled)}/hr against a ${fmt(alignedRate)}/hr aligned rate. A ${fmt(increment)} raise doesn't close the full gap but gets you to or above break-even. One proposal at the new rate is all it takes to start.`,
          linkLabel: "Draft a proposal at this rate →",
          linkTo: "/rate-architecture",
          actionType: "raise_rate_next_proposal",
        },
        {
          priority: 2,
          text: `Tell your ${activeProjectCount} active clients your rate is increasing in 90 days`,
          why: "Early notice is professional and gives clients time to adjust. It also creates a deadline that makes the increase real — not perpetually planned.",
          linkLabel: "Draft a rate increase notice →",
          linkTo: "/knowledge-base",
          actionType: "notify_clients_90_days",
        },
        {
          priority: 3,
          text: `Calculate what your last 3 projects would have earned at ${fmt(newRate)}/hr`,
          why: "Seeing the dollar amount left on the table on completed projects is more motivating than any projected number. It makes the cost of underpricing concrete.",
          linkLabel: "Run this calculation →",
          linkTo: "/rate-architecture",
          actionType: "backcalc_last_3_projects",
        },
      ];
      signals = [
        { key: "Billed rate vs aligned rate", value: `${fmt(rateBilled)} vs ${fmt(alignedRate)}`, flagged: rateBilled < alignedRate },
        { key: "Gap to break-even", value: `${fmt(c.gapToBreakEven || 0)}/hr`, flagged: (c.gapToBreakEven || 0) > 0 },
        { key: "Utilization", value: `${targetHrs > 0 ? Math.round((currentHrs / targetHrs) * 100) : 0}%` },
        { key: "Cost structure", value: costContribution > 0 ? `${fmt(costContribution)}/hr recent growth` : "Stable · no recent changes", flagged: costContribution > 0 },
      ];
    } else if (primaryProfile === "low_utilization") {
      const target = Math.min(40 * 0.6, currentHrs + 5);
      const unbilled = Math.max(0, 40 - currentHrs);
      headline = "Unbilled hours are costing more than your rate gap";
      actions = [
        {
          priority: 1,
          text: `Block ${target.toFixed(0)} billable hours on your calendar before anything else this week`,
          why: `You're working ~40hrs/week but billing ${currentHrs.toFixed(0)}. That means ${unbilled.toFixed(0)}hrs/week is going somewhere else. Blocking billable time first — before admin, calls, or anything non-billable — is the only reliable way to change this.`,
          linkLabel: "Set up my week →",
          linkTo: "/calendar",
          actionType: "block_billable_calendar",
        },
        {
          priority: 2,
          text: "Audit last week's time log: find where the unbilled hours actually went",
          why: "You can't protect time you can't see. Tag each non-billable block — admin, business development, unbilled client contact, scope creep. The pattern will be obvious.",
          linkLabel: "Review my time log →",
          linkTo: "/time-calendar",
          actionType: "audit_time_log",
        },
        {
          priority: 3,
          text: "Identify one type of work you're doing for free that should be billed",
          why: `At ${targetHrs > 0 ? Math.round((currentHrs / targetHrs) * 100) : 0}% utilization, something significant is going unbilled. Client emails beyond scope, revision rounds beyond contract, sourcing time marked non-billable by habit.`,
          linkLabel: "Review active projects for unbilled work →",
          linkTo: "/sightline",
          actionType: "find_unbilled_work",
        },
      ];
      signals = [
        { key: "Current billable hours/week", value: `${currentHrs.toFixed(0)}`, flagged: currentHrs < targetHrs },
        { key: "Target billable hours/week", value: `${targetHrs.toFixed(0)}` },
        { key: "Utilization", value: `${targetHrs > 0 ? Math.round((currentHrs / targetHrs) * 100) : 0}%`, flagged: currentHrs < targetHrs },
        { key: "Billed rate", value: `${fmt(rateBilled)}/hr` },
      ];
    } else {
      // cost_creep
      const growth = costContribution * (targetHrs * 48);
      headline = "Your cost floor has grown — your rate hasn't kept up";
      actions = [
        {
          priority: 1,
          text: "Review every recurring subscription and cancel one unused service today",
          why: `Your operating expenses grew ${fmt(growth)} in the last 6 months — adding ${fmt(costContribution)}/hr to your aligned rate without any deliberate decision. One cancellation today starts reversing that drift.`,
          linkLabel: "Review my operating expenses →",
          linkTo: "/settings?panel=expenses",
          actionType: "review_subscriptions",
        },
        {
          priority: 2,
          text: "Update your aligned rate within 30 days of any expense change",
          why: "Every new tool or service you add raises your cost floor immediately. Your rate should follow within 30 days — not the next annual review.",
          linkLabel: "Set a 30-day rate review reminder →",
          linkTo: "/settings?panel=rate",
          actionType: "set_30_day_review",
        },
        {
          priority: 3,
          text: `Identify the ${fmt(growth)} added to your costs in the last 6 months`,
          why: "Cost creep is rarely one big decision — it's twelve small ones. Naming each addition makes it possible to evaluate whether it earned its place in your rate.",
          linkLabel: "Show me what changed in my expenses →",
          linkTo: "/settings?panel=expenses",
          actionType: "identify_cost_growth",
        },
      ];
      signals = [
        { key: "Cost-driven rate growth (180d)", value: `+${fmt(costContribution)}/hr`, flagged: costContribution > 0 },
        { key: "Billed rate", value: `${fmt(rateBilled)}/hr`, flagged: rateBilled < alignedRate },
        { key: "Aligned rate now", value: `${fmt(alignedRate)}/hr` },
        { key: "Aligned rate 180d ago", value: `${fmt(oldestAligned)}/hr` },
      ];
    }

    // Rotation logic — if last action was the same priority-1 action AND metric snapshot roughly unchanged,
    // swap in the priority-3 as new priority-1
    const prev = signalState;
    const snapshot = {
      rate_billed: rateBilled,
      util_hrs_per_week: currentHrs,
      cost_floor: c.breakEvenRate,
      aligned_rate: alignedRate,
      snapshot_at: new Date().toISOString(),
    };
    let rotationNote = "";
    if (prev && prev.last_action_type === actions[0].actionType) {
      const prevSnap = (prev.last_metric_snapshot ?? {}) as any;
      const rateChanged = Math.abs((prevSnap.rate_billed || 0) - rateBilled) > 0.5;
      const utilChanged =
        Math.abs((prevSnap.util_hrs_per_week || 0) - currentHrs) / Math.max(1, prevSnap.util_hrs_per_week || 1) > 0.1;
      const costChanged = Math.abs((prevSnap.cost_floor || 0) - c.breakEvenRate) * (targetHrs * 48) > 2000;
      if (!rateChanged && !utilChanged && !costChanged) {
        // rotate: swap 1 and 3
        const swap = actions[2];
        actions[2] = { ...actions[0], priority: 3 };
        actions[0] = { ...swap, priority: 1 };
        rotationNote = "Same signal, different entry point. Cycle resets when your billed rate, utilization, or cost floor changes meaningfully.";
      } else {
        rotationNote = "Signals shifted since last visit. New action reflects the change.";
      }
    } else {
      rotationNote = prev?.last_action_type
        ? `Previous focus: ${prev.last_action_type.replace(/_/g, " ")} · New cycle triggered by signal change.`
        : "First read of your signals. Cycle refreshes as your rate, utilization, or costs move.";
    }

    // Upsert firm_signal_state
    const cycleCount = (prev?.cycle_count ?? 0) + (prev?.last_action_type === actions[0].actionType ? 0 : 1);
    await supabase.from("firm_signal_state").upsert(
      {
        firm_id: firmId,
        pricing_gap_pct: Number(pricingGapPct.toFixed(2)),
        util_gap_pct: Number(utilGapPct.toFixed(2)),
        cost_gap_pct: Number(costGapPct.toFixed(2)),
        primary_profile: primaryProfile,
        last_action_type: actions[0].actionType,
        last_action_suggested_at: new Date().toISOString(),
        cycle_count: cycleCount,
        last_metric_snapshot: snapshot,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "firm_id" },
    );

    return {
      visible: true,
      profile: primaryProfile,
      pricingGapPct,
      utilGapPct,
      costGapPct,
      headline,
      actions,
      signals,
      rotationNote,
      openCommitment: openCommitment
        ? {
            id: (openCommitment as any).id,
            committedRate: Number((openCommitment as any).committed_rate) || null,
            daysSince: Math.floor(
              (Date.now() - new Date((openCommitment as any).committed_at).getTime()) / (24 * 3600 * 1000),
            ),
            currentBilledRate: rateBilled,
          }
        : null,
      alignedRate,
      billedRate: rateBilled,
    };
  });

export const recordReconsideration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ commitmentId: z.string().uuid(), notes: z.string().max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("firm_action_commitments")
      .update({
        notes: data.notes,
        outcome: "reconsidered",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", data.commitmentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
