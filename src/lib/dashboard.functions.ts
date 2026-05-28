import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getDashboardData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, firm_id, name, email, role")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) {
      return { profile, firm: null, config: null, expenses: [], scenarios: [], prefs: { hidden_metrics: [] as string[] }, weekHours: 0 };
    }
    const startOfWeek = new Date();
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const isoWeek = startOfWeek.toISOString().slice(0, 10);

    const [{ data: firm }, { data: config }, { data: expenses }, { data: scenarios }, { data: prefs }, { data: weekEntries }] = await Promise.all([
      supabase.from("firms").select("*").eq("id", profile.firm_id).single(),
      supabase.from("firm_config").select("*").eq("firm_id", profile.firm_id).maybeSingle(),
      supabase.from("expenses").select("*").eq("firm_id", profile.firm_id),
      supabase.from("scenarios").select("id, name, payload, created_at").eq("firm_id", profile.firm_id).order("created_at", { ascending: false }).limit(5),
      supabase.from("user_metric_prefs").select("hidden_metrics").eq("user_id", userId).maybeSingle(),
      supabase.from("time_entries").select("hrs, billable").eq("firm_id", profile.firm_id).gte("date", isoWeek),
    ]);
    const weekHours = (weekEntries ?? []).filter((t) => t.billable).reduce((s, t) => s + Number(t.hrs || 0), 0);
    return {
      profile, firm, config, expenses: expenses ?? [], scenarios: scenarios ?? [],
      prefs: { hidden_metrics: prefs?.hidden_metrics ?? [] },
      weekHours,
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