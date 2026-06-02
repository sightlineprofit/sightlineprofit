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
        scenarios: [], windowWeeks: 12, weeklyBuckets: [],
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
    // Weekly buckets (ISO week starting Monday) for last `windowWeeks` weeks.
    const buckets: Record<string, { billable: number; total: number }> = {};
    const weekStart = (d: Date) => {
      const x = new Date(d);
      const day = x.getUTCDay(); // 0 Sun .. 6 Sat
      const diff = (day + 6) % 7; // days since Monday
      x.setUTCDate(x.getUTCDate() - diff);
      x.setUTCHours(0, 0, 0, 0);
      return x.toISOString().slice(0, 10);
    };
    for (const t of entries ?? []) {
      if (!t.date) continue;
      const key = weekStart(new Date(t.date + "T00:00:00Z"));
      if (!buckets[key]) buckets[key] = { billable: 0, total: 0 };
      const h = Number(t.hrs || 0);
      buckets[key].total += h;
      if (t.billable) buckets[key].billable += h;
    }
    const weeklyBuckets = Object.entries(buckets)
      .map(([weekStart, v]) => ({ weekStart, ...v }))
      .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
    return {
      config, expenses: expenses ?? [], team: team ?? [], pipeline: pipeline ?? [],
      usageByUser, scenarios: scenarios ?? [], windowWeeks, weeklyBuckets,
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

export const saveCapacityIndicator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ value: z.enum(["yes", "no", "unsure", "unset"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("firm_id").eq("id", userId).single();
    if (!profile?.firm_id) throw new Error("No firm");
    const { error } = await supabase
      .from("firm_config")
      .update({ capacity_constrained_indicator: data.value, updated_at: new Date().toISOString() })
      .eq("firm_id", profile.firm_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });