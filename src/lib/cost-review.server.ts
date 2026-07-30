import type { SupabaseClient } from "@supabase/supabase-js";
import { calc, type Expense, type FirmConfig } from "@/lib/finance";
import { ensureTourRow } from "@/lib/tour.server";

import type { CostReviewNotifications } from "@/lib/cost-review.utils";

export type { CostReviewNotifications } from "@/lib/cost-review.utils";
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function loadAlignedRate(supabase: SupabaseClient, firmId: string): Promise<number> {
  const [{ data: config }, { data: expenses }, { data: owners }, { data: team }] =
    await Promise.all([
      supabase.from("firm_config").select("*").eq("firm_id", firmId).maybeSingle(),
      supabase.from("expenses").select("*").eq("firm_id", firmId),
      supabase.from("owner_compensation").select("*").eq("firm_id", firmId),
      supabase
        .from("firm_members")
        .select("burdened_weekly_cost, weeks_per_year, role_type, expected_hrs_per_week, billed_rate")
        .eq("firm_id", firmId)
        .eq("is_active", true)
        .neq("role_type", "principal"),
    ]);

  const c = calc(
    (config ?? null) as FirmConfig | null,
    (expenses ?? []) as Expense[],
    {
      ownerComp: (owners ?? []) as never,
      teamProfiles: (team ?? []) as never,
    },
  );
  return Math.round((c.alignedRate || 0) * 100) / 100;
}

async function countAffectedActiveProjects(
  supabase: SupabaseClient,
  firmId: string,
  newAlignedRate: number,
): Promise<number> {
  if (!Number.isFinite(newAlignedRate) || newAlignedRate <= 0) return 0;

  const { data: projects } = await supabase
    .from("projects")
    .select("id, status")
    .eq("firm_id", firmId)
    .in("status", ["active", "in_progress"]);

  if (!projects?.length) return 0;

  const activeIds = projects.map((p) => p.id);
  const { data: snapshots } = await supabase
    .from("project_cost_snapshots")
    .select("project_id, break_even_rate")
    .eq("firm_id", firmId)
    .in("project_id", activeIds);

  let count = 0;
  for (const snap of snapshots ?? []) {
    const ber = Number(snap.break_even_rate);
    if (!Number.isFinite(ber)) continue;
    if (Math.abs(ber - newAlignedRate) / newAlignedRate > 0.15) count += 1;
  }
  return count;
}

/**
 * After a successful cost-settings save: refresh review metadata and build
 * client notification payloads. Never throws — callers treat as fire-and-forget.
 */
export async function recordCostReviewAfterSave(
  supabase: SupabaseClient,
  firmId: string,
): Promise<CostReviewNotifications | null> {
  const newAlignedRate = await loadAlignedRate(supabase, firmId);

  await ensureTourRow(supabase, firmId);

  const { data: prefs } = await supabase
    .from("firm_preferences")
    .select("aligned_rate_at_last_review")
    .eq("firm_id", firmId)
    .maybeSingle();

  const previousAlignedRate = Number(prefs?.aligned_rate_at_last_review) || 0;
  const rateDelta = newAlignedRate - previousAlignedRate;

  const { error: updateError } = await supabase
    .from("firm_preferences")
    .update({
      last_cost_review_date: todayIsoDate(),
      aligned_rate_at_last_review: newAlignedRate,
      updated_at: new Date().toISOString(),
    })
    .eq("firm_id", firmId);

  if (updateError) throw updateError;

  const out: CostReviewNotifications = {};

  if (previousAlignedRate > 0 && Math.abs(rateDelta) >= 5) {
    out.rateChange = {
      previousRate: previousAlignedRate,
      newRate: newAlignedRate,
      delta: rateDelta,
      direction: rateDelta > 0 ? "up" : "down",
    };
  }

  const affected = await countAffectedActiveProjects(supabase, firmId, newAlignedRate);
  if (affected > 0) {
    out.affectedProjects = { count: affected };
  }

  if (!out.rateChange && !out.affectedProjects) return null;
  return out;
}
