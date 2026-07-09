import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calc as calcFinance, type Expense, type FirmConfig } from "@/lib/finance";

export const getProjectList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) return { projects: [], config: null };
    const [
      { data: projects },
      { data: phases },
      { data: config },
      { data: team },
      { data: expenses },
    ] = await Promise.all([
      supabase.from("projects").select("*").eq("firm_id", profile.firm_id).order("created_at", { ascending: false }),
      supabase.from("project_phases").select("project_id, expected_hrs, actual_hrs"),
      supabase.from("firm_config").select("*").eq("firm_id", profile.firm_id).maybeSingle(),
      supabase.from("profiles").select("id, cost_rate, billable_rate").eq("firm_id", profile.firm_id),
      supabase.from("expenses").select("*").eq("firm_id", profile.firm_id),
    ]);
    const totals: Record<string, { scoped: number; actual: number }> = {};
    for (const p of phases ?? []) {
      const t = (totals[p.project_id] ||= { scoped: 0, actual: 0 });
      t.scoped += Number(p.expected_hrs || 0);
      t.actual += Number(p.actual_hrs || 0);
    }

    const projectIds = (projects ?? []).map((p) => p.id);
    const { data: entries } = projectIds.length
      ? await supabase
          .from("time_entries")
          .select("project_id, user_id, hrs, billable, date")
          .in("project_id", projectIds)
      : { data: [] as Array<{ project_id: string | null; user_id: string; hrs: number; billable: boolean; date: string }> };

    // Pull most recent 'nothing_to_report' event per project so the freshness
    // clock resets on a legitimate override (see project detail page).
    const { data: ntrRows } = projectIds.length
      ? await supabase
          .from("project_activity_log")
          .select("project_id, occurred_at")
          .eq("event_type", "nothing_to_report")
          .in("project_id", projectIds)
          .order("occurred_at", { ascending: false })
      : { data: [] as Array<{ project_id: string; occurred_at: string }> };
    const lastNtrByProject = new Map<string, string>();
    for (const r of ntrRows ?? []) {
      if (!lastNtrByProject.has(r.project_id)) {
        // First hit is the most recent thanks to the order clause.
        // Store as YYYY-MM-DD so it composes with time_entries.date below.
        lastNtrByProject.set(r.project_id, String(r.occurred_at).slice(0, 10));
      }
    }

    const costRateByUser = new Map<string, number>();
    const billRateByUser = new Map<string, number>();
    for (const t of team ?? []) {
      if (t.cost_rate != null) costRateByUser.set(t.id, Number(t.cost_rate));
      if (t.billable_rate != null) billRateByUser.set(t.id, Number(t.billable_rate));
    }

    // Firm break-even as fallback cost rate
    const fin = calcFinance(config as FirmConfig | null, (expenses ?? []) as unknown as Expense[]);
    const firmBreakEven = Number(fin.breakEvenRate) || 0;
    const firmBilledRate = Number((config as { rate_billed?: number } | null)?.rate_billed) || 0;

    const now = Date.now();
    const weekAgo = now - 7 * 24 * 3600 * 1000;

    type Agg = {
      totalCost: number;
      weeklyCost: number;
      revenue: number;
      hasAnyEntry: boolean;
      usingFallbackCostRate: boolean;
      lastEntryAt: string | null;
    };
    const agg: Record<string, Agg> = {};
    for (const e of entries ?? []) {
      if (!e.project_id) continue;
      const a = (agg[e.project_id] ||= {
        totalCost: 0, weeklyCost: 0, revenue: 0, hasAnyEntry: false, usingFallbackCostRate: false, lastEntryAt: null,
      });
      a.hasAnyEntry = true;
      const hrs = Number(e.hrs || 0);
      let cr = costRateByUser.get(e.user_id);
      if (cr == null) { cr = firmBreakEven; a.usingFallbackCostRate = true; }
      const cost = hrs * (cr || 0);
      a.totalCost += cost;
      const ts = new Date(e.date).getTime();
      if (!Number.isNaN(ts) && ts >= weekAgo) a.weeklyCost += cost;
      if (!a.lastEntryAt || (e.date as string) > a.lastEntryAt) a.lastEntryAt = e.date as string;
      if (e.billable) {
        const br = billRateByUser.get(e.user_id) ?? firmBilledRate;
        a.revenue += hrs * (br || 0);
      }
    }

    return {
      config,
      projects: (projects ?? []).map((p) => {
        const a = agg[p.id] ?? { totalCost: 0, weeklyCost: 0, revenue: 0, hasAnyEntry: false, usingFallbackCostRate: false, lastEntryAt: null };
        const fixedFee = Number((p as { fixed_fee?: number | null }).fixed_fee) || 0;
        const scopedRate = Number(p.scoped_rate) || 0;
        const scopedHrs = totals[p.id]?.scoped ?? Number(p.scoped_hrs || 0);
        const mode: "fixed" | "hourly" | "none" = fixedFee > 0 ? "fixed" : scopedRate > 0 ? "hourly" : "none";
        let projectFee = 0;
        let marginRemaining: number | null = null;
        if (mode === "fixed") {
          projectFee = fixedFee;
          marginRemaining = projectFee - a.totalCost;
        } else if (mode === "hourly") {
          projectFee = scopedRate * scopedHrs;
          marginRemaining = (scopedRate * scopedHrs) - a.totalCost;
        }
        // Freshness computation.
        // lastActivityAt = MAX(most recent time entry, most recent
        // 'nothing_to_report' override). Real time entries live in
        // time_entries; the override lives in project_activity_log.
        const lastNtr = lastNtrByProject.get(p.id) ?? null;
        const lastActivityAt =
          a.lastEntryAt && lastNtr
            ? (a.lastEntryAt > lastNtr ? a.lastEntryAt : lastNtr)
            : (a.lastEntryAt ?? lastNtr);
        let daysSince: number | null = null;
        if (lastActivityAt) {
          const ts = new Date(lastActivityAt as string).getTime();
          if (!Number.isNaN(ts)) daysSince = Math.floor((now - ts) / (24 * 3600 * 1000));
        }
        // "new" = no history at all (no time entries, no NTR override) AND
        // the project hasn't started yet (or has no start date). Retroactive
        // projects (past start date, no entries) still surface as critical
        // so the user is prompted to backfill hours.
        const startRaw = (p as { start_date?: string | null }).start_date ?? null;
        const todayIso = new Date(now).toISOString().slice(0, 10);
        const hasHistory = a.hasAnyEntry || lastNtr != null;
        const notStarted = !startRaw || (startRaw as string) >= todayIso;
        let freshnessState: "new" | "current" | "stale" | "critical";
        if (!hasHistory && notStarted) freshnessState = "new";
        else if (daysSince == null) freshnessState = "critical";
        else if (daysSince < 7) freshnessState = "current";
        else if (daysSince <= 20) freshnessState = "stale";
        else freshnessState = "critical";
        return {
          ...p,
          totals: totals[p.id] ?? { scoped: Number(p.scoped_hrs || 0), actual: 0 },
          freshness: {
            lastEntryAt: lastActivityAt,
            daysSince,
            state: freshnessState,
          },
          margin: {
            mode,
            projectFee,
            totalCost: a.totalCost,
            weeklyCost: a.weeklyCost,
            revenue: a.revenue,
            remaining: marginRemaining,
            hasAnyEntry: a.hasAnyEntry,
            usingFallbackCostRate: a.usingFallbackCostRate,
          },
        };
      }),
    };
  });

