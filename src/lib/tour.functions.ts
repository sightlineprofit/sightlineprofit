import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getTourFirmId, ensureTourRow } from "@/lib/tour.server";

export const getFirmPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const firmId = await getTourFirmId(supabase, userId);
    if (!firmId) return null;
    const { data } = await supabase
      .from("firm_preferences" as any)
      .select("*")
      .eq("firm_id", firmId)
      .maybeSingle();
    if (!data) {
      await ensureTourRow(supabase, firmId);
      const { data: fresh } = await supabase
        .from("firm_preferences" as any)
        .select("*")
        .eq("firm_id", firmId)
        .maybeSingle();
      return fresh;
    }
    return data;
  });

export const setTourStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ step: z.number().int().min(0).max(7) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const firmId = await getTourFirmId(supabase, userId);
    if (!firmId) throw new Error("No firm");
    await ensureTourRow(supabase, firmId);
    const { error } = await supabase
      .from("firm_preferences" as any)
      .update({ tour_step: data.step })
      .eq("firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const skipTourFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const firmId = await getTourFirmId(supabase, userId);
    if (!firmId) throw new Error("No firm");
    await ensureTourRow(supabase, firmId);
    const { error } = await supabase
      .from("firm_preferences" as any)
      .update({ tour_completed: true, tour_skipped_at: new Date().toISOString() })
      .eq("firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const completeTourFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const firmId = await getTourFirmId(supabase, userId);
    if (!firmId) throw new Error("No firm");
    await ensureTourRow(supabase, firmId);
    const { error } = await supabase
      .from("firm_preferences" as any)
      .update({ tour_completed: true, tour_step: 7 })
      .eq("firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetTourFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const firmId = await getTourFirmId(supabase, userId);
    if (!firmId) throw new Error("No firm");
    await ensureTourRow(supabase, firmId);
    const { error } = await supabase
      .from("firm_preferences" as any)
      .update({ tour_completed: false, tour_step: 0, tour_skipped_at: null })
      .eq("firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const dismissTourWelcomeBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const firmId = await getTourFirmId(supabase, userId);
    if (!firmId) throw new Error("No firm");
    await ensureTourRow(supabase, firmId);
    const { error } = await supabase
      .from("firm_preferences" as any)
      .update({ welcome_banner_dismissed: true })
      .eq("firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Reconcile tour progress against existing data. For users who came through
 * the old /onboarding wizard (or set things up in Settings), auto-advance
 * tour_step / tour_completed so we don't ask them to re-enter data.
 */
export const reconcileTour = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const firmId = await getTourFirmId(supabase, userId);
    if (!firmId) return { reconciled: false };
    await ensureTourRow(supabase, firmId);

    const { data: prefs } = await supabase
      .from("firm_preferences" as any)
      .select("*")
      .eq("firm_id", firmId)
      .maybeSingle();
    if (!prefs || (prefs as any).tour_completed) return { reconciled: false };

    const [{ data: cfg }, { data: expenses }, { data: members }] = await Promise.all([
      supabase.from("firm_config").select("*").eq("firm_id", firmId).maybeSingle(),
      supabase.from("expenses").select("id").eq("firm_id", firmId).limit(1),
      supabase.from("firm_members").select("id").eq("firm_id", firmId).limit(1),
    ]);

    const c: any = cfg ?? {};
    const compTotal =
      (Number(c.comp_draw_annual) || 0) +
      (Number(c.comp_distribution_annual) || 0) +
      (Number(c.comp_health_annual) || 0) +
      (Number(c.comp_retire_annual) || 0);
    const step1Done = compTotal > 0;
    const step2Done = (expenses ?? []).length > 0;
    const step3Done =
      Number(c.target_billable_hrs_per_week) > 0 && Number(c.rate_billed) > 0;
    const step4Done = (members ?? []).length > 0;

    const doneFlags = [step1Done, step2Done, step3Done, step4Done];
    let highest = 0;
    for (let i = 0; i < 4; i += 1) if (doneFlags[i]) highest = i + 1;

    if (step1Done && step2Done && step3Done && step4Done) {
      await supabase
        .from("firm_preferences" as any)
        .update({ tour_completed: true, tour_step: 7 })
        .eq("firm_id", firmId);
      return { reconciled: true, completed: true, step: 7 };
    }

    if (highest > ((prefs as any).tour_step ?? 0)) {
      await supabase
        .from("firm_preferences" as any)
        .update({ tour_step: highest })
        .eq("firm_id", firmId);
    }
    return { reconciled: highest > 0, completed: false, step: highest };
  });