import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const categorySchema = z.enum([
  "rate_architecture",
  "owner_compensation",
  "team_cost",
  "team_capacity",
  "operating_expenses",
]);

export const listChangeLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ category: categorySchema, limit: z.number().int().min(1).max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("firm_id")
      .eq("id", userId)
      .single();
    if (!me?.firm_id) return [];
    const { data: rows } = await supabase
      .from("firm_change_log")
      .select("id, category, entity_label, changed_fields, changed_by_name, created_at")
      .eq("firm_id", me.firm_id)
      .eq("category", data.category)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 200);
    return rows ?? [];
  });