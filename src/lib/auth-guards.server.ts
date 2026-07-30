export const ACCESS_RESTRICTED = "Access restricted";
export const VIEW_ONLY_WRITE_DENIED = "View-only users cannot make changes";

import { isTimeEntryAssignee } from "@/lib/time-assignees.server";

export type CallerProfile = {
  role: string;
  firm_id: string;
  is_super_admin?: boolean | null;
  impersonated_firm_id?: string | null;
};

export function isFinancialRole(role: string): boolean {
  return role === "principal" || role === "admin";
}

export function effectiveRole(profile: CallerProfile): string {
  return profile.is_super_admin ? "principal" : profile.role;
}

export function effectiveFirmId(profile: CallerProfile): string {
  return profile.impersonated_firm_id ?? profile.firm_id;
}

/** Principals, admins, and super admins may log time on behalf of other firm users. */
export function canAssignTimeEntryUser(profile: CallerProfile): boolean {
  return !!profile.is_super_admin || isFinancialRole(profile.role);
}

export async function resolveTimeEntryTargetUserId(
  supabase: { from: (table: string) => unknown },
  profile: CallerProfile,
  callerUserId: string,
  requestedUserId?: string | null,
): Promise<string> {
  if (!requestedUserId || requestedUserId === callerUserId || !canAssignTimeEntryUser(profile)) {
    return callerUserId;
  }
  const firmId = effectiveFirmId(profile);
  if (!(await isTimeEntryAssignee(firmId, requestedUserId))) {
    throw new Error("Team member not found");
  }
  return requestedUserId;
}

export async function getCallerProfile(
  supabase: { from: (table: string) => unknown },
  userId: string,
): Promise<CallerProfile> {
  const { data: profile, error } = await (supabase as any)
    .from("profiles")
    .select("role, firm_id, is_super_admin, impersonated_firm_id")
    .eq("id", userId)
    .single();

  if (error || !profile) {
    throw new Error(ACCESS_RESTRICTED);
  }
  if (!profile.firm_id && !profile.impersonated_firm_id && !profile.is_super_admin) {
    throw new Error(ACCESS_RESTRICTED);
  }

  return profile as CallerProfile;
}

export async function requirePrincipalOrAdmin(
  supabase: { from: (table: string) => unknown },
  userId: string,
): Promise<CallerProfile> {
  const profile = await getCallerProfile(supabase, userId);
  if (profile.is_super_admin) return profile;
  if (!isFinancialRole(profile.role)) {
    throw new Error(ACCESS_RESTRICTED);
  }
  return profile;
}

export async function requirePrincipal(
  supabase: { from: (table: string) => unknown },
  userId: string,
): Promise<CallerProfile> {
  const profile = await getCallerProfile(supabase, userId);
  if (profile.is_super_admin) return profile;
  if (profile.role !== "principal") {
    throw new Error(ACCESS_RESTRICTED);
  }
  return profile;
}

export async function requireAtLeastTeam(
  supabase: { from: (table: string) => unknown },
  userId: string,
): Promise<CallerProfile & { role: string; firm_id: string }> {
  const profile = await getCallerProfile(supabase, userId);
  const role = effectiveRole(profile);
  if (!["principal", "admin", "team", "view_only"].includes(role)) {
    throw new Error(ACCESS_RESTRICTED);
  }
  return { ...profile, role, firm_id: effectiveFirmId(profile) };
}

export async function requireCanWrite(
  supabase: { from: (table: string) => unknown },
  userId: string,
): Promise<CallerProfile & { role: string; firm_id: string }> {
  const profile = await requireAtLeastTeam(supabase, userId);
  if (profile.role === "view_only") {
    throw new Error(VIEW_ONLY_WRITE_DENIED);
  }
  return profile;
}

export async function loadFirmConfigForCaller(
  supabase: { from: (table: string) => unknown },
  userId: string,
  firmId: string,
  profileOverride?: CallerProfile | null,
) {
  const profile = profileOverride ?? (await getCallerProfile(supabase, userId));
  const role = effectiveRole(profile);
  if (isFinancialRole(role) || profile.is_super_admin) {
    return (supabase as any).from("firm_config").select("*").eq("firm_id", firmId).maybeSingle();
  }
  return (supabase as any)
    .from("firm_config_team_safe")
    .select("*")
    .eq("firm_id", firmId)
    .maybeSingle();
}
