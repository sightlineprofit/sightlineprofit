import type { SupabaseClient } from "@supabase/supabase-js";

export async function getTourFirmId(supabase: SupabaseClient<any>, userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("firm_id, impersonated_firm_id")
    .eq("id", userId)
    .maybeSingle();
  return (profile?.impersonated_firm_id ?? profile?.firm_id) as string | null;
}

export async function ensureTourRow(supabase: SupabaseClient<any>, firmId: string) {
  await supabase
    .from("firm_preferences" as any)
    .upsert({ firm_id: firmId }, { onConflict: "firm_id", ignoreDuplicates: true });
}