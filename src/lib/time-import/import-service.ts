import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { isValidImportDate } from "./parsers";
import type {
  ImportResult,
  ImportSource,
  NormalizedEntry,
  ProjectRef,
  ResolvedEntry,
  ResolvedImportResult,
  ResolvedImportSummary,
  SkippedDetailRow,
} from "./types";

type DbClient = SupabaseClient<Database>;

interface ActivityTypeRow {
  id: string;
  name: string;
  is_billable: boolean;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function stringSimilarity(a: string, b: string): number {
  const la = normalizeName(a);
  const lb = normalizeName(b);
  if (!la || !lb) return 0;
  if (la === lb) return 1;
  if (la.includes(lb) || lb.includes(la)) return 0.85;
  const longer = la.length >= lb.length ? la : lb;
  const shorter = la.length >= lb.length ? lb : la;
  if (longer.length === 0) return 1;
  const editDist = levenshtein(longer, shorter);
  return 1 - editDist / longer.length;
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[b.length][a.length];
}

function matchProject(
  projectName: string,
  projects: ProjectRef[],
  billable: boolean,
): {
  matched_project_id: string | null;
  matched_project_name: string | null;
  needs_resolution: boolean;
  suggested_matches: ProjectRef[];
} {
  const trimmed = projectName.trim();
  if (!trimmed) {
    if (!billable) {
      return {
        matched_project_id: null,
        matched_project_name: null,
        needs_resolution: false,
        suggested_matches: [],
      };
    }
    return {
      matched_project_id: null,
      matched_project_name: null,
      needs_resolution: true,
      suggested_matches: projects.slice(0, 3),
    };
  }

  const exact = projects.find((p) => normalizeName(p.name) === normalizeName(trimmed));
  if (exact) {
    return {
      matched_project_id: exact.id,
      matched_project_name: exact.name,
      needs_resolution: false,
      suggested_matches: [],
    };
  }

  const contains = projects.find((p) => {
    const pn = normalizeName(p.name);
    const en = normalizeName(trimmed);
    return pn.includes(en) || en.includes(pn);
  });
  if (contains) {
    return {
      matched_project_id: contains.id,
      matched_project_name: contains.name,
      needs_resolution: false,
      suggested_matches: [],
    };
  }

  const suggested = [...projects]
    .map((p) => ({ project: p, score: stringSimilarity(trimmed, p.name) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.project);

  return {
    matched_project_id: null,
    matched_project_name: null,
    needs_resolution: true,
    suggested_matches: suggested,
  };
}

function findDefaultActivity(activities: ActivityTypeRow[]): ActivityTypeRow {
  const internalAdmin = activities.find(
    (a) => normalizeName(a.name) === "internal admin" && !a.is_billable,
  );
  if (internalAdmin) return internalAdmin;
  const nonBillable = activities.find((a) => !a.is_billable);
  if (nonBillable) return nonBillable;
  const uncategorized = activities.find((a) => normalizeName(a.name) === "uncategorized");
  if (uncategorized) return uncategorized;
  if (activities.length > 0) return activities[0];
  throw new Error("No activity types found for firm");
}

function matchActivity(
  activityName: string,
  activities: ActivityTypeRow[],
  defaultActivity: ActivityTypeRow,
): { id: string; name: string } {
  const trimmed = activityName.trim();
  if (!trimmed) return { id: defaultActivity.id, name: defaultActivity.name };
  const match = activities.find((a) => normalizeName(a.name) === normalizeName(trimmed));
  if (match) return { id: match.id, name: match.name };
  const contains = activities.find((a) => {
    const an = normalizeName(a.name);
    const en = normalizeName(trimmed);
    return an.includes(en) || en.includes(an);
  });
  if (contains) return { id: contains.id, name: contains.name };
  return { id: defaultActivity.id, name: defaultActivity.name };
}

function validateEntry(entry: NormalizedEntry): string | null {
  if (!entry.date) return "Missing or invalid date";
  const dateErr = isValidImportDate(entry.date);
  if (dateErr) return dateErr;
  if (entry.hrs <= 0) return "Hours must be greater than 0";
  if (entry.hrs > 24) return "Hours cannot exceed 24 per entry";
  return null;
}

function buildSummary(resolved: ResolvedEntry[]): ResolvedImportSummary {
  const dates = resolved
    .filter((e) => e.status !== "error" && e.date)
    .map((e) => e.date)
    .sort();
  const matched = resolved.filter((e) => e.matched_project_id !== null).length;
  const unmatched = resolved.filter(
    (e) => e.status === "needs_review" && e.needs_resolution,
  ).length;
  return {
    total: resolved.length,
    ready: resolved.filter((e) => e.status === "ready").length,
    needs_review: resolved.filter((e) => e.status === "needs_review").length,
    errors: resolved.filter((e) => e.status === "error").length,
    date_range_start: dates[0] ?? null,
    date_range_end: dates[dates.length - 1] ?? null,
    projects_matched: matched,
    projects_unmatched: unmatched,
  };
}

export async function resolveEntries(
  supabase: DbClient,
  entries: NormalizedEntry[],
  firmId: string,
): Promise<ResolvedImportResult> {
  const [{ data: projects }, { data: activities }] = await Promise.all([
    supabase.from("projects").select("id, name").eq("firm_id", firmId).order("name"),
    supabase.from("activity_types").select("id, name, is_billable").eq("firm_id", firmId),
  ]);

  const projectList: ProjectRef[] = (projects ?? []).map((p) => ({
    id: p.id,
    name: p.name,
  }));
  const activityList: ActivityTypeRow[] = (activities ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    is_billable: a.is_billable,
  }));
  const defaultActivity = findDefaultActivity(activityList);

  const resolved: ResolvedEntry[] = entries.map((entry) => {
    const validationError = validateEntry(entry);
    if (validationError) {
      return {
        ...entry,
        matched_project_id: null,
        matched_project_name: null,
        matched_activity_id: defaultActivity.id,
        matched_activity_name: defaultActivity.name,
        needs_resolution: false,
        suggested_matches: [],
        status: "error",
        error_message: validationError,
      };
    }

    const projectMatch = matchProject(entry.project_name, projectList, entry.billable);
    const activityMatch = matchActivity(entry.activity_name, activityList, defaultActivity);

    let status: ResolvedEntry["status"] = "ready";
    let needsResolution = projectMatch.needs_resolution;
    if (projectMatch.needs_resolution && !entry.billable) {
      // Non-billable without a project match can import with null project_id.
      needsResolution = false;
      status = "ready";
    } else if (projectMatch.needs_resolution) {
      status = "needs_review";
    }

    return {
      ...entry,
      matched_project_id: projectMatch.matched_project_id,
      matched_project_name: projectMatch.matched_project_name,
      matched_activity_id: activityMatch.id,
      matched_activity_name: activityMatch.name,
      needs_resolution: needsResolution,
      suggested_matches: projectMatch.suggested_matches,
      status,
      error_message: null,
    };
  });

  return { resolved, summary: buildSummary(resolved) };
}

export interface ImportedEntryRow {
  firm_id: string;
  user_id: string;
  project_id: string | null;
  activity_type_id: string;
  date: string;
  hrs: number;
  billable: boolean;
  description: string | null;
  imported_from: string;
  import_log_id: string;
}

export function buildImportableRow(
  entry: ResolvedEntry,
  firmId: string,
  userId: string,
  source: ImportSource,
  importLogId: string,
): ImportedEntryRow | null {
  if (entry.status === "error") return null;
  if (entry.status === "needs_review") return null;

  if (entry.billable && !entry.matched_project_id) return null;

  return {
    firm_id: firmId,
    user_id: userId,
    project_id: entry.matched_project_id,
    activity_type_id: entry.matched_activity_id,
    date: entry.date,
    hrs: entry.hrs,
    billable: entry.billable,
    description: entry.description || null,
    imported_from: source,
    import_log_id: importLogId,
  };
}

export async function insertImportedEntry(
  supabase: DbClient,
  row: ImportedEntryRow,
): Promise<void> {
  const { error } = await supabase.from("time_entries").insert({
    firm_id: row.firm_id,
    user_id: row.user_id,
    project_id: row.project_id,
    activity_type_id: row.activity_type_id,
    date: row.date,
    hrs: row.hrs,
    billable: row.billable,
    description: row.description,
    start_time: null,
    end_time: null,
    imported_from: row.imported_from,
    import_log_id: row.import_log_id,
  });
  if (error) throw new Error(error.message);
}

export async function importResolvedEntries(
  supabase: DbClient,
  entries: ResolvedEntry[],
  firmId: string,
  userId: string,
  source: ImportSource,
  filename: string,
  dateRangeStart: string | null,
  dateRangeEnd: string | null,
): Promise<ImportResult> {
  const { data: log, error: logError } = await supabase
    .from("time_import_logs")
    .insert({
      firm_id: firmId,
      imported_by: userId,
      source,
      filename,
      rows_found: entries.length,
      rows_imported: 0,
      rows_skipped: 0,
      rows_errored: 0,
      skipped_detail: [],
      date_range_start: dateRangeStart,
      date_range_end: dateRangeEnd,
    })
    .select("id")
    .single();

  if (logError || !log) throw new Error(logError?.message ?? "Failed to create import log");
  const importLogId = log.id;

  let imported = 0;
  let skipped = 0;
  let errored = 0;
  const skipped_detail: SkippedDetailRow[] = [];
  const importedDates: string[] = [];

  for (const entry of entries) {
    if (entry.status === "error") {
      errored++;
      skipped_detail.push({
        row: entry.source_row,
        reason: entry.error_message ?? "Validation error",
      });
      continue;
    }

    const row = buildImportableRow(entry, firmId, userId, source, importLogId);
    if (!row) {
      skipped++;
      const reason =
        entry.status === "needs_review"
          ? `Unresolved project: ${entry.project_name || "(empty)"}`
          : "Not eligible for import";
      skipped_detail.push({ row: entry.source_row, reason });
      continue;
    }

    try {
      await insertImportedEntry(supabase, row);
      imported++;
      importedDates.push(entry.date);
    } catch (e) {
      errored++;
      skipped_detail.push({
        row: entry.source_row,
        reason: e instanceof Error ? e.message : "Insert failed",
      });
    }
  }

  const importDates = [...importedDates].sort();

  const { error: updateError } = await supabase
    .from("time_import_logs")
    .update({
      rows_imported: imported,
      rows_skipped: skipped,
      rows_errored: errored,
      skipped_detail,
      date_range_start: dateRangeStart ?? importDates[0] ?? null,
      date_range_end: dateRangeEnd ?? importDates[importDates.length - 1] ?? null,
    })
    .eq("id", importLogId);

  if (updateError) throw new Error(updateError.message);

  return {
    imported,
    skipped,
    errored,
    skipped_detail,
    date_range_start: dateRangeStart ?? importDates[0] ?? null,
    date_range_end: dateRangeEnd ?? importDates[importDates.length - 1] ?? null,
    import_log_id: importLogId,
  };
}

export function applyProjectOverride(
  entries: ResolvedEntry[],
  sourceRow: number,
  projectId: string,
  projectName: string,
): ResolvedEntry[] {
  return entries.map((e) => {
    if (e.source_row !== sourceRow) return e;
    if (e.status === "error") return e;
    return {
      ...e,
      matched_project_id: projectId,
      matched_project_name: projectName,
      needs_resolution: false,
      status: "ready",
      suggested_matches: [],
    };
  });
}

export function applyBulkProjectOverride(
  entries: ResolvedEntry[],
  projectNameKey: string,
  projectId: string,
  projectName: string,
): ResolvedEntry[] {
  const key = normalizeName(projectNameKey);
  return entries.map((e) => {
    if (e.status === "error") return e;
    if (normalizeName(e.project_name) !== key) return e;
    return {
      ...e,
      matched_project_id: projectId,
      matched_project_name: projectName,
      needs_resolution: false,
      status: "ready",
      suggested_matches: [],
    };
  });
}

export function recomputeSummary(resolved: ResolvedEntry[]): ResolvedImportSummary {
  return buildSummary(resolved);
}
