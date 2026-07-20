#!/usr/bin/env npx tsx
/**
 * Live E2E test for time import against nizj Supabase.
 * Run: npx tsx scripts/live-time-import-test.ts
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { parseCsvFile } from "../src/lib/time-import/parsers";
import { resolveEntries, importResolvedEntries } from "../src/lib/time-import/import-service";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. from .env.local)");
  process.exit(1);
}

const FIRM_ID = process.env.TEST_FIRM_ID ?? "dfaf3ad5-2390-437c-9d1f-97c8b8198da3";
const USER_ID = process.env.TEST_USER_ID ?? "aaf3029d-6c41-4354-b895-52d073b32e45";

const supabase = createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  // 1. Verify schema
  const { error: schemaErr } = await supabase.from("time_import_logs").select("id").limit(1);
  if (schemaErr) {
    console.error("Schema check failed — apply migration first:", schemaErr.message);
    process.exit(1);
  }

  const { data: cols } = await supabase
    .from("time_entries")
    .select("imported_from, import_log_id")
    .limit(1);
  if (cols === null) {
    console.error("time_entries import columns missing");
    process.exit(1);
  }
  console.log("✓ Schema ready (time_import_logs + time_entries columns)");

  // 2. Load firm projects
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .eq("firm_id", FIRM_ID)
    .order("name");
  console.log(`✓ Firm ${FIRM_ID} has ${projects?.length ?? 0} projects`);
  if (projects?.length) {
    console.log("  Sample:", projects.slice(0, 3).map((p) => p.name).join(", "));
  }

  // 3. Build CSV using real project name if available
  const projectName = projects?.[0]?.name ?? "Henderson Styling";
  const fixturePath = join(root, "src/lib/time-import/__fixtures__/harvest-sample.csv");
  let csvText = readFileSync(fixturePath, "utf-8");
  // Remap fixture projects to real firm project for better match testing
  csvText = csvText
    .replace(/Henderson Residence/g, projectName)
    .replace(/Lakeview Kitchen/g, projectName)
    .replace(/Unknown Project XYZ/g, "Definitely Missing Project XYZ");

  const parsed = parseCsvFile(csvText);
  if (!parsed.ok) {
    console.error("Parse failed:", parsed.error);
    process.exit(1);
  }
  console.log(`✓ Parsed ${parsed.entries.length} entries (source: ${parsed.detectedSource})`);

  // 4. Resolve
  const { resolved, summary } = await resolveEntries(supabase, parsed.entries, FIRM_ID);
  console.log("✓ Resolution summary:", summary);

  // 5. Import only ready entries (use a test filename tag)
  const testFilename = `live-test-harvest-${Date.now()}.csv`;
  const beforeCount = await countImportedEntries();
  const result = await importResolvedEntries(
    supabase,
    resolved,
    FIRM_ID,
    USER_ID,
    parsed.detectedSource,
    testFilename,
    summary.date_range_start,
    summary.date_range_end,
  );
  console.log("✓ Import result:", result);

  const afterCount = await countImportedEntries();
  console.log(`✓ Imported entries in DB: ${afterCount - beforeCount} new (total tagged: ${afterCount})`);

  // 6. Verify import log
  const { data: log } = await supabase
    .from("time_import_logs")
    .select("*")
    .eq("id", result.import_log_id)
    .single();
  console.log("✓ Import log:", {
    id: log?.id,
    source: log?.source,
    rows_found: log?.rows_found,
    rows_imported: log?.rows_imported,
    rows_skipped: log?.rows_skipped,
    rows_errored: log?.rows_errored,
    date_range: [log?.date_range_start, log?.date_range_end],
  });

  // 7. Spot-check one inserted row
  const { data: sample } = await supabase
    .from("time_entries")
    .select("id, date, hrs, billable, project_id, imported_from, import_log_id, user_id")
    .eq("import_log_id", result.import_log_id)
    .limit(3);
  console.log("✓ Sample inserted rows:", sample);

  const allOk =
    result.imported > 0 &&
    log?.rows_imported === result.imported &&
    (sample?.length ?? 0) > 0 &&
    sample?.every((r) => r.imported_from === parsed.detectedSource && r.user_id === USER_ID);

  console.log(allOk ? "\n✅ Live import test PASSED" : "\n❌ Live import test FAILED");
  process.exit(allOk ? 0 : 1);
}

async function countImportedEntries(): Promise<number> {
  const { count } = await supabase
    .from("time_entries")
    .select("id", { count: "exact", head: true })
    .eq("firm_id", FIRM_ID)
    .not("import_log_id", "is", null);
  return count ?? 0;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
