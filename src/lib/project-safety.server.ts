import { isFinancialRole } from "@/lib/auth-guards.server";

const PROJECT_FINANCIAL_FIELDS = [
  "flat_fee_amount",
  "scoped_rate",
  "fixed_fee",
  "pricing_method",
  "payment_status",
  "payment_collected",
  "payment_collected_date",
  "payment_notes",
  "retainer_monthly_amount",
  "retainer_duration_months",
  "hourly_scoped_hours",
] as const;

export function stripProjectFinancialFields<T extends Record<string, unknown>>(project: T): Omit<T, (typeof PROJECT_FINANCIAL_FIELDS)[number]> {
  const safe = { ...project };
  for (const key of PROJECT_FINANCIAL_FIELDS) {
    delete safe[key];
  }
  return safe as Omit<T, (typeof PROJECT_FINANCIAL_FIELDS)[number]>;
}

export function stripProjectsForRole<T extends Record<string, unknown>>(
  projects: T[],
  role: string,
): T[] {
  if (isFinancialRole(role)) return projects;
  return projects.map((p) => stripProjectFinancialFields(p) as T);
}

export function stripProjectForRole<T extends Record<string, unknown>>(
  project: T,
  role: string,
): T {
  if (isFinancialRole(role)) return project;
  return stripProjectFinancialFields(project) as T;
}

/** Safe column list for non-financial project pickers (time calendar, etc.). */
export const PROJECT_SAFE_SELECT =
  "id, firm_id, name, client_name, status, start_date, end_date, created_at, archived_at, deleted_at, sop_template_id, scoped_hrs, est_weekly_hrs, last_confirmed_at";

/** Optional project columns that may be missing until migrations are applied. */
export const PROJECT_OPTIONAL_INSERT_COLUMNS = [
  "client_email",
  "client_phone",
  "client_preferred_communication",
  "retainer_monthly_amount",
  "retainer_duration_months",
  "monthly_retainer_fee",
  "retainer_start_date",
] as const;

export function isMissingProjectColumn(
  error: { message?: string } | null | undefined,
  column: string,
): boolean {
  const msg = error?.message ?? "";
  return msg.includes(column) && (msg.includes("schema cache") || msg.includes("does not exist"));
}

/** Insert a project row, dropping optional columns if the remote schema is behind. */
export async function insertProjectWithSchemaFallback(
  supabase: { from: (table: string) => any },
  row: Record<string, unknown>,
): Promise<{ id: string }> {
  const payload = { ...row };
  for (let attempt = 0; attempt < PROJECT_OPTIONAL_INSERT_COLUMNS.length + 1; attempt++) {
    const { data: project, error } = await supabase
      .from("projects")
      .insert(payload)
      .select("id")
      .single();
    if (!error && project?.id) return project as { id: string };

    const missing = PROJECT_OPTIONAL_INSERT_COLUMNS.find(
      (col) => col in payload && isMissingProjectColumn(error, col),
    );
    if (!missing) throw new Error(error?.message ?? "Could not create project");
    delete payload[missing];
  }
  throw new Error("Could not create project");
}
