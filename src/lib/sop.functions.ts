import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_SOP_TEMPLATES } from "@/lib/sop-seed.server";
import { listFirmProjects } from "@/lib/project-lifecycle.server";
import { SOP_ASSIGNED_ROLE_VALUES } from "@/lib/sop-roles";

const FIRM_RESOURCE_BUCKET = "firm-resources";

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

const workflowTypeSchema = z.enum(["project", "firm_operation"]);

function isMissingSortOrderColumn(message: string | undefined) {
  return !!message && /sort_order/i.test(message) && /(column|schema cache|does not exist)/i.test(message);
}

function isMissingRelation(message: string | undefined) {
  return !!message && /(relation|table).*(does not exist|not found)/i.test(message);
}

async function loadSopTemplates(
  supabase: {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          is: (col: string, val: null) => {
            order: (
              col: string,
              opts?: { ascending?: boolean },
            ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
          };
        };
      };
    };
  },
  firmId: string,
) {
  const { data, error } = await supabase
    .from("sop_templates")
    .select("*")
    .eq("firm_id", firmId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = [...(data ?? [])];
  rows.sort((a, b) => {
    const ao = (a as { sort_order?: number }).sort_order;
    const bo = (b as { sort_order?: number }).sort_order;
    if (ao != null && bo != null && ao !== bo) return ao - bo;
    return String((b as { created_at?: string }).created_at ?? "").localeCompare(
      String((a as { created_at?: string }).created_at ?? ""),
    );
  });
  return rows;
}

async function safeTableRows<T>(
  result: PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const { data, error } = await result;
  if (!error) return data ?? [];
  if (isMissingRelation(error.message)) return [];
  throw new Error(error.message);
}

async function loadFirmResources(
  supabase: Pick<typeof supabaseAdmin, "from">,
  firmId: string,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from("firm_resources")
    .select("*")
    .eq("firm_id", firmId)
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  if (!error) return data ?? [];
  if (isMissingSortOrderColumn(error.message)) {
    const fallback = await supabase
      .from("firm_resources")
      .select("*")
      .eq("firm_id", firmId)
      .eq("is_active", true)
      .order("name");
    if (fallback.error) throw new Error(fallback.error.message);
    return fallback.data ?? [];
  }
  if (isMissingRelation(error.message)) return [];
  throw new Error(error.message);
}

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
    const { count: defaultCount } = await supabaseAdmin
      .from("sop_templates")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", profile.firm_id)
      .eq("is_default", true)
      .is("deleted_at", null);
    if ((defaultCount ?? 0) < DEFAULT_SOP_TEMPLATES.length) {
      const { ensureDefaultSopsForFirm } = await import("@/lib/sop-seed.server");
      await ensureDefaultSopsForFirm(profile.firm_id);
    }
    const [templates, { data: phases }, { data: config }, projectsResult, { data: prefs }] = await Promise.all([
      loadSopTemplates(supabase, profile.firm_id),
      supabase.from("sop_phases").select("*").eq("firm_id", profile.firm_id).order("sort_order"),
      supabase.from("firm_config").select("*").eq("firm_id", profile.firm_id).maybeSingle(),
      listFirmProjects(supabase, profile.firm_id, {
        select: "id, name, client_name, status, sop_template_id, created_at",
        orderBy: { column: "created_at", ascending: false },
      }),
      (supabase.from("user_sop_preferences" as never) as never as { select: (s: string) => { eq: (k: string, v: string) => Promise<{ data: Array<{ template_id: string; hidden: boolean }> | null }> } })
        .select("template_id, hidden")
        .eq("user_id", userId),
    ]);
    const projects = projectsResult.data;
    const phaseIds = (phases ?? []).map((p) => p.id);
    const { data: steps } = phaseIds.length
      ? await supabase.from("sop_steps").select("*").in("phase_id", phaseIds).order("sort_order")
      : { data: [] as never[] };

    const stepIds = (steps ?? []).map((s: { id: string }) => s.id);
    const [stepAssignees, picker, resources, stepResources] = await Promise.all([
      stepIds.length
        ? safeTableRows(
            supabase.from("sop_step_assignees").select("*").in("sop_step_id", stepIds),
          )
        : Promise.resolve([]),
      import("@/lib/project-cost-snapshot.server").then((m) =>
        m.listFirmMembersForAssigneePicker(supabase, profile.firm_id),
      ),
      loadFirmResources(supabase, profile.firm_id),
      stepIds.length
        ? safeTableRows(
            supabase
              .from("sop_step_resources")
              .select("*")
              .eq("firm_id", profile.firm_id)
              .in("sop_step_id", stepIds),
          )
        : Promise.resolve([]),
    ]);

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
      templates: templates as never[],
      phases: phases ?? [],
      steps: steps ?? [],
      stepAssignees: stepAssignees ?? [],
      resources: resources ?? [],
      stepResources: stepResources ?? [],
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

async function requireFirmAdmin(
  supabase: { from: (table: string) => unknown },
  userId: string,
) {
  const { data: profile } = await supabase.from("profiles").select("firm_id, role").eq("id", userId).single();
  if (!profile?.firm_id) throw new Error("No firm");
  if (!["principal", "admin"].includes(profile.role as string)) throw new Error("Admin only");
  return profile as { firm_id: string; role: string };
}

export const createSopWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        name: z.string().min(1).max(160),
        description: z.string().max(4000).optional().nullable(),
        workflow_type: workflowTypeSchema,
        icon: z.string().max(80).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requireFirmAdmin(supabase, userId);
    const row: Record<string, unknown> = {
      firm_id: profile.firm_id,
      name: data.name,
      description: data.description ?? null,
      workflow_type: data.workflow_type,
      icon: data.icon ?? null,
      is_active: true,
      scope_risk_level: "low",
    };
    const { data: last, error: sortLookupErr } = await supabase
      .from("sop_templates")
      .select("sort_order")
      .eq("firm_id", profile.firm_id)
      .eq("workflow_type", data.workflow_type)
      .is("deleted_at", null)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sortLookupErr) {
      row.sort_order = ((last as { sort_order?: number } | null)?.sort_order ?? -1) + 1;
    } else if (!isMissingSortOrderColumn(sortLookupErr.message)) {
      throw new Error(sortLookupErr.message);
    }
    const { data: ins, error } = await supabase
      .from("sop_templates")
      .insert(row)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return ins;
  });

