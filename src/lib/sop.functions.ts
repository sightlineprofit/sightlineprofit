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
      estimated_hrs: z.number().min(0).max(10000).default(0),
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
      return { templates: [], phases: [], steps: [], projects: [], config: null, lastUsed: {}, usageCounts: {}, activeUsageCounts: {}, hiddenIds: [], role: profile?.role ?? "team" };
    }
    const [{ data: templates }, { data: phases }, { data: config }, { data: projectsRaw }, { data: prefs }] = await Promise.all([
      supabase.from("sop_templates").select("*").eq("firm_id", profile.firm_id).is("deleted_at", null).order("created_at", { ascending: false }),
      supabase.from("sop_phases").select("*").eq("firm_id", profile.firm_id).order("sort_order"),
      supabase.from("firm_config").select("*").eq("firm_id", profile.firm_id).maybeSingle(),
      supabase.from("projects")
        .select("id, name, client_name, status, sop_template_id, created_at")
        .eq("firm_id", profile.firm_id)
        .order("created_at", { ascending: false }),
      (supabase.from("user_sop_preferences" as never) as never as { select: (s: string) => { eq: (k: string, v: string) => Promise<{ data: Array<{ template_id: string; hidden: boolean }> | null }> } })
        .select("template_id, hidden")
        .eq("user_id", userId),
    ]);
    const projects = projectsRaw ?? [];
    const phaseIds = (phases ?? []).map((p) => p.id);
    const { data: steps } = phaseIds.length
      ? await supabase.from("sop_steps").select("*").in("phase_id", phaseIds).order("sort_order")
      : { data: [] as never[] };

    const stepIds = (steps ?? []).map((s: { id: string }) => s.id);
    const [{ data: stepAssignees }, picker] = stepIds.length
      ? await Promise.all([
          supabase.from("sop_step_assignees").select("*").in("sop_step_id", stepIds),
          import("@/lib/project-cost-snapshot.server").then((m) =>
            m.listFirmMembersForAssigneePicker(supabase, profile.firm_id),
          ),
        ])
      : [{ data: [] as never[] }, { members: [], principal: { name: "Principal" } }];

    const lastUsed: Record<string, string> = {};
    const usageCounts: Record<string, number> = {};
    const activeUsageCounts: Record<string, number> = {};
    for (const p of projects) {
      if (!p.sop_template_id) continue;
      usageCounts[p.sop_template_id] = (usageCounts[p.sop_template_id] ?? 0) + 1;
      if (p.status === "active") {
        activeUsageCounts[p.sop_template_id] = (activeUsageCounts[p.sop_template_id] ?? 0) + 1;
      }
      if (!lastUsed[p.sop_template_id] || p.created_at > lastUsed[p.sop_template_id]) {
        lastUsed[p.sop_template_id] = p.created_at;
      }
    }
    const hiddenIds = (prefs ?? []).filter((p) => p.hidden).map((p) => p.template_id);
    return {
      templates: templates ?? [],
      phases: phases ?? [],
      steps: steps ?? [],
      stepAssignees: stepAssignees ?? [],
      assigneePickerMembers: picker.members,
      assigneePickerPrincipal: picker.principal,
      projects: projects.map((p) => ({ id: p.id, name: p.name, client_name: p.client_name, status: p.status })),
      config,
      lastUsed,
      usageCounts,
      activeUsageCounts,
      hiddenIds,
      role: profile.role as string,
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
      // If any step has an estimated_hrs > 0, the phase total is computed from steps.
      const stepSum = ph.steps.reduce((s, st) => s + (Number(st.estimated_hrs) || 0), 0);
      const computedHrs = stepSum > 0 ? stepSum : Number(ph.expected_hrs) || 0;
      const phBody = {
        firm_id: profile.firm_id,
        template_id: templateId,
        name: ph.name,
        expected_hrs: computedHrs,
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
            estimated_hrs: Number(s.estimated_hrs) || 0,
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
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("firm_id, role").eq("id", userId).single();
    if (!profile?.firm_id) throw new Error("No firm");
    if (!["principal", "admin"].includes(profile.role as string)) throw new Error("Admin only");
    const { data: tpl } = await supabase
      .from("sop_templates")
      .select("id, is_default, firm_id")
      .eq("id", data.id)
      .single();
    if (!tpl || tpl.firm_id !== profile.firm_id) throw new Error("Template not found");
    if ((tpl as { is_default?: boolean }).is_default) {
      throw new Error(
        "Default templates cannot be deleted. You can hide this template if it doesn't apply to your practice, or duplicate it to create your own version.",
      );
    }
    // Soft delete — preserves any snapshotted project_phases referencing this template.
    const { error } = await supabase
      .from("sop_templates")
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setSopHidden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ template_id: z.string().uuid(), hidden: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tbl = supabase.from("user_sop_preferences" as never) as never as {
      upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => Promise<{ error: { message: string } | null }>;
    };
    const { error } = await tbl.upsert(
      {
        user_id: userId,
        template_id: data.template_id,
        hidden: data.hidden,
        hidden_at: data.hidden ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,template_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unhideAllSops = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const tbl = supabase.from("user_sop_preferences" as never) as never as {
      update: (row: Record<string, unknown>) => { eq: (k: string, v: string) => Promise<{ error: { message: string } | null }> };
    };
    const { error } = await tbl
      .update({ hidden: false, hidden_at: null, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const duplicateSopTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("firm_id, role").eq("id", userId).single();
    if (!profile?.firm_id) throw new Error("No firm");
    if (!["principal", "admin"].includes(profile.role as string)) throw new Error("Admin only");
    const { data: tpl } = await supabase
      .from("sop_templates")
      .select("*")
      .eq("id", data.id)
      .eq("firm_id", profile.firm_id)
      .single();
    if (!tpl) throw new Error("Template not found");
    const { data: ins, error } = await supabase
      .from("sop_templates")
      .insert({
        firm_id: profile.firm_id,
        name: `${tpl.name} (copy)`,
        category: tpl.category,
        department: tpl.department,
        description: tpl.description,
        tags: tpl.tags,
        triggered_by: tpl.triggered_by,
        done_when: tpl.done_when,
        scope_risk_level: tpl.scope_risk_level,
        common_failure_modes: tpl.common_failure_modes,
        is_default: false,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const newId = (ins as { id: string }).id;

    const { data: phases } = await supabase
      .from("sop_phases")
      .select("*")
      .eq("template_id", data.id)
      .order("sort_order");
    for (const ph of phases ?? []) {
      const { data: pIns, error: pErr } = await supabase
        .from("sop_phases")
        .insert({
          firm_id: profile.firm_id,
          template_id: newId,
          name: ph.name,
          expected_hrs: ph.expected_hrs,
          billable: ph.billable,
          description: ph.description,
          time_benchmark_notes: ph.time_benchmark_notes,
          sort_order: ph.sort_order,
        })
        .select("id")
        .single();
      if (pErr) throw new Error(pErr.message);
      const { data: stepsSrc } = await supabase
        .from("sop_steps")
        .select("*")
        .eq("phase_id", ph.id)
        .order("sort_order");
      if (stepsSrc?.length) {
        await supabase.from("sop_steps").insert(
          stepsSrc.map((s) => ({
            phase_id: (pIns as { id: string }).id,
            description: s.description,
            estimated_hrs: (s as { estimated_hrs?: number }).estimated_hrs ?? 0,
            sort_order: s.sort_order,
          })),
        );
      }
    }
    return { id: newId };
  });

export const getTemplateUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ template_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("firm_id").eq("id", userId).single();
    if (!profile?.firm_id) return { projects: [] };
    const { data: projects } = await supabase
      .from("projects")
      .select("id, name, client_name, status, created_at")
      .eq("firm_id", profile.firm_id)
      .eq("sop_template_id", data.template_id)
      .order("created_at", { ascending: false });
    return { projects: projects ?? [] };
  });

const attachSchema = z.object({
  template_id: z.string().uuid(),
  project_id: z.string().uuid(),
  phase_ids: z.array(z.string().uuid()).max(200).optional(),
});

export const attachTemplateToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => attachSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("firm_id, role").eq("id", userId).single();
    if (!profile?.firm_id) throw new Error("No firm");
    if (!["principal", "admin"].includes(profile.role as string)) throw new Error("Admin only");

    // Verify project belongs to firm
    const { data: project } = await supabase
      .from("projects")
      .select("id, firm_id, name")
      .eq("id", data.project_id)
      .eq("firm_id", profile.firm_id)
      .single();
    if (!project) throw new Error("Project not found");

    // Load template phases (filtered if phase_ids provided)
    let phasesQ = supabase
      .from("sop_phases")
      .select("id, name, expected_hrs, billable, sort_order")
      .eq("template_id", data.template_id)
      .order("sort_order");
    if (data.phase_ids?.length) phasesQ = phasesQ.in("id", data.phase_ids);
    const { data: phases } = await phasesQ;
    if (!phases?.length) throw new Error("No phases to attach");

    // Get current max sort_order on project to append
    const { data: existing } = await supabase
      .from("project_phases")
      .select("sort_order")
      .eq("project_id", project.id)
      .order("sort_order", { ascending: false })
      .limit(1);
    let nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

    // Load steps for all phases at once
    const phaseIds = phases.map((p) => p.id);
    const { data: allSteps } = await supabase
      .from("sop_steps")
      .select("id, phase_id, description, estimated_hrs, sort_order")
      .in("phase_id", phaseIds)
      .order("sort_order");

    // Insert project_phases one-by-one to capture new ids for step snapshot
    let migrationPending = false;
    for (const p of phases) {
      const { data: ins, error } = await supabase
        .from("project_phases")
        .insert({
          project_id: project.id,
          sop_phase_id: p.id,
          name: p.name,
          expected_hrs: Number(p.expected_hrs) || 0,
          billable: p.billable,
          sort_order: nextOrder++,
          actual_hrs: 0,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      const steps = (allSteps ?? []).filter((s) => s.phase_id === p.id);
      if (steps.length) {
        const { data: insertedSteps, error: stepErr } = await supabase
          .from("project_steps")
          .insert(
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
          )
          .select("id, sop_step_id");
        if (stepErr) throw new Error(stepErr.message);
        const { copySopAssigneesToProjectSteps, refreshProjectCostSnapshot } = await import(
          "@/lib/project-cost-snapshot.server"
        );
        const pairs = (insertedSteps ?? [])
          .filter((row: { sop_step_id?: string | null }) => row.sop_step_id)
          .map((row: { id: string; sop_step_id: string }) => ({
            sopStepId: row.sop_step_id,
            projectStepId: row.id,
          }));
        const copied = await copySopAssigneesToProjectSteps(supabase, pairs);
        if (!copied) migrationPending = true;
        const refreshed = await refreshProjectCostSnapshot(supabase, project.id, profile.firm_id);
        if (!refreshed) migrationPending = true;
      }
    }
    return { project_id: project.id, attached: phases.length, migrationPending };
  });

export const reorderProjectPhases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      project_id: z.string().uuid(),
      ordered_ids: z.array(z.string().uuid()).min(1).max(200),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    for (let i = 0; i < data.ordered_ids.length; i++) {
      const { error } = await supabase
        .from("project_phases")
        .update({ sort_order: i })
        .eq("id", data.ordered_ids[i])
        .eq("project_id", data.project_id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// Read-only: return a template's phases so the project setup wizard can
// append them into its scope draft without creating a project first.
export const getSopTemplatePhases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ template_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) return { template: null, phases: [] };
    const { data: tpl } = await supabase
      .from("sop_templates")
      .select("id, name, firm_id")
      .eq("id", data.template_id)
      .maybeSingle();
    if (!tpl || tpl.firm_id !== profile.firm_id) {
      return { template: null, phases: [] };
    }
    const { data: phases } = await supabase
      .from("sop_phases")
      .select("id, name, expected_hrs, billable, sort_order")
      .eq("template_id", data.template_id)
      .order("sort_order");
    return {
      template: { id: tpl.id, name: tpl.name },
      phases: (phases ?? []).map((p) => ({
        name: p.name,
        expected_hrs: Number(p.expected_hrs) || 0,
        billable: !!p.billable,
      })),
    };
  });

const sopStepAssigneeSchema = z.object({
  sop_step_id: z.string().uuid(),
  assignee_kind: z.enum(["member", "principal"]).default("member"),
  firm_member_id: z.string().uuid().optional().nullable(),
  estimated_hrs: z.number().min(0).max(9999).optional(),
  is_billable: z.boolean().optional(),
  notes: z.string().max(500).optional().nullable(),
});

export const upsertSopStepAssignee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => sopStepAssigneeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id, role")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) throw new Error("No firm");
    if (!["principal", "admin"].includes(profile.role as string)) throw new Error("Admin only");
    if (data.assignee_kind === "member" && !data.firm_member_id) {
      throw new Error("firm_member_id required");
    }

    const match =
      data.assignee_kind === "principal"
        ? { sop_step_id: data.sop_step_id, assignee_kind: "principal" as const }
        : {
            sop_step_id: data.sop_step_id,
            firm_member_id: data.firm_member_id!,
            assignee_kind: "member" as const,
          };

    const { data: existing } = await supabase
      .from("sop_step_assignees")
      .select("id")
      .match(match)
      .maybeSingle();

    const row = {
      sop_step_id: data.sop_step_id,
      assignee_kind: data.assignee_kind,
      firm_member_id: data.assignee_kind === "principal" ? null : data.firm_member_id,
      estimated_hrs: data.estimated_hrs ?? 0,
      is_billable: data.is_billable ?? true,
      notes: data.notes ?? null,
    };

    if (existing?.id) {
      const { data: updated, error } = await supabase
        .from("sop_step_assignees")
        .update(row)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return updated;
    }

    const { data: inserted, error } = await supabase
      .from("sop_step_assignees")
      .insert(row)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return inserted;
  });

export const deleteSopStepAssignee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("sop_step_assignees").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });