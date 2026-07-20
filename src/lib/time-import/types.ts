export type ImportSource =
  | "clockify"
  | "harvest"
  | "toggl"
  | "excel"
  | "studio_designer"
  | "generic_csv";

export interface NormalizedEntry {
  date: string;
  hrs: number;
  billable: boolean;
  project_name: string;
  description: string;
  activity_name: string;
  source_row: number;
  raw: Record<string, string>;
}

export interface ProjectRef {
  id: string;
  name: string;
}

export type ResolvedEntryStatus = "ready" | "needs_review" | "error";

export interface ResolvedEntry extends NormalizedEntry {
  matched_project_id: string | null;
  matched_project_name: string | null;
  matched_activity_id: string;
  matched_activity_name: string;
  needs_resolution: boolean;
  suggested_matches: ProjectRef[];
  status: ResolvedEntryStatus;
  error_message: string | null;
}

export interface ResolvedImportSummary {
  total: number;
  ready: number;
  needs_review: number;
  errors: number;
  date_range_start: string | null;
  date_range_end: string | null;
  projects_matched: number;
  projects_unmatched: number;
}

export interface ResolvedImportResult {
  resolved: ResolvedEntry[];
  summary: ResolvedImportSummary;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errored: number;
  skipped_detail: Array<{ row: number; reason: string }>;
  date_range_start: string | null;
  date_range_end: string | null;
  import_log_id: string;
}

export interface SkippedDetailRow {
  row: number;
  reason: string;
}

export type ParseResult =
  | { ok: true; entries: NormalizedEntry[]; detectedSource: ImportSource }
  | { ok: false; error: string };