export const renameSopWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), name: z.string().min(1).max(160) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requireFirmAdmin(supabase, userId);
    const { error } = await supabase
      .from("sop_templates")
      .update({ name: data.name.trim() })
      .eq("id", data.id)
      .eq("firm_id", profile.firm_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const moveSopWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      workflow_type: workflowTypeSchema,
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requireFirmAdmin(supabase, userId);
    const { error } = await supabase
      .from("sop_templates")
      .update({ workflow_type: data.workflow_type })
      .eq("id", data.id)
      .eq("firm_id", profile.firm_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderSopWorkflows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      workflow_type: workflowTypeSchema,
      ordered_ids: z.array(z.string().uuid()).min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requireFirmAdmin(supabase, userId);
    const { data: existing } = await supabase
      .from("sop_templates")
      .select("id")
      .eq("firm_id", profile.firm_id)
      .eq("workflow_type", data.workflow_type)
      .is("deleted_at", null);
    const allowed = new Set((existing ?? []).map((t: { id: string }) => t.id));
    if (data.ordered_ids.some((id) => !allowed.has(id))) {
      throw new Error("Invalid workflow order");
    }
    for (let i = 0; i < data.ordered_ids.length; i++) {
      const { error } = await supabase
        .from("sop_templates")
        .update({ sort_order: i })
        .eq("id", data.ordered_ids[i])
        .eq("firm_id", profile.firm_id);
      if (error) {
        if (isMissingSortOrderColumn(error.message)) {
          throw new Error("Workflow reorder requires a database update — run npm run db:apply-sop-migration");
        }
        throw new Error(error.message);
      }
    }
    return { ok: true };
  });

