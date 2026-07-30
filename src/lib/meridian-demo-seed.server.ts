import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  calc,
  buildSnapshotFromCalc,
  mapTeamBurdenRow,
  type Expense,
  type FirmConfig,
} from "@/lib/finance";
import { seedDefaultSops } from "@/lib/sop-seed.server";
import {
  MERIDIAN_DEMO_FIRM_ID,
  MERIDIAN_DEMO_FIRM_NAME,
  MERIDIAN_DEMO_STRIPE_SUB_ID,
  MERIDIAN_MEMBER_ID,
  MERIDIAN_SOP_FULL_RENO_ID,
  MERIDIAN_SOP_INTAKE_ID,
  MERIDIAN_SOP_KITCHEN_ID,
  meridianExpenseId,
  meridianProjectId,
} from "@/lib/meridian-demo.constants";

export type MeridianDemoEnv = {
  email: string;
  password: string;
  teamEmail: string;
};

export function readMeridianDemoEnv(): MeridianDemoEnv {
  const email = process.env.DEMO_ACCOUNT_EMAIL?.trim().toLowerCase();
  const password = process.env.DEMO_ACCOUNT_PASSWORD;
  const teamEmail =
    process.env.DEMO_TEAM_EMAIL?.trim().toLowerCase() ??
    "amanda@meridianinteriors.demo";
  if (!email || !password) {
    throw new Error(
      "Set DEMO_ACCOUNT_EMAIL and DEMO_ACCOUNT_PASSWORD (Worker secrets or local env) before seeding.",
    );
  }
  return { email, password, teamEmail };
}

const TODAY = new Date();

export function demoDaysAgo(daysAgo: number): string {
  const date = new Date(TODAY);
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

export function demoDaysAhead(daysAhead: number): string {
  const date = new Date(TODAY);
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

function isoAtDaysAgo(daysAgo: number): string {
  return new Date(TODAY.getTime() - daysAgo * 86400_000).toISOString();
}

function firstBusinessDayMonthsAgo(monthsAgo: number): string {
  const d = new Date(TODAY);
  d.setMonth(d.getMonth() - monthsAgo);
  d.setDate(1);
  const day = d.getDay();
  if (day === 0) d.setDate(2);
  if (day === 6) d.setDate(3);
  return d.toISOString().slice(0, 10);
}

export async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < perPage) break;
    page += 1;
  }
  return null;
}

async function ensureAuthUser(email: string, password: string, name: string): Promise<string> {
  const existing = await findAuthUserIdByEmail(email);
  if (existing) return existing;
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, full_name: name },
  });
  if (error || !data.user) throw new Error(error?.message ?? "Failed to create auth user");
  return data.user.id;
}

async function linkProfile(
  userId: string,
  firmId: string,
  role: "principal" | "team",
  name: string,
  email: string,
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("id, firm_id")
    .eq("id", userId)
    .maybeSingle();

  if (!existing) {
    const { error } = await supabaseAdmin.from("profiles").insert({
      id: userId,
      email,
      name,
      role,
      firm_id: firmId,
      welcomed_at: role === "principal" ? new Date().toISOString() : null,
      accepted_at: new Date().toISOString(),
    } as any);
    if (error) throw new Error(error.message);
    return;
  }

  const patch: Record<string, unknown> = {
    email,
    name,
    role,
    accepted_at: existing ? undefined : new Date().toISOString(),
  };
  if (!existing.firm_id) patch.firm_id = firmId;
  if (role === "principal") patch.welcomed_at = new Date().toISOString();

  const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", userId);
  if (error) throw new Error(error.message);
}

type ProjectSeed = {
  n: number;
  name: string;
  client_name: string;
  status: "completed" | "active" | "pipeline" | "pursuit";
  pricing_method: "flat_fee" | "hourly" | "hybrid";
  flat_fee_amount: number | null;
  scoped_hrs: number;
  scoped_rate: number | null;
  logged_hrs: number;
  start_days_ago: number | null;
  end_days_ago: number | null;
  end_days_ahead: number | null;
  payment_status: "unpaid" | "partially_paid" | "paid";
  payment_collected: number | null;
  payment_collected_days_ago: number | null;
  sop?: "full" | "kitchen";
  phases?: { name: string; expected: number; billable: boolean }[];
};

const PROJECTS: ProjectSeed[] = [
  {
    n: 1,
    name: "Hargrove Residence",
    client_name: "The Hargrove Family",
    status: "completed",
    pricing_method: "flat_fee",
    flat_fee_amount: 42000,
    scoped_hrs: 185,
    scoped_rate: null,
    logged_hrs: 191,
    start_days_ago: 183,
    end_days_ago: 91,
    end_days_ahead: null,
    payment_status: "paid",
    payment_collected: 42000,
    payment_collected_days_ago: 96,
    sop: "full",
  },
  {
    n: 2,
    name: "Bellamy Kitchen & Primary Suite",
    client_name: "Sarah Bellamy",
    status: "completed",
    pricing_method: "flat_fee",
    flat_fee_amount: 18500,
    scoped_hrs: 95,
    scoped_rate: null,
    logged_hrs: 88,
    start_days_ago: 152,
    end_days_ago: 60,
    end_days_ahead: null,
    payment_status: "paid",
    payment_collected: 18500,
    payment_collected_days_ago: 60,
    sop: "kitchen",
  },
  {
    n: 3,
    name: "Voss Media Room & Library",
    client_name: "Marcus Voss",
    status: "completed",
    pricing_method: "flat_fee",
    flat_fee_amount: 22000,
    scoped_hrs: 110,
    scoped_rate: null,
    logged_hrs: 118,
    start_days_ago: 152,
    end_days_ago: 50,
    end_days_ahead: null,
    payment_status: "paid",
    payment_collected: 22000,
    payment_collected_days_ago: 50,
  },
  {
    n: 4,
    name: "Thornton Full Home Renovation",
    client_name: "The Thornton Family",
    status: "completed",
    pricing_method: "flat_fee",
    flat_fee_amount: 68000,
    scoped_hrs: 250,
    scoped_rate: null,
    logged_hrs: 238,
    start_days_ago: 183,
    end_days_ago: 30,
    end_days_ahead: null,
    payment_status: "paid",
    payment_collected: 68000,
    payment_collected_days_ago: 30,
    sop: "full",
  },
  {
    n: 5,
    name: "Whitmore Guest Suite",
    client_name: "Jennifer Whitmore",
    status: "completed",
    pricing_method: "flat_fee",
    flat_fee_amount: 8800,
    scoped_hrs: 48,
    scoped_rate: null,
    logged_hrs: 52,
    start_days_ago: 121,
    end_days_ago: 75,
    end_days_ahead: null,
    payment_status: "paid",
    payment_collected: 8800,
    payment_collected_days_ago: 75,
  },
  {
    n: 6,
    name: "Henderson Residence",
    client_name: "The Henderson Family",
    status: "active",
    pricing_method: "flat_fee",
    flat_fee_amount: 54000,
    scoped_hrs: 210,
    scoped_rate: null,
    logged_hrs: 134,
    start_days_ago: 91,
    end_days_ago: null,
    end_days_ahead: 75,
    payment_status: "partially_paid",
    payment_collected: 27000,
    payment_collected_days_ago: 88,
    sop: "full",
  },
  {
    n: 7,
    name: "Mercer Kitchen Renovation",
    client_name: "David & Priya Mercer",
    status: "active",
    pricing_method: "flat_fee",
    flat_fee_amount: 19500,
    scoped_hrs: 98,
    scoped_rate: null,
    logged_hrs: 61,
    start_days_ago: 60,
    end_days_ago: null,
    end_days_ahead: 45,
    payment_status: "partially_paid",
    payment_collected: 9750,
    payment_collected_days_ago: 58,
    sop: "kitchen",
  },
  {
    n: 8,
    name: "Aldridge Commercial Loft",
    client_name: "Aldridge Creative",
    status: "active",
    pricing_method: "hourly",
    flat_fee_amount: null,
    scoped_hrs: 80,
    scoped_rate: 295,
    logged_hrs: 42,
    start_days_ago: 30,
    end_days_ago: null,
    end_days_ahead: 60,
    payment_status: "unpaid",
    payment_collected: null,
    payment_collected_days_ago: null,
  },
  {
    n: 9,
    name: "Park Avenue Staging & FF&E",
    client_name: "The Park Avenue Group",
    status: "active",
    pricing_method: "hybrid",
    flat_fee_amount: 8500,
    scoped_hrs: 40,
    scoped_rate: null,
    logged_hrs: 18,
    start_days_ago: 30,
    end_days_ago: null,
    end_days_ahead: 45,
    payment_status: "partially_paid",
    payment_collected: 4250,
    payment_collected_days_ago: 28,
  },
  {
    n: 10,
    name: "Carlisle Primary & Nursery",
    client_name: "Emma Carlisle",
    status: "active",
    pricing_method: "flat_fee",
    flat_fee_amount: 14200,
    scoped_hrs: 72,
    scoped_rate: null,
    logged_hrs: 8,
    start_days_ago: 14,
    end_days_ago: null,
    end_days_ahead: 90,
    payment_status: "partially_paid",
    payment_collected: 7100,
    payment_collected_days_ago: 12,
  },
  {
    n: 11,
    name: "Westfield Residence",
    client_name: "The Westfield Family",
    status: "active",
    pricing_method: "flat_fee",
    flat_fee_amount: 28000,
    scoped_hrs: 85,
    scoped_rate: null,
    logged_hrs: 24,
    start_days_ago: 45,
    end_days_ago: null,
    end_days_ahead: 60,
    payment_status: "partially_paid",
    payment_collected: 14000,
    payment_collected_days_ago: 42,
  },
  {
    n: 12,
    name: "Novak Full Renovation",
    client_name: "The Novak Family",
    status: "pipeline",
    pricing_method: "flat_fee",
    flat_fee_amount: 48000,
    scoped_hrs: 180,
    scoped_rate: null,
    logged_hrs: 0,
    start_days_ago: null,
    end_days_ago: null,
    end_days_ahead: 30,
    payment_status: "unpaid",
    payment_collected: null,
    payment_collected_days_ago: null,
    sop: "full",
  },
  {
    n: 13,
    name: "Sutherland Home Office",
    client_name: "Chris Sutherland",
    status: "pipeline",
    pricing_method: "flat_fee",
    flat_fee_amount: 11500,
    scoped_hrs: 42,
    scoped_rate: null,
    logged_hrs: 0,
    start_days_ago: null,
    end_days_ago: null,
    end_days_ahead: 60,
    payment_status: "unpaid",
    payment_collected: null,
    payment_collected_days_ago: null,
  },
  {
    n: 14,
    name: "Whitfield Kitchen",
    client_name: "The Whitfield Family",
    status: "pursuit",
    pricing_method: "flat_fee",
    flat_fee_amount: 16800,
    scoped_hrs: 88,
    scoped_rate: null,
    logged_hrs: 0,
    start_days_ago: null,
    end_days_ago: null,
    end_days_ahead: 75,
    payment_status: "unpaid",
    payment_collected: null,
    payment_collected_days_ago: null,
    sop: "kitchen",
  },
  {
    n: 15,
    name: "Brennan Whole Home",
    client_name: "The Brennan Family",
    status: "pursuit",
    pricing_method: "flat_fee",
    flat_fee_amount: 72000,
    scoped_hrs: 240,
    scoped_rate: null,
    logged_hrs: 0,
    start_days_ago: null,
    end_days_ago: null,
    end_days_ahead: 90,
    payment_status: "unpaid",
    payment_collected: null,
    payment_collected_days_ago: null,
    sop: "full",
  },
];

