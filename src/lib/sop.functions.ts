import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const phaseSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  expected_hrs: z.number().min(0).max(10000),
  billable: z.boolean(),
  description: z.string().max(2000).optional().nullable(),
  time_benchmark_notes: z.string().max(2000).optional().nullable(),
  sort_order: z.number().int(),
  steps: z.array(
    z.object({
      id: z.string().uuid().optional(),
      description: z.string().min(1).max(500),
      sort_order: z.number().int(),
    }),
  ),
});

const templateSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(160),
  category: z.string().max(120).optional().nullable(),
  department: z.string().max(120).optional().nullable(),
  description: z.string().max(4000).optional().nullable(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional().nullable(),
  triggered_by: z.string().max(500).optional().nullable(),
  done_when: z.string().max(500).optional().nullable(),
  scope_risk_level: z.enum(["low", "medium", "high"]),
  common_failure_modes: z.string().max(4000).optional().nullable(),
  phases: z.array(phaseSchema).max(40),
});

export const getSopLibrary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id, role")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) {
      return { templates: [], phases: [], steps: [], config: null, lastUsed: {} };
    }
    const [{ data: templates }, { data: phases }, { data: config }, { data: projects }] = await Promise.all([
      supabase.from("sop_templates").select("*").eq("firm_id", profile.firm_id).order("created_at", { ascending: false }),
      supabase.from("sop_phases").select("*").eq("firm_id", profile.firm_id).order("sort_order"),
      supabase.from("firm_config").select("*").eq("firm_id", profile.firm_id).maybeSingle(),
      supabase.from("projects").select("id, sop_template_id, created_at").eq("firm_id", profile.firm_id),
    ]);
    const phaseIds = (phases ?? []).map((p) => p.id);
    const { data: steps } = phaseIds.length
      ? await supabase.from("sop_steps").select("*").in("phase_id", phaseIds).order("sort_order")
      : { data: [] as never[] };

    const lastUsed: Record<string, string> = {};
    for (const p of projects ?? []) {
      if (p.sop_template_id && (!lastUsed[p.sop_template_id] || p.created_at > lastUsed[p.sop_template_id])) {
        lastUsed[p.sop_template_id] = p.created_at;
      }
    }
    return {
      templates: templates ?? [],
      phases: phases ?? [],
      steps: steps ?? [],
      config,
      lastUsed,
    };
  });

export const saveSopTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => templateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("firm_id, role").eq("id", userId).single();
    if (!profile?.firm_id) throw new Error("No firm");
    if (!["principal", "admin"].includes(profile.role as string)) throw new Error("Admin only");

    const tplBody = {
      firm_id: profile.firm_id,
      name: data.name,
      category: data.category ?? null,
      department: data.department ?? null,
      description: data.description ?? null,
      tags: data.tags ?? null,
      triggered_by: data.triggered_by ?? null,
      done_when: data.done_when ?? null,
      scope_risk_level: data.scope_risk_level,
      common_failure_modes: data.common_failure_modes ?? null,
    };
    let templateId = data.id;
    if (templateId) {
      const { error } = await supabase.from("sop_templates").update(tplBody).eq("id", templateId);
      if (error) throw new Error(error.message);
    } else {
      const { data: ins, error } = await supabase.from("sop_templates").insert(tplBody).select("id").single();
      if (error) throw new Error(error.message);
      templateId = ins.id;
    }

    // Phases: delete removed, upsert remaining
    const { data: existing } = await supabase.from("sop_phases").select("id").eq("template_id", templateId);
    const keptIds = new Set(data.phases.filter((p) => p.id).map((p) => p.id as string));
    const toDelete = (existing ?? []).filter((p) => !keptIds.has(p.id)).map((p) => p.id);
    if (toDelete.length) {
      await supabase.from("sop_steps").delete().in("phase_id", toDelete);
      await supabase.from("sop_phases").delete().in("id", toDelete);
    }
    for (const ph of data.phases) {
      const phBody = {
        firm_id: profile.firm_id,
        template_id: templateId,
        name: ph.name,
        expected_hrs: ph.expected_hrs,
        billable: ph.billable,
        description: ph.description ?? null,
        time_benchmark_notes: ph.time_benchmark_notes ?? null,
        sort_order: ph.sort_order,
      };
      let phaseId = ph.id;
      if (phaseId) {
        await supabase.from("sop_phases").update(phBody).eq("id", phaseId);
      } else {
        const { data: pi, error } = await supabase.from("sop_phases").insert(phBody).select("id").single();
        if (error) throw new Error(error.message);
        phaseId = pi.id;
      }
      // Replace steps for this phase
      await supabase.from("sop_steps").delete().eq("phase_id", phaseId);
      if (ph.steps.length) {
        await supabase.from("sop_steps").insert(
          ph.steps.map((s) => ({
            phase_id: phaseId!,
            description: s.description,
            sort_order: s.sort_order,
          })),
        );
      }
    }
    return { id: templateId };
  });

export const deleteSopTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: phases } = await supabase.from("sop_phases").select("id").eq("template_id", data.id);
    const ids = (phases ?? []).map((p) => p.id);
    if (ids.length) {
      await supabase.from("sop_steps").delete().in("phase_id", ids);
      await supabase.from("sop_phases").delete().in("id", ids);
    }
    const { error } = await supabase.from("sop_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const attachSchema = z.object({
  template_id: z.string().uuid(),
  project_name: z.string().min(1).max(160),
  client_name: z.string().max(160).optional().nullable(),
});

export const attachTemplateToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => attachSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("firm_id, role").eq("id", userId).single();
    if (!profile?.firm_id) throw new Error("No firm");
    if (!["principal", "admin"].includes(profile.role as string)) throw new Error("Admin only");

    const [{ data: tpl }, { data: phases }] = await Promise.all([
      supabase.from("sop_templates").select("*").eq("id", data.template_id).single(),
      supabase.from("sop_phases").select("*").eq("template_id", data.template_id).order("sort_order"),
    ]);
    if (!tpl) throw new Error("Template not found");
    const scopedHrs = (phases ?? []).reduce((s, p) => s + Number(p.expected_hrs || 0), 0);

    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        firm_id: profile.firm_id,
        name: data.project_name,
        client_name: data.client_name ?? null,
        sop_template_id: data.template_id,
        scoped_hrs: scopedHrs,
        status: "active",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (phases?.length) {
      await supabase.from("project_phases").insert(
        phases.map((p) => ({
          project_id: project.id,
          sop_phase_id: p.id,
          name: p.name,
          expected_hrs: p.expected_hrs,
          billable: p.billable,
          sort_order: p.sort_order,
          actual_hrs: 0,
        })),
      );
    }
    return { id: project.id };
  });