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

export const getTourStep6Progress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const firmId = await getTourFirmId(supabase, userId);
    if (!firmId) {
      return { projectCreated: false, sopAttached: false, projectId: null as string | null };
    }

    const { data: projects } = await supabase
      .from("projects")
      .select("id, sop_template_id, created_at")
      .eq("firm_id", firmId)
      .order("created_at", { ascending: false })
      .limit(25);

    if (!projects?.length) {
      return { projectCreated: false, sopAttached: false, projectId: null as string | null };
    }

    const projectIds = projects.map((p) => p.id as string);
    const { data: phases } = await supabase
      .from("project_phases")
      .select("project_id")
      .in("project_id", projectIds)
      .limit(1);

    const phasedProjectId = (phases?.[0]?.project_id as string | undefined) ?? null;
    const templatedProject = projects.find((p) => p.sop_template_id);
    const projectWithSopId = phasedProjectId ?? (templatedProject?.id as string | undefined) ?? null;
    const projectId = projectWithSopId ?? (projects[0].id as string);

    return {
      projectCreated: true,
      sopAttached: !!projectWithSopId,
      projectId,
    };
  });

export const getTourStep7Progress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const firmId = await getTourFirmId(supabase, userId);
    if (!firmId) {
      return { timeLogged: false, historyImported: false, importedCount: 0 };
    }

    const { count: entryCount } = await supabase
      .from("time_entries")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .eq("user_id", userId);

    const { data: importLog } = await supabase
      .from("time_import_logs")
      .select("rows_imported")
      .eq("firm_id", firmId)
      .gt("rows_imported", 0)
      .order("imported_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const importedCount = Number(importLog?.rows_imported) || 0;

    return {
      timeLogged: (entryCount ?? 0) > 0,
      historyImported: importedCount > 0,
      importedCount,
    };
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
      Number(c.target_billable_hrs_per_week) > 0 &&
      (c.pricing_structure === "flat_fee" || Number(c.rate_billed) > 0);
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