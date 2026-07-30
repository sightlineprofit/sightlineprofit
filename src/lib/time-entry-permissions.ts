/** Client-safe: who may log time on behalf of other firm profiles. */
export function canAssignTimeEntries(
  profile:
    | {
        role?: string | null;
        is_super_admin?: boolean | null;
      }
    | null
    | undefined,
  realIsSuperAdmin = false,
): boolean {
  if (realIsSuperAdmin || profile?.is_super_admin) return true;
  const role = profile?.role ?? "";
  return role === "principal" || role === "admin";
}
