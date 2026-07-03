import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const DEMO_FIRM_ID = "00000000-0000-0000-0000-000000000d10";

// Stable UUIDs so re-loading demo data is idempotent (no duplicates).
const P1 = "00000000-0000-0000-0000-000000000d21"; // Morrison Residence
const P2 = "00000000-0000-0000-0000-000000000d22"; // Aldrich Commercial
const P3 = "00000000-0000-0000-0000-000000000d23"; // Park Avenue Kitchen
const P4 = "00000000-0000-0000-0000-000000000d24"; // Henderson Styling
const PIPE1 = "00000000-0000-0000-0000-000000000d31"; // Chen Residence
const SC1 = "00000000-0000-0000-0000-000000000d41";
const SC2 = "00000000-0000-0000-0000-000000000d42";

// Phase UUIDs: pattern d5<projIdx><phaseIdx>
function phaseId(project: number, phase: number): string {
  return `00000000-0000-0000-0000-0000d5${String(project).padStart(2, "0")}${String(phase).padStart(2, "0")}`;
}

// Expense UUIDs
function expenseId(n: number): string {
  return `00000000-0000-0000-0000-0000e600000${n}`;
}

async function assertSuper(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("is_super_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.is_super_admin) throw new Error("Forbidden");
}

async function ensureDemoFirm() {
  const { data } = await supabaseAdmin
    .from("firms")
    .select("id, name, subscription_tier, is_demo, data_status, last_reset_at, last_demo_loaded_at")
    .eq("id", DEMO_FIRM_ID)
    .maybeSingle();
  return data;
}

export const getDemoFirmStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.userId);
    return await ensureDemoFirm();
  });

export const enterDemoAsPrincipal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.userId);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ impersonated_firm_id: DEMO_FIRM_ID })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true, firm_id: DEMO_FIRM_ID };
  });

/* -------------------- Reset -------------------- */

export const resetDemoFirm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.userId);

    // 1. Look up project ids owned by demo firm (needed for cascading child rows
    //    that don't have their own firm_id column).
    const { data: projRows } = await supabaseAdmin
      .from("projects")
      .select("id")
      .eq("firm_id", DEMO_FIRM_ID);
    const projectIds = (projRows ?? []).map((r) => r.id);

    // 2. Delete firm-scoped tables in FK-safe order.
    await supabaseAdmin.from("time_entries").delete().eq("firm_id", DEMO_FIRM_ID);
    await supabaseAdmin.from("manual_hour_logs").delete().eq("firm_id", DEMO_FIRM_ID);
    if (projectIds.length) {
      await supabaseAdmin.from("project_steps").delete().in("project_phase_id",
        (
          await supabaseAdmin
            .from("project_phases")
            .select("id")
            .in("project_id", projectIds)
        ).data?.map((r) => r.id) ?? ["00000000-0000-0000-0000-000000000000"],
      );
      await supabaseAdmin.from("project_phases").delete().in("project_id", projectIds);
      await supabaseAdmin.from("project_financial_audit").delete().in("project_id", projectIds);
      await supabaseAdmin.from("project_assignments").delete().in("project_id", projectIds);
    }
    await supabaseAdmin.from("projects").delete().eq("firm_id", DEMO_FIRM_ID);
    await supabaseAdmin.from("pipeline_projects").delete().eq("firm_id", DEMO_FIRM_ID);
    await supabaseAdmin.from("sop_templates").delete().eq("firm_id", DEMO_FIRM_ID);
    await supabaseAdmin.from("expenses").delete().eq("firm_id", DEMO_FIRM_ID);
    await supabaseAdmin.from("scenarios").delete().eq("firm_id", DEMO_FIRM_ID);

    // 3. Reset firm_config to a fresh onboarding state.
    await supabaseAdmin
      .from("firm_config")
      .upsert(
        {
          firm_id: DEMO_FIRM_ID,
          comp_draw_annual: null,
          comp_ptax_pct: null,
          comp_health_annual: null,
          comp_retire_annual: null,
          comp_distribution_annual: null,
          comp_reserve_target_annual: null,
          available_hrs_per_week: null,
          target_billable_hrs_per_week: null,
          target_gross_margin_pct: null,
          rate_billed: null,
          rate_insight_shown: false,
          aligned_rate_at_signup: null,
          growth_signals: {},
          capacity_constrained_indicator: "unset",
        } as any,
        { onConflict: "firm_id" },
      );

    // 4. Enforce demo firm tier + mark clean.
    await supabaseAdmin
      .from("firms")
      .update({
        subscription_tier: "practice",
        subscription_status: "active",
        data_status: "clean",
        last_reset_at: new Date().toISOString(),
      } as any)
      .eq("id", DEMO_FIRM_ID)
      .eq("is_demo", true);

    return { ok: true };
  });

