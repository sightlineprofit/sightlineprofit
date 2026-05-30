import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    const [{ data: projects }, { data: phases }, { data: config }] = await Promise.all([
      supabase.from("projects").select("*").eq("firm_id", profile.firm_id).order("created_at", { ascending: false }),
      supabase.from("project_phases").select("project_id, expected_hrs, actual_hrs"),
      supabase.from("firm_config").select("*").eq("firm_id", profile.firm_id).maybeSingle(),
    ]);
    const totals: Record<string, { scoped: number; actual: number }> = {};
    for (const p of phases ?? []) {
      const t = (totals[p.project_id] ||= { scoped: 0, actual: 0 });
      t.scoped += Number(p.expected_hrs || 0);
      t.actual += Number(p.actual_hrs || 0);
    }
    return {
      config,
      projects: (projects ?? []).map((p) => ({
        ...p,
        totals: totals[p.id] ?? { scoped: Number(p.scoped_hrs || 0), actual: 0 },
      })),
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
    const [{ data: project }, { data: phases }, { data: entries }, { data: config }, { data: template }, { data: team }] = await Promise.all([
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
      isPrincipal,
      isAdmin,
    };
  });

export const updateProjectStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["active", "pipeline", "completed", "on_hold"]),
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
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  sop_template_id: z.string().uuid().optional().nullable(),
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

    // If a template is attached, snapshot its phases (independent copy).
    let scopedHrs = 0;
    let tplPhases: { name: string; expected_hrs: number; billable: boolean; sort_order: number; id: string }[] = [];
    if (data.sop_template_id) {
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
        scoped_hrs: scopedHrs || null,
        start_date: data.start_date || null,
        end_date: data.end_date || null,
        sop_template_id: data.sop_template_id ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (tplPhases.length) {
      const phaseIds = tplPhases.map((p) => p.id);
      const { data: allSteps } = await supabase
        .from("sop_steps")
        .select("phase_id, description, estimated_hrs, sort_order")
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
              description: s.description,
              estimated_hrs: Number(s.estimated_hrs) || 0,
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
      start_date: z.string().optional().nullable(),
      end_date: z.string().optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { id, ...patch } = data;
    const { error } = await supabase.from("projects").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });