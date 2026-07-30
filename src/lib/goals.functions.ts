import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePrincipalOrAdmin } from "@/lib/auth-guards.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  calc,
  mapTeamBurdenRow,
  type FirmConfig,
  type Expense,
} from "@/lib/finance";
import {
  buildGoalInsightsMap,
  type FirmGoalRow,
  type GoalInsightsMap,
  type GoalMetricsContext,
} from "@/lib/goals";
import {
  fetchPinterestBoards,
  fetchPinterestPins,
  getPinterestOAuthUrl,
} from "@/lib/pinterest.server";
import { extensionForMime, VISION_BOARD_MAX_IMAGES } from "@/lib/vision-board-upload";

const FIRM_RESOURCE_BUCKET = "firm-resources";
const VISION_SIGNED_URL_SEC = 60 * 60 * 24 * 7;

export type VisionBoardImage = {
  /** Storage path or external URL (for remove). */
  path: string;
  url: string;
};

export type FirmVisionClient = {
  anchor_statement: string | null;
  quarterly_focus_word: string | null;
  quarterly_focus_quarter: string | null;
  quarterly_review_note: string | null;
  selected_board_ids: string[] | null;
  uploaded_image_urls: string[] | null;
  uploaded_images: VisionBoardImage[];
  /** Derived from pinterest_connected_at — never expose OAuth tokens to the client. */
  pinterest_connected: boolean;
};

/** Columns safe to return from getFuturePageData / saveFirmVision (no OAuth secrets). */
const FIRM_VISION_PUBLIC_SELECT =
  "anchor_statement, quarterly_focus_word, quarterly_focus_quarter, quarterly_review_note, selected_board_ids, uploaded_image_urls, pinterest_connected_at" as const;

function mapFirmVisionPublic(
  visionRaw: Record<string, unknown> | null | undefined,
  imageEntries: VisionBoardImage[],
): FirmVisionClient {
  return {
    anchor_statement: (visionRaw?.anchor_statement as string | null) ?? null,
    quarterly_focus_word: (visionRaw?.quarterly_focus_word as string | null) ?? null,
    quarterly_focus_quarter: (visionRaw?.quarterly_focus_quarter as string | null) ?? null,
    quarterly_review_note: (visionRaw?.quarterly_review_note as string | null) ?? null,
    selected_board_ids: (visionRaw?.selected_board_ids as string[] | null) ?? null,
    uploaded_image_urls: imageEntries.map((e) => e.url),
    uploaded_images: imageEntries,
    pinterest_connected: !!(visionRaw?.pinterest_connected_at as string | null | undefined),
  };
}

function assertVisionStoragePath(firmId: string, path: string) {
  const prefix = `${firmId}/vision/`;
  if (!path.startsWith(prefix) || path.includes("..")) {
    throw new Error("Invalid vision image path");
  }
}

async function resolveVisionImageEntries(
  stored: string[] | null | undefined,
): Promise<VisionBoardImage[]> {
  if (!stored?.length) return [];
  const out: VisionBoardImage[] = [];
  for (const entry of stored) {
    if (/^https?:\/\//i.test(entry)) {
      out.push({ path: entry, url: entry });
      continue;
    }
    const { data, error } = await supabaseAdmin.storage
      .from(FIRM_RESOURCE_BUCKET)
      .createSignedUrl(entry, VISION_SIGNED_URL_SEC);
    if (!error && data?.signedUrl) {
      out.push({ path: entry, url: data.signedUrl });
    }
  }
  return out;
}

export type FirmMilestoneRow = {
  id: string;
  name: string;
  target_date: string | null;
  milestone_type: string;
  status: string;
  detail: string | null;
  linked_goal_id: string | null;
  sort_order: number;
};

export type FutureProjectionInputs = {
  calc: ReturnType<typeof calc>;
  averageProjectFee: number;
  hoursPerProject: number;
  ytdRevenueCollected: number;
  activeProjectCount: number;
  teamMembers: Array<{
    id: string;
    name: string;
    salary: number;
    profile_id: string | null;
  }>;
  ownerSalary: number;
};

async function resolveFirmId(supabase: typeof supabaseAdmin, userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("firm_id")
    .eq("id", userId)
    .single();
  return profile?.firm_id ?? null;
}

async function ensureVisionRow(firmId: string) {
  const { data: existing } = await supabaseAdmin
    .from("firm_vision")
    .select("id")
    .eq("firm_id", firmId)
    .maybeSingle();
  if (existing?.id) return;
  await supabaseAdmin.from("firm_vision").insert({ firm_id: firmId });
}

function projectRevenue(p: {
  fixed_fee?: number | null;
  scoped_hrs?: number | null;
  scoped_rate?: number | null;
}): number {
  const fee = Number(p.fixed_fee || 0);
  if (fee > 0) return fee;
  return Number(p.scoped_hrs || 0) * Number(p.scoped_rate || 0);
}

async function loadGoalMetricsContext(
  firmId: string,
  calcResult: ReturnType<typeof calc>,
): Promise<GoalMetricsContext> {
  const now = new Date();
  const periodMonth = now.getMonth() + 1;
  const yearStart = `${now.getFullYear()}-01-01`;
  const since90 = new Date();
  since90.setDate(since90.getDate() - 90);
  const since90Iso = since90.toISOString().slice(0, 10);
  const since12 = new Date();
  since12.setMonth(since12.getMonth() - 12);
  const since12Iso = since12.toISOString().slice(0, 10);

  const [
    { data: draws },
    { data: entries90 },
    { data: activeProjects },
    { data: feeHistory },
    { data: members },
    { data: collectedProjects },
  ] = await Promise.all([
    supabaseAdmin
      .from("owner_draws")
      .select("amount, draw_type, draw_date")
      .eq("firm_id", firmId)
      .gte("draw_date", yearStart),
    supabaseAdmin
      .from("time_entries")
      .select("hrs, date")
      .eq("firm_id", firmId)
      .gte("date", since90Iso),
    supabaseAdmin
      .from("projects")
      .select("id, fixed_fee, scoped_hrs, scoped_rate, status")
      .eq("firm_id", firmId)
      .eq("status", "active"),
    supabaseAdmin
      .from("projects")
      .select("fixed_fee, scoped_hrs, scoped_rate, created_at")
      .eq("firm_id", firmId)
      .gte("created_at", since12Iso),
    supabaseAdmin
      .from("firm_members")
      .select("id, is_active")
      .eq("firm_id", firmId)
      .eq("is_active", true),
    supabaseAdmin
      .from("projects")
      .select("payment_collected, payment_collected_date")
      .eq("firm_id", firmId)
      .gt("payment_collected", 0),
  ]);

  let ytdTotalDrawn = 0;
  for (const d of draws ?? []) {
    ytdTotalDrawn += Number(d.amount) || 0;
  }

  let totalHrs90 = 0;
  const weekSet = new Set<string>();
  for (const e of entries90 ?? []) {
    totalHrs90 += Number(e.hrs) || 0;
    weekSet.add((e.date as string).slice(0, 10));
  }
  const weeks90 = Math.max(1, Math.round(90 / 7));
  const avgWeeklyHours90d = totalHrs90 / weeks90;

  const fees = (activeProjects ?? []).map((p) => projectRevenue(p));
  const minActiveProjectFee = fees.length ? Math.min(...fees) : null;
  const projectsBelowMinFee = 0;

  const histFees = (feeHistory ?? [])
    .map((p) => projectRevenue(p))
    .filter((f) => f > 0);
  const averageProjectFee =
    histFees.length > 0
      ? histFees.reduce((a, b) => a + b, 0) / histFees.length
      : fees.length
        ? fees.reduce((a, b) => a + b, 0) / fees.length
        : 25_000;

  let ytdRevenueCollected = 0;
  for (const p of collectedProjects ?? []) {
    const d = p.payment_collected_date as string | null;
    if (d && d >= yearStart) {
      ytdRevenueCollected += Number(p.payment_collected) || 0;
    }
  }

  const marginPct = Number(calcResult.grossMarginPct) || 35;
  const targetMarginPct =
    marginPct > 0 ? marginPct : 35;

  return {
    periodMonth,
    ytdTotalDrawn,
    avgWeeklyHours90d,
    minActiveProjectFee,
    activeProjectCount: activeProjects?.length ?? 0,
    activeProjectFees: fees,
    projectsBelowMinFee,
    averageProjectFee,
    activeTeamHeadcount: members?.length ?? 0,
    ytdRevenueCollected,
    totalAnnualCostFloor: calcResult.totalCost,
    targetMarginPct,
    alignedRate: calcResult.alignedRate,
    breakEvenRate: calcResult.breakEvenRate,
    annualBillableHrs: calcResult.annualBillableHrs,
  };
}