export const getProjectDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id, role")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) throw new Error("No firm");
    const isPrincipal = profile.role === "principal";
    const isAdmin = profile.role === "principal" || profile.role === "admin";
    const [{ data: project }, { data: phases }, { data: entries }, { data: config }, { data: template }, { data: team }, { data: activityLog }, { data: milestones }] = await Promise.all([
      supabase.from("projects").select("*").eq("id", data.id).eq("firm_id", profile.firm_id).single(),
      supabase.from("project_phases").select("*").eq("project_id", data.id).order("sort_order"),
      supabase.from("time_entries").select("*").eq("project_id", data.id).order("date", { ascending: false }),
      supabase.from("firm_config").select("*").eq("firm_id", profile.firm_id).maybeSingle(),
      supabase.from("projects").select("sop_template_id").eq("id", data.id).single().then(async (r) => {
        const tid = r.data?.sop_template_id;
        if (!tid) return { data: null };
        return supabase.from("sop_templates").select("id, name, category").eq("id", tid).maybeSingle();
      }),
      supabase.from("profiles").select("id, name, email, cost_rate, billable_rate").eq("firm_id", profile.firm_id),
      supabase.from("project_activity_log").select("*").eq("project_id", data.id).order("occurred_at", { ascending: false }),
      supabase.from("project_milestones").select("*").eq("project_id", data.id).order("milestone_date"),
    ]);
    if (!project) throw new Error("Project not found");
    const phaseIds = (phases ?? []).map((p) => p.id);
    const { data: steps } = phaseIds.length
      ? await supabase.from("project_steps").select("*").in("project_phase_id", phaseIds).order("sort_order")
      : { data: [] as never[] };
    const { data: audit } = isPrincipal
      ? await supabase
          .from("project_financial_audit")
          .select("*")
          .eq("project_id", data.id)
          .order("changed_at", { ascending: false })
      : { data: [] as never[] };
    return {
      project,
      phases: phases ?? [],
      steps: steps ?? [],
      entries: entries ?? [],
      config,
      template,
      team: team ?? [],
      audit: audit ?? [],
      activityLog: activityLog ?? [],
      milestones: milestones ?? [],
      isPrincipal,
      isAdmin,
    };
  });

// Log a 'confirmed_reviewed' event and stamp projects.last_confirmed_at.
// Enabled only in State 2 (fresh but unconfirmed) client-side; server writes
// unconditionally so any RLS-authorized firm member can acknowledge.
export const confirmProjectReviewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("firm_id").eq("id", userId).single();
    if (!profile?.firm_id) throw new Error("No firm");
    const now = new Date().toISOString();
    const { error: logErr } = await supabase.from("project_activity_log").insert({
      project_id: data.project_id,
      firm_id: profile.firm_id,
      event_type: "confirmed_reviewed",
      occurred_at: now,
      logged_by: userId,
      note: null,
    });
    if (logErr) throw new Error(logErr.message);
    const { error: upErr } = await supabase
      .from("projects").update({ last_confirmed_at: now }).eq("id", data.project_id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true, last_confirmed_at: now };
  });

// Log a 'nothing_to_report' override. Requires the exact typed phrase to
// enforce deliberate friction. Also stamps last_confirmed_at (per spec,
// this doubles as confirmation) and — because lastActivityAt is derived as
// MAX(time_entries.date, nothing_to_report.occurred_at) — resets the
// freshness clock without a fabricated time entry.
export const NOTHING_TO_REPORT_PHRASE = "NOTHING TO REPORT";
export const logNothingToReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      project_id: z.string().uuid(),
      phrase: z.string(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.phrase.trim().toUpperCase() !== NOTHING_TO_REPORT_PHRASE) {
      throw new Error(`You must type "${NOTHING_TO_REPORT_PHRASE}" exactly to confirm.`);
    }
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("firm_id").eq("id", userId).single();
    if (!profile?.firm_id) throw new Error("No firm");
    const now = new Date().toISOString();
    const { error: logErr } = await supabase.from("project_activity_log").insert({
      project_id: data.project_id,
      firm_id: profile.firm_id,
      event_type: "nothing_to_report",
      occurred_at: now,
      logged_by: userId,
      note: data.phrase.trim(),
    });
    if (logErr) throw new Error(logErr.message);
    const { error: upErr } = await supabase
      .from("projects").update({ last_confirmed_at: now }).eq("id", data.project_id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true, last_confirmed_at: now };
  });

