/**
 * Who can appear on time-entry assignee pickers (profiles + roster firm_members).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type TimeLogAssignee = {
  /** Select value: p:{profileId} or m:{firmMemberId} */
  key: string;
  name: string;
  email: string | null;
  profileId: string | null;
  firmMemberId: string | null;
};

const PROFILE_FIELDS =
  "id, name, email, role, color, billable_rate, expected_hrs_per_week, billable_pct";

export async function listTimeLogAssigneesForFirm(firmId: string): Promise<TimeLogAssignee[]> {
  const [{ data: profiles, error: pErr }, { data: members, error: mErr }] = await Promise.all([
    supabaseAdmin.from("profiles").select(PROFILE_FIELDS).eq("firm_id", firmId).order("name"),
    supabaseAdmin
      .from("firm_members")
      .select("id, name, email, profile_id, role_type, is_active")
      .eq("firm_id", firmId)
      .eq("is_active", true)
      .neq("role_type", "principal")
      .order("name"),
  ]);
  if (pErr) throw new Error(pErr.message);
  if (mErr) throw new Error(mErr.message);

  const profileIds = new Set((profiles ?? []).map((p) => p.id as string));
  const out: TimeLogAssignee[] = [];

  for (const p of profiles ?? []) {
    out.push({
      key: `p:${p.id as string}`,
      name: (p.name as string) || (p.email as string) || "Team member",
      email: (p.email as string) ?? null,
      profileId: p.id as string,
      firmMemberId: null,
    });
  }

  for (const m of members ?? []) {
    const pid = m.profile_id as string | null;
    if (pid && profileIds.has(pid)) continue;
    if (pid) {
      out.push({
        key: `p:${pid}`,
        name: (m.name as string) || (m.email as string) || "Team member",
        email: (m.email as string) ?? null,
        profileId: pid,
        firmMemberId: m.id as string,
      });
      continue;
    }
    out.push({
      key: `m:${m.id as string}`,
      name: (m.name as string) || (m.email as string) || "Team member",
      email: (m.email as string) ?? null,
      profileId: null,
      firmMemberId: m.id as string,
    });
  }

  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return out;
}

export function parseTimeLogAssigneeKey(key: string): {
  profileId: string | null;
  firmMemberId: string | null;
} {
  if (key.startsWith("p:")) return { profileId: key.slice(2), firmMemberId: null };
  if (key.startsWith("m:")) return { profileId: null, firmMemberId: key.slice(2) };
  return { profileId: key, firmMemberId: null };
}

export async function isAllowedTimeLogAssignee(firmId: string, key: string): Promise<boolean> {
  const assignees = await listTimeLogAssigneesForFirm(firmId);
  return assignees.some((a) => a.key === key || a.profileId === key);
}

/** @deprecated use listTimeLogAssigneesForFirm */
export type TimeAssigneeProfile = {
  id: string;
  name: string | null;
  email: string;
  role?: string | null;
  color?: string | null;
  billable_rate?: number | null;
  expected_hrs_per_week?: number | null;
  billable_pct?: number | null;
};

export async function listTimeEntryAssigneeProfiles(firmId: string): Promise<TimeAssigneeProfile[]> {
  const assignees = await listTimeLogAssigneesForFirm(firmId);
  return assignees.map((a) => ({
    id: a.profileId ?? a.firmMemberId!,
    name: a.name,
    email: a.email ?? "",
  }));
}

export async function isTimeEntryAssignee(firmId: string, profileUserId: string): Promise<boolean> {
  return isAllowedTimeLogAssignee(firmId, `p:${profileUserId}`) || isAllowedTimeLogAssignee(firmId, profileUserId);
}