export const getFuturePageData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requirePrincipalOrAdmin(supabase, userId);
    const firmId = await resolveFirmId(supabaseAdmin, userId);
    if (!firmId) {
      return {
        firmName: null,
        vision: null as FirmVisionClient | null,
        goals: [] as FirmGoalRow[],
        milestones: [] as FirmMilestoneRow[],
        insights: {} as GoalInsightsMap,
        projections: null as FutureProjectionInputs | null,
      };
    }

    await ensureVisionRow(firmId);

    const [
      { data: firm },
      { data: config },
      { data: expenses },
      { data: ownerComp },
      { data: teamRows },
      { data: visionRaw },
      { data: goals },
      { data: milestones },
    ] = await Promise.all([
      supabaseAdmin.from("firms").select("name").eq("id", firmId).single(),
      supabaseAdmin.from("firm_config").select("*").eq("firm_id", firmId).maybeSingle(),
      supabaseAdmin.from("expenses").select("*").eq("firm_id", firmId),
      supabaseAdmin.from("owner_compensation").select("*").eq("firm_id", firmId),
      supabaseAdmin
        .from("firm_members")
        .select(
          "id, name, email, profile_id, is_active, burdened_weekly_cost, weeks_per_year, expected_hrs_per_week, productive_hrs_per_week, billed_rate",
        )
        .eq("firm_id", firmId)
        .eq("is_active", true),
      supabaseAdmin
        .from("firm_vision")
        .select(FIRM_VISION_PUBLIC_SELECT)
        .eq("firm_id", firmId)
        .maybeSingle(),
      supabaseAdmin
        .from("firm_goals")
        .select("*")
        .eq("firm_id", firmId)
        .order("sort_order", { ascending: true }),
      supabaseAdmin
        .from("firm_milestones")
        .select("*")
        .eq("firm_id", firmId)
        .order("target_date", { ascending: true, nullsFirst: false }),
    ]);

    const teamProfiles = (teamRows ?? []).map((t) =>
      mapTeamBurdenRow(t as Parameters<typeof mapTeamBurdenRow>[0]),
    );
    const calcResult = calc(
      (config ?? null) as FirmConfig | null,
      (expenses ?? []) as Expense[],
      { ownerComp: ownerComp ?? [], teamProfiles },
    );

    const metricsCtx = await loadGoalMetricsContext(firmId, calcResult);
    const goalRows = (goals ?? []) as unknown as FirmGoalRow[];
    const insights = buildGoalInsightsMap(goalRows, metricsCtx);

    const storedImages = (visionRaw as { uploaded_image_urls?: string[] | null } | null)
      ?.uploaded_image_urls;
    const imageEntries = await resolveVisionImageEntries(storedImages ?? null);
    const vision = mapFirmVisionPublic(
      (visionRaw ?? null) as Record<string, unknown> | null,
      imageEntries,
    );

    const { data: salaryRows } = await supabaseAdmin
      .from("firm_members")
      .select("id, name, annual_base_salary, profile_id")
      .eq("firm_id", firmId)
      .eq("is_active", true);

    const ownerSalary =
      ownerComp?.reduce((s, r) => s + (Number(r.comp_draw_annual) || 0), 0) ?? 0;

    let hoursPerProject = 80;
    const { data: recentCompleted } = await supabaseAdmin
      .from("projects")
      .select("id, scoped_hrs")
      .eq("firm_id", firmId)
      .in("status", ["completed", "collected"])
      .order("created_at", { ascending: false })
      .limit(20);
    const scoped = (recentCompleted ?? [])
      .map((p) => Number(p.scoped_hrs))
      .filter((h) => h > 0);
    if (scoped.length) {
      hoursPerProject = scoped.reduce((a, b) => a + b, 0) / scoped.length;
    }

    const projections: FutureProjectionInputs = {
      calc: calcResult,
      averageProjectFee: metricsCtx.averageProjectFee,
      hoursPerProject,
      ytdRevenueCollected: metricsCtx.ytdRevenueCollected,
      activeProjectCount: metricsCtx.activeProjectCount,
      teamMembers: (salaryRows ?? []).map((m) => ({
        id: m.id as string,
        name: (m.name as string) || "Team member",
        salary: Number((m as { annual_base_salary?: number }).annual_base_salary) || 0,
        profile_id: m.profile_id as string | null,
      })),
      ownerSalary,
    };

    return {
      firmName: firm?.name ?? null,
      vision,
      goals: goalRows,
      milestones: (milestones ?? []) as unknown as FirmMilestoneRow[],
      insights,
      projections,
    };
  });

const goalInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(500),
  category: z.enum(["time", "income", "team", "clients", "firm", "personal", "other"]),
  timeframe: z.enum(["this_year", "next_year", "someday"]),
  target_date: z.string().nullable().optional(),
  target_value: z.number().nullable().optional(),
  target_unit: z.string().nullable().optional(),
  linked_metric: z
    .enum([
      "annual_draw",
      "weekly_hours",
      "min_project_fee",
      "team_headcount",
      "portfolio_realized_rate",
      "annual_revenue",
    ])
    .nullable()
    .optional(),
  notes: z.string().nullable().optional(),
  createMilestone: z.boolean().optional(),
});

export const saveFirmGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(goalInputSchema)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await requirePrincipalOrAdmin(supabase, userId);
    const firmId = await resolveFirmId(supabaseAdmin, userId);
    if (!firmId) throw new Error("No firm");

    const row = {
      firm_id: firmId,
      name: data.name,
      category: data.category,
      timeframe: data.timeframe,
      target_date: data.target_date ?? null,
      target_value: data.target_value ?? null,
      target_unit: data.target_unit ?? null,
      linked_metric: data.linked_metric ?? null,
      notes: data.notes ?? null,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { error } = await supabaseAdmin
        .from("firm_goals")
        .update(row)
        .eq("id", data.id)
        .eq("firm_id", firmId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("firm_goals")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id as string };
  });

export const updateFirmGoalStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      status: z.enum(["active", "achieved", "missed", "paused"]),
    }),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await requirePrincipalOrAdmin(supabase, userId);
    const firmId = await resolveFirmId(supabaseAdmin, userId);
    if (!firmId) throw new Error("No firm");

    const patch: Record<string, unknown> = {
      status: data.status,
      updated_at: new Date().toISOString(),
    };
    if (data.status === "achieved") {
      patch.achieved_at = new Date().toISOString();
    }

    const { error } = await supabaseAdmin
      .from("firm_goals")
      .update(patch)
      .eq("id", data.id)
      .eq("firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveFirmVision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      anchor_statement: z.string().nullable().optional(),
      quarterly_focus_word: z.string().nullable().optional(),
      quarterly_focus_quarter: z.string().nullable().optional(),
      quarterly_review_note: z.string().nullable().optional(),
      selected_board_ids: z.array(z.string()).nullable().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await requirePrincipalOrAdmin(supabase, userId);
    const firmId = await resolveFirmId(supabaseAdmin, userId);
    if (!firmId) throw new Error("No firm");
    await ensureVisionRow(firmId);

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.anchor_statement !== undefined) patch.anchor_statement = data.anchor_statement;
    if (data.quarterly_focus_word !== undefined) patch.quarterly_focus_word = data.quarterly_focus_word;
    if (data.quarterly_focus_quarter !== undefined) {
      patch.quarterly_focus_quarter = data.quarterly_focus_quarter;
    }
    if (data.quarterly_review_note !== undefined) patch.quarterly_review_note = data.quarterly_review_note;
    if (data.selected_board_ids !== undefined) patch.selected_board_ids = data.selected_board_ids;

    const { error } = await supabaseAdmin.from("firm_vision").update(patch).eq("firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const milestoneSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1),
  target_date: z.string().nullable().optional(),
  milestone_type: z.enum(["goal", "hire", "revenue", "personal", "directional"]),
  status: z.enum(["achieved", "active", "upcoming", "missed"]).optional(),
  detail: z.string().nullable().optional(),
  linked_goal_id: z.string().uuid().nullable().optional(),
});

export const saveFirmMilestone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(milestoneSchema)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await requirePrincipalOrAdmin(supabase, userId);
    const firmId = await resolveFirmId(supabaseAdmin, userId);
    if (!firmId) throw new Error("No firm");

    const row = {
      firm_id: firmId,
      name: data.name,
      target_date: data.target_date ?? null,
      milestone_type: data.milestone_type,
      status: data.status ?? "upcoming",
      detail: data.detail ?? null,
      linked_goal_id: data.linked_goal_id ?? null,
    };

    if (data.id) {
      const { error } = await supabaseAdmin
        .from("firm_milestones")
        .update(row)
        .eq("id", data.id)
        .eq("firm_id", firmId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("firm_milestones")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id as string };
  });

export const getPinterestBoardsForFirm = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requirePrincipalOrAdmin(supabase, userId);
    const firmId = await resolveFirmId(supabaseAdmin, userId);
    if (!firmId) return [];
    return fetchPinterestBoards(firmId);
  });

export const getPinterestPinsForFirm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      boardIds: z.array(z.string()),
      limit: z.number().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await requirePrincipalOrAdmin(supabase, userId);
    const firmId = await resolveFirmId(supabaseAdmin, userId);
    if (!firmId) return [];
    return fetchPinterestPins(firmId, data.boardIds, data.limit ?? 24);
  });

export const getPinterestConnectUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requirePrincipalOrAdmin(supabase, userId);
    const firmId = await resolveFirmId(supabaseAdmin, userId);
    if (!firmId) throw new Error("No firm");
    return { url: getPinterestOAuthUrl(firmId, userId) };
  });

export const togglePinterestBoardSelection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ boardId: z.string(), selected: z.boolean() }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await requirePrincipalOrAdmin(supabase, userId);
    const firmId = await resolveFirmId(supabaseAdmin, userId);
    if (!firmId) throw new Error("No firm");

    const { data: vision } = await supabaseAdmin
      .from("firm_vision")
      .select("selected_board_ids")
      .eq("firm_id", firmId)
      .maybeSingle();

    const current = (vision as { selected_board_ids?: string[] | null })?.selected_board_ids ?? [];
    let next: string[];
    if (data.selected) {
      next = current.includes(data.boardId) ? current : [...current, data.boardId];
    } else {
      next = current.filter((id) => id !== data.boardId);
    }

    await supabaseAdmin
      .from("firm_vision")
      .update({ selected_board_ids: next, updated_at: new Date().toISOString() })
      .eq("firm_id", firmId);

    return { selected_board_ids: next };
  });

export const createVisionBoardUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      fileName: z.string().min(1).max(255),
      contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    }),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await requirePrincipalOrAdmin(supabase, userId);
    const firmId = await resolveFirmId(supabaseAdmin, userId);
    if (!firmId) throw new Error("No firm");
    await ensureVisionRow(firmId);

    const ext = extensionForMime(data.contentType);
    const safeBase =
      data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.[^.]+$/, "") || "image";
    const path = `${firmId}/vision/${crypto.randomUUID()}-${safeBase}${ext}`;

    const { data: signed, error } = await supabaseAdmin.storage
      .from(FIRM_RESOURCE_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !signed) {
      throw new Error(error?.message ?? "Vision image storage is not configured.");
    }
    return { path, signedUrl: signed.signedUrl, token: signed.token };
  });

export const appendVisionBoardImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ paths: z.array(z.string().min(1)).min(1).max(VISION_BOARD_MAX_IMAGES) }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await requirePrincipalOrAdmin(supabase, userId);
    const firmId = await resolveFirmId(supabaseAdmin, userId);
    if (!firmId) throw new Error("No firm");

    for (const p of data.paths) assertVisionStoragePath(firmId, p);

    const { data: row } = await supabaseAdmin
      .from("firm_vision")
      .select("uploaded_image_urls")
      .eq("firm_id", firmId)
      .maybeSingle();

    const current = (row as { uploaded_image_urls?: string[] | null } | null)?.uploaded_image_urls ?? [];
    const merged = [...current];
    for (const p of data.paths) {
      if (!merged.includes(p)) merged.push(p);
    }
    if (merged.length > VISION_BOARD_MAX_IMAGES) {
      throw new Error(`You can have up to ${VISION_BOARD_MAX_IMAGES} images on your vision board.`);
    }

    const { error } = await supabaseAdmin
      .from("firm_vision")
      .update({ uploaded_image_urls: merged, updated_at: new Date().toISOString() })
      .eq("firm_id", firmId);
    if (error) throw new Error(error.message);

    const entries = await resolveVisionImageEntries(merged);
    return { uploaded_images: entries };
  });

export const removeVisionBoardImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ path: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await requirePrincipalOrAdmin(supabase, userId);
    const firmId = await resolveFirmId(supabaseAdmin, userId);
    if (!firmId) throw new Error("No firm");

    const { data: row } = await supabaseAdmin
      .from("firm_vision")
      .select("uploaded_image_urls")
      .eq("firm_id", firmId)
      .maybeSingle();

    const current = (row as { uploaded_image_urls?: string[] | null } | null)?.uploaded_image_urls ?? [];
    const next = current.filter((p) => p !== data.path);
    if (next.length === current.length) throw new Error("Image not found");

    const isStorage = !/^https?:\/\//i.test(data.path);
    if (isStorage) {
      assertVisionStoragePath(firmId, data.path);
      await supabaseAdmin.storage.from(FIRM_RESOURCE_BUCKET).remove([data.path]).catch(() => undefined);
    }

    const { error } = await supabaseAdmin
      .from("firm_vision")
      .update({ uploaded_image_urls: next, updated_at: new Date().toISOString() })
      .eq("firm_id", firmId);
    if (error) throw new Error(error.message);

    const entries = await resolveVisionImageEntries(next);
    return { uploaded_images: entries };
  });