export const updateProjectStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum([
          "pursuit",
          "pipeline",
          "active",
          "invoiced",
          "collected",
          "completed",
          "on_hold",
        ]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("projects").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(160),
  client_name: z.string().trim().max(160).optional().nullable(),
  status: z.enum(["active", "pipeline", "completed", "on_hold"]).default("active"),
  scoped_rate: z.number().min(0).max(100000).optional().nullable(),
  fixed_fee: z.number().min(0).max(100000000).optional().nullable(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  sop_template_id: z.string().uuid().optional().nullable(),
  phases: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(160),
        expected_hrs: z.number().min(0).max(10000),
        billable: z.boolean().default(true),
      }),
    )
    .max(200)
    .optional()
    .nullable(),
});

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createProjectSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id, role")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) throw new Error("No firm");
    if (!["principal", "admin"].includes(profile.role as string)) throw new Error("Admin only");

    // If explicit phases are provided (wizard), use them. Otherwise, if a
    // template is attached, snapshot its phases (independent copy).
    let scopedHrs = 0;
    let tplPhases: { name: string; expected_hrs: number; billable: boolean; sort_order: number; id: string }[] = [];
    const customPhases = data.phases ?? null;
    if (customPhases && customPhases.length) {
      scopedHrs = customPhases.reduce((s, p) => s + Number(p.expected_hrs || 0), 0);
    } else if (data.sop_template_id) {
      const { data: phases } = await supabase
        .from("sop_phases")
        .select("id, name, expected_hrs, billable, sort_order")
        .eq("template_id", data.sop_template_id)
        .order("sort_order");
      tplPhases = phases ?? [];
      scopedHrs = tplPhases.reduce((s, p) => s + Number(p.expected_hrs || 0), 0);
    }

    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        firm_id: profile.firm_id,
        name: data.name,
        client_name: data.client_name ?? null,
        status: data.status,
        scoped_rate: data.scoped_rate ?? null,
        fixed_fee: data.fixed_fee ?? null,
        scoped_hrs: scopedHrs || null,
        start_date: data.start_date || null,
        end_date: data.end_date || null,
        sop_template_id: data.sop_template_id ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (customPhases && customPhases.length) {
      // Insert wizard-provided phases as a plain snapshot (no template link
      // per-phase). The project keeps its sop_template_id association if the
      // wizard was launched from a template.
      const rows = customPhases.map((p, i) => ({
        project_id: project.id,
        name: p.name,
        expected_hrs: Number(p.expected_hrs) || 0,
        billable: p.billable,
        sort_order: i,
        actual_hrs: 0,
      }));
      const { error: phErr } = await supabase.from("project_phases").insert(rows);
      if (phErr) throw new Error(phErr.message);
    } else if (tplPhases.length) {
      const phaseIds = tplPhases.map((p) => p.id);
      const { data: allSteps } = await supabase
        .from("sop_steps")
        .select("id, phase_id, description, estimated_hrs, sort_order")
        .in("phase_id", phaseIds)
        .order("sort_order");
      for (const p of tplPhases) {
        const { data: ins, error: phErr } = await supabase
          .from("project_phases")
          .insert({
            project_id: project.id,
            sop_phase_id: p.id,
            name: p.name,
            expected_hrs: p.expected_hrs,
            billable: p.billable,
            sort_order: p.sort_order,
            actual_hrs: 0,
          })
          .select("id")
          .single();
        if (phErr) throw new Error(phErr.message);
        const steps = (allSteps ?? []).filter((s) => s.phase_id === p.id);
        if (steps.length) {
          await supabase.from("project_steps").insert(
            steps.map((s) => ({
              project_phase_id: ins.id,
              sop_step_id: s.id,
              description: s.description,
              estimated_hrs: Number(s.estimated_hrs) || 0,
              template_estimated_hrs: Number(s.estimated_hrs) || 0,
              is_custom: false,
              sort_order: s.sort_order,
              actual_hrs: 0,
            })),
          );
        }
      }
    }
    return { id: project.id };
  });

const phaseUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  project_id: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  expected_hrs: z.number().min(0).max(10000),
  billable: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(1000).optional(),
});

export const upsertProjectPhase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => phaseUpsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.id) {
      const { error } = await supabase
        .from("project_phases")
        .update({
          name: data.name,
          expected_hrs: data.expected_hrs,
          billable: data.billable,
          ...(data.sort_order !== undefined ? { sort_order: data.sort_order } : {}),
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: existing } = await supabase
      .from("project_phases")
      .select("sort_order")
      .eq("project_id", data.project_id)
      .order("sort_order", { ascending: false })
      .limit(1);
    const nextOrder = data.sort_order ?? ((existing?.[0]?.sort_order ?? -1) + 1);
    const { data: row, error } = await supabase
      .from("project_phases")
      .insert({
        project_id: data.project_id,
        name: data.name,
        expected_hrs: data.expected_hrs,
        billable: data.billable,
        sort_order: nextOrder,
        actual_hrs: 0,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteProjectPhase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("project_phases").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateProjectMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(160).optional(),
      client_name: z.string().trim().max(160).optional().nullable(),
      scoped_rate: z.number().min(0).max(100000).optional().nullable(),
      fixed_fee: z.number().min(0).max(100000000).optional().nullable(),
      start_date: z.string().optional().nullable(),
      end_date: z.string().optional().nullable(),
      est_weekly_hrs: z.number().min(0).max(200).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { id, ...patch } = data;
    const { error } = await supabase.from("projects").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Milestones ------------------------------------------------------------

export const saveProjectMilestone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid().optional(),
      project_id: z.string().uuid(),
      label: z.string().trim().min(1).max(120),
      milestone_date: z.string().min(4),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("firm_id").eq("id", userId).single();
    if (!profile?.firm_id) throw new Error("No firm");
    if (data.id) {
      const { error } = await supabase.from("project_milestones")
        .update({ label: data.label, milestone_date: data.milestone_date })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase.from("project_milestones")
      .insert({
        project_id: data.project_id,
        firm_id: profile.firm_id,
        label: data.label,
        milestone_date: data.milestone_date,
      })
      .select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteProjectMilestone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("project_milestones").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Financial mutations (principal-only) -----------------------------------

async function ensurePrincipal(supabase: any, userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("firm_id, role")
    .eq("id", userId)
    .single();
  if (!profile?.firm_id) throw new Error("No firm");
  if (profile.role !== "principal") {
    throw new Error("Only the firm principal can change financial parameters");
  }
  return { firmId: profile.firm_id as string };
}

export const updateProjectFinancial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      project_id: z.string().uuid(),
      scoped_rate: z.number().min(0).max(100000).nullable().optional(),
      fixed_fee: z.number().min(0).max(100000000).nullable().optional(),
      reason: z.string().trim().max(500).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { firmId } = await ensurePrincipal(supabase, userId);
    const { data: existing } = await supabase
      .from("projects")
      .select("id, firm_id, scoped_rate, fixed_fee")
      .eq("id", data.project_id)
      .eq("firm_id", firmId)
      .single();
    if (!existing) throw new Error("Project not found");

    const audits: { field_changed: string; old_value: string | null; new_value: string | null }[] = [];
    const patch: { scoped_rate?: number | null; fixed_fee?: number | null } = {};
    if (data.scoped_rate !== undefined) {
      const oldVal = existing.scoped_rate == null ? null : String(existing.scoped_rate);
      const newVal = data.scoped_rate == null ? null : String(data.scoped_rate);
      if (oldVal !== newVal) {
        patch.scoped_rate = data.scoped_rate;
        audits.push({ field_changed: "scoped_rate", old_value: oldVal, new_value: newVal });
      }
    }
    if (data.fixed_fee !== undefined) {
      const oldVal = (existing as { fixed_fee?: number | null }).fixed_fee == null
        ? null
        : String((existing as { fixed_fee?: number | null }).fixed_fee);
      const newVal = data.fixed_fee == null ? null : String(data.fixed_fee);
      if (oldVal !== newVal) {
        patch.fixed_fee = data.fixed_fee;
        audits.push({ field_changed: "fixed_fee", old_value: oldVal, new_value: newVal });
      }
    }
    if (Object.keys(patch).length === 0) return { ok: true, changed: 0 };

    const { error } = await supabase.from("projects").update(patch).eq("id", data.project_id);
    if (error) throw new Error(error.message);
    if (audits.length) {
      await supabase.from("project_financial_audit").insert(
        audits.map((a) => ({
          ...a,
          project_id: data.project_id,
          firm_id: firmId,
          changed_by: userId,
          reason: data.reason ?? null,
        })),
      );
    }
    return { ok: true, changed: audits.length };
  });

export const updateProjectPhaseFinancial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      expected_hrs: z.number().min(0).max(10000).optional(),
      billable: z.boolean().optional(),
      reason: z.string().trim().max(500).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { firmId } = await ensurePrincipal(supabase, userId);
    const { data: phase } = await supabase
      .from("project_phases")
      .select("id, name, expected_hrs, billable, project_id, projects:project_id(firm_id)")
      .eq("id", data.id)
      .single();
    if (!phase) throw new Error("Phase not found");
    const phaseFirmId = (phase as any).projects?.firm_id;
    if (phaseFirmId !== firmId) throw new Error("Not allowed");

    const audits: { field_changed: string; old_value: string | null; new_value: string | null }[] = [];
    const patch: { expected_hrs?: number; billable?: boolean } = {};
    if (data.expected_hrs !== undefined && Number(phase.expected_hrs) !== data.expected_hrs) {
      patch.expected_hrs = data.expected_hrs;
      audits.push({
        field_changed: `phase_expected_hrs:${phase.name}`,
        old_value: String(phase.expected_hrs ?? 0),
        new_value: String(data.expected_hrs),
      });
    }
    if (data.billable !== undefined && phase.billable !== data.billable) {
      patch.billable = data.billable;
      audits.push({
        field_changed: `phase_billable:${phase.name}`,
        old_value: phase.billable ? "true" : "false",
        new_value: data.billable ? "true" : "false",
      });
    }
    if (Object.keys(patch).length === 0) return { ok: true, changed: 0 };

    const { error } = await supabase.from("project_phases").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    if (audits.length) {
      await supabase.from("project_financial_audit").insert(
        audits.map((a) => ({
          ...a,
          project_id: phase.project_id,
          firm_id: firmId,
          changed_by: userId,
          reason: data.reason ?? null,
        })),
      );
    }
    return { ok: true, changed: audits.length };
  });

// Lightweight patch for time entries (no time recomputation) — reassign phase,
// flip billable, or edit notes after the fact. Used by the Time Log tab.
export const patchTimeEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      project_phase_id: z.string().uuid().nullable().optional(),
      billable: z.boolean().optional(),
      notes: z.string().max(500).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: prev } = await supabase
      .from("time_entries")
      .select("project_phase_id, hrs")
      .eq("id", data.id)
      .single();
    const patch: { project_phase_id?: string | null; billable?: boolean; notes?: string | null } = {};
    if (data.project_phase_id !== undefined) patch.project_phase_id = data.project_phase_id;
    if (data.billable !== undefined) patch.billable = data.billable;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabase.from("time_entries").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    // Recompute phase actuals for any affected phase
    const toRecount = new Set<string>();
    if (prev?.project_phase_id) toRecount.add(prev.project_phase_id as string);
    if (data.project_phase_id) toRecount.add(data.project_phase_id);
    for (const phaseId of toRecount) {
      const { data: rows } = await supabase.from("time_entries").select("hrs").eq("project_phase_id", phaseId);
      const total = (rows ?? []).reduce((s: number, r: { hrs: number | null }) => s + Number(r.hrs || 0), 0);
      const { data: ph } = await supabase.from("project_phases").select("expected_hrs").eq("id", phaseId).maybeSingle();
      const expected = Number(ph?.expected_hrs ?? 0);
      await supabase.from("project_phases").update({ actual_hrs: total, phase_over_scope: total > expected }).eq("id", phaseId);
    }
    return { ok: true };
  });