export const addSopPhase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      template_id: z.string().uuid(),
      name: z.string().min(1).max(120),
      billable: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requireFirmAdmin(supabase, userId);
    const { data: phases } = await supabase
      .from("sop_phases")
      .select("sort_order")
      .eq("template_id", data.template_id)
      .order("sort_order", { ascending: false })
      .limit(1);
    const sort_order = (phases?.[0]?.sort_order ?? -1) + 1;
    const { data: ins, error } = await supabase
      .from("sop_phases")
      .insert({
        firm_id: profile.firm_id,
        template_id: data.template_id,
        name: data.name,
        expected_hrs: 0,
        estimated_hrs: 0,
        billable: data.billable ?? true,
        sort_order,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return ins;
  });

const sopStepSaveSchema = z
  .object({
    id: z.string().uuid().optional(),
    phase_id: z.string().uuid(),
    name: z.string().min(1).max(500),
    assigned_role: z.enum(SOP_ASSIGNED_ROLE_VALUES),
    assigned_role_label: z.string().max(80).optional().nullable(),
    estimated_hrs: z.number().min(0).max(10000).default(0),
    trigger_description: z.string().max(2000).optional().nullable(),
    completion_criteria: z.string().max(2000).optional().nullable(),
    steps: z
      .array(z.object({ order: z.number().int(), text: z.string().min(1).max(1000) }))
      .optional()
      .nullable(),
    notes: z.string().max(4000).optional().nullable(),
    is_billable: z.boolean().default(true),
    resource_ids: z.array(z.string().uuid()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.assigned_role === "other" && !data.assigned_role_label?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter who handles this task",
        path: ["assigned_role_label"],
      });
    }
  });

export const saveSopStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => sopStepSaveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requireFirmAdmin(supabase, userId);
    const { data: phase } = await supabase
      .from("sop_phases")
      .select("id, template_id, firm_id")
      .eq("id", data.phase_id)
      .single();
    if (!phase || phase.firm_id !== profile.firm_id) throw new Error("Phase not found");

    const row = {
      phase_id: data.phase_id,
      name: data.name,
      description: data.name,
      assigned_role: data.assigned_role,
      assigned_role_label:
        data.assigned_role === "other" ? data.assigned_role_label?.trim() || null : null,
      estimated_hrs: data.estimated_hrs,
      trigger_description: data.trigger_description ?? null,
      completion_criteria: data.completion_criteria ?? null,
      steps: data.steps ?? null,
      notes: data.notes ?? null,
      is_billable: data.is_billable,
    };

    let stepId = data.id;
    if (stepId) {
      const { error } = await supabase.from("sop_steps").update(row).eq("id", stepId);
      if (error) throw new Error(error.message);
    } else {
      const { data: existing } = await supabase
        .from("sop_steps")
        .select("sort_order")
        .eq("phase_id", data.phase_id)
        .order("sort_order", { ascending: false })
        .limit(1);
      const sort_order = (existing?.[0]?.sort_order ?? -1) + 1;
      const { data: ins, error } = await supabase
        .from("sop_steps")
        .insert({ ...row, sort_order })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      stepId = ins.id;
    }

    if (data.resource_ids !== undefined) {
      await supabase.from("sop_step_resources").delete().eq("sop_step_id", stepId);
      if (data.resource_ids.length) {
        const { error: linkErr } = await supabase.from("sop_step_resources").insert(
          data.resource_ids.map((resource_id) => ({
            sop_step_id: stepId!,
            resource_id,
            firm_id: profile.firm_id,
          })),
        );
        if (linkErr) throw new Error(linkErr.message);
      }
    }

    await supabaseAdmin.rpc("refresh_sop_template_estimated_hrs", { p_template_id: phase.template_id });
    return { id: stepId };
  });

const bulkStepRolesSchema = z
  .object({
    step_ids: z.array(z.string().uuid()).min(1).max(500),
    assigned_role: z.enum(SOP_ASSIGNED_ROLE_VALUES),
    assigned_role_label: z.string().max(80).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.assigned_role === "other" && !data.assigned_role_label?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter who handles these tasks",
        path: ["assigned_role_label"],
      });
    }
  });

export const bulkUpdateSopStepRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => bulkStepRolesSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requireFirmAdmin(supabase, userId);

    const { data: steps, error: stepErr } = await supabase
      .from("sop_steps")
      .select("id, phase_id")
      .in("id", data.step_ids);
    if (stepErr) throw new Error(stepErr.message);
    if (!steps?.length) throw new Error("No tasks found");

    const phaseIds = [...new Set(steps.map((s) => s.phase_id))];
    const { data: phases, error: phErr } = await supabase
      .from("sop_phases")
      .select("id, template_id")
      .in("id", phaseIds)
      .eq("firm_id", profile.firm_id);
    if (phErr) throw new Error(phErr.message);

    const allowedPhases = new Set((phases ?? []).map((p) => p.id));
    const allowedStepIds = steps.filter((s) => allowedPhases.has(s.phase_id)).map((s) => s.id);
    if (!allowedStepIds.length) throw new Error("No tasks found");

    const patch = {
      assigned_role: data.assigned_role,
      assigned_role_label:
        data.assigned_role === "other" ? data.assigned_role_label?.trim() || null : null,
      updated_at: new Date().toISOString(),
    };

    for (const id of allowedStepIds) {
      const { error } = await supabase.from("sop_steps").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    }

    const templateIds = [...new Set((phases ?? []).map((p) => p.template_id))];
    for (const templateId of templateIds) {
      await supabaseAdmin.rpc("refresh_sop_template_estimated_hrs", { p_template_id: templateId });
    }

    return { updated: allowedStepIds.length };
  });

export const reorderSopPhases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ template_id: z.string().uuid(), ordered_ids: z.array(z.string().uuid()).min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireFirmAdmin(supabase, userId);
    for (let i = 0; i < data.ordered_ids.length; i++) {
      const { error } = await supabase
        .from("sop_phases")
        .update({ sort_order: i })
        .eq("id", data.ordered_ids[i])
        .eq("template_id", data.template_id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const reorderSopSteps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ phase_id: z.string().uuid(), ordered_ids: z.array(z.string().uuid()).min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireFirmAdmin(supabase, userId);
    for (let i = 0; i < data.ordered_ids.length; i++) {
      const { error } = await supabase
        .from("sop_steps")
        .update({ sort_order: i })
        .eq("id", data.ordered_ids[i])
        .eq("phase_id", data.phase_id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

const resourceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  resource_type: z.enum([
    "email_template",
    "document_template",
    "process_doc",
    "video",
    "external_link",
    "contract",
    "checklist",
    "other",
  ]),
  url: z.string().max(2000).optional().nullable(),
  file_path: z.string().max(500).optional().nullable(),
  file_name: z.string().max(255).optional().nullable(),
  content: z.string().max(50000).optional().nullable(),
  subject_line: z.string().max(500).optional().nullable(),
  tags: z.array(z.string().max(40)).max(20).optional().nullable(),
});

export const saveFirmResource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => resourceSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requireFirmAdmin(supabase, userId);
    const body: {
      firm_id: string;
      name: string;
      resource_type: string;
      url: string | null;
      content: string | null;
      subject_line: string | null;
      tags: string[] | null;
      updated_at: string;
      file_path?: string | null;
      file_name?: string | null;
    } = {
      firm_id: profile.firm_id,
      name: data.name,
      resource_type: data.resource_type,
      url: data.url ?? null,
      content: data.content ?? null,
      subject_line: data.subject_line ?? null,
      tags: data.tags ?? null,
      updated_at: new Date().toISOString(),
    };
    if (data.file_path != null || data.file_name != null) {
      body.file_path = data.file_path ?? null;
      body.file_name = data.file_name ?? null;
    }
    if (data.id) {
      const { data: updated, error } = await supabase
        .from("firm_resources")
        .update(body)
        .eq("id", data.id)
        .eq("firm_id", profile.firm_id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return updated;
    }
    const { data: existing } = await supabase
      .from("firm_resources")
      .select("sort_order")
      .eq("firm_id", profile.firm_id)
      .order("sort_order", { ascending: false })
      .limit(1);
    const sort_order =
      ((existing?.[0] as { sort_order?: number } | undefined)?.sort_order ?? -1) + 1;
    let ins = await supabase
      .from("firm_resources")
      .insert({ ...body, sort_order })
      .select("*")
      .single();
    if (ins.error && isMissingSortOrderColumn(ins.error.message)) {
      ins = await supabase.from("firm_resources").insert(body).select("*").single();
    }
    if (ins.error) throw new Error(ins.error.message);
    return ins.data;
  });

export const reorderFirmResources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ordered_ids: z.array(z.string().uuid()).min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requireFirmAdmin(supabase, userId);
    for (let i = 0; i < data.ordered_ids.length; i++) {
      const { error } = await supabase
        .from("firm_resources")
        .update({ sort_order: i, updated_at: new Date().toISOString() })
        .eq("id", data.ordered_ids[i])
        .eq("firm_id", profile.firm_id);
      if (error) {
        if (isMissingSortOrderColumn(error.message)) {
          throw new Error("Resource reorder requires a database update — run npm run db:apply-sop-migration");
        }
        throw new Error(error.message);
      }
    }
    return { ok: true };
  });

export const deleteFirmResource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requireFirmAdmin(supabase, userId);
    const { data: row } = await supabase
      .from("firm_resources")
      .select("file_path")
      .eq("id", data.id)
      .eq("firm_id", profile.firm_id)
      .maybeSingle();
    const filePath = (row as { file_path?: string | null } | null)?.file_path;
    if (filePath?.startsWith(`${profile.firm_id}/`)) {
      await supabaseAdmin.storage.from(FIRM_RESOURCE_BUCKET).remove([filePath]).catch(() => undefined);
    }
    const { error } = await supabase
      .from("firm_resources")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("firm_id", profile.firm_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createFirmResourceUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ fileName: z.string().min(1).max(255) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requireFirmAdmin(supabase, userId);
    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_") || "document";
    const path = `${profile.firm_id}/${crypto.randomUUID()}/${safeName}`;
    const { data: signed, error } = await supabaseAdmin.storage
      .from(FIRM_RESOURCE_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message ?? "Storage is not configured — run npm run db:apply-firm-resource-files");
    return { path, signedUrl: signed.signedUrl, token: signed.token, fileName: data.fileName };
  });

export const getFirmResourceDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ path: z.string().min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requireFirmAdmin(supabase, userId);
    if (!data.path.startsWith(`${profile.firm_id}/`)) throw new Error("Invalid file path");
    const { data: signed, error } = await supabaseAdmin.storage
      .from(FIRM_RESOURCE_BUCKET)
      .createSignedUrl(data.path, 3600);
    if (error || !signed?.signedUrl) throw new Error(error?.message ?? "Could not open file");
    return { url: signed.signedUrl };
  });

export const deleteFirmResourceStorageObject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ path: z.string().min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requireFirmAdmin(supabase, userId);
    if (!data.path.startsWith(`${profile.firm_id}/`)) throw new Error("Invalid file path");
    const { error } = await supabaseAdmin.storage.from(FIRM_RESOURCE_BUCKET).remove([data.path]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const workflowPeriodSchema = z.object({
  period_label: z.string().trim().max(120).optional().nullable(),
  period_start: z.string().trim().max(32).optional().nullable(),
  period_end: z.string().trim().max(32).optional().nullable(),
});

export const attachWorkflowToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        workflow_id: z.string().uuid(),
        project_id: z.string().uuid(),
        period: workflowPeriodSchema.optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requireFirmAdmin(supabase, userId);
    const { attachWorkflowToProject: attach } = await import("@/lib/sop-library.server");
    await attach(supabase, data.workflow_id, data.project_id, profile.firm_id, data.period ?? null);
    return { ok: true };
  });

export const detachProjectWorkflowAttachmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ attachment_id: z.string().uuid(), project_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requireFirmAdmin(supabase, userId);
    const { detachProjectWorkflowAttachment } = await import("@/lib/sop-library.server");
    await detachProjectWorkflowAttachment(
      supabase,
      data.attachment_id,
      data.project_id,
      profile.firm_id,
    );
    return { ok: true };
  });

export const detachWorkflowFromProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requireFirmAdmin(supabase, userId);
    const { detachWorkflowFromProject: detach } = await import("@/lib/sop-library.server");
    await detach(supabase, data.project_id, profile.firm_id);
    return { ok: true };
  });

export const getSopRoleInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("firm_id").eq("id", userId).single();
    if (!profile?.firm_id) {
      return {
        roles: [],
        totalHrsPerProject: 0,
        delegatableHrs: 0,
        delegatablePct: 0,
        tasksWithResources: 0,
        totalTasks: 0,
        principalHrsPerProject: 0,
        projectsWithWorkflows: 0,
        topHireRecommendation: null,
      };
    }
    const { getRoleInsights } = await import("@/lib/sop-library.server");
    return getRoleInsights(supabase, profile.firm_id);
  });

export const listProjectWorkflows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("firm_id").eq("id", userId).single();
    if (!profile?.firm_id) return { workflows: [] };

    const { count: templateCount } = await supabaseAdmin
      .from("sop_templates")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", profile.firm_id)
      .eq("is_default", true)
      .is("deleted_at", null);
    if ((templateCount ?? 0) < DEFAULT_SOP_TEMPLATES.length) {
      const { ensureDefaultSopsForFirm } = await import("@/lib/sop-seed.server");
      await ensureDefaultSopsForFirm(profile.firm_id);
    }

    const { data: workflows } = await supabase
      .from("sop_templates")
      .select("id, name, icon, estimated_total_hrs, workflow_type")
      .eq("firm_id", profile.firm_id)
      .in("workflow_type", ["project", "firm_operation"])
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name");
    const ids = (workflows ?? []).map((w) => w.id);
    if (!ids.length) return { workflows: [] };
    const { data: phases } = await supabase.from("sop_phases").select("id, template_id").in("template_id", ids);
    const phaseIds = (phases ?? []).map((p) => p.id);
    const { data: steps } = phaseIds.length
      ? await supabase.from("sop_steps").select("id, phase_id, estimated_hrs").in("phase_id", phaseIds)
      : { data: [] };
    return {
      workflows: (workflows ?? []).map((w) => {
        const wPhases = (phases ?? []).filter((p) => p.template_id === w.id);
        const wPhaseIds = new Set(wPhases.map((p) => p.id));
        const wSteps = (steps ?? []).filter((s) => wPhaseIds.has(s.phase_id));
        const hrs =
          Number(w.estimated_total_hrs) ||
          wSteps.reduce((sum, s) => sum + (Number(s.estimated_hrs) || 0), 0);
        return {
          id: w.id,
          name: w.name,
          icon: w.icon,
          workflowType: (w as { workflow_type?: string }).workflow_type ?? "project",
          phaseCount: wPhases.length,
          taskCount: wSteps.length,
          totalHrs: hrs,
        };
      }),
    };
  });