const CAPRICE_DESCRIPTIONS = [
  "Client consultation call",
  "Design development — schematic phase",
  "Vendor sourcing and selection",
  "Space planning revisions",
  "Procurement coordination",
  "Site visit",
  "Client presentation prep",
  "Email correspondence",
  "Spec sheet updates",
];

const AMANDA_DESCRIPTIONS = [
  "Finish selections and research",
  "Spec sheet development",
  "Vendor communication",
  "Site documentation",
  "Material sample sourcing",
  "Drawing updates",
  "Procurement tracking",
];

function isWeekday(d: Date): boolean {
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

function* weekdaysBetween(start: Date, end: Date): Generator<Date> {
  const cur = new Date(start);
  while (cur <= end) {
    if (isWeekday(cur)) yield new Date(cur);
    cur.setDate(cur.getDate() + 1);
  }
}

function generateTimeEntriesForProject(opts: {
  firmId: string;
  projectId: string;
  principalId: string;
  teamUserId: string;
  teamMemberId: string;
  totalHrs: number;
  startDaysAgo: number;
  endDaysAgo: number;
  principalShare?: number;
}): Record<string, unknown>[] {
  const {
    firmId,
    projectId,
    principalId,
    teamUserId,
    teamMemberId,
    totalHrs,
    startDaysAgo,
    endDaysAgo,
    principalShare = 0.42,
  } = opts;
  if (totalHrs <= 0) return [];

  const start = new Date(TODAY.getTime() - startDaysAgo * 86400_000);
  const end = new Date(TODAY.getTime() - endDaysAgo * 86400_000);
  const days = [...weekdaysBetween(start, end)];
  if (!days.length) return [];

  const entries: Record<string, unknown>[] = [];
  let remaining = totalHrs;
  let i = 0;
  while (remaining > 0.25 && i < 500) {
    const day = days[i % days.length];
    const usePrincipal = Math.random() < principalShare;
    const hrs = Math.min(remaining, 1.5 + Math.random() * 3.5);
    const billable = Math.random() < (usePrincipal ? 0.65 : 0.7);
    const desc = usePrincipal
      ? CAPRICE_DESCRIPTIONS[i % CAPRICE_DESCRIPTIONS.length]
      : AMANDA_DESCRIPTIONS[i % AMANDA_DESCRIPTIONS.length];
    entries.push({
      firm_id: firmId,
      project_id: projectId,
      user_id: usePrincipal ? principalId : teamUserId,
      firm_member_id: null,
      date: day.toISOString().slice(0, 10),
      hrs: Math.round(hrs * 100) / 100,
      billable,
      description: `${desc} — project`,
    });
    remaining -= hrs;
    i += 1;
    if (i > days.length * 4 && remaining < 2) break;
  }
  return entries;
}

async function insertCustomSops(firmId: string): Promise<void> {
  const templates = [
    {
      id: MERIDIAN_SOP_FULL_RENO_ID,
      name: "Full Residential Renovation",
      workflow_type: "project",
      icon: "ti-home",
      estimated_total_hrs: 185,
    },
    {
      id: MERIDIAN_SOP_KITCHEN_ID,
      name: "Kitchen & Bath Renovation",
      workflow_type: "project",
      icon: "ti-bath",
      estimated_total_hrs: 95,
    },
    {
      id: MERIDIAN_SOP_INTAKE_ID,
      name: "New Client Intake Process",
      workflow_type: "firm_operation",
      icon: "ti-user-plus",
      estimated_total_hrs: 12,
    },
  ];

  for (const tpl of templates) {
    await supabaseAdmin.from("sop_templates").upsert(
      {
        id: tpl.id,
        firm_id: firmId,
        name: tpl.name,
        workflow_type: tpl.workflow_type,
        icon: tpl.icon,
        estimated_total_hrs: tpl.estimated_total_hrs,
        is_active: true,
        is_default: false,
        category: "Project Delivery",
        department: "Design",
        description: `${tpl.name} workflow for ${MERIDIAN_DEMO_FIRM_NAME}.`,
      } as any,
      { onConflict: "id" },
    );
  }

  const fullPhases = [
    { name: "Discovery & Onboarding", expected: 18, billable: false },
    { name: "Schematic Design", expected: 35, billable: true },
    { name: "Design Development", expected: 45, billable: true },
    { name: "Procurement", expected: 30, billable: false },
    { name: "Installation & Styling", expected: 28, billable: true },
    { name: "Project Close-out", expected: 12, billable: false },
  ];

  for (let pi = 0; pi < fullPhases.length; pi++) {
    const ph = fullPhases[pi];
    const phaseId = `00000000-0000-4000-a000-${(0xf001 + pi).toString(16).padStart(12, "0")}`;
    await supabaseAdmin.from("sop_phases").upsert(
      {
        id: phaseId,
        firm_id: firmId,
        template_id: MERIDIAN_SOP_FULL_RENO_ID,
        name: ph.name,
        expected_hrs: ph.expected,
        billable: ph.billable,
        sort_order: pi,
      } as any,
      { onConflict: "id" },
    );
    await supabaseAdmin.from("sop_steps").upsert(
      {
        id: `00000000-0000-4000-a000-${(0xf101 + pi).toString(16).padStart(12, "0")}`,
        phase_id: phaseId,
        name: `${ph.name} — key task`,
        description: `Complete ${ph.name.toLowerCase()} deliverables for the client.`,
        estimated_hrs: Math.max(1, ph.expected / 3),
        sort_order: 0,
        assigned_role: pi === 0 ? "administrative" : "designer",
        is_billable: ph.billable,
      } as any,
      { onConflict: "id" },
    );
  }

  const kitchenPhases = [
    { name: "Discovery", expected: 10, billable: false },
    { name: "Design", expected: 28, billable: true },
    { name: "Procurement", expected: 22, billable: false },
    { name: "Install & Close", expected: 15, billable: true },
  ];
  for (let pi = 0; pi < kitchenPhases.length; pi++) {
    const ph = kitchenPhases[pi];
    const phaseId = `00000000-0000-4000-a000-${(0xf201 + pi).toString(16).padStart(12, "0")}`;
    await supabaseAdmin.from("sop_phases").upsert(
      {
        id: phaseId,
        firm_id: firmId,
        template_id: MERIDIAN_SOP_KITCHEN_ID,
        name: ph.name,
        expected_hrs: ph.expected,
        billable: ph.billable,
        sort_order: pi,
      } as any,
      { onConflict: "id" },
    );
  }

  const intakePhaseId = "00000000-0000-4000-a000-000000000f01";
  await supabaseAdmin.from("sop_phases").upsert(
    {
      id: intakePhaseId,
      firm_id: firmId,
      template_id: MERIDIAN_SOP_INTAKE_ID,
      name: "Inquiry to signed agreement",
      expected_hrs: 12,
      billable: false,
      sort_order: 0,
    } as any,
    { onConflict: "id" },
  );
  for (let ti = 0; ti < 7; ti++) {
    await supabaseAdmin.from("sop_steps").upsert(
      {
        id: `00000000-0000-4000-a000-${(0xf301 + ti).toString(16).padStart(12, "0")}`,
        phase_id: intakePhaseId,
        name: `Intake step ${ti + 1}`,
        description: "Standard intake task for new inquiries.",
        estimated_hrs: 1.5,
        sort_order: ti,
        assigned_role: ti % 2 === 0 ? "administrative" : "principal",
        is_billable: false,
      } as any,
      { onConflict: "id" },
    );
  }
}

async function loadFinanceSnapshot(firmId: string) {
  const [{ data: firmConfig }, { data: firmExpenses }, { data: firmOwnerComp }, { data: firmTeam }] =
    await Promise.all([
      supabaseAdmin.from("firm_config").select("*").eq("firm_id", firmId).maybeSingle(),
      supabaseAdmin.from("expenses").select("*").eq("firm_id", firmId),
      supabaseAdmin.from("owner_compensation").select("*").eq("firm_id", firmId),
      supabaseAdmin
        .from("firm_members")
        .select(
          "burdened_weekly_cost, weeks_per_year, role_type, expected_hrs_per_week, productive_hrs_per_week, billed_rate, is_active",
        )
        .eq("firm_id", firmId)
        .eq("is_active", true)
        .neq("role_type", "principal"),
    ]);

  const fin = calc(
    (firmConfig as FirmConfig | null) ?? null,
    ((firmExpenses ?? []) as Expense[]) ?? [],
    {
      ownerComp: (firmOwnerComp as any) ?? [],
      teamProfiles: ((firmTeam ?? []) as any[]).map(mapTeamBurdenRow),
    },
  );
  const body = buildSnapshotFromCalc(fin, (firmConfig as FirmConfig | null) ?? null, {
    isRetroactive: false,
  });
  return { fin, body };
}

export async function seedMeridianPrivateDemo(): Promise<
  { ok: true; skipped: true; email: string } | { ok: true; skipped: false; email: string; firmId: string }
> {
  const env = readMeridianDemoEnv();
  const existing = await findAuthUserIdByEmail(env.email);
  if (existing) {
    return { ok: true, skipped: true, email: env.email };
  }

  const principalId = await ensureAuthUser(env.email, env.password, "Caprice West");
  const teamUserId = await ensureAuthUser(env.teamEmail, env.password, "Amanda Chen");

  const firmCreatedAt = isoAtDaysAgo(183);
  const trialEnd = isoAtDaysAgo(-365);

  await supabaseAdmin.from("firms").upsert(
    {
      id: MERIDIAN_DEMO_FIRM_ID,
      name: MERIDIAN_DEMO_FIRM_NAME,
      owner_id: principalId,
      created_at: firmCreatedAt,
      subscription_tier: "practice",
      subscription_status: "active",
      stripe_subscription_id: MERIDIAN_DEMO_STRIPE_SUB_ID,
      trial_ends_at: trialEnd,
      billing_frequency: "monthly",
      onboarding_completed: true,
      onboarding_completed_at: isoAtDaysAgo(170),
      is_demo: false,
      data_status: "clean",
    } as any,
    { onConflict: "id" },
  );

  await linkProfile(principalId, MERIDIAN_DEMO_FIRM_ID, "principal", "Caprice West", env.email);
  await linkProfile(teamUserId, MERIDIAN_DEMO_FIRM_ID, "team", "Amanda Chen", env.teamEmail);

  await supabaseAdmin.from("firm_config").upsert(
    {
      firm_id: MERIDIAN_DEMO_FIRM_ID,
      target_billable_hrs_per_week: 22,
      available_hrs_per_week: 28,
      target_gross_margin_pct: 35,
      pricing_structure: "flat_fee",
      capacity_ceiling_hrs_per_week: 28,
      accepting_new_clients: true,
      capacity_view_horizon: "12_months",
      rate_billed: 310,
      accounting_basis: "cash",
      business_structure: "sole_prop",
      comp_draw_annual: 72000,
      comp_distribution_annual: 60000,
      comp_ptax_pct: (8478 / 72000) * 100,
      comp_health_annual: 6000,
      comp_retire_annual: 9000,
    } as any,
    { onConflict: "firm_id" },
  );

  await supabaseAdmin.from("owner_compensation").delete().eq("firm_id", MERIDIAN_DEMO_FIRM_ID);
  const { error: ocErr } = await supabaseAdmin.from("owner_compensation").insert({
    firm_id: MERIDIAN_DEMO_FIRM_ID,
    profile_id: principalId,
    comp_draw_annual: 72000,
    distribution_annual: 60000,
    payroll_tax_pct: (8478 / 72000) * 100,
    health_insurance_annual: 6000,
    retirement_annual: 9000,
    distribution_tax_rate: 0.27,
  } as any);
  if (ocErr) throw new Error(ocErr.message);

  const expenseRows = [
    ["Studio rent", 18000],
    ["Business insurance", 3600],
    ["Software subscriptions", 4800],
    ["Marketing and photography", 8400],
    ["Professional development", 3000],
    ["Accounting and bookkeeping", 6000],
    ["Office supplies", 1800],
    ["Travel and site visits", 9600],
    ["Phone and internet", 2400],
    ["Trade memberships", 1200],
  ] as const;

  await supabaseAdmin.from("expenses").upsert(
    expenseRows.map(([name, amount], i) => ({
      id: meridianExpenseId(i + 1),
      firm_id: MERIDIAN_DEMO_FIRM_ID,
      name,
      amount,
      frequency: "annual" as const,
      recurring: true,
    })),
    { onConflict: "id" },
  );

  const { fin } = await loadFinanceSnapshot(MERIDIAN_DEMO_FIRM_ID);

  await supabaseAdmin.from("firm_preferences").upsert(
    {
      firm_id: MERIDIAN_DEMO_FIRM_ID,
      tour_completed: true,
      welcome_banner_dismissed: true,
      dashboard_primary_view: "revenue_architecture",
      last_cost_review_date: demoDaysAgo(95),
      aligned_rate_at_last_review: fin.alignedRate,
    } as any,
    { onConflict: "firm_id" },
  );

  const burdenedWeekly = 62778 / 48;
  await supabaseAdmin.from("firm_members").upsert(
    {
      id: MERIDIAN_MEMBER_ID,
      firm_id: MERIDIAN_DEMO_FIRM_ID,
      profile_id: teamUserId,
      name: "Amanda Chen",
      email: env.teamEmail,
      role_type: "designer",
      is_platform_user: true,
      is_active: true,
      productive_hrs_per_week: 32,
      expected_hrs_per_week: 32,
      weeks_per_year: 48,
      annual_base_salary: 52000,
      employer_payroll_tax_pct: 0.0765,
      annual_benefits: 4200,
      other_annual_costs: 2600,
      burdened_weekly_cost: burdenedWeekly,
      burdened_hourly_rate: 40.87,
      compensation_type: "salary",
      employment_type: "employee",
      invite_accepted_at: new Date().toISOString(),
    } as any,
    { onConflict: "id" },
  );

  await seedDefaultSops(MERIDIAN_DEMO_FIRM_ID);
  await insertCustomSops(MERIDIAN_DEMO_FIRM_ID);

  await supabaseAdmin.from("firm_resources").upsert(
    [
      {
        id: "00000000-0000-0000-0000-000000000e31",
        firm_id: MERIDIAN_DEMO_FIRM_ID,
        name: "Post-consultation email template",
        resource_type: "email_template",
        subject_line: "Thank you for meeting with Meridian Interiors",
        content:
          "Hi {{client_name}},\n\nThank you for taking the time to meet with us. We're excited about the possibility of working together on {{project_scope}}.\n\nBest,\nCaprice West",
        sort_order: 1,
        is_active: true,
      },
      {
        id: "00000000-0000-0000-0000-000000000e32",
        firm_id: MERIDIAN_DEMO_FIRM_ID,
        name: "Letter of Agreement template",
        resource_type: "contract",
        url: "https://docs.google.com/document/d/meridian-loa-template",
        sort_order: 2,
        is_active: true,
      },
      {
        id: "00000000-0000-0000-0000-000000000e33",
        firm_id: MERIDIAN_DEMO_FIRM_ID,
        name: "Client intake questionnaire",
        resource_type: "document_template",
        url: "https://forms.google.com/meridian-intake",
        sort_order: 3,
        is_active: true,
      },
    ] as any,
    { onConflict: "id" },
  );

  for (const p of PROJECTS) {
    const id = meridianProjectId(p.n);
    const sopId =
      p.sop === "full"
        ? MERIDIAN_SOP_FULL_RENO_ID
        : p.sop === "kitchen"
          ? MERIDIAN_SOP_KITCHEN_ID
          : null;

    await supabaseAdmin.from("projects").upsert(
      {
        id,
        firm_id: MERIDIAN_DEMO_FIRM_ID,
        name: p.name,
        client_name: p.client_name,
        status: p.status,
        pricing_method: p.pricing_method,
        flat_fee_amount: p.flat_fee_amount,
        fixed_fee: p.flat_fee_amount,
        scoped_hrs: p.scoped_hrs,
        scoped_rate: p.scoped_rate,
        sop_template_id: sopId,
        start_date: p.start_days_ago != null ? demoDaysAgo(p.start_days_ago) : demoDaysAhead(p.end_days_ahead ?? 30),
        end_date:
          p.end_days_ago != null
            ? demoDaysAgo(p.end_days_ago)
            : p.end_days_ahead != null
              ? demoDaysAhead(p.end_days_ahead)
              : null,
        payment_status: p.payment_status,
        payment_collected: p.payment_collected,
        payment_collected_date:
          p.payment_collected_days_ago != null ? demoDaysAgo(p.payment_collected_days_ago) : null,
        created_at: p.start_days_ago != null ? isoAtDaysAgo(p.start_days_ago) : new Date().toISOString(),
      } as any,
      { onConflict: "id" },
    );

    const phaseCount = p.sop === "full" ? 6 : p.sop === "kitchen" ? 4 : 3;
    for (let pi = 0; pi < phaseCount; pi++) {
      const expected = Math.round(p.scoped_hrs / phaseCount);
      const actual =
        p.logged_hrs > 0
          ? Math.round((expected / p.scoped_hrs) * p.logged_hrs)
          : 0;
      const phaseUuid = `00000000-0000-4000-a000-${(p.n * 100 + pi + 1).toString(16).padStart(12, "0")}`;
      await supabaseAdmin.from("project_phases").upsert(
        {
          id: phaseUuid,
          project_id: id,
          firm_id: MERIDIAN_DEMO_FIRM_ID,
          name: `Phase ${pi + 1}`,
          expected_hrs: expected,
          actual_hrs: p.status === "completed" ? actual : Math.min(actual, expected),
          billable: pi % 2 === 1,
          sort_order: pi,
        } as any,
        { onConflict: "id" },
      );
    }

    if (p.status === "completed" || p.status === "active") {
      const { body } = await loadFinanceSnapshot(MERIDIAN_DEMO_FIRM_ID);
      await supabaseAdmin.from("project_cost_snapshots").delete().eq("project_id", id);
      await supabaseAdmin.from("project_cost_snapshots").insert({
        project_id: id,
        firm_id: MERIDIAN_DEMO_FIRM_ID,
        ...body,
      } as any);
    }

    if (p.n === 6) {
      await supabaseAdmin.from("project_milestones").upsert(
        {
          id: "00000000-0000-0000-0000-000000000e41",
          firm_id: MERIDIAN_DEMO_FIRM_ID,
          project_id: id,
          label: "Client reveal",
          milestone_date: demoDaysAhead(45),
          sort_order: 0,
        } as any,
        { onConflict: "id" },
      );
    }
  }

  await supabaseAdmin.from("project_assignments").upsert(
    PROJECTS.filter((p) => p.status === "active" && p.logged_hrs > 0)
      .slice(0, 6)
      .map((p, i) => ({
        id: `00000000-0000-4000-a000-${(0xb001 + i).toString(16).padStart(12, "0")}`,
        project_id: meridianProjectId(p.n),
        firm_id: MERIDIAN_DEMO_FIRM_ID,
        assignee_id: MERIDIAN_MEMBER_ID,
        assigned_by: principalId,
        role_on_project: "Designer",
      })) as any,
    { onConflict: "id" },
  );

  await refreshMeridianTimeAndDraws(principalId, teamUserId);

  await supabaseAdmin.from("firm_life_events").upsert(
    [
      {
        id: "00000000-0000-0000-0000-000000000e51",
        firm_id: MERIDIAN_DEMO_FIRM_ID,
        name: "Summer family vacation",
        event_type: "vacation",
        block_type: "time_off",
        start_date: demoDaysAhead(37),
        end_date: demoDaysAhead(48),
        capacity_pct: 0,
        is_recurring: false,
        recurs_annually: false,
        scheduling_only: false,
      },
      {
        id: "00000000-0000-0000-0000-000000000e52",
        firm_id: MERIDIAN_DEMO_FIRM_ID,
        name: "Holiday season",
        event_type: "seasonal_slowdown",
        block_type: "capacity",
        start_date: `${TODAY.getFullYear()}-12-20`,
        end_date: `${TODAY.getFullYear() + 1}-01-03`,
        capacity_pct: 0,
        is_recurring: true,
        recurs_annually: true,
        scheduling_only: false,
      },
    ] as any,
    { onConflict: "id" },
  );

  return { ok: true, skipped: false, email: env.email, firmId: MERIDIAN_DEMO_FIRM_ID };
}

export async function refreshMeridianTimeAndDraws(
  principalId?: string,
  teamUserId?: string,
): Promise<void> {
  const env = readMeridianDemoEnv();
  const pid = principalId ?? (await findAuthUserIdByEmail(env.email));
  const tid = teamUserId ?? (await findAuthUserIdByEmail(env.teamEmail));
  if (!pid || !tid) throw new Error("Demo users not found");

  await supabaseAdmin.from("time_entries").delete().eq("firm_id", MERIDIAN_DEMO_FIRM_ID);
  await supabaseAdmin.from("owner_draws").delete().eq("firm_id", MERIDIAN_DEMO_FIRM_ID);

  const allEntries: Record<string, unknown>[] = [];
  for (const p of PROJECTS) {
    if (p.logged_hrs <= 0 || p.start_days_ago == null) continue;
    const endAgo =
      p.end_days_ago ??
      (p.status === "active" ? 0 : p.end_days_ago ?? 14);
    allEntries.push(
      ...generateTimeEntriesForProject({
        firmId: MERIDIAN_DEMO_FIRM_ID,
        projectId: meridianProjectId(p.n),
        principalId: pid,
        teamUserId: tid,
        teamMemberId: MERIDIAN_MEMBER_ID,
        totalHrs: p.logged_hrs,
        startDaysAgo: p.start_days_ago,
        endDaysAgo: Math.max(0, endAgo),
      }),
    );
  }

  for (let i = 0; i < allEntries.length; i += 100) {
    const chunk = allEntries.slice(i, i + 100);
    const { error } = await supabaseAdmin.from("time_entries").insert(chunk as any);
    if (error) throw new Error(error.message);
  }

  const draws: Record<string, unknown>[] = [];
  for (let m = 0; m < 6; m++) {
    draws.push({
      firm_id: MERIDIAN_DEMO_FIRM_ID,
      draw_date: firstBusinessDayMonthsAgo(5 - m),
      amount: 6000,
      draw_type: "salary",
      notes: "Monthly owner draw",
    });
  }
  draws.push(
    {
      firm_id: MERIDIAN_DEMO_FIRM_ID,
      draw_date: demoDaysAgo(91),
      amount: 12000,
      draw_type: "distribution",
      notes: "Q1 distribution",
    },
    {
      firm_id: MERIDIAN_DEMO_FIRM_ID,
      draw_date: demoDaysAgo(30),
      amount: 9500,
      draw_type: "distribution",
      notes: "Q2 partial distribution",
    },
  );
  const { error: drawErr } = await supabaseAdmin.from("owner_draws").insert(draws as any);
  if (drawErr) throw new Error(drawErr.message);
}

export async function getMeridianDemoStatus(): Promise<{
  configured: boolean;
  email: string | null;
  teamEmail: string | null;
  accountExists: boolean;
}> {
  let email: string | null = null;
  let teamEmail: string | null = null;
  try {
    const env = readMeridianDemoEnv();
    email = env.email;
    teamEmail = env.teamEmail;
  } catch {
    return { configured: false, email: null, teamEmail: null, accountExists: false };
  }
  const accountExists = !!(await findAuthUserIdByEmail(email));
  return { configured: true, email, teamEmail, accountExists };
}
