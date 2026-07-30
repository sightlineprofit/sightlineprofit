import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePrincipalOrAdmin } from "@/lib/auth-guards.server";

const assignmentRowSchema = z.object({
  firm_member_id: z.string().uuid(),
  role_on_project: z.string().trim().max(120).optional().nullable(),
});

export const listProjectAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requirePrincipalOrAdmin(supabase, userId);

    const { data: rows, error } = await supabase
      .from("project_assignments")
      .select(
        "id, project_id, firm_id, assignee_id, assigned_by, assigned_at, role_on_project, firm_members(id, name, email, profile_id, is_platform_user)",
      )
      .eq("project_id", data.projectId)
      .eq("firm_id", profile.firm_id)
      .order("assigned_at", { ascending: true });

    if (error) throw new Error(error.message);
    return { assignments: rows ?? [] };
  });

export const setProjectAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        projectId: z.string().uuid(),
        assignments: z.array(assignmentRowSchema),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requirePrincipalOrAdmin(supabase, userId);

    const { data: project } = await supabase
      .from("projects")
      .select("id, firm_id")
      .eq("id", data.projectId)
      .eq("firm_id", profile.firm_id)
      .maybeSingle();
    if (!project) throw new Error("Project not found");

    const { error: delErr } = await supabase
      .from("project_assignments")
      .delete()
      .eq("project_id", data.projectId)
      .eq("firm_id", profile.firm_id);
    if (delErr) throw new Error(delErr.message);

    if (!data.assignments.length) return { ok: true };

    const rows = data.assignments.map((a) => ({
      project_id: data.projectId,
      firm_id: profile.firm_id,
      assignee_id: a.firm_member_id,
      assigned_by: userId,
      role_on_project: a.role_on_project?.trim() || null,
    }));

    const { error: insErr } = await supabase.from("project_assignments").insert(rows);
    if (insErr) throw new Error(insErr.message);
    return { ok: true };
  });

export const addProjectAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        projectId: z.string().uuid(),
        firmMemberId: z.string().uuid(),
        roleOnProject: z.string().trim().max(120).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requirePrincipalOrAdmin(supabase, userId);

    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("firm_id", profile.firm_id)
      .maybeSingle();
    if (!project) throw new Error("Project not found");

    const { data: member } = await supabase
      .from("firm_members")
      .select("id")
      .eq("id", data.firmMemberId)
      .eq("firm_id", profile.firm_id)
      .maybeSingle();
    if (!member) throw new Error("Team member not found");

    const { data: row, error } = await supabase
      .from("project_assignments")
      .upsert(
        {
          project_id: data.projectId,
          firm_id: profile.firm_id,
          assignee_id: data.firmMemberId,
          assigned_by: userId,
          role_on_project: data.roleOnProject?.trim() || null,
        },
        { onConflict: "project_id,assignee_id" },
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const removeProjectAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ assignmentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requirePrincipalOrAdmin(supabase, userId);

    const { error } = await supabase
      .from("project_assignments")
      .delete()
      .eq("id", data.assignmentId)
      .eq("firm_id", profile.firm_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
