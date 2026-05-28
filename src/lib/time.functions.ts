import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeStr = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);

function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(0, eh + em / 60 - (sh + sm / 60));
}

export const getCalendarData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ weekStart: dateStr }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, firm_id, role, billable_rate")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) {
      return {
        profile, config: null, weekStart: data.weekStart, entries: [],
        projects: [], phases: [], activityGroups: [], team: [],
      };
    }
    const start = new Date(data.weekStart + "T00:00:00");
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const endIso = end.toISOString().slice(0, 10);

    const isAdmin = ["principal", "admin"].includes(profile.role as string);

    let entriesQ = supabase
      .from("time_entries")
      .select("*")
      .eq("firm_id", profile.firm_id)
      .gte("date", data.weekStart)
      .lt("date", endIso);
    if (!isAdmin) entriesQ = entriesQ.eq("user_id", userId);

    const [{ data: entries }, { data: projects }, { data: phases }, { data: ags }, { data: team }, { data: config }] =
      await Promise.all([
        entriesQ,
        supabase.from("projects").select("id, name, client_name, scoped_rate, status").eq("firm_id", profile.firm_id).order("name"),
        supabase.from("project_phases").select("*"),
        supabase.from("activity_groups").select("*").eq("firm_id", profile.firm_id).order("name"),
        supabase
          .from("profiles")
          .select("id, name, email, role, billable_rate, expected_hrs_per_week, billable_pct")
          .eq("firm_id", profile.firm_id)
          .order("name"),
        supabase.from("firm_config").select("*").eq("firm_id", profile.firm_id).maybeSingle(),
      ]);

    // filter phases to firm projects (no firm_id on phases table)
    const projectIds = new Set((projects ?? []).map((p) => p.id));
    const phasesScoped = (phases ?? []).filter((p) => projectIds.has(p.project_id));

    return {
      profile, config, weekStart: data.weekStart,
      entries: entries ?? [], projects: projects ?? [],
      phases: phasesScoped, activityGroups: ags ?? [], team: team ?? [],
    };
  });

const entrySchema = z.object({
  id: z.string().uuid().optional(),
  date: dateStr,
  start_time: timeStr,
  end_time: timeStr,
  billable: z.boolean(),
  notes: z.string().max(500).optional().nullable(),
  project_id: z.string().uuid().optional().nullable(),
  project_phase_id: z.string().uuid().optional().nullable(),
  activity_group_id: z.string().uuid().optional().nullable(),
  user_id: z.string().uuid().optional(), // admin can set, else defaults to self
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recomputePhaseActual(supabase: any, phaseId: string): Promise<void> {
  const { data } = await supabase.from("time_entries").select("hrs").eq("project_phase_id", phaseId);
  const total = (data ?? []).reduce((s: number, r: { hrs: number | null }) => s + Number(r.hrs || 0), 0);
  await supabase.from("project_phases").update({ actual_hrs: total }).eq("id", phaseId);
}

export const saveTimeEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => entrySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id, role")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) throw new Error("No firm");
    const isAdmin = ["principal", "admin"].includes(profile.role as string);
    const targetUser = isAdmin && data.user_id ? data.user_id : userId;
    const hrs = hoursBetween(data.start_time, data.end_time);
    if (hrs <= 0) throw new Error("End time must be after start time");

    const row = {
      firm_id: profile.firm_id,
      user_id: targetUser,
      date: data.date,
      start_time: data.start_time,
      end_time: data.end_time,
      hrs,
      billable: data.billable,
      notes: data.notes ?? null,
      project_id: data.project_id ?? null,
      project_phase_id: data.project_phase_id ?? null,
      activity_group_id: data.activity_group_id ?? null,
    };

    let previousPhase: string | null = null;
    if (data.id) {
      const { data: prev } = await supabase.from("time_entries").select("project_phase_id").eq("id", data.id).single();
      previousPhase = (prev?.project_phase_id as string | null) ?? null;
      const { error } = await supabase.from("time_entries").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("time_entries").insert(row);
      if (error) throw new Error(error.message);
    }

    // Recompute phase actuals (current + previous if changed)
    const toRecount = new Set<string>();
    if (row.project_phase_id) toRecount.add(row.project_phase_id);
    if (previousPhase && previousPhase !== row.project_phase_id) toRecount.add(previousPhase);
    for (const phaseId of toRecount) {
      await recomputePhaseActual(supabase, phaseId);
    }
    return { ok: true };
  });

export const deleteTimeEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: prev } = await supabase.from("time_entries").select("project_phase_id").eq("id", data.id).single();
    const { error } = await supabase.from("time_entries").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (prev?.project_phase_id) {
      await recomputePhaseActual(supabase, prev.project_phase_id as string);
    }
    return { ok: true };
  });

const targetsSchema = z.object({
  target_billable_hrs_per_week: z.number().min(0).max(168).optional().nullable(),
  rate_billed: z.number().min(0).max(100000).optional().nullable(),
});

export const updateTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => targetsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("firm_id, role").eq("id", userId).single();
    if (!profile?.firm_id) throw new Error("No firm");
    if (!["principal", "admin"].includes(profile.role as string)) throw new Error("Not allowed");
    const { error } = await supabase
      .from("firm_config")
      .upsert({ firm_id: profile.firm_id, ...data, updated_at: new Date().toISOString() }, { onConflict: "firm_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });