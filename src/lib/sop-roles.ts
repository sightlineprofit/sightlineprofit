export const SOP_ASSIGNED_ROLE_VALUES = [
  "principal",
  "designer",
  "junior_designer",
  "coordinator",
  "project_manager",
  "account_manager",
  "administrative",
  "external",
  "other",
] as const;

export type SopAssignedRole = (typeof SOP_ASSIGNED_ROLE_VALUES)[number];

export type RoleStyle = {
  label: string;
  text: string;
  bg: string;
  bar: string;
  border: string;
};

export const SOP_ROLE_STYLES: Record<SopAssignedRole, RoleStyle> = {
  principal: {
    label: "Principal",
    text: "#2C2C2C",
    bg: "rgba(44,44,44,0.08)",
    bar: "#2C2C2C",
    border: "#2C2C2C",
  },
  designer: {
    label: "Designer",
    text: "#2d5a3d",
    bg: "rgba(92,138,110,0.10)",
    bar: "#5C8A6E",
    border: "#5C8A6E",
  },
  junior_designer: {
    label: "Junior designer",
    text: "#2d5a3d",
    bg: "rgba(92,138,110,0.08)",
    bar: "#5C8A6E",
    border: "#5C8A6E",
  },
  coordinator: {
    label: "Coordinator",
    text: "#7a5c1e",
    bg: "rgba(184,134,11,0.10)",
    bar: "#B8860B",
    border: "#B8860B",
  },
  project_manager: {
    label: "Project manager",
    text: "#1e4a7a",
    bg: "rgba(59,130,246,0.10)",
    bar: "#3B82F6",
    border: "#3B82F6",
  },
  account_manager: {
    label: "Account manager",
    text: "#5c3d7a",
    bg: "rgba(139,92,246,0.10)",
    bar: "#8B5CF6",
    border: "#8B5CF6",
  },
  administrative: {
    label: "Administrative",
    text: "#4a4139",
    bg: "rgba(107,98,89,0.12)",
    bar: "#6B6259",
    border: "#6B6259",
  },
  external: {
    label: "External",
    text: "#7a3a1e",
    bg: "rgba(196,113,74,0.10)",
    bar: "#C4714A",
    border: "#C4714A",
  },
  other: {
    label: "Other",
    text: "#4a4139",
    bg: "rgba(107,98,89,0.10)",
    bar: "#6B6259",
    border: "#6B6259",
  },
};

export const SOP_ROLE_OPTIONS = Object.entries(SOP_ROLE_STYLES).map(([value, s]) => ({
  value: value as SopAssignedRole,
  label: s.label,
}));

export function roleStyle(role: string | null | undefined): RoleStyle {
  const key = role ?? "principal";
  if (key in SOP_ROLE_STYLES) return SOP_ROLE_STYLES[key as SopAssignedRole];
  return SOP_ROLE_STYLES.principal;
}

export function assignedRoleDisplayLabel(
  role: string | null | undefined,
  customLabel?: string | null,
): string {
  if (role === "other") {
    const trimmed = customLabel?.trim();
    return trimmed || SOP_ROLE_STYLES.other.label;
  }
  return roleStyle(role).label;
}

export const RESOURCE_TYPE_LABELS: Record<string, string> = {
  email_template: "Email template",
  document_template: "Document",
  process_doc: "Process doc",
  video: "Video",
  external_link: "Link",
  contract: "Contract",
  checklist: "Checklist",
  other: "Other",
};
