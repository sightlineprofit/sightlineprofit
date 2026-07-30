type SupabaseClient = { from: (table: string) => any };

export function isMissingProjectLifecycleColumn(error: { message?: string } | null): boolean {
  const msg = error?.message ?? "";
  return (
    msg.includes("deleted_at") ||
    msg.includes("archived_at") ||
    msg.includes("column") && msg.includes("does not exist")
  );
}

type ListFirmProjectsOptions = {
  select?: string;
  excludeDeleted?: boolean;
  excludeArchived?: boolean;
  orderBy?: { column: string; ascending?: boolean };
};

/** Lists firm projects, falling back when archive/delete columns are not migrated yet. */
export async function listFirmProjects(
  supabase: SupabaseClient,
  firmId: string,
  options: ListFirmProjectsOptions = {},
): Promise<{ data: Record<string, unknown>[]; lifecycleReady: boolean }> {
  const {
    select = "*",
    excludeDeleted = true,
    excludeArchived = false,
    orderBy = { column: "created_at", ascending: false },
  } = options;

  const base = () => {
    let q = supabase.from("projects").select(select).eq("firm_id", firmId);
    if (excludeDeleted) q = q.is("deleted_at", null);
    if (excludeArchived) q = q.is("archived_at", null);
    return q.order(orderBy.column, { ascending: orderBy.ascending ?? false });
  };

  let { data, error } = await base();
  if (error && isMissingProjectLifecycleColumn(error)) {
    const fallback = await supabase
      .from("projects")
      .select(select)
      .eq("firm_id", firmId)
      .order(orderBy.column, { ascending: orderBy.ascending ?? false });
    if (fallback.error) throw new Error(fallback.error.message);
    return { data: (fallback.data ?? []) as Record<string, unknown>[], lifecycleReady: false };
  }
  if (error) throw new Error(error.message);
  return { data: (data ?? []) as Record<string, unknown>[], lifecycleReady: true };
}

export async function listDeletedFirmProjects(
  supabase: SupabaseClient,
  firmId: string,
  limit = 50,
): Promise<{ data: Array<{ id: string; name: string; client_name: string | null; deleted_at: string | null }>; lifecycleReady: boolean }> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, client_name, deleted_at")
    .eq("firm_id", firmId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(limit);

  if (error && isMissingProjectLifecycleColumn(error)) {
    return { data: [], lifecycleReady: false };
  }
  if (error) throw new Error(error.message);
  return { data: (data ?? []) as Array<{ id: string; name: string; client_name: string | null; deleted_at: string | null }>, lifecycleReady: true };
}

export function requireProjectLifecycleMigration(): never {
  throw new Error(
    "Archive and delete require a database update. Run supabase/migrations/20260722170000_project_archive_delete.sql in the Supabase SQL editor.",
  );
}
