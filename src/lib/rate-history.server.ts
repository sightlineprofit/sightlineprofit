import type { SupabaseClient } from "@supabase/supabase-js";
import { calc, type FirmConfig, type Expense } from "@/lib/finance";

/**
 * Recompute the firm's aligned rate from the current DB state and append a
 * history row if the rate has changed since the last recorded value.
 * Server-only helper; safe to fire-and-forget from save handlers.
 */
export async function recordAlignedRate(
  supabase: SupabaseClient,
  firmId: string,
  reason: string,
): Promise<void> {
  try {
    const [{ data: config }, { data: expenses }, { data: owners }, { data: team }] =
      await Promise.all([
        supabase.from("firm_config").select("*").eq("firm_id", firmId).maybeSingle(),
        supabase.from("expenses").select("*").eq("firm_id", firmId),
        supabase.from("owner_compensation").select("*").eq("firm_id", firmId),
        supabase
          .from("firm_members")
          .select("burdened_weekly_cost, weeks_per_year, role_type, expected_hrs_per_week")
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
    const newRate = Math.round((c.alignedRate || 0) * 100) / 100;
    if (!Number.isFinite(newRate) || newRate <= 0) return;

    const { data: last } = await supabase
      .from("aligned_rate_history")
      .select("rate")
      .eq("firm_id", firmId)
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const prev = last ? Number(last.rate) : null;
    if (prev !== null && Math.abs(prev - newRate) < 0.01) return;

    await supabase.from("aligned_rate_history").insert({
      firm_id: firmId,
      rate: newRate,
      previous_rate: prev,
      change_reason: reason,
    });
  } catch {
    // fire-and-forget — never break save flows
  }
}