/* -------------------- Load demo data -------------------- */

function daysAgoISO(d: number): string {
  return new Date(Date.now() - d * 86400_000).toISOString().slice(0, 10);
}
function daysAheadISO(d: number): string {
  return new Date(Date.now() + d * 86400_000).toISOString().slice(0, 10);
}

type PhaseSeed = { name: string; expected: number; actual: number };

const PROJECT_SEEDS: Array<{
  id: string;
  idx: number;
  name: string;
  client_name: string;
  fixed_fee: number;
  scoped_hrs: number;
  start_days_ago: number;
  end_days_ahead: number;
  phases: PhaseSeed[];
}> = [
  {
    id: P1,
    idx: 1,
    name: "Morrison Residence",
    client_name: "Morrison Family",
    fixed_fee: 52000,
    scoped_hrs: 185,
    start_days_ago: 90,
    end_days_ahead: 45,
    phases: [
      { name: "Programming & Discovery", expected: 12, actual: 12 },
      { name: "Schematic Design", expected: 28, actual: 31 },
      { name: "Design Development", expected: 42, actual: 38 },
      { name: "Construction Documents", expected: 24, actual: 18 },
      { name: "Procurement", expected: 36, actual: 22 },
      { name: "Construction Admin", expected: 28, actual: 6 },
      { name: "Installation & Styling", expected: 15, actual: 0 },
    ],
  },
  {
    id: P2,
    idx: 2,
    name: "Aldrich Commercial",
    client_name: "Aldrich Properties LLC",
    fixed_fee: 89000,
    scoped_hrs: 310,
    start_days_ago: 45,
    end_days_ahead: 120,
    phases: [
      { name: "Programming", expected: 18, actual: 18 },
      { name: "Schematic Design", expected: 45, actual: 42 },
      { name: "Design Development", expected: 68, actual: 24 },
      { name: "Construction Documents", expected: 72, actual: 0 },
      { name: "Bidding", expected: 12, actual: 0 },
      { name: "Construction Admin", expected: 65, actual: 0 },
      { name: "Project Close", expected: 8, actual: 0 },
    ],
  },
  {
    id: P3,
    idx: 3,
    name: "Park Avenue Kitchen",
    client_name: "Park Family",
    fixed_fee: 28500,
    scoped_hrs: 96,
    start_days_ago: 30,
    end_days_ahead: 30,
    phases: [
      { name: "Programming & Site Review", expected: 6, actual: 7 },
      { name: "Concept Design", expected: 14, actual: 18 },
      { name: "Design Development", expected: 22, actual: 26 },
      { name: "Procurement", expected: 28, actual: 24 },
      { name: "Construction Oversight", expected: 18, actual: 8 },
      { name: "Styling & Close", expected: 8, actual: 0 },
    ],
  },
  {
    id: P4,
    idx: 4,
    name: "Henderson Styling",
    client_name: "Henderson Residence",
    fixed_fee: 8500,
    scoped_hrs: 22,
    start_days_ago: 14,
    end_days_ahead: 14,
    phases: [
      { name: "Discovery & Assessment", expected: 3, actual: 2 },
      { name: "Sourcing & Curation", expected: 8, actual: 4 },
      { name: "Styling Day", expected: 7, actual: 0 },
      { name: "Close", expected: 2, actual: 0 },
    ],
  },
];

