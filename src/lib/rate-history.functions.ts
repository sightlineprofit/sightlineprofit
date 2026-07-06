import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listRateHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("firm_id")
      .eq("id", userId)
      .single();
    if (!me?.firm_id) return [] as Array<{ id: string; rate: number; previous_rate: number | null; change_reason: string | null; changed_at: string }>;
    const { data } = await supabase
      .from("aligned_rate_history")
      .select("id, rate, previous_rate, change_reason, changed_at")
      .eq("firm_id", me.firm_id)
      .order("changed_at", { ascending: false })
      .limit(10);
    return data ?? [];
  });