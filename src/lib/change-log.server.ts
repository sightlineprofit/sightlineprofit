import type { SupabaseClient } from "@supabase/supabase-js";

export type ChangeLogCategory =
  | "rate_architecture"
  | "owner_compensation"
  | "team_cost"
  | "team_capacity"
  | "operating_expenses";

export type FieldType =
  | "currency"
  | "currency_annual"
  | "hours_per_week"
  | "weeks"
  | "percent"
  | "rate_per_hour"
  | "text"
  | "boolean"
  | "enum";

export type ChangedField = {
  field: string; // human label, e.g. "Hourly wage"
  key?: string; // db key for reference
  old_value: unknown;
  new_value: unknown;
  type: FieldType;
};

/**
 * Compute a diff between old & new records for a fixed list of field
 * descriptors. Returns only fields that actually changed (loose equality
 * across null/undefined/empty string; numeric compared numerically).
 */
export function diffFields<T extends Record<string, unknown>>(
  oldRow: Partial<T> | null | undefined,
  newRow: Partial<T>,
  fields: Array<{ key: keyof T & string; label: string; type: FieldType }>,
): ChangedField[] {
  const out: ChangedField[] = [];
  for (const f of fields) {
    const o = oldRow ? oldRow[f.key] : undefined;
    const n = newRow[f.key];
    if (!isDifferent(o, n, f.type)) continue;
    out.push({
      field: f.label,
      key: f.key,
      old_value: normalize(o),
      new_value: normalize(n),
      type: f.type,
    });
  }
  return out;
}

function normalize(v: unknown): unknown {
  if (v === undefined) return null;
  if (v === "") return null;
  return v;
}
function isDifferent(a: unknown, b: unknown, type: FieldType): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === null && nb === null) return false;
  if (na === null || nb === null) return true;
  if (
    type === "currency" ||
    type === "currency_annual" ||
    type === "hours_per_week" ||
    type === "weeks" ||
    type === "percent" ||
    type === "rate_per_hour"
  ) {
    return Math.abs(Number(na) - Number(nb)) > 0.0001;
  }
  if (type === "boolean") return Boolean(na) !== Boolean(nb);
  return String(na) !== String(nb);
}

/**
 * Insert one change log row for a single save action. No-ops when changes
 * is empty. Never throws — logging must not break the underlying save.
 */
export async function logChange(
  supabase: SupabaseClient,
  args: {
    firmId: string;
    userId: string | null;
    category: ChangeLogCategory;
    entityLabel: string;
    changes: ChangedField[];
  },
): Promise<void> {
  if (!args.changes || args.changes.length === 0) return;
  try {
    let name: string | null = null;
    if (args.userId) {
      const { data } = await supabase
        .from("profiles")
        .select("name, email")
        .eq("id", args.userId)
        .maybeSingle();
      name = (data?.name as string) || (data?.email as string) || null;
    }
    await supabase.from("firm_change_log").insert({
      firm_id: args.firmId,
      category: args.category,
      entity_label: args.entityLabel,
      changed_fields: args.changes,
      changed_by: args.userId,
      changed_by_name: name,
    });
  } catch {
    // fire-and-forget
  }
}