export const listSopTemplatesLite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("firm_id").eq("id", userId).single();
    if (!profile?.firm_id) return { templates: [] };
    const { data: templates } = await supabase
      .from("sop_templates")
      .select("id, name, category")
      .eq("firm_id", profile.firm_id)
      .order("name");
    return { templates: templates ?? [] };
  });
// --- Project step (process step) mutations ----------------------------------

async function recomputePhaseExpectedFromSteps(supabase: any, phaseId: string) {
  const { data: rows } = await supabase
    .from("project_steps")
    .select("estimated_hrs")
    .eq("project_phase_id", phaseId);
  const total = (rows ?? []).reduce(
    (s: number, r: { estimated_hrs: number | null }) => s + Number(r.estimated_hrs || 0),
    0,
  );
  const { data: ph } = await supabase
    .from("project_phases")
    .select("actual_hrs")
    .eq("id", phaseId)
    .maybeSingle();
  const actual = Number(ph?.actual_hrs ?? 0);
  await supabase
    .from("project_phases")
    .update({ expected_hrs: total, phase_over_scope: actual > total })
    .eq("id", phaseId);
}

export const updateProjectStepHrs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      estimated_hrs: z.number().min(0).max(999),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: existing } = await supabase
      .from("project_steps")
      .select("id, project_phase_id")
      .eq("id", data.id)
      .single();
    if (!existing) throw new Error("Step not found");
    const { error } = await supabase
      .from("project_steps")
      .update({ estimated_hrs: data.estimated_hrs })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await recomputePhaseExpectedFromSteps(supabase, existing.project_phase_id as string);
    return { ok: true };
  });

