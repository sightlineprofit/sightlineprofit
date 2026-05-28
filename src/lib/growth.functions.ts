import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getGrowthData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) {
      return {
        config: null, expenses: [], team: [], pipeline: [], usageByUser: {},
        scenarios: [], windowWeeks: 12,
      };
    }
    const windowWeeks = 12;
    const since = new Date();
    since.setDate(since.getDate() - windowWeeks * 7);
    const sinceIso = since.toISOString().slice(0, 10);

    const [{ data: config }, { data: expenses }, { data: team }, { data: pipeline }, { data: entries }, { data: scenarios }] =
      await Promise.all([
        supabase.from("firm_config").select("*").eq("firm_id", profile.firm_id).maybeSingle(),
        supabase.from("expenses").select("*").eq("firm_id", profile.firm_id),
        supabase
          .from("profiles")
          .select("id, name, email, role, billable_rate, cost_rate, expected_hrs_per_week, weeks_per_year, billable_pct")
          .eq("firm_id", profile.firm_id)
          .order("created_at", { ascending: true }),
        supabase.from("pipeline_projects").select("*").eq("firm_id", profile.firm_id),
        supabase
          .from("time_entries")
          .select("user_id, hrs, billable, date")
          .eq("firm_id", profile.firm_id)
          .gte("date", sinceIso),
        supabase
          .from("scenarios")
          .select("id, name, payload, created_at")
          .eq("firm_id", profile.firm_id)
          .order("created_at", { ascending: false }),
      ]);

    const usageByUser: Record<string, { billable: number; total: number }> = {};
    for (const t of entries ?? []) {
      const u = t.user_id as string;
      if (!usageByUser[u]) usageByUser[u] = { billable: 0, total: 0 };
      const h = Number(t.hrs || 0);
      usageByUser[u].total += h;
      if (t.billable) usageByUser[u].billable += h;
    }
    return {
      config, expenses: expenses ?? [], team: team ?? [], pipeline: pipeline ?? [],
      usageByUser, scenarios: scenarios ?? [], windowWeeks,
    };
  });

export const saveGrowthScenario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().trim().min(1).max(80),
      payload: z.record(z.string(), z.any()),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("firm_id").eq("id", userId).single();
    if (!profile?.firm_id) throw new Error("No firm");
    const payload = { ...data.payload, kind: "growth" };
    if (data.id) {
      const { data: row, error } = await supabase
        .from("scenarios")
        .update({ name: data.name, payload, updated_at: new Date().toISOString() })
        .eq("id", data.id)
        .eq("firm_id", profile.firm_id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await supabase
      .from("scenarios")
      .insert({ firm_id: profile.firm_id, created_by: userId, name: data.name, payload })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteScenario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("scenarios").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });