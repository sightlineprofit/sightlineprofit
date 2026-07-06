import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ActionType = z.enum([
  "rate_increase",
  "utilization",
  "cost_reduction",
  "settings_update",
  "proposal_sent",
]);

export const createCommitmentSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        items: z
          .array(
            z.object({
              action_type: ActionType,
              target_value: z.number().nullable().optional(),
              notes: z.string().max(500).nullable().optional(),
            }),
          )
          .min(1)
          .max(10),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) throw new Error("No firm");
    const scenario_group = crypto.randomUUID();
    const rows = data.items.map((i) => ({
      firm_id: profile.firm_id!,
      created_by: userId,
      action_type: i.action_type,
      target_value: i.target_value ?? null,
      notes: i.notes ?? null,
      scenario_group,
    }));
    const { data: inserted, error } = await supabase
      .from("firm_action_commitments" as any)
      .insert(rows)
      .select("*");
    if (error) throw new Error(error.message);
    return { scenario_group, items: inserted ?? [] };
  });

export const resolveCommitment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        outcome: z.enum(["completed", "reconsidered", "expired"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("firm_action_commitments" as any)
      .update({
        outcome: data.outcome,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listActiveCommitments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) return [];
    const { data } = await supabase
      .from("firm_action_commitments" as any)
      .select("*")
      .eq("firm_id", profile.firm_id)
      .is("resolved_at", null)
      .order("committed_at", { ascending: false });
    return data ?? [];
  });