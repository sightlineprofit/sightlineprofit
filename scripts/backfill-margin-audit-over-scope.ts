#!/usr/bin/env npx tsx
/**
 * One-time backfill: audit entries for projects already over scope.
 *
 * Run (dry run):
 *   npx tsx --env-file=.env.local scripts/backfill-margin-audit-over-scope.ts --dry-run
 *
 * Run (live):
 *   npx tsx --env-file=.env.local scripts/backfill-margin-audit-over-scope.ts
 *
 * Optional: --firm-id=<uuid> to limit to one firm.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import {
  backfillMarginAuditForProject,
  sumProjectHours,
} from "../src/lib/project-margin-audit.server";
import { getProjectFinancials, breakEvenResultFromSnapshot, type ProjectCostSnapshot } from "../src/lib/finance";
import { fetchProjectStepAssigneeRows } from "../src/lib/project-cost-snapshot.server";

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. --env-file=.env.local)");
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const firmIdArg = args.find((a) => a.startsWith("--firm-id="))?.split("=")[1];

const supabase = createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function resolveBreakEven(projectId: string, firmId: string, snapshot: ProjectCostSnapshot) {
  let breakEvenResult = breakEvenResultFromSnapshot(snapshot);
  try {
    const { liveResult } = await fetchProjectStepAssigneeRows(supabase, projectId, snapshot, firmId);
    const snapshotResult = breakEvenResultFromSnapshot(snapshot);
    const assigneesNewerThanSnapshot =
      liveResult.hasAssigneeData &&
      (!snapshotResult || snapshot.cost_basis_method === "firm_average");
    breakEvenResult =
      liveResult.hasAssigneeData && !assigneesNewerThanSnapshot ? liveResult : snapshotResult;
  } catch {
    // optional assignee tables
  }
  return breakEvenResult;
}

async function findAuditUserId(firmId: string): Promise<string | null> {
  const { data: admin } = await supabase
    .from("profiles")
    .select("id")
    .eq("firm_id", firmId)
    .in("role", ["principal", "admin"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return admin?.id ?? null;
}

async function main() {
  console.log(`Margin audit backfill${dryRun ? " (dry run)" : ""}\n`);

  let projectsQuery = supabase
    .from("projects")
    .select("id, name, firm_id, deleted_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (firmIdArg) projectsQuery = projectsQuery.eq("firm_id", firmIdArg);

  const { data: projects, error } = await projectsQuery;
  if (error) {
    console.error("Failed to load projects:", error.message);
    process.exit(1);
  }

  const projectIds = (projects ?? []).map((p) => p.id);
  const { data: snapshots } = projectIds.length
    ? await supabase.from("project_cost_snapshots").select("*").in("project_id", projectIds)
    : { data: [] as never[] };
  const snapshotByProject = new Map((snapshots ?? []).map((s) => [s.project_id, s]));

  let candidates = 0;
  let inserted = 0;
  let skipped = 0;
  let noSnapshot = 0;

  for (const project of projects ?? []) {
    const snapshot = snapshotByProject.get(project.id);
    if (!snapshot) continue;

    const hoursLogged = await sumProjectHours(supabase, project.id);
    const breakEvenResult = await resolveBreakEven(project.id, project.firm_id, snapshot as ProjectCostSnapshot);
    const fin = getProjectFinancials({
      project: project as Parameters<typeof getProjectFinancials>[0]["project"],
      snapshot: snapshot as ProjectCostSnapshot,
      hoursLogged,
      breakEvenResult,
    });
    if (hoursLogged <= fin.scopedHours) continue;

    candidates++;
    const userId = (await findAuditUserId(project.firm_id)) ?? project.firm_id;
    const result = await backfillMarginAuditForProject({
      supabase,
      projectId: project.id,
      firmId: project.firm_id,
      userId,
      dryRun,
    });

    if (result === "inserted") {
      inserted++;
      console.log(
        `${dryRun ? "[dry-run] would backfill" : "✓ backfilled"} ${project.name} — ${hoursLogged} hrs logged (${fin.overHours} over ${fin.scopedHours} scoped)`,
      );
    } else if (result === "skipped") {
      skipped++;
      console.log(`– skipped ${project.name} (already backfilled or at scope)`);
    } else {
      noSnapshot++;
    }
  }

  console.log(
    `\nDone. ${candidates} over-scope project(s); ${inserted} ${dryRun ? "would be " : ""}written; ${skipped} skipped; ${noSnapshot} missing snapshot.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