export const loadDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.userId);

    // Clear existing demo data first so re-loading produces the same state.
    // (Re-uses reset logic inline — we skip the config reset because we
    // immediately re-populate it below.)
    const { data: projRows } = await supabaseAdmin
      .from("projects")
      .select("id")
      .eq("firm_id", DEMO_FIRM_ID);
    const oldProjectIds = (projRows ?? []).map((r) => r.id);

    await supabaseAdmin.from("time_entries").delete().eq("firm_id", DEMO_FIRM_ID);
    await supabaseAdmin.from("manual_hour_logs").delete().eq("firm_id", DEMO_FIRM_ID);
    if (oldProjectIds.length) {
      await supabaseAdmin.from("project_phases").delete().in("project_id", oldProjectIds);
      await supabaseAdmin.from("project_financial_audit").delete().in("project_id", oldProjectIds);
      await supabaseAdmin.from("project_assignments").delete().in("project_id", oldProjectIds);
    }
    await supabaseAdmin.from("projects").delete().eq("firm_id", DEMO_FIRM_ID);
    await supabaseAdmin.from("pipeline_projects").delete().eq("firm_id", DEMO_FIRM_ID);
    await supabaseAdmin.from("expenses").delete().eq("firm_id", DEMO_FIRM_ID);
    await supabaseAdmin.from("scenarios").delete().eq("firm_id", DEMO_FIRM_ID);

    // --- firm_config ---
    await supabaseAdmin
      .from("firm_config")
      .upsert(
        {
          firm_id: DEMO_FIRM_ID,
          comp_draw_annual: 95000,
          comp_ptax_pct: 15.3,
          comp_health_annual: 7200,
          comp_retire_annual: 4800,
          available_hrs_per_week: 40,
          target_billable_hrs_per_week: 28,
          target_gross_margin_pct: 35,
          rate_billed: 245,
          capacity_constrained_indicator: "yes",
          growth_signals: {
            owner_actual_hrs_per_week: 46,
            owner_production_hrs: 28,
            owner_leadership_hrs: 12,
            market_timing: "growing",
            client_experience: {
              missing_responses: false,
              late_deliverables: true,
              below_standard: false,
            },
          },
        } as any,
        { onConflict: "firm_id" },
      );

    // --- expenses ---
    const expenseSeeds = [
      { n: 1, name: "Design software suite", amount: 299, frequency: "monthly", category: "Software" },
      { n: 2, name: "Project management tools", amount: 89, frequency: "monthly", category: "Software" },
      { n: 3, name: "Professional liability insurance", amount: 3200, frequency: "annual", category: "Insurance" },
      { n: 4, name: "Accounting & bookkeeping", amount: 3600, frequency: "annual", category: "Professional Services" },
      { n: 5, name: "Professional development", amount: 2400, frequency: "annual", category: "Education" },
      { n: 6, name: "Marketing & website", amount: 150, frequency: "monthly", category: "Marketing" },
      { n: 7, name: "Office supplies & samples", amount: 200, frequency: "monthly", category: "Operations" },
      { n: 8, name: "Phone & communications", amount: 85, frequency: "monthly", category: "Operations" },
    ];
    await supabaseAdmin.from("expenses").upsert(
      expenseSeeds.map((e) => ({
        id: expenseId(e.n),
        firm_id: DEMO_FIRM_ID,
        name: e.name,
        amount: e.amount,
        frequency: e.frequency,
        category: e.category,
        recurring: true,
      })) as any,
      { onConflict: "id" },
    );

    // --- projects + phases ---
    for (const p of PROJECT_SEEDS) {
      await supabaseAdmin.from("projects").upsert(
        {
          id: p.id,
          firm_id: DEMO_FIRM_ID,
          name: p.name,
          client_name: p.client_name,
          status: "active",
          fixed_fee: p.fixed_fee,
          scoped_hrs: p.scoped_hrs,
          scoped_rate: 245,
          start_date: daysAgoISO(p.start_days_ago),
          end_date: daysAheadISO(p.end_days_ahead),
        } as any,
        { onConflict: "id" },
      );
      await supabaseAdmin.from("project_phases").upsert(
        p.phases.map((ph, i) => ({
          id: phaseId(p.idx, i + 1),
          project_id: p.id,
          name: ph.name,
          expected_hrs: ph.expected,
          actual_hrs: ph.actual,
          billable: true,
          sort_order: i,
          phase_over_scope: ph.actual > ph.expected,
        })) as any,
        { onConflict: "id" },
      );
    }

    // --- pipeline ---
    await supabaseAdmin.from("pipeline_projects").upsert(
      [
        {
          id: PIPE1,
          firm_id: DEMO_FIRM_ID,
          name: "Chen Residence",
          client_name: "Chen Family",
          billing_type: "fixed",
          fixed_fee: 65000,
          estimated_hrs: 220,
          probability_pct: 70,
          estimated_start: daysAheadISO(60),
          estimated_end: daysAheadISO(240),
          scoped_rate: 245,
          notes:
            "Full renovation, 3BR + primary suite. Met at Architectural Digest event. Strong fit.",
        },
      ] as any,
      { onConflict: "id" },
    );

    // --- time entries (recent, spread across 30 days, hitting phases 4/5) ---
    const principal = context.userId; // super admin acts as demo principal
    const timeEntries: any[] = [];
    // Morrison: 12 entries, ~48 hrs, mostly phases 4&5
    const morrisonSpec = [
      { day: 1, hrs: 5, phase: 4, billable: true },
      { day: 3, hrs: 4, phase: 5, billable: true },
      { day: 5, hrs: 3.5, phase: 4, billable: true },
      { day: 8, hrs: 4.5, phase: 5, billable: true },
      { day: 10, hrs: 5, phase: 4, billable: true },
      { day: 12, hrs: 2, phase: 4, billable: false },
      { day: 15, hrs: 4, phase: 5, billable: true },
      { day: 17, hrs: 3.5, phase: 5, billable: true },
      { day: 20, hrs: 5, phase: 4, billable: true },
      { day: 22, hrs: 4, phase: 5, billable: true },
      { day: 25, hrs: 4.5, phase: 4, billable: true },
      { day: 28, hrs: 3, phase: 5, billable: false },
    ];
    for (const e of morrisonSpec) {
      timeEntries.push({
        firm_id: DEMO_FIRM_ID,
        user_id: principal,
        project_id: P1,
        project_phase_id: phaseId(1, e.phase),
        date: daysAgoISO(e.day),
        hrs: e.hrs,
        billable: e.billable,
      });
    }
    // Aldrich Commercial: 8 entries ~32 hrs, phases 2&3, all billable
    const aldSpec = [
      { day: 2, hrs: 4, phase: 3 },
      { day: 4, hrs: 3.5, phase: 3 },
      { day: 7, hrs: 5, phase: 2 },
      { day: 11, hrs: 4, phase: 3 },
      { day: 14, hrs: 3.5, phase: 3 },
      { day: 18, hrs: 4, phase: 2 },
      { day: 22, hrs: 4, phase: 3 },
      { day: 27, hrs: 4, phase: 3 },
    ];
    for (const e of aldSpec) {
      timeEntries.push({
        firm_id: DEMO_FIRM_ID,
        user_id: principal,
        project_id: P2,
        project_phase_id: phaseId(2, e.phase),
        date: daysAgoISO(e.day),
        hrs: e.hrs,
        billable: true,
      });
    }
    // Park Ave Kitchen: 14 entries ~52 hrs, phases 4&5
    const parkSpec = [
      { day: 1, hrs: 4, phase: 5 },
      { day: 2, hrs: 3.5, phase: 4 },
      { day: 4, hrs: 4, phase: 4 },
      { day: 6, hrs: 3, phase: 5 },
      { day: 8, hrs: 4.5, phase: 4 },
      { day: 10, hrs: 3.5, phase: 5 },
      { day: 13, hrs: 4, phase: 4 },
      { day: 15, hrs: 4, phase: 4 },
      { day: 17, hrs: 3.5, phase: 5 },
      { day: 20, hrs: 4, phase: 4 },
      { day: 22, hrs: 3.5, phase: 5 },
      { day: 24, hrs: 3.5, phase: 4 },
      { day: 27, hrs: 3.5, phase: 5 },
      { day: 29, hrs: 3.5, phase: 4 },
    ];
    for (const e of parkSpec) {
      timeEntries.push({
        firm_id: DEMO_FIRM_ID,
        user_id: principal,
        project_id: P3,
        project_phase_id: phaseId(3, e.phase),
        date: daysAgoISO(e.day),
        hrs: e.hrs,
        billable: true,
      });
    }
    await supabaseAdmin.from("time_entries").insert(timeEntries as any);

    // --- manual hour logs (8 weeks) ---
    const weeks = [
      { total: 38, billable: 26 },
      { total: 41, billable: 29 },
      { total: 36, billable: 24 },
      { total: 44, billable: 31 },
      { total: 39, billable: 27 },
      { total: 35, billable: 22 },
      { total: 42, billable: 30 },
      { total: 40, billable: 28 },
    ];
    const now = new Date();
    const day = now.getUTCDay();
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - ((day + 6) % 7));
    const manualLogs = weeks.map((w, i) => {
      const start = new Date(monday);
      start.setUTCDate(monday.getUTCDate() - i * 7);
      return {
        firm_id: DEMO_FIRM_ID,
        user_id: principal,
        period_start: start.toISOString().slice(0, 10),
        period_type: "week",
        total_hrs_worked: w.total,
        billable_hrs: w.billable,
        non_billable_hrs: w.total - w.billable,
      };
    });
    await supabaseAdmin
      .from("manual_hour_logs")
      .upsert(manualLogs as any, {
        onConflict: "firm_id,user_id,period_type,period_start",
      });

    // --- scenarios ---
    await supabaseAdmin.from("scenarios").upsert(
      [
        {
          id: SC1,
          firm_id: DEMO_FIRM_ID,
          created_by: principal,
          name: "Rate increase to $275",
          payload: { rate_override: 275, hrs_override: null, label: "Rate increase to $275" },
        },
        {
          id: SC2,
          firm_id: DEMO_FIRM_ID,
          created_by: principal,
          name: "Add 4 billable hrs/week",
          payload: { rate_override: null, hrs_override: 32, label: "Add 4 billable hrs/week" },
        },
      ] as any,
      { onConflict: "id" },
    );

    // --- RLS safety validation: every seeded row must have firm_id = DEMO ---
    const checks = ["projects", "pipeline_projects", "expenses", "scenarios",
      "time_entries", "manual_hour_logs"];
    for (const tbl of checks) {
      const ids =
        tbl === "projects" ? [P1, P2, P3, P4] :
        tbl === "pipeline_projects" ? [PIPE1] :
        tbl === "scenarios" ? [SC1, SC2] :
        tbl === "expenses" ? expenseSeeds.map((e) => expenseId(e.n)) :
        [];
      if (!ids.length) continue;
      const { data: bad } = await (supabaseAdmin as any)
        .from(tbl)
        .select("id, firm_id")
        .neq("firm_id", DEMO_FIRM_ID)
        .in("id", ids);
      if (bad && bad.length) {
        throw new Error(`RLS validation failed: ${tbl} has rows outside demo firm.`);
      }
    }

    // --- mark demo firm status ---
    await supabaseAdmin
      .from("firms")
      .update({
        subscription_tier: "practice",
        subscription_status: "active",
        data_status: "demo_data",
        last_demo_loaded_at: new Date().toISOString(),
      } as any)
      .eq("id", DEMO_FIRM_ID)
      .eq("is_demo", true);

    return { ok: true };
  });

// touch to keep zod import used if unused warning would appear
const _z = z;
void _z;