/** Resolve firm_members.id for the authenticated platform user. */
export async function getCurrentFirmMemberId(
  supabase: { from: (table: string) => unknown },
  userId: string,
  firmId: string,
): Promise<string | null> {
  const { data, error } = await (supabase as any)
    .from("firm_members")
    .select("id")
    .eq("firm_id", firmId)
    .eq("profile_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) return null;
  return (data?.id as string | undefined) ?? null;
}

export async function getFirmMemberIdForProfile(
  supabase: { from: (table: string) => unknown },
  firmId: string,
  profileId: string,
): Promise<string | null> {
  const { data } = await (supabase as any)
    .from("firm_members")
    .select("id")
    .eq("firm_id", firmId)
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
