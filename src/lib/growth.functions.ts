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
        completedProjects: [], completedPhases: [],
        projectStartLag: [], projectFlow: { started: 0, completed: 0 },
        ownerComp: [], teamBurdens: [],
      };
    }
    const windowWeeks = 12;
    const since = new Date();
    since.setDate(since.getDate() - windowWeeks * 7);
    const sinceIso = since.toISOString().slice(0, 10);
    const since6moIso = (() => {
      const d = new Date(); d.setMonth(d.getMonth() - 6);
      return d.toISOString().slice(0, 10);
    })();
    const since12moIso = (() => {
      const d = new Date(); d.setMonth(d.getMonth() - 12);
      return d.toISOString().slice(0, 10);
    })();
    const since90dIso = (() => {
      const d = new Date(); d.setDate(d.getDate() - 90);
      return d.toISOString().slice(0, 10);
    })();

    const [
      { data: config }, { data: expenses }, { data: team }, { data: pipeline },
      { data: entries }, { data: scenarios },
      { data: completedProjectsRaw }, { data: completedPhasesRaw },
      { data: projectsAllRecent }, { data: firstEntriesRaw },
      { data: ownerComp }, { data: teamBurdens },
    ] =
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
        // Completed projects in last 12 months (uses end_date when set, falls back to created_at)
        supabase
          .from("projects")
          .select("id, name, status, fixed_fee, scoped_hrs, scoped_rate, end_date, created_at")
          .eq("firm_id", profile.firm_id)
          .in("status", ["completed", "invoiced", "collected"]),
        // All phases for those completed projects to compute scope creep / time cost.
        supabase
          .from("project_phases")
          .select("id, project_id, expected_hrs, actual_hrs"),
        // All projects created in last 90d (for start vs close)
        supabase
          .from("projects")
          .select("id, status, created_at, end_date")
          .eq("firm_id", profile.firm_id)
          .gte("created_at", since90dIso),
        // First time entry per project in last 6 months for contract→kickoff lag
        supabase
          .from("time_entries")
          .select("project_id, date")
          .eq("firm_id", profile.firm_id)
          .not("project_id", "is", null)
          .gte("date", since6moIso),
        supabase.from("owner_compensation").select("*").eq("firm_id", profile.firm_id),
        supabase
          .from("firm_members")
          .select("burdened_weekly_cost, weeks_per_year, role_type, expected_hrs_per_week, billed_rate")
          .eq("firm_id", profile.firm_id)
          .eq("is_active", true)
          .neq("role_type", "principal"),
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

    // ── Completed projects (last 12 months) with time cost ─────────────
    const phasesByProject: Record<string, { expected: number; actual: number }> = {};
    for (const ph of completedPhasesRaw ?? []) {
      const pid = ph.project_id as string;
      if (!phasesByProject[pid]) phasesByProject[pid] = { expected: 0, actual: 0 };
      phasesByProject[pid].expected += Number(ph.expected_hrs || 0);
      phasesByProject[pid].actual += Number(ph.actual_hrs || 0);
    }
    // Approximate firm cost rate (avg of team cost_rate) for time_cost
    const costRates = (team ?? [])
      .map((m) => Number(m.cost_rate || 0))
      .filter((n) => n > 0);
    const avgCostRate = costRates.length
      ? costRates.reduce((a, b) => a + b, 0) / costRates.length
      : 0;
    const completedProjects = (completedProjectsRaw ?? [])
      .filter((p) => {
        const closeIso = (p.end_date || p.created_at || "").slice(0, 10);
        return closeIso >= since12moIso;
      })
      .map((p) => {
        const ph = phasesByProject[p.id] ?? { expected: 0, actual: 0 };
        const fee = Number(p.fixed_fee || 0) ||
          (Number(p.scoped_hrs || 0) * Number(p.scoped_rate || 0));
        const timeCost = ph.actual * avgCostRate;
        return {
          id: p.id,
          name: p.name,
          fee,
          timeCost,
          margin: fee - timeCost,
          expectedHrs: ph.expected,
          actualHrs: ph.actual,
          closedAt: (p.end_date || p.created_at || "").slice(0, 10),
        };
      });

    // Completed phases for scope creep in last 6mo
    const recent6moProjectIds = new Set(
      (completedProjectsRaw ?? [])
        .filter((p) => ((p.end_date || p.created_at || "").slice(0, 10) >= since6moIso))
        .map((p) => p.id),
    );
    const completedPhases = (completedPhasesRaw ?? [])
      .filter((ph) => recent6moProjectIds.has(ph.project_id as string))
      .map((ph) => ({
        expectedHrs: Number(ph.expected_hrs || 0),
        actualHrs: Number(ph.actual_hrs || 0),
      }));

    // Project flow last 90d
    const flow = { started: 0, completed: 0 };
    for (const p of projectsAllRecent ?? []) {
      flow.started += 1;
      if (["completed", "invoiced", "collected"].includes(p.status as string)) {
        flow.completed += 1;
      }
    }

    // Contract→kickoff lag: per completed project in last 6mo, days from created_at → first entry
    const firstEntryByProject: Record<string, string> = {};
    for (const e of firstEntriesRaw ?? []) {
      const pid = e.project_id as string;
      const d = e.date as string;
      if (!firstEntryByProject[pid] || d < firstEntryByProject[pid]) {
        firstEntryByProject[pid] = d;
      }
    }
    const projectStartLag: { id: string; days: number }[] = [];
    for (const p of completedProjectsRaw ?? []) {
      const closeIso = (p.end_date || p.created_at || "").slice(0, 10);
      if (closeIso < since6moIso) continue;
      const first = firstEntryByProject[p.id];
      if (!first || !p.created_at) continue;
      const created = new Date(p.created_at);
      const firstD = new Date(first + "T00:00:00Z");
      const days = Math.round((firstD.getTime() - created.getTime()) / 86400000);
      if (days >= 0 && days < 365) projectStartLag.push({ id: p.id, days });
    }

    return {
      config, expenses: expenses ?? [], team: team ?? [], pipeline: pipeline ?? [],
      usageByUser, scenarios: scenarios ?? [], windowWeeks, weeklyBuckets,
      completedProjects, completedPhases, projectStartLag, projectFlow: flow,
      ownerComp: ownerComp ?? [], teamBurdens: teamBurdens ?? [],
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

export const saveGrowthSignals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      patch: z.record(z.string(), z.any()),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("firm_id").eq("id", userId).single();
    if (!profile?.firm_id) throw new Error("No firm");
    const { data: current } = await supabase
      .from("firm_config")
      .select("growth_signals")
      .eq("firm_id", profile.firm_id)
      .maybeSingle();
    const existing = ((current as unknown as { growth_signals?: Record<string, unknown> } | null)
      ?.growth_signals) ?? {};
    const merged = {
      ...existing,
      ...data.patch,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("firm_config")
      .update({ growth_signals: merged, updated_at: new Date().toISOString() })
      .eq("firm_id", profile.firm_id);
    if (error) throw new Error(error.message);
    return { ok: true, growth_signals: merged };
  });