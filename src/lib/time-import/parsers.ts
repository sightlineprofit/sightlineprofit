import Papa from "papaparse";
import type { ImportSource, NormalizedEntry, ParseResult } from "./types";

const TEN_YEARS_MS = 10 * 365.25 * 24 * 60 * 60 * 1000;

export function parseCsvText(text: string): { headers: string[]; rows: string[][] } {
  const result = Papa.parse<string[]>(text.trim(), {
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  if (result.errors.length > 0 && result.data.length === 0) {
    throw new Error(result.errors[0]?.message ?? "Failed to parse CSV");
  }
  const data = result.data.filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
  if (data.length === 0) return { headers: [], rows: [] };
  const headers = data[0].map((h) => String(h ?? "").trim());
  const rows = data.slice(1).map((row) => headers.map((_, i) => String(row[i] ?? "").trim()));
  return { headers, rows };
}

export function detectSource(headers: string[]): ImportSource {
  const normalized = headers.map((h) => h.trim());
  if (normalized.includes("Duration (decimal)")) return "clockify";
  if (normalized.includes("Billable?")) return "harvest";
  if (normalized.includes("Start date") && normalized.includes("Duration")) return "toggl";
  if (normalized.includes("Phase") || normalized.includes("Staff")) return "studio_designer";
  return "generic_csv";
}

function colIndex(headers: string[], name: string): number {
  const idx = headers.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  return idx;
}

function getCell(row: string[], headers: string[], name: string): string {
  const idx = colIndex(headers, name);
  return idx >= 0 ? (row[idx] ?? "").trim() : "";
}

export function durationHmsToDecimal(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  if (!trimmed.includes(":")) return parseFloat(trimmed) || 0;
  const parts = trimmed.split(":").map((p) => parseInt(p, 10) || 0);
  if (parts.length === 3) return parts[0] + parts[1] / 60 + parts[2] / 3600;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return parseFloat(trimmed) || 0;
}

export function parseBillableFlag(value: string, defaultValue = true): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return defaultValue;
  if (["yes", "y", "true", "1"].includes(v)) return true;
  if (["no", "n", "false", "0"].includes(v)) return false;
  return defaultValue;
}

export function parseFlexibleDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const us = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    const [, m, d, y] = us;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

export function isValidImportDate(dateStr: string): string | null {
  const parsed = parseFlexibleDate(dateStr);
  if (!parsed) return "Invalid date format";
  const date = new Date(parsed + "T12:00:00");
  if (Number.isNaN(date.getTime())) return "Invalid date";
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (date > today) return "Date cannot be in the future";
  const tenYearsAgo = new Date(today.getTime() - TEN_YEARS_MS);
  if (date < tenYearsAgo) return "Date is more than 10 years ago";
  return null;
}

function rowToRecord(headers: string[], row: string[]): Record<string, string> {
  const raw: Record<string, string> = {};
  headers.forEach((h, i) => {
    raw[h] = row[i] ?? "";
  });
  return raw;
}

function parseUsDateToIso(value: string): string {
  const iso = parseFlexibleDate(value);
  return iso ?? "";
}

export function parseClockify(rows: string[][], headers: string[]): NormalizedEntry[] {
  const entries: NormalizedEntry[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const raw = rowToRecord(headers, row);
    const decimalDur = getCell(row, headers, "Duration (decimal)");
    let hrs = parseFloat(decimalDur) || 0;
    if (hrs <= 0) {
      hrs = durationHmsToDecimal(getCell(row, headers, "Duration (h)"));
    }
    entries.push({
      date: parseUsDateToIso(getCell(row, headers, "Start Date")),
      hrs,
      billable: getCell(row, headers, "Billable") === "Yes",
      project_name: getCell(row, headers, "Project"),
      description: getCell(row, headers, "Description"),
      activity_name: getCell(row, headers, "Task"),
      source_row: i + 2,
      raw,
    });
  }
  return entries;
}

export function parseHarvest(rows: string[][], headers: string[]): NormalizedEntry[] {
  const entries: NormalizedEntry[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const raw = rowToRecord(headers, row);
    entries.push({
      date: getCell(row, headers, "Date"),
      hrs: parseFloat(getCell(row, headers, "Hours")) || 0,
      billable: getCell(row, headers, "Billable?") === "Yes",
      project_name: getCell(row, headers, "Project"),
      description: getCell(row, headers, "Notes"),
      activity_name: getCell(row, headers, "Task"),
      source_row: i + 2,
      raw,
    });
  }
  return entries;
}

export function parseToggl(rows: string[][], headers: string[]): NormalizedEntry[] {
  const entries: NormalizedEntry[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const raw = rowToRecord(headers, row);
    const task = getCell(row, headers, "Task");
    const tags = getCell(row, headers, "Tags");
    const firstTag = tags.split(",").map((t) => t.trim()).find(Boolean) ?? "";
    entries.push({
      date: getCell(row, headers, "Start date"),
      hrs: durationHmsToDecimal(getCell(row, headers, "Duration")),
      billable: getCell(row, headers, "Billable") === "Yes",
      project_name: getCell(row, headers, "Project"),
      description: getCell(row, headers, "Description"),
      activity_name: task || firstTag,
      source_row: i + 2,
      raw,
    });
  }
  return entries;
}

function studioDesignerHeadersMatch(headers: string[]): boolean {
  const lower = headers.map((h) => h.toLowerCase());
  const hasDate = lower.includes("date");
  const hasHours = lower.includes("hours");
  const hasProject = lower.includes("project");
  return hasDate && hasHours && (hasProject || lower.includes("phase") || lower.includes("activity"));
}

export function parseStudioDesigner(rows: string[][], headers: string[]): NormalizedEntry[] {
  if (!studioDesignerHeadersMatch(headers)) {
    return parseGenericCsv(rows, headers);
  }
  const entries: NormalizedEntry[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const raw = rowToRecord(headers, row);
    const notes = getCell(row, headers, "Notes");
    const activity = getCell(row, headers, "Activity");
    const phase = getCell(row, headers, "Phase");
    entries.push({
      date: parseUsDateToIso(getCell(row, headers, "Date")),
      hrs: parseFloat(getCell(row, headers, "Hours")) || 0,
      billable: parseBillableFlag(getCell(row, headers, "Billable"), true),
      project_name: getCell(row, headers, "Project"),
      description: notes || activity,
      activity_name: phase || activity,
      source_row: i + 2,
      raw,
    });
  }
  return entries;
}

export function parseGenericCsv(rows: string[][], headers: string[]): NormalizedEntry[] {
  const required = ["Date", "Hours", "Project"] as const;
  for (const col of required) {
    if (colIndex(headers, col) < 0) {
      throw new Error(
        `Required column '${col}' not found. Download the template to see the expected format.`,
      );
    }
  }
  const entries: NormalizedEntry[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const raw = rowToRecord(headers, row);
    const dateRaw = getCell(row, headers, "Date");
    if (dateRaw.toUpperCase().startsWith("INSTRUCTIONS")) continue;
    entries.push({
      date: parseUsDateToIso(dateRaw),
      hrs: parseFloat(getCell(row, headers, "Hours")) || 0,
      billable: parseBillableFlag(getCell(row, headers, "Billable"), true),
      project_name: getCell(row, headers, "Project"),
      description: getCell(row, headers, "Description"),
      activity_name: getCell(row, headers, "Activity"),
      source_row: i + 2,
      raw,
    });
  }
  return entries;
}

export function parseBySource(
  headers: string[],
  rows: string[][],
  source: ImportSource,
): NormalizedEntry[] {
  switch (source) {
    case "clockify":
      return parseClockify(rows, headers);
    case "harvest":
      return parseHarvest(rows, headers);
    case "toggl":
      return parseToggl(rows, headers);
    case "studio_designer":
      return parseStudioDesigner(rows, headers);
    case "excel":
    case "generic_csv":
      return parseGenericCsv(rows, headers);
    default:
      return parseGenericCsv(rows, headers);
  }
}

export function parseCsvFile(
  text: string,
  preferredSource?: ImportSource,
  dateFrom?: string | null,
  dateTo?: string | null,
): ParseResult {
  try {
    const { headers, rows } = parseCsvText(text);
    if (headers.length === 0) {
      return { ok: false, error: "CSV file is empty or has no headers." };
    }
    const detected = preferredSource ?? detectSource(headers);
    let entries: NormalizedEntry[];
    try {
      entries = parseBySource(headers, rows, detected);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to parse CSV";
      return { ok: false, error: message };
    }
    if (dateFrom || dateTo) {
      entries = entries.filter((e) => {
        if (!e.date) return false;
        if (dateFrom && e.date < dateFrom) return false;
        if (dateTo && e.date > dateTo) return false;
        return true;
      });
    }
    return { ok: true, entries, detectedSource: detected };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to parse CSV";
    return { ok: false, error: message };
  }
}

export function uiSourceToImportSource(
  ui: "clockify" | "harvest" | "toggl" | "studio_designer" | "excel" | "other",
): ImportSource {
  if (ui === "excel") return "excel";
  if (ui === "other") return "generic_csv";
  return ui;
}

export function formatSourceLabel(source: ImportSource): string {
  const labels: Record<ImportSource, string> = {
    clockify: "Clockify",
    harvest: "Harvest",
    toggl: "Toggl",
    excel: "Excel",
    studio_designer: "Studio Designer",
    generic_csv: "CSV",
  };
  return labels[source] ?? source;
}
