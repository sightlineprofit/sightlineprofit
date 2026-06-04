import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  client_name: z.string().trim().max(200).optional().nullable(),
  billing_type: z.enum(["fixed", "hourly"]),
  fixed_fee: z.number().min(0).max(100_000_000).optional().nullable(),
  scoped_rate: z.number().min(0).max(100_000).optional().nullable(),
  estimated_hrs: z.number().min(0).max(100_000).optional().nullable(),
  probability_pct: z.number().min(1).max(100),
  estimated_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  estimated_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  sop_template_id: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const createProspect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id, role")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) throw new Error("No firm");
    if (!["principal", "admin"].includes(profile.role as string)) {
      throw new Error("Not allowed");
    }
    const row = {
      firm_id: profile.firm_id,
      name: data.name,
      client_name: data.client_name ?? null,
      billing_type: data.billing_type,
      fixed_fee: data.billing_type === "fixed" ? data.fixed_fee ?? null : null,
      scoped_rate: data.billing_type === "hourly" ? data.scoped_rate ?? null : null,
      estimated_hrs: data.estimated_hrs ?? null,
      probability_pct: data.probability_pct,
      estimated_start: data.estimated_start ?? null,
      estimated_end: data.estimated_end ?? null,
      sop_template_id: data.sop_template_id ?? null,
      notes: data.notes ?? null,
    };
    const { data: inserted, error } = await supabase
      .from("pipeline_projects")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });