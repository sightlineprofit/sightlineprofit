import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getDashboardData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, firm_id, name, email, role, is_super_admin, impersonated_firm_id")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) {
      return {
        profile,
        firm: null,
        config: null,
        expenses: [],
        scenarios: [],
        prefs: { hidden_metrics: [] as string[] },
        weekHours: 0,
        bdWeekHours: 0,
        committedRevenue: 0,
        collectedRevenue: 0,
      };
    }
    const startOfWeek = new Date();
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const isoWeek = startOfWeek.toISOString().slice(0, 10);

    // 4-week trailing window (for non-billable estimate) and 8-week past window (for pressure chart).
    const fourWeeksAgo = new Date(startOfWeek);
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    const eightWeeksAgo = new Date(startOfWeek);
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

    const [
      { data: firm },
      { data: config },
      { data: expenses },
      { data: scenarios },
      { data: prefs },
      { data: weekEntries },
      { data: projects },
      { data: capacityProjects },
      { data: phases },
      { data: pipeline },
      { data: team },
      { data: trailingEntries },
      { data: sopTemplates },
      { data: sopPhases },
      { data: manualLogsWindow },
    ] = await Promise.all([
      supabase.from("firms").select("*").eq("id", profile.firm_id).single(),
      supabase.from("firm_config").select("*").eq("firm_id", profile.firm_id).maybeSingle(),
      supabase.from("expenses").select("*").eq("firm_id", profile.firm_id),
      supabase.from("scenarios").select("id, name, payload, created_at").eq("firm_id", profile.firm_id).order("created_at", { ascending: false }).limit(5),
      supabase.from("user_metric_prefs").select("hidden_metrics").eq("user_id", userId).maybeSingle(),
      supabase
        .from("time_entries")
        .select("hrs, billable, project_id, projects(status)")
        .eq("firm_id", profile.firm_id)
        .gte("date", isoWeek),
      supabase
        .from("projects")
        .select("id, status, scoped_hrs, scoped_rate, fixed_fee")
        .eq("firm_id", profile.firm_id),
      supabase
        .from("projects")
        .select("id, name, status, start_date, end_date, scoped_hrs, scoped_rate, fixed_fee, sop_template_id")
        .eq("firm_id", profile.firm_id),
      supabase
        .from("project_phases")
        .select("id, project_id, name, expected_hrs, actual_hrs, billable, sort_order"),
      supabase
        .from("pipeline_projects")
        .select("id, name, estimated_hrs, estimated_start, probability_pct")
        .eq("firm_id", profile.firm_id),
      supabase
        .from("profiles")
        .select("id, name, email, role, color, expected_hrs_per_week, billable_rate")
        .eq("firm_id", profile.firm_id),
      supabase
        .from("time_entries")
        .select("hrs, billable, date, user_id")
        .eq("firm_id", profile.firm_id)
        .gte("date", eightWeeksAgo.toISOString().slice(0, 10)),
      supabase
        .from("sop_templates")
        .select("id, name")
        .eq("firm_id", profile.firm_id)
        .is("deleted_at", null),
      supabase
        .from("sop_phases")
        .select("template_id, expected_hrs")
        .eq("firm_id", profile.firm_id),
      supabase
        .from("manual_hour_logs")
        .select("id, user_id, period_type, period_start, total_hrs_worked, billable_hrs, non_billable_hrs")
        .eq("firm_id", profile.firm_id)
        .gte("period_start", eightWeeksAgo.toISOString().slice(0, 10)),
    ]);

    const isBD = (status: string | null | undefined) =>
      status === "pursuit" || status === "pipeline";
    const weekHours = (weekEntries ?? [])
      .filter((t: any) => t.billable && !isBD(t.projects?.status))
      .reduce((s, t: any) => s + Number(t.hrs || 0), 0);
    const bdWeekHours = (weekEntries ?? [])
      .filter((t: any) => isBD(t.projects?.status))
      .reduce((s, t: any) => s + Number(t.hrs || 0), 0);

    const projectRevenue = (p: any): number => {
      const fee = Number(p.fixed_fee || 0);
      if (fee > 0) return fee;
      return Number(p.scoped_hrs || 0) * Number(p.scoped_rate || 0);
    };
    let committedRevenue = 0;
    let collectedRevenue = 0;
    for (const p of projects ?? []) {
      const r = projectRevenue(p);
      if (p.status === "active" || p.status === "invoiced") committedRevenue += r;
      if (p.status === "collected") collectedRevenue += r;
    }

    // ----- Capacity payload -----
    // Filter phases to firm's projects (no firm_id on project_phases).
    const projectIds = new Set((capacityProjects ?? []).map((p) => p.id));
    const phasesScoped = (phases ?? []).filter((p) => projectIds.has(p.project_id as string));

    // Non-billable trailing 4 weeks: sum hours where billable=false and date >= 4 weeks ago.
    const fourCutoff = fourWeeksAgo.toISOString().slice(0, 10);
    let nonBillable4w = 0;
    for (const t of trailingEntries ?? []) {
      if (!t.billable && (t.date as string) >= fourCutoff) {
        nonBillable4w += Number(t.hrs || 0);
      }
    }
    const avgWeeklyNonBillable = nonBillable4w / 4;

    // SOP template totals: sum of phase expected_hrs per template.
    const sopTotals = new Map<string, number>();
    for (const sp of sopPhases ?? []) {
      sopTotals.set(
        sp.template_id as string,
        (sopTotals.get(sp.template_id as string) ?? 0) + Number(sp.expected_hrs || 0),
      );
    }
    const sopTemplatesOut = (sopTemplates ?? []).map((t) => ({
      id: t.id as string,
      name: t.name as string,
      total_hrs: sopTotals.get(t.id as string) ?? 0,
    }));

    return {
      profile, firm, config, expenses: expenses ?? [], scenarios: scenarios ?? [],
      prefs: { hidden_metrics: prefs?.hidden_metrics ?? [] },
      weekHours,
      bdWeekHours,
      committedRevenue,
      collectedRevenue,
      capacity: {
        projects: capacityProjects ?? [],
        phases: phasesScoped,
        pipeline: pipeline ?? [],
        team: team ?? [],
        trailingEntries: trailingEntries ?? [],
        avgWeeklyNonBillable,
        sopTemplates: sopTemplatesOut,
      },
    };
  });

export const updateMetricPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ hidden_metrics: z.array(z.string().max(64)).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("user_metric_prefs")
      .upsert(
        { user_id: userId, hidden_metrics: data.hidden_metrics, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveScenario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      name: z.string().trim().min(1).max(80),
      payload: z.record(z.string(), z.any()),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("firm_id").eq("id", userId).single();
    if (!profile?.firm_id) throw new Error("No firm");
    const { data: row, error } = await supabase
      .from("scenarios")
      .insert({ firm_id: profile.firm_id, created_by: userId, name: data.name, payload: data.payload })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listKnowledge = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data } = await supabase
      .from("knowledge_articles")
      .select("*")
      .not("published_at", "is", null)
      .order("published_at", { ascending: false });
    return data ?? [];
  });