export const createProjectStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      project_phase_id: z.string().uuid(),
      description: z.string().trim().min(1).max(500),
      estimated_hrs: z.number().min(0).max(999),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: existing } = await supabase
      .from("project_steps")
      .select("sort_order")
      .eq("project_phase_id", data.project_phase_id)
      .order("sort_order", { ascending: false })
      .limit(1);
    const nextOrder = ((existing?.[0]?.sort_order ?? -1) + 1);
    const { data: row, error } = await supabase
      .from("project_steps")
      .insert({
        project_phase_id: data.project_phase_id,
        description: data.description,
        estimated_hrs: data.estimated_hrs,
        sort_order: nextOrder,
        actual_hrs: 0,
        is_custom: true,
        sop_step_id: null,
        template_estimated_hrs: null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await recomputePhaseExpectedFromSteps(supabase, data.project_phase_id);
    return { id: row.id };
  });

export const deleteProjectStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: existing } = await supabase
      .from("project_steps")
      .select("id, project_phase_id, is_custom")
      .eq("id", data.id)
      .single();
    if (!existing) throw new Error("Step not found");
    if (!existing.is_custom) throw new Error("Only custom steps can be deleted");
    const { error } = await supabase.from("project_steps").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await recomputePhaseExpectedFromSteps(supabase, existing.project_phase_id as string);
    return { ok: true };
  });
