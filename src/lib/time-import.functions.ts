import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  parseCsvFile,
  uiSourceToImportSource,
} from "@/lib/time-import/parsers";
import {
  importResolvedEntries,
  resolveEntries,
} from "@/lib/time-import/import-service";
import type { ImportSource, ResolvedEntry } from "@/lib/time-import/types";

const uiSourceSchema = z.enum([
  "clockify",
  "harvest",
  "toggl",
  "studio_designer",
  "excel",
  "other",
]);

const resolvedEntrySchema = z.object({
  date: z.string(),
  hrs: z.number(),
  billable: z.boolean(),
  project_name: z.string(),
  description: z.string(),
  activity_name: z.string(),
  source_row: z.number(),
  raw: z.record(z.string()),
  matched_project_id: z.string().uuid().nullable(),
  matched_project_name: z.string().nullable(),
  matched_activity_id: z.string().uuid(),
  matched_activity_name: z.string(),
  needs_resolution: z.boolean(),
  suggested_matches: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  status: z.enum(["ready", "needs_review", "error"]),
  error_message: z.string().nullable(),
});

const previewSchema = z.object({
  csvText: z.string().min(1).max(10_000_000),
  source: uiSourceSchema,
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  filename: z.string().min(1).max(500),
});

const importSchema = z.object({
  entries: z.array(resolvedEntrySchema).min(1).max(50_000),
  source: z.enum([
    "clockify",
    "harvest",
    "toggl",
    "excel",
    "studio_designer",
    "generic_csv",
  ]),
  filename: z.string().min(1).max(500),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export const previewTimeImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => previewSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id, role")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) throw new Error("No firm");
    if (!["principal", "admin"].includes(profile.role as string)) {
      throw new Error("Admin only");
    }

    const preferredSource = uiSourceToImportSource(data.source);
    const parsed = parseCsvFile(data.csvText, preferredSource, data.dateFrom, data.dateTo);
    if (!parsed.ok) {
      return { ok: false as const, error: parsed.error };
    }

    const { data: projects } = await supabase
      .from("projects")
      .select("id, name")
      .eq("firm_id", profile.firm_id)
      .order("name");

    const result = await resolveEntries(supabase, parsed.entries, profile.firm_id);

    return {
      ok: true as const,
      detectedSource: parsed.detectedSource,
      projects: projects ?? [],
      ...result,
    };
  });

export const runTimeImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => importSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id, role")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) throw new Error("No firm");
    if (!["principal", "admin"].includes(profile.role as string)) {
      throw new Error("Admin only");
    }

    const entries = data.entries as ResolvedEntry[];
    const result = await importResolvedEntries(
      supabase,
      entries,
      profile.firm_id,
      userId,
      data.source as ImportSource,
      data.filename,
      data.dateFrom ?? null,
      data.dateTo ?? null,
    );

    return { ok: true as const, ...result };
  });

export const listTimeImportLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id, role")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) throw new Error("No firm");
    if (!["principal", "admin"].includes(profile.role as string)) {
      throw new Error("Admin only");
    }

    const { data: logs, error } = await supabase
      .from("time_import_logs")
      .select("*")
      .eq("firm_id", profile.firm_id)
      .order("imported_at", { ascending: false })
      .limit(20);

    if (error) throw new Error(error.message);
    return { logs: logs ?? [] };
  });

export const createImportProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ name: z.string().trim().min(1).max(160) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id, role")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) throw new Error("No firm");
    if (!["principal", "admin"].includes(profile.role as string)) {
      throw new Error("Admin only");
    }

    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        firm_id: profile.firm_id,
        name: data.name,
        status: "active",
        pricing_method: "hourly",
      })
      .select("id, name")
      .single();

    if (error) throw new Error(error.message);
    return { project };
  });
