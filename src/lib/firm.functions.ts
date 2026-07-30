import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeBurden } from "@/lib/cost";
import { seedDefaultSops } from "@/lib/sop-seed.server";
import { recordAlignedRate } from "@/lib/rate-history.server";
import {
  recordCostReviewAfterSave,
} from "@/lib/cost-review.server";
import type { CostReviewNotifications } from "@/lib/cost-review.utils";
import { ensureTourRow } from "@/lib/tour.server";
import { logChange, diffFields, type ChangedField } from "@/lib/change-log.server";
import { calc, capTargetBillableToAvailable, mapTeamBurdenRow, type FirmConfig } from "@/lib/finance";
import { loadFirmConfigForCaller, type CallerProfile } from "@/lib/auth-guards.server";
import { getRuntimeEnv } from "@/lib/runtime-env.server";

// Single-plan model: no tier parameter. All new firms are Practice-access
// with a 27-day trial. Optional Stripe billing fields (billing_frequency,
// stripe_price_id) may be captured up-front from /register.
const createFirmSchema = z.object({
  firmName: z.string().trim().min(1).max(120),
  ownerName: z.string().trim().min(1).max(120),
  billingFrequency: z.enum(["monthly", "annual"]).optional(),
  stripePriceId: z.string().trim().max(120).optional().nullable(),
  stripeCustomerId: z.string().trim().max(120).optional().nullable(),
  paymentMethodId: z.string().trim().max(120).optional().nullable(),
});

async function linkProfileToFirmIfNull(
  userId: string,
  firmId: string,
  ownerName: string,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc("link_profile_to_firm_if_null" as any, {
    p_user_id: userId,
    p_firm_id: firmId,
    p_role: "principal",
    p_name: ownerName,
  });
  if (error) {
    const msg = error.message ?? "";
    if (/firm_id cannot be changed/i.test(msg)) {
      const { data: again } = await supabaseAdmin
        .from("profiles")
        .select("firm_id")
        .eq("id", userId)
        .maybeSingle();
      if (again?.firm_id) return again.firm_id;
    }
    if (/link_profile_to_firm_if_null|Could not find the function/i.test(msg)) {
      const { data: linked, error: updErr } = await supabaseAdmin
        .from("profiles")
        .update({
          firm_id: firmId,
          role: "principal",
          name: ownerName || undefined,
          accepted_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .is("firm_id", null)
        .select("firm_id")
        .maybeSingle();
      if (updErr) throw new Error(updErr.message);
      return linked?.firm_id ?? null;
    }
    throw new Error(error.message);
  }
  return typeof data === "string" ? data : null;
}

/** OAuth signups occasionally land before handle_new_user finishes — backfill profile row. */
async function ensureUserProfile(userId: string): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (existing) return;

  const { data: authUser, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !authUser?.user) return;

  const u = authUser.user;
  const meta = (u.user_metadata ?? {}) as Record<string, string>;
  await supabaseAdmin.from("profiles").insert({
    id: userId,
    email: u.email ?? "",
    name: meta.name || meta.full_name || u.email?.split("@")[0] || "",
  });
}

/** Admin read of firm_id — used at login before any bootstrap writes. */
export const getAuthBootstrapState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    await ensureUserProfile(userId);
    await linkOwnedFirmIfMissing(userId);
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("firm_id, is_super_admin")
      .eq("id", userId)
      .maybeSingle();
    return {
      firmId: profile?.firm_id ?? null,
      isSuperAdmin: !!profile?.is_super_admin,
    };
  });

export const createFirmForCurrentUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createFirmSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Admin read: user-scoped client can lag behind bootstrap; service role is source of truth.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("firm_id, name")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.firm_id) {
      return { firmId: profile.firm_id, alreadyExists: true };
    }

    // Recover orphaned owner rows (firm exists, profile.firm_id still null).
    const { data: ownedFirm } = await supabaseAdmin
      .from("firms")
      .select("id")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (ownedFirm?.id) {
      const linkedFirmId = await linkProfileToFirmIfNull(
        userId,
        ownedFirm.id,
        data.ownerName || profile?.name || "",
      );
      if (linkedFirmId) {
        return { firmId: linkedFirmId, alreadyExists: true };
      }
    }

    const trialEndsAt = new Date(Date.now() + 27 * 24 * 60 * 60 * 1000).toISOString();

    // Bootstrap uses admin client: the firms_select policy requires
    // current_firm_id() to match, but the user's profile.firm_id is still
    // null at this point — so RETURNING via the user-scoped client fails.
    const { data: firm, error: firmErr } = await supabaseAdmin
      .from("firms")
      .insert({
        name: data.firmName,
        owner_id: userId,
        subscription_tier: "practice",
        subscription_status: "trialing",
        trial_ends_at: trialEndsAt,
        billing_frequency: data.billingFrequency ?? "monthly",
        stripe_price_id: data.stripePriceId ?? null,
        stripe_customer_id: data.stripeCustomerId ?? null,
        stripe_payment_method_id: data.paymentMethodId ?? null,
      } as any)
      .select("id")
      .single();
    if (firmErr || !firm) throw new Error(firmErr?.message ?? "Failed to create firm");

    const linkedFirmId = await linkProfileToFirmIfNull(userId, firm.id, data.ownerName);
    if (!linkedFirmId) {
      const { data: again } = await supabaseAdmin
        .from("profiles")
        .select("firm_id")
        .eq("id", userId)
        .maybeSingle();
      if (again?.firm_id) {
        return { firmId: again.firm_id, alreadyExists: true };
      }
      throw new Error("Could not link your account to the new studio. Try signing in again.");
    }

    await supabaseAdmin.from("firm_config").insert({ firm_id: firm.id });

    // If this signup claimed a founding-rate price, record it against the
    // founding_access counter so the next visitor sees the correct slot count.
    if (data.stripePriceId === "sightline_founding_monthly" || data.stripePriceId === "sightline_founding_annual") {
      await supabaseAdmin
        .from("founding_access" as any)
        .upsert({ firm_id: firm.id, stripe_price_id: data.stripePriceId }, { onConflict: "firm_id" });
    }

    // Seed the 10 starter SOP templates for this firm (idempotent by name).
    try {
      await seedDefaultSops(firm.id);
    } catch (e) {
      console.error("[createFirmForCurrentUser] seedDefaultSops failed:", e);
    }

    return { firmId: firm.id, alreadyExists: false };
  });

/** Link profile.firm_id when the user owns a firm row but bootstrap never ran. */
async function linkOwnedFirmIfMissing(userId: string): Promise<void> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("firm_id")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.firm_id) return;

  const { data: ownedFirm } = await supabaseAdmin
    .from("firms")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!ownedFirm?.id) return;

  try {
    await linkProfileToFirmIfNull(userId, ownedFirm.id, "");
  } catch (e) {
    console.error("[linkOwnedFirmIfMissing]", e);
  }
}

export const getMyContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await ensureUserProfile(userId);
    await linkOwnedFirmIfMissing(userId);
    // Admin read for the signed-in user only — avoids RLS gaps during login/bootstrap.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, firm_id, role, name, email, is_super_admin, impersonated_firm_id, preferred_home, welcomed_at")
      .eq("id", userId)
      .maybeSingle();
    const effectiveFirmId = profile?.impersonated_firm_id ?? profile?.firm_id ?? null;
    if (!effectiveFirmId) return { profile, firm: null, config: null };
    const callerProfile: CallerProfile | null = profile
      ? {
          role: profile.role,
          firm_id: profile.firm_id!,
          is_super_admin: profile.is_super_admin,
          impersonated_firm_id: profile.impersonated_firm_id,
        }
      : null;
    const [{ data: firm }, configResult] = await Promise.all([
      supabaseAdmin.from("firms").select("*").eq("id", effectiveFirmId).single(),
      loadFirmConfigForCaller(supabase, userId, effectiveFirmId, callerProfile),
    ]);
    const { data: config } = configResult;
    return { profile, firm, config };
  });

export const setPreferredHome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ preferred_home: z.enum(["dashboard", "calendar", "sightline"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ preferred_home: data.preferred_home })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markWelcomed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ welcomed_at: new Date().toISOString() })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Mark the firm's onboarding wizard as complete. */
export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.firm_id) throw new Error("No firm");
    const { error } = await supabase
      .from("firms")
      .update({
        onboarding_completed: true,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq("id", profile.firm_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const landingPageEnum = z.enum([
  "dashboard",
  "projects",
  "capacity",
  "time_calendar",
  "rate_architecture",
]);

export const setDefaultLandingPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ page: landingPageEnum }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.firm_id) throw new Error("No firm");
    const { error } = await supabase
      .from("firms")
      .update({ default_landing_page: data.page })
      .eq("id", profile.firm_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function attachCostReview(
  supabase: Parameters<typeof recordAlignedRate>[0],
  firmId: string,
): Promise<CostReviewNotifications | null | undefined> {
  try {
    return await recordCostReviewAfterSave(supabase, firmId);
  } catch (e) {
    console.error("[cost-review] notification failed", e);
    return undefined;
  }
}

export const confirmCostReviewUnchanged = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.firm_id) throw new Error("No firm");
    await ensureTourRow(supabase, profile.firm_id);
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from("firm_preferences")
      .update({
        last_cost_review_date: today,
        updated_at: new Date().toISOString(),
      })
      .eq("firm_id", profile.firm_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const dismissWelcomeBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.firm_id) throw new Error("No firm");
    const { error } = await supabase
      .from("firms")
      .update({ welcome_banner_dismissed: true })
      .eq("id", profile.firm_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const configSchema = z.object({
  comp_draw_annual: z.number().min(0).max(1e9).nullable().optional(),
  comp_ptax_pct: z.number().min(0).max(100).nullable().optional(),
  comp_health_annual: z.number().min(0).max(1e9).nullable().optional(),
  comp_retire_annual: z.number().min(0).max(1e9).nullable().optional(),
  available_hrs_per_week: z.number().min(0).max(168).nullable().optional(),
  target_billable_hrs_per_week: z.number().min(0).max(168).nullable().optional(),
  target_gross_margin_pct: z.number().min(0).max(100).nullable().optional(),
  target_utilization_pct: z.number().min(0).max(100).nullable().optional(),
  rate_billed: z.number().min(0).max(100000).nullable().optional(),
  pricing_structure: z.enum(["hourly", "flat_fee", "both", "retainer"]).optional(),
  actual_billed_rate: z.number().min(0).max(100000).nullable().optional(),
  accounting_basis: z.enum(["cash", "accrual"]).optional(),
  business_structure: z
    .enum(["sole_prop", "s_corp", "partnership", "c_corp", "other"])
    .nullable()
    .optional(),
  comp_distribution_annual: z.number().min(0).max(1e9).nullable().optional(),
  comp_reserve_target_annual: z.number().min(0).max(1e9).nullable().optional(),
  comp_reserve_mode: z
    .enum(["months_1", "months_2", "months_3", "months_6", "months_12", "custom"])
    .optional(),
  planned_activity_allocation: z.record(z.string(), z.number().min(0).max(100)).optional(),
});

export const upsertFirmConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => configSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) throw new Error("No firm");
    const { data: prevConfig } = await supabase
      .from("firm_config")
      .select("*")
      .eq("firm_id", profile.firm_id)
      .maybeSingle();
    const payload = { ...data } as Record<string, unknown>;
    capTargetBillableToAvailable(payload, (prevConfig ?? {}) as Record<string, unknown>);
    const { error } = await supabase
      .from("firm_config")
      .upsert(
        { firm_id: profile.firm_id, ...payload, updated_at: new Date().toISOString() },
        { onConflict: "firm_id" },
      );
    if (error) throw new Error(error.message);
    await recordAlignedRate(supabase, profile.firm_id, "Capacity or rate updated");
    const costReview = await attachCostReview(supabase, profile.firm_id);
    const rateChanges = diffFields(
      (prevConfig ?? {}) as Record<string, unknown>,
      payload,
      [
        { key: "rate_billed", label: "Billed rate", type: "rate_per_hour" },
        { key: "pricing_structure", label: "Pricing structure", type: "text" },
        { key: "target_billable_hrs_per_week", label: "Target billable hours / week", type: "hours_per_week" },
        { key: "target_gross_margin_pct", label: "Target margin", type: "percent" },
        { key: "available_hrs_per_week", label: "Available hours / week", type: "hours_per_week" },
        { key: "actual_billed_rate", label: "Actual billed rate", type: "rate_per_hour" },
      ],
    );
    if (rateChanges.length) {
      await logChange(supabase, {
        firmId: profile.firm_id,
        userId,
        category: "rate_architecture",
        entityLabel: "Firm rate settings",
        changes: rateChanges,
      });
    }
    return { ok: true, costReview };
  });

const expenseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amount: z.number().min(0).max(1e9),
  frequency: z.enum(["annual", "monthly", "quarterly", "onetime"]),
  category: z.string().trim().max(80).optional().nullable(),
  recurring: z.boolean(),
  amort_months: z.number().int().min(1).max(360).optional().nullable(),
});

export const addExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => expenseSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) throw new Error("No firm");
    const { data: row, error } = await supabase
      .from("expenses")
      .insert({ firm_id: profile.firm_id, ...data })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await recordAlignedRate(supabase, profile.firm_id, "Operating expenses updated");
    const costReview = await attachCostReview(supabase, profile.firm_id);
    await logChange(supabase, {
      firmId: profile.firm_id,
      userId,
      category: "operating_expenses",
      entityLabel: data.name || "Expense",
      changes: [
        { field: "Added expense", key: "amount", old_value: null, new_value: data.amount, type: "currency" },
        { field: "Frequency", key: "frequency", old_value: null, new_value: data.frequency, type: "enum" },
        ...(data.category ? [{ field: "Category", key: "category", old_value: null, new_value: data.category, type: "text" as const }] : []),
      ],
    });
    return { ...row, costReview };
  });

export const deleteExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("firm_id")
      .eq("id", userId)
      .single();
    const { data: prev } = await supabase
      .from("expenses")
      .select("name, amount, frequency, category")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabase.from("expenses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    let costReview: CostReviewNotifications | null | undefined;
    if (me?.firm_id) {
      await recordAlignedRate(supabase, me.firm_id, "Operating expenses updated");
      costReview = await attachCostReview(supabase, me.firm_id);
    }
    if (me?.firm_id && prev) {
      await logChange(supabase, {
        firmId: me.firm_id,
        userId,
        category: "operating_expenses",
        entityLabel: (prev.name as string) || "Expense",
        changes: [
          { field: "Removed expense", key: "amount", old_value: prev.amount, new_value: null, type: "currency" },
        ],
      });
    }
    return { ok: true, costReview };
  });

export const listExpenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) return [];
    const { data } = await supabase
      .from("expenses")
      .select("*")
      .eq("firm_id", profile.firm_id)
      .order("created_at", { ascending: false });
    return data ?? [];
  });

const inviteSchema = z.object({
  email: z.string().trim().email().max(255),
  role: z.enum(["principal", "admin", "team", "view_only"]),
  name: z.string().trim().max(120).optional().nullable(),
  billable_rate: z.number().min(0).max(100000).optional().nullable(),
  cost_rate: z.number().min(0).max(100000).optional().nullable(),
  expected_hrs_per_week: z.number().min(0).max(168).optional().nullable(),
  weeks_per_year: z.number().min(0).max(60).optional().nullable(),
  billable_pct: z.number().min(0).max(100).optional().nullable(),
  compensation_type: z.enum(["hourly", "salaried"]).optional(),
  annual_base_salary: z.number().min(0).max(1e9).optional().nullable(),
  employer_payroll_tax_pct: z.number().min(0).max(100).optional().nullable(),
  annual_benefits: z.number().min(0).max(1e9).optional().nullable(),
  other_annual_costs: z.number().min(0).max(1e9).optional().nullable(),
  firm_member_id: z.string().uuid().optional(),
});

export const inviteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => inviteSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id, role, name, email")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) throw new Error("No firm");
    if (!["principal", "admin"].includes(profile.role)) throw new Error("Not allowed");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await assertEmailAvailableForTeamInvite(supabaseAdmin, data.email, profile.firm_id);

    if (data.firm_member_id) {
      const { data: memberRow, error: memberErr } = await supabaseAdmin
        .from("firm_members")
        .select("id, firm_id, is_active, profile_id")
        .eq("id", data.firm_member_id)
        .maybeSingle();
      if (memberErr) throw new Error(memberErr.message);
      if (!memberRow || memberRow.firm_id !== profile.firm_id || !memberRow.is_active) {
        throw new Error("Team member not found");
      }
      if (memberRow.profile_id) {
        throw new Error("This person already has a Sightline account.");
      }
      await supabaseAdmin
        .from("firm_members")
        .update({
          email: data.email,
          name: data.name ?? undefined,
        })
        .eq("id", data.firm_member_id);
    }

    // Fresh token + 7-day expiry on every (re)invite
    const newToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const expiry = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const { data: row, error } = await supabase
      .from("team_invitations")
      .upsert(
        {
          firm_id: profile.firm_id,
          email: data.email,
          role: data.role,
          name: data.name ?? null,
          billable_rate: data.billable_rate ?? null,
          cost_rate: data.cost_rate ?? null,
          expected_hrs_per_week: data.expected_hrs_per_week ?? null,
          weeks_per_year: data.weeks_per_year ?? null,
          billable_pct: data.billable_pct ?? null,
          invited_by: userId,
          token: newToken,
          invite_token_expiry: expiry,
          invited_at: new Date().toISOString(),
          accepted_at: null,
        },
        { onConflict: "firm_id,email" },
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    let teamCapacityToast: { totalAnnualHrs: number } | undefined;

    // Mirror invite state on firm_members for non-principal roles (Team cost
    // panel). Principals use profiles + owner_compensation, not firm_members.
    if (data.role !== "principal") {
      let existing: { id: string } | null = null;
      if (data.firm_member_id) {
        existing = { id: data.firm_member_id };
      } else {
        const { data: found } = await supabaseAdmin
          .from("firm_members")
          .select("id")
          .eq("firm_id", profile.firm_id)
          .ilike("email", data.email)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        existing = found;
      }
      const patch = {
        invite_sent_at: new Date().toISOString(),
        invite_accepted_at: null as string | null,
        role_type: data.role,
      };
      if (existing?.id) {
        await supabaseAdmin.from("firm_members").update(patch).eq("id", existing.id);
      } else {
        const wasFirstTeamMember =
          (await countActiveNonPrincipalTeam(supabaseAdmin, profile.firm_id)) === 0;
        await supabaseAdmin.from("firm_members").insert({
          firm_id: profile.firm_id,
          name: data.name ?? data.email,
          email: data.email,
          role_type: data.role,
          employment_type: "employee",
          is_platform_user: false,
          invite_sent_at: patch.invite_sent_at,
          expected_hrs_per_week: data.expected_hrs_per_week ?? 40,
          productive_hrs_per_week: data.expected_hrs_per_week ?? 40,
          weeks_per_year: data.weeks_per_year ?? 48,
        });
        if (wasFirstTeamMember) {
          teamCapacityToast = await teamCapacityToastAfterFirstMember(
            supabaseAdmin,
            profile.firm_id,
          );
        }
      }
    }

    // Fire off invitation email (async, non-blocking on failure) +
    // log to webhook_log so Ivorey.io / observability has a record.
    const [{ data: firm }] = await Promise.all([
      supabaseAdmin.from("firms").select("name").eq("id", profile.firm_id).single(),
    ]);
    const { data: logRow, error: logErr } = await supabaseAdmin
      .from("webhook_log")
      .insert({
        event_tag: "team-invite",
        firm_id: profile.firm_id,
        recipient_email: data.email,
        payload: {
          invitation_id: row.id,
          token: newToken,
          role: data.role,
          firm_name: firm?.name ?? null,
          principal_name: profile.name ?? profile.email,
          principal_email: profile.email,
          member_name: data.name ?? null,
        },
        status: "pending",
      })
      .select("id")
      .single();
    if (logErr) console.warn("[inviteTeamMember] webhook_log insert:", logErr.message);

    let emailSent = false;
    let emailError: string | null = null;
    try {
      const sendResult = await sendInvitationEmail({
        to: data.email,
        memberName: data.name ?? null,
        principalName: profile.name || profile.email,
        firmName: firm?.name ?? "their studio",
        role: data.role,
        token: newToken,
        invitationId: row.id as string,
      });
      emailSent = inviteEmailDelivered(sendResult);
      if (!emailSent && sendResult.skipped) {
        emailError = "Email skipped (Resend not configured on this server).";
      }
      if (logRow?.id) {
        await logTeamInviteEmailOutcome(supabaseAdmin, logRow.id, {
          sent: emailSent,
          providerId: sendResult.providerId,
          error: emailError,
        });
      }
    } catch (e) {
      emailError = e instanceof Error ? e.message : "Email send failed";
      console.warn("[inviteTeamMember] email send failed:", e);
      if (logRow?.id) {
        await logTeamInviteEmailOutcome(supabaseAdmin, logRow.id, { sent: false, error: emailError });
      }
    }
    return { ...row, teamCapacityToast, emailSent, emailError };
  });

// ─────────────── Invitation: token validation + acceptance + resend ───────────────

async function assertEmailAvailableForTeamInvite(
  supabaseAdmin: Awaited<ReturnType<typeof import("@/integrations/supabase/client.server")>>["supabaseAdmin"],
  email: string,
  firmId: string,
) {
  const normalized = email.trim().toLowerCase();
  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("id, email, name, role, firm_id")
    .ilike("email", normalized)
    .maybeSingle();
  if (!existing) return;
  const label = (existing.name as string) || (existing.email as string);
  if (existing.firm_id === firmId) {
    throw new Error(
      `${label} already uses this email for Sightline (${existing.role as string}). Use the team member's own work email — not the firm owner login.`,
    );
  }
  throw new Error("That email is already registered on another Sightline firm.");
}

function inviteEmailDelivered(result: { sent?: boolean; skipped?: boolean; providerId?: string }) {
  return result.sent === true && !result.skipped && !!result.providerId;
}

async function logTeamInviteEmailOutcome(
  supabaseAdmin: Awaited<ReturnType<typeof import("@/integrations/supabase/client.server")>>["supabaseAdmin"],
  logId: string,
  outcome: { sent: boolean; error?: string | null; providerId?: string },
) {
  const patch: Record<string, unknown> = {
    status: outcome.sent ? "sent" : "failed",
    error: outcome.sent ? null : (outcome.error ?? "Email send failed"),
    delivered_at: outcome.sent ? new Date().toISOString() : null,
  };
  await supabaseAdmin.from("webhook_log").update(patch).eq("id", logId);
}

async function sendInvitationEmail(args: {
  to: string;
  memberName: string | null;
  principalName: string;
  firmName: string;
  role: string;
  token: string;
  invitationId?: string;
}) {
  const base = (getRuntimeEnv("PUBLIC_APP_URL") || "https://sightlineprofit.com").replace(/\/$/, "");
  const acceptUrl = `${base}/accept-invite?token=${encodeURIComponent(args.token)}`;
  const { buildTeamInvitationEmail } = await import("@/lib/email-templates/team-invitation");
  const { sendTransactionalEmail } = await import("@/lib/transactional-email.server");
  const { subject, html, text, templateVariables } = buildTeamInvitationEmail({
    memberName: args.memberName,
    principalName: args.principalName,
    firmName: args.firmName,
    role: args.role,
    acceptUrl,
  });
  const templateId = getRuntimeEnv("RESEND_TEAM_INVITE_TEMPLATE_ID");
  const idempotencyKey = args.invitationId
    ? `team-invite-${args.invitationId}-${Date.now()}`
    : `team-invite-${args.token}-${Date.now()}`;

  try {
    return await sendTransactionalEmail({
      to: args.to,
      subject,
      ...(templateId
        ? { template: { id: templateId, variables: templateVariables } }
        : { html, text }),
      idempotencyKey,
    });
  } catch (templateErr) {
    if (!templateId) throw templateErr;
    console.warn("[sendInvitationEmail] template send failed, retrying inline HTML:", templateErr);
    return sendTransactionalEmail({
      to: args.to,
      subject,
      html,
      text,
      idempotencyKey: `${idempotencyKey}-inline`,
    });
  }
}

export const validateInviteToken = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        token: z
          .string()
          .transform((s) => {
            try {
              return decodeURIComponent(s).trim();
            } catch {
              return s.trim();
            }
          })
          .pipe(z.string().min(8).max(512)),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from("team_invitations")
      .select("id, firm_id, email, role, name, invite_token_expiry, accepted_at, invited_by")
      .eq("token", data.token)
      .maybeSingle();
    if (!inv) return { status: "invalid" as const };
    if (inv.accepted_at) return { status: "accepted" as const };
    const expired = new Date(inv.invite_token_expiry as unknown as string) < new Date();
    const [{ data: firm }, { data: principal }] = await Promise.all([
      supabaseAdmin.from("firms").select("name").eq("id", inv.firm_id).single(),
      supabaseAdmin.from("profiles").select("name, email").eq("id", inv.invited_by).maybeSingle(),
    ]);
    const meta = {
      firmName: firm?.name ?? "your firm",
      principalName: principal?.name || principal?.email || "your principal",
      email: inv.email,
      name: inv.name,
      role: inv.role,
    };
    if (expired) return { status: "expired" as const, ...meta };
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", (inv.email as string).trim())
      .maybeSingle();
    if (existingProfile) {
      return { status: "existing_account" as const, ...meta };
    }
    return { status: "valid" as const, ...meta };
  });

const acceptSchema = z.object({
  token: z
    .string()
    .transform((s) => {
      try {
        return decodeURIComponent(s).trim();
      } catch {
        return s.trim();
      }
    })
    .pipe(z.string().min(8).max(512)),
  password: z.string().min(8).max(200),
  name: z.string().trim().min(1).max(120),
});

export const acceptInvite = createServerFn({ method: "POST" })
  .inputValidator((d) => acceptSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv, error: invErr } = await supabaseAdmin
      .from("team_invitations")
      .select("*")
      .eq("token", data.token)
      .maybeSingle();
    if (invErr || !inv) throw new Error("Invalid invitation");
    if (inv.accepted_at) throw new Error("Invitation already used");
    if (new Date(inv.invite_token_expiry as unknown as string) < new Date()) {
      throw new Error("Invitation expired");
    }

    // Create the auth user
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: inv.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name },
    });
    if (createErr || !created.user) throw new Error(createErr?.message ?? "Could not create account");

    const newUserId = created.user.id;

    // Upsert profile (handle_new_user trigger may have created a row already)
    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: newUserId,
          email: inv.email,
          name: data.name,
          firm_id: inv.firm_id,
          role: inv.role,
          billable_rate: inv.billable_rate,
          cost_rate: inv.cost_rate,
          expected_hrs_per_week: inv.expected_hrs_per_week,
          weeks_per_year: inv.weeks_per_year,
          billable_pct: inv.billable_pct,
          invited_at: inv.invited_at,
          accepted_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
    if (profErr) throw new Error(profErr.message);

    // Mark invitation accepted
    await supabaseAdmin
      .from("team_invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", inv.id);

    // Link firm_members for non-principal roles (team cost lives here).
    if (inv.role !== "principal") {
      const nowIso = new Date().toISOString();
      const { data: existing } = await supabaseAdmin
        .from("firm_members")
        .select("id")
        .eq("firm_id", inv.firm_id)
        .ilike("email", inv.email)
        .is("profile_id", null)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        await supabaseAdmin
          .from("firm_members")
          .update({
            profile_id: newUserId,
            is_platform_user: true,
            invite_accepted_at: nowIso,
            name: data.name,
          })
          .eq("id", existing.id);
      } else {
        await supabaseAdmin.from("firm_members").insert({
          firm_id: inv.firm_id,
          profile_id: newUserId,
          name: data.name,
          email: inv.email,
          role_type: inv.role,
          employment_type: "employee",
          is_platform_user: true,
          invite_sent_at: inv.invited_at,
          invite_accepted_at: nowIso,
          expected_hrs_per_week: inv.expected_hrs_per_week ?? 40,
          weeks_per_year: inv.weeks_per_year ?? 48,
        });
      }
    }

    // Webhook log
    await supabaseAdmin.from("webhook_log").insert({
      event_tag: "team-member-onboarded",
      firm_id: inv.firm_id,
      recipient_email: inv.email,
      payload: { invitation_id: inv.id, user_id: newUserId, role: inv.role },
      status: "pending",
    });

    return { ok: true, email: inv.email };
  });

export const resendInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("firm_id, role, name, email")
      .eq("id", userId)
      .single();
    if (!me?.firm_id) throw new Error("No firm");
    if (!["principal", "admin"].includes(me.role)) throw new Error("Not allowed");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from("team_invitations")
      .select("*")
      .eq("id", data.id)
      .eq("firm_id", me.firm_id)
      .maybeSingle();
    if (!inv) throw new Error("Invitation not found");

    const { data: rosterMatch } = await supabaseAdmin
      .from("firm_members")
      .select("email")
      .eq("firm_id", me.firm_id)
      .ilike("email", inv.email as string)
      .eq("is_active", true)
      .maybeSingle();

    let sendTo = (inv.email as string).trim().toLowerCase();
    const rosterEmail = (rosterMatch?.email as string | null)?.trim().toLowerCase();
    if (rosterEmail && rosterEmail !== sendTo) {
      sendTo = rosterEmail;
      await supabaseAdmin.from("team_invitations").update({ email: sendTo }).eq("id", inv.id);
    }

    await assertEmailAvailableForTeamInvite(supabaseAdmin, sendTo, me.firm_id);

    // Keep the same token so any in-flight email still works; extend expiry on resend.
    const inviteToken = String(inv.token).trim();
    const expiry = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    await supabaseAdmin
      .from("team_invitations")
      .update({
        invite_token_expiry: expiry,
        invited_at: new Date().toISOString(),
      })
      .eq("id", inv.id);

    const { data: firm } = await supabaseAdmin
      .from("firms")
      .select("name")
      .eq("id", me.firm_id)
      .single();
    const { data: logRow, error: logErr } = await supabaseAdmin
      .from("webhook_log")
      .insert({
        event_tag: "team-invite",
        firm_id: me.firm_id,
        recipient_email: sendTo,
        payload: {
          invitation_id: inv.id,
          token: inviteToken,
          role: inv.role,
          firm_name: firm?.name ?? null,
          principal_name: me.name ?? me.email,
          resent: true,
        },
        status: "pending",
      })
      .select("id")
      .single();
    if (logErr) console.warn("[resendInvitation] webhook_log insert:", logErr.message);

    try {
      const sendResult = await sendInvitationEmail({
        to: sendTo,
        memberName: inv.name,
        principalName: me.name || me.email,
        firmName: firm?.name ?? "their studio",
        role: inv.role,
        token: inviteToken,
        invitationId: inv.id as string,
      });
      console.info("[resendInvitation] sent", {
        to: sendTo,
        providerId: sendResult?.providerId,
      });
      if (logRow?.id) {
        await logTeamInviteEmailOutcome(supabaseAdmin, logRow.id, {
          sent: inviteEmailDelivered(sendResult),
          providerId: sendResult.providerId,
          error: inviteEmailDelivered(sendResult) ? null : "Resend did not confirm delivery",
        });
      }
      const delivered = inviteEmailDelivered(sendResult);
      return {
        ok: true,
        email: sendTo,
        emailSent: delivered,
        emailError: delivered ? null : ("Resend did not accept the message" as string | null),
      };
    } catch (e) {
      const emailError = e instanceof Error ? e.message : "Email send failed";
      console.warn("[resendInvitation] email send failed:", e);
      if (logRow?.id) {
        await logTeamInviteEmailOutcome(supabaseAdmin, logRow.id, { sent: false, error: emailError });
      }
      return { ok: true, email: sendTo, emailSent: false, emailError };
    }
  });

/** Send a real invite email to the caller's own address (delivery / template test). */
export const sendTeamInviteDeliveryTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("firm_id, role, name, email")
      .eq("id", userId)
      .single();
    if (!me?.firm_id) throw new Error("No firm");
    if (!["principal", "admin"].includes(me.role)) throw new Error("Not allowed");
    const to = (me.email as string)?.trim().toLowerCase();
    if (!to) throw new Error("Your profile has no email address.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const newToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const expiry = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    const { data: row, error: upsertErr } = await supabaseAdmin
      .from("team_invitations")
      .upsert(
        {
          firm_id: me.firm_id,
          email: to,
          role: "team",
          name: "Invite delivery test",
          invited_by: userId,
          token: newToken,
          invite_token_expiry: expiry,
          invited_at: new Date().toISOString(),
          accepted_at: null,
        },
        { onConflict: "firm_id,email" },
      )
      .select("id")
      .single();
    if (upsertErr) throw new Error(upsertErr.message);

    const { data: firm } = await supabaseAdmin
      .from("firms")
      .select("name")
      .eq("id", me.firm_id)
      .single();

    const { data: logRow } = await supabaseAdmin
      .from("webhook_log")
      .insert({
        event_tag: "team-invite",
        firm_id: me.firm_id,
        recipient_email: to,
        payload: {
          invitation_id: row?.id,
          delivery_test: true,
          token: newToken,
        },
        status: "pending",
      })
      .select("id")
      .single();

    try {
      const sendResult = await sendInvitationEmail({
        to,
        memberName: "Invite delivery test",
        principalName: me.name || me.email,
        firmName: firm?.name ?? "your firm",
        role: "team",
        token: newToken,
        invitationId: row?.id as string,
      });
      if (logRow?.id) {
        await logTeamInviteEmailOutcome(supabaseAdmin, logRow.id, {
          sent: inviteEmailDelivered(sendResult),
          providerId: sendResult.providerId,
          error: inviteEmailDelivered(sendResult) ? null : "Resend did not confirm delivery",
        });
      }
      const delivered = inviteEmailDelivered(sendResult);
      return {
        emailSent: delivered,
        email: to,
        emailError: delivered ? null : ("Resend did not accept the message" as string | null),
        providerId: sendResult.providerId,
      };
    } catch (e) {
      const emailError = e instanceof Error ? e.message : "Email send failed";
      if (logRow?.id) {
        await logTeamInviteEmailOutcome(supabaseAdmin, logRow.id, { sent: false, error: emailError });
      }
      return { emailSent: false, email: to, emailError };
    }
  });

export const getInviteEmailConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();
    if (!me || !["principal", "admin"].includes(me.role)) throw new Error("Not allowed");
    const { getTransactionalEmailConfig } = await import("@/lib/transactional-email.server");
    return getTransactionalEmailConfig();
  });

const cancelPendingInvitationSchema = z
  .object({
    invitationId: z.string().uuid().optional(),
    firmMemberId: z.string().uuid().optional(),
  })
  .refine((d) => d.invitationId || d.firmMemberId, {
    message: "invitationId or firmMemberId required",
  });

/** Cancel a pending team invite and remove the roster record if they never joined. */
export const cancelPendingInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => cancelPendingInvitationSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("firm_id, role")
      .eq("id", userId)
      .single();
    if (!me?.firm_id) throw new Error("No firm");
    if (!["principal", "admin"].includes(me.role)) throw new Error("Not allowed");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let invitationId = data.invitationId ?? null;
    let memberId = data.firmMemberId ?? null;
    let memberName = "Team member";
    let memberEmail: string | null = null;

    if (memberId) {
      const { data: member } = await supabaseAdmin
        .from("firm_members")
        .select("id, name, email, is_platform_user, invite_accepted_at")
        .eq("id", memberId)
        .eq("firm_id", me.firm_id)
        .maybeSingle();
      if (!member) throw new Error("Team member not found");
      if (member.is_platform_user) {
        throw new Error("This person has already joined. Manage them from Team cost instead.");
      }
      memberName = (member.name as string) || "Team member";
      memberEmail = (member.email as string | null) ?? null;
    }

    if (invitationId) {
      const { data: inv } = await supabaseAdmin
        .from("team_invitations")
        .select("id, email, name, accepted_at")
        .eq("id", invitationId)
        .eq("firm_id", me.firm_id)
        .maybeSingle();
      if (!inv) throw new Error("Invitation not found");
      if (inv.accepted_at) throw new Error("This invitation was already accepted.");
      memberEmail = memberEmail ?? (inv.email as string);
      memberName = memberName === "Team member" ? ((inv.name as string) || memberEmail || memberName) : memberName;
    } else if (memberEmail) {
      const { data: inv } = await supabaseAdmin
        .from("team_invitations")
        .select("id, accepted_at")
        .eq("firm_id", me.firm_id)
        .ilike("email", memberEmail)
        .is("accepted_at", null)
        .maybeSingle();
      if (inv?.id) invitationId = inv.id as string;
      if (inv?.accepted_at) throw new Error("This invitation was already accepted.");
    }

    if (invitationId) {
      const { error: delErr } = await supabaseAdmin
        .from("team_invitations")
        .delete()
        .eq("id", invitationId)
        .eq("firm_id", me.firm_id)
        .is("accepted_at", null);
      if (delErr) throw new Error(delErr.message);
    }

    if (memberId) {
      const { error: memErr } = await supabaseAdmin
        .from("firm_members")
        .update({
          is_active: false,
          invite_sent_at: null,
          invite_accepted_at: null,
        })
        .eq("id", memberId)
        .eq("firm_id", me.firm_id)
        .eq("is_platform_user", false);
      if (memErr) throw new Error(memErr.message);
    } else if (memberEmail) {
      await supabaseAdmin
        .from("firm_members")
        .update({
          is_active: false,
          invite_sent_at: null,
          invite_accepted_at: null,
        })
        .eq("firm_id", me.firm_id)
        .ilike("email", memberEmail)
        .eq("is_platform_user", false);
    }

    await logChange(supabase, {
      firmId: me.firm_id,
      userId,
      category: "team_capacity",
      entityLabel: memberName,
      changes: [
        {
          field: "Invitation",
          key: "invitation",
          old_value: memberEmail ?? "pending",
          new_value: "cancelled",
          type: "text",
        },
      ],
    });

    return { ok: true };
  });

export const backfillStarterSops = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id, role, is_super_admin")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) throw new Error("No firm");
    const isAdmin =
      profile.is_super_admin || profile.role === "principal" || profile.role === "admin";
    if (!isAdmin) throw new Error("Forbidden");
    const result = await seedDefaultSops(profile.firm_id);
    return { ok: true, ...result };
  });

export const listTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) return { members: [], invites: [] };
    const [{ data: members }, { data: invites }] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, name, email, role, billable_rate, cost_rate, accepted_at, expected_hrs_per_week, weeks_per_year, billable_pct",
        )
        .eq("firm_id", profile.firm_id)
        .order("created_at", { ascending: true }),
      supabase
        .from("team_invitations")
        .select("id, name, email, role, billable_rate, cost_rate, accepted_at, invited_at, invite_token_expiry")
        .eq("firm_id", profile.firm_id)
        .is("accepted_at", null)
        .order("invited_at", { ascending: false }),
    ]);
    return { members: members ?? [], invites: invites ?? [] };
  });

const memberUpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().max(120).optional().nullable(),
  role: z.enum(["principal", "admin", "team", "view_only"]).optional(),
  billable_rate: z.number().min(0).max(100000).optional().nullable(),
  cost_rate: z.number().min(0).max(100000).optional().nullable(),
  expected_hrs_per_week: z.number().min(0).max(168).optional().nullable(),
  weeks_per_year: z.number().min(0).max(60).optional().nullable(),
  billable_pct: z.number().min(0).max(100).optional().nullable(),
});

export const updateTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => memberUpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("firm_id, role")
      .eq("id", userId)
      .single();
    if (!me?.firm_id) throw new Error("No firm");
    if (!["principal", "admin"].includes(me.role)) throw new Error("Not allowed");

    const { id, name, ...rest } = data;
    const { error } = await supabase
      .from("profiles")
      .update({
        ...rest,
        ...(name !== undefined ? { name: name ?? "" } : {}),
      })
      .eq("id", id)
      .eq("firm_id", me.firm_id);
    if (error) throw new Error(error.message);
    // If this profile is linked to a firm_members row, keep basic fields in sync.
    if (name !== undefined) {
      await supabase
        .from("firm_members")
        .update({ name: name ?? "" })
        .eq("profile_id", id)
        .eq("firm_id", me.firm_id);
    }
    return { ok: true };
  });

// ─────────────────────── firm_members (source of truth for team cost) ───────────────────────

export const listFirmMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) return [];
    const { data } = await supabase
      .from("firm_members")
      .select("*")
      .eq("firm_id", profile.firm_id)
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    return data ?? [];
  });

const firmMemberSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().optional().nullable(),
  role_type: z.enum(["principal", "admin", "team", "contractor", "view_only"]),
  employment_type: z.enum(["employee", "contractor", "1099"]).default("employee"),
  notes: z.string().max(500).optional().nullable(),
  // compensation
  compensation_type: z.enum(["hourly", "salaried", "contract_hourly", "contract_annual"]).default("hourly"),
  hourly_wage: z.number().min(0).max(100000).optional().nullable(),
  annual_base_salary: z.number().min(0).max(1e9).optional().nullable(),
  employer_payroll_tax_pct: z.number().min(0).max(100).optional().nullable(),
  employer_tax_rate_is_custom: z.boolean().optional(),
  annual_benefits: z.number().min(0).max(1e9).optional().nullable(),
  other_annual_costs: z.number().min(0).max(1e9).optional().nullable(),
  expected_hrs_per_week: z.number().min(0).max(168).optional().nullable(),
  productive_hrs_per_week: z.number().min(0).max(168).optional().nullable(),
  weeks_per_year: z.number().min(0).max(60).optional().nullable(),
  billed_rate: z.number().min(0).max(100000).optional().nullable(),
});

async function countActiveNonPrincipalTeam(
  supabase: Parameters<typeof logChange>[0],
  firmId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("firm_members")
    .select("id", { count: "exact", head: true })
    .eq("firm_id", firmId)
    .eq("is_active", true)
    .neq("role_type", "principal");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function teamCapacityToastAfterFirstMember(
  supabase: Parameters<typeof logChange>[0],
  firmId: string,
): Promise<{ totalAnnualHrs: number }> {
  const [{ data: config }, { data: members }] = await Promise.all([
    supabase.from("firm_config").select("*").eq("firm_id", firmId).maybeSingle(),
    supabase
      .from("firm_members")
      .select(
        "burdened_weekly_cost, weeks_per_year, expected_hrs_per_week, productive_hrs_per_week, billed_rate, is_active, role_type",
      )
      .eq("firm_id", firmId)
      .eq("is_active", true),
  ]);
  const teamProfiles = (members ?? [])
    .filter((m) => m.role_type !== "principal")
    .map(mapTeamBurdenRow);
  const result = calc(config as FirmConfig, [], { teamProfiles });
  return { totalAnnualHrs: result.annualBillableHrs || 0 };
}

export const saveFirmMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => firmMemberSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("firm_id, role")
      .eq("id", userId)
      .single();
    if (!me?.firm_id) throw new Error("No firm");
    if (!["principal", "admin"].includes(me.role)) throw new Error("Not allowed");

    // Compute burden (contractor/1099 exempt from employer payroll tax)
    const empType = data.employment_type;
    const isContract = empType === "contractor" || empType === "1099";
    const wks = Number(data.weeks_per_year) || 48;
    const hpw = Number(data.expected_hrs_per_week) || 40;
    const ptaxPct = isContract ? 0 : Number(data.employer_payroll_tax_pct ?? 7.65) || 0;
    const benefits = isContract ? 0 : Number(data.annual_benefits) || 0;
    const other = Number(data.other_annual_costs) || 0;

    let hr = 0;
    if (data.compensation_type === "salaried") {
      const base = Number(data.annual_base_salary) || 0;
      const yr = base * (1 + ptaxPct / 100) + benefits + other;
      hr = wks > 0 && hpw > 0 ? yr / (wks * hpw) : 0;
    } else if (data.compensation_type === "contract_annual") {
      const base = Number(data.annual_base_salary) || 0;
      const yr = base + other;
      hr = wks > 0 && hpw > 0 ? yr / (wks * hpw) : 0;
    } else {
      // hourly or contract_hourly
      const cost = Number(data.hourly_wage) || 0;
      const yearlyHrs = Math.max(1, wks * hpw);
      hr = cost * (1 + ptaxPct / 100) + benefits / yearlyHrs + other / yearlyHrs;
    }
    const wk = hr * hpw;

    const isNonPrincipal = data.role_type !== "principal";
    let wasFirstTeamMember = false;
    if (!data.id && isNonPrincipal) {
      wasFirstTeamMember = (await countActiveNonPrincipalTeam(supabase, me.firm_id)) === 0;
    }

    const productiveHrs =
      data.productive_hrs_per_week ??
      (data.id ? null : (data.expected_hrs_per_week ?? 40));

    const row = {
      firm_id: me.firm_id,
      name: data.name,
      email: data.email ?? null,
      role_type: data.role_type,
      employment_type: empType,
      notes: data.notes ?? null,
      compensation_type: data.compensation_type,
      hourly_wage: data.hourly_wage ?? null,
      annual_base_salary: data.annual_base_salary ?? null,
      employer_payroll_tax_pct: isContract ? null : (data.employer_payroll_tax_pct ?? null),
      employer_tax_rate_is_custom: data.employer_tax_rate_is_custom ?? false,
      annual_benefits: isContract ? null : (data.annual_benefits ?? null),
      other_annual_costs: data.other_annual_costs ?? null,
      expected_hrs_per_week: data.expected_hrs_per_week ?? null,
      productive_hrs_per_week: productiveHrs,
      weeks_per_year: data.weeks_per_year ?? null,
      billed_rate: data.billed_rate ?? null,
      burdened_hourly_rate: hr || null,
      burdened_weekly_cost: wk || null,
    };

    if (data.id) {
      const { data: prevMember } = await supabase
        .from("firm_members")
        .select("*")
        .eq("id", data.id)
        .maybeSingle();
      const { error } = await supabase
        .from("firm_members")
        .update(row)
        .eq("id", data.id)
        .eq("firm_id", me.firm_id);
      if (error) throw new Error(error.message);

      const nextEmail = (data.email ?? "").trim().toLowerCase();
      const prevEmail = (prevMember?.email as string | null)?.trim().toLowerCase() ?? "";
      if (nextEmail && prevEmail && nextEmail !== prevEmail && !prevMember?.is_platform_user) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("team_invitations")
          .update({ email: nextEmail })
          .eq("firm_id", me.firm_id)
          .ilike("email", prevEmail)
          .is("accepted_at", null);
      }

      await recordAlignedRate(supabase, me.firm_id, "Team cost updated");
      const costReview = await attachCostReview(supabase, me.firm_id);
      await logMemberChanges(supabase, me.firm_id, userId, data.name, prevMember, row);
      return { ok: true, id: data.id, costReview };
    }
    const { data: inserted, error } = await supabase
      .from("firm_members")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await recordAlignedRate(supabase, me.firm_id, "Team cost updated");
    const costReview = await attachCostReview(supabase, me.firm_id);
    await logMemberChanges(supabase, me.firm_id, userId, data.name, null, row);
    let teamCapacityToast: { totalAnnualHrs: number } | undefined;
    if (wasFirstTeamMember) {
      teamCapacityToast = await teamCapacityToastAfterFirstMember(supabase, me.firm_id);
    }
    return { ok: true, id: inserted!.id, costReview, teamCapacityToast };
  });

async function logMemberChanges(
  supabase: Parameters<typeof logChange>[0],
  firmId: string,
  userId: string | null,
  entityLabel: string,
  prev: Record<string, unknown> | null,
  next: Record<string, unknown>,
) {
  const costChanges: ChangedField[] = diffFields(prev, next, [
    { key: "compensation_type", label: "Compensation type", type: "enum" },
    { key: "employment_type", label: "Employment type", type: "enum" },
    { key: "hourly_wage", label: "Hourly wage", type: "rate_per_hour" },
    { key: "annual_base_salary", label: "Annual salary", type: "currency_annual" },
    { key: "employer_payroll_tax_pct", label: "Employer payroll tax", type: "percent" },
    { key: "annual_benefits", label: "Annual benefits", type: "currency_annual" },
    { key: "other_annual_costs", label: "Equipment / other", type: "currency_annual" },
    { key: "billed_rate", label: "Billed rate", type: "rate_per_hour" },
  ]);
  const capChanges: ChangedField[] = diffFields(prev, next, [
    { key: "expected_hrs_per_week", label: "Expected hours / week", type: "hours_per_week" },
    { key: "productive_hrs_per_week", label: "Productive hours / week", type: "hours_per_week" },
    { key: "weeks_per_year", label: "Weeks / year", type: "weeks" },
  ]);
  if (costChanges.length) {
    await logChange(supabase, {
      firmId, userId, category: "team_cost", entityLabel, changes: costChanges,
    });
  }
  if (capChanges.length) {
    await logChange(supabase, {
      firmId, userId, category: "team_capacity", entityLabel, changes: capChanges,
    });
  }
}

export const deleteFirmMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("firm_id, role")
      .eq("id", userId)
      .single();
    if (!me?.firm_id) throw new Error("No firm");
    if (!["principal", "admin"].includes(me.role)) throw new Error("Not allowed");
    const { data: prev } = await supabase
      .from("firm_members")
      .select("name, is_active")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabase
      .from("firm_members")
      .update({ is_active: false })
      .eq("id", data.id)
      .eq("firm_id", me.firm_id);
    if (error) throw new Error(error.message);
    await recordAlignedRate(supabase, me.firm_id, "Team cost updated");
    const costReview = await attachCostReview(supabase, me.firm_id);
    await logChange(supabase, {
      firmId: me.firm_id,
      userId,
      category: "team_capacity",
      entityLabel: (prev?.name as string) || "Team member",
      changes: [{ field: "Active", key: "is_active", old_value: true, new_value: false, type: "boolean" }],
    });
    return { ok: true, costReview };
  });

export const listActivityGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) return [];
    const { data } = await supabase
      .from("activity_groups")
      .select("*")
      .eq("firm_id", profile.firm_id)
      .order("created_at", { ascending: true });
    return data ?? [];
  });

const activityGroupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/),
});

export const addActivityGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => activityGroupSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) throw new Error("No firm");
    const { data: row, error } = await supabase
      .from("activity_groups")
      .insert({ firm_id: profile.firm_id, ...data })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteActivityGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("activity_groups").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const CUSTOM_ACTIVITY_COLORS = ["#6B8E9B", "#C4714A", "#9B7BB8", "#5C8A6E", "#B8860B", "#4A7FA5"];

export const listActivityTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) return [];
    const { data } = await supabase
      .from("activity_types")
      .select("id, name, is_billable, is_default, is_system, color, sort_order")
      .eq("firm_id", profile.firm_id)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    return data ?? [];
  });

const activityTypeCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  is_billable: z.boolean().default(false),
});

export const addActivityType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => activityTypeCreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id, role")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) throw new Error("No firm");
    if (!["principal", "admin"].includes(profile.role)) throw new Error("Admin only");

    const { data: last } = await supabase
      .from("activity_types")
      .select("sort_order")
      .eq("firm_id", profile.firm_id)
      .lt("sort_order", 99)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const sortOrder = Math.min(98, (last?.sort_order ?? 5) + 1);
    const color = CUSTOM_ACTIVITY_COLORS[sortOrder % CUSTOM_ACTIVITY_COLORS.length];

    const { data: row, error } = await supabase
      .from("activity_types")
      .insert({
        firm_id: profile.firm_id,
        name: data.name,
        is_billable: data.is_billable,
        is_default: false,
        is_system: false,
        color,
        sort_order: sortOrder,
      })
      .select("id, name, is_billable, is_default, is_system, color, sort_order")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const activityTypeUpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80).optional(),
  is_billable: z.boolean().optional(),
  /** Required when changing an activity that has linked time entries. */
  applyToExistingEntries: z.boolean().optional(),
});

export const getActivityTypeEntryCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) return { count: 0 };

    const { count, error } = await supabase
      .from("time_entries")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", profile.firm_id)
      .eq("activity_type_id", data.id);
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

export const updateActivityType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => activityTypeUpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id, role")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) throw new Error("No firm");
    if (!["principal", "admin"].includes(profile.role)) throw new Error("Admin only");

    const { data: existing } = await supabase
      .from("activity_types")
      .select("id, name, is_billable, is_default, is_system")
      .eq("id", data.id)
      .eq("firm_id", profile.firm_id)
      .maybeSingle();
    if (!existing) throw new Error("Activity not found");
    if (existing.is_system) throw new Error("System activities cannot be edited");

    const nameChanging = data.name !== undefined && data.name !== existing.name;
    const billableChanging =
      data.is_billable !== undefined && data.is_billable !== existing.is_billable;
    if (!nameChanging && !billableChanging) return { ok: true, entriesUpdated: 0 };

    const { count: entryCount, error: countError } = await supabase
      .from("time_entries")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", profile.firm_id)
      .eq("activity_type_id", data.id);
    if (countError) throw new Error(countError.message);
    const linkedEntries = entryCount ?? 0;

    if (linkedEntries > 0 && !data.applyToExistingEntries) {
      throw new Error(
        `${linkedEntries} time ${linkedEntries === 1 ? "entry uses" : "entries use"} this activity. Confirm to update them.`,
      );
    }

    const patch: { name?: string; is_billable?: boolean } = {};
    if (billableChanging) patch.is_billable = data.is_billable;
    if (nameChanging) patch.name = data.name;

    const { error: typeError } = await supabase.from("activity_types").update(patch).eq("id", data.id);
    if (typeError) throw new Error(typeError.message);

    let entriesUpdated = 0;
    if (billableChanging && linkedEntries > 0) {
      const { error: entryError } = await supabase
        .from("time_entries")
        .update({ billable: data.is_billable! })
        .eq("firm_id", profile.firm_id)
        .eq("activity_type_id", data.id);
      if (entryError) throw new Error(entryError.message);
      entriesUpdated = linkedEntries;
    }

    // Renames propagate automatically — entries store activity_type_id, not the name.
    return {
      ok: true,
      entriesUpdated,
      entriesLinked: linkedEntries,
      nameChanged: nameChanging,
      billableChanged: billableChanging,
    };
  });

export const deleteActivityType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id, role")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) throw new Error("No firm");
    if (!["principal", "admin"].includes(profile.role)) throw new Error("Admin only");

    const { data: existing } = await supabase
      .from("activity_types")
      .select("id, is_default, is_system")
      .eq("id", data.id)
      .eq("firm_id", profile.firm_id)
      .maybeSingle();
    if (!existing) throw new Error("Activity not found");
    if (existing.is_default || existing.is_system) {
      throw new Error("Default activities cannot be deleted");
    }

    const { error } = await supabase.from("activity_types").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const logOwnerDraw = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        draw_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        amount: z.number().positive().max(1e9),
        draw_type: z.enum(["salary", "distribution"]),
        notes: z.string().trim().max(500).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id, role")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) throw new Error("No firm");
    if (!["principal", "admin"].includes(profile.role)) throw new Error("Admin only");

    const { data: row, error } = await supabase
      .from("owner_draws")
      .insert({
        firm_id: profile.firm_id,
        draw_date: data.draw_date,
        amount: data.amount,
        draw_type: data.draw_type,
        notes: data.notes ?? null,
      })
      .select("id, amount, draw_type")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const firmUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const updateFirm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => firmUpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) throw new Error("No firm");
    const { error } = await supabase.from("firms").update({ name: data.name }).eq("id", profile.firm_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Self-serve recovery: lets the firm owner (or first user if no principal
 * exists yet) promote themselves to `principal`. Used when a profile ends up
 * stuck on `team` and the navigation guard locks them out of all admin pages.
 */
export const claimPrincipalRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, firm_id, role")
      .eq("id", userId)
      .single();
    if (pErr || !profile?.firm_id) throw new Error("No firm associated with this account");
    if (profile.role === "principal") return { ok: true, alreadyPrincipal: true };

    const { data: firm } = await supabaseAdmin
      .from("firms")
      .select("id, owner_id")
      .eq("id", profile.firm_id)
      .single();

    const isOwner = firm?.owner_id === userId;

    let hasPrincipal = false;
    if (!isOwner) {
      const { count } = await supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("firm_id", profile.firm_id)
        .eq("role", "principal");
      hasPrincipal = (count ?? 0) > 0;
    }

    if (!isOwner && hasPrincipal) {
      throw new Error(
        "This firm already has a principal. Ask them to update your role in Settings → Owner compensation or Team.",
      );
    }

    const { error: uErr } = await supabaseAdmin
      .from("profiles")
      .update({ role: "principal" })
      .eq("id", userId);
    if (uErr) throw new Error(uErr.message);

    return { ok: true, alreadyPrincipal: false };
  });

// ──────────────────── Owner Compensation (multi-principal) ────────────────────

export const listOwnerCompensations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("firm_id, role")
      .eq("id", userId)
      .single();
    if (!me?.firm_id) return { principals: [], comp: [] };
    const [{ data: principals }, { data: comp }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, name, email, role, created_at")
        .eq("firm_id", me.firm_id)
        .eq("role", "principal")
        .order("created_at", { ascending: true }),
      supabase
        .from("owner_compensation")
        .select("*")
        .eq("firm_id", me.firm_id),
    ]);
    let compRows = comp ?? [];
    // Backfill: if the current principal has no owner_compensation row but
    // firm_config carries non-zero comp fields (from an older onboarding
    // flow that only wrote to firm_config), seed a row so Settings and the
    // Rate Architecture itemization surface the same values automatically.
    if (
      me.role === "principal" &&
      !compRows.some((r: any) => r.profile_id === userId)
    ) {
      const { data: cfg } = await supabase
        .from("firm_config")
        .select(
          "comp_draw_annual, comp_distribution_annual, comp_health_annual, comp_retire_annual, comp_ptax_pct",
        )
        .eq("firm_id", me.firm_id)
        .maybeSingle();
      const draw = Number(cfg?.comp_draw_annual) || 0;
      const dist = Number(cfg?.comp_distribution_annual) || 0;
      const health = Number(cfg?.comp_health_annual) || 0;
      const retire = Number(cfg?.comp_retire_annual) || 0;
      if (draw > 0 || dist > 0 || health > 0 || retire > 0) {
        const ptax = Number(cfg?.comp_ptax_pct);
        const { data: inserted } = await supabase
          .from("owner_compensation")
          .upsert(
            {
              firm_id: me.firm_id,
              profile_id: userId,
              comp_draw_annual: draw || null,
              distribution_annual: dist || null,
              health_insurance_annual: health || null,
              retirement_annual: retire || null,
              payroll_tax_pct: Number.isFinite(ptax) && ptax > 0 ? ptax : 15.3,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "firm_id,profile_id" },
          )
          .select("*")
          .maybeSingle();
        if (inserted) compRows = [...compRows, inserted];
      }
    }
    return { principals: principals ?? [], comp: compRows };
  });

const ownerCompSchema = z.object({
  comp_draw_annual: z.number().min(0).max(1e9).nullable().optional(),
  payroll_tax_pct: z.number().min(0).max(100).nullable().optional(),
  health_insurance_annual: z.number().min(0).max(1e9).nullable().optional(),
  retirement_annual: z.number().min(0).max(1e9).nullable().optional(),
  distribution_annual: z.number().min(0).max(1e9).nullable().optional(),
  distribution_tax_rate: z.number().min(0).max(1).nullable().optional(),
  reserve_target: z.number().min(0).max(1e9).nullable().optional(),
  reserve_months: z.number().int().min(0).max(60).nullable().optional(),
  compensation_notes: z.string().max(2000).nullable().optional(),
  employee_payroll_tax_pct: z.number().min(0).max(100).nullable().optional(),
});

export const upsertOwnerCompensation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ownerCompSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("firm_id, role")
      .eq("id", userId)
      .single();
    if (!me?.firm_id) throw new Error("No firm");
    if (me.role !== "principal") throw new Error("Only principals can update their compensation.");
    const { data: prev } = await supabase
      .from("owner_compensation")
      .select("*")
      .eq("firm_id", me.firm_id)
      .eq("profile_id", userId)
      .maybeSingle();
    const { data: meProfile } = await supabase
      .from("profiles").select("name, email").eq("id", userId).maybeSingle();
    const entityLabel = (meProfile?.name as string) || (meProfile?.email as string) || "Principal";
    const { error } = await supabase
      .from("owner_compensation")
      .upsert(
        {
          firm_id: me.firm_id,
          profile_id: userId,
          ...data,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "firm_id,profile_id" },
      );
    if (error) throw new Error(error.message);
    await recordAlignedRate(supabase, me.firm_id, "Compensation updated");
    const costReview = await attachCostReview(supabase, me.firm_id);
    const changes = diffFields(prev as Record<string, unknown> | null, data as Record<string, unknown>, [
      { key: "comp_draw_annual", label: "Compensation draw", type: "currency_annual" },
      { key: "payroll_tax_pct", label: "Payroll tax", type: "percent" },
      { key: "health_insurance_annual", label: "Health insurance", type: "currency_annual" },
      { key: "retirement_annual", label: "Retirement", type: "currency_annual" },
      { key: "distribution_annual", label: "Distributions", type: "currency_annual" },
      { key: "distribution_tax_rate", label: "Distribution tax rate", type: "percent" },
      { key: "reserve_target", label: "Reserve target", type: "currency" },
      { key: "reserve_months", label: "Reserve months", type: "weeks" },
      { key: "employee_payroll_tax_pct", label: "Employee payroll tax", type: "percent" },
    ]);
    if (changes.length) {
      await logChange(supabase, {
        firmId: me.firm_id, userId, category: "owner_compensation",
        entityLabel, changes,
      });
    }
    return { ok: true, costReview };
  });

export const deleteOwnerCompensation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("firm_id, role")
      .eq("id", userId)
      .single();
    if (!me?.firm_id) throw new Error("No firm");
    if (me.role !== "principal") throw new Error("Only principals can remove their compensation.");
    const { data: prev } = await supabase
      .from("owner_compensation")
      .select("comp_draw_annual")
      .eq("firm_id", me.firm_id)
      .eq("profile_id", userId)
      .maybeSingle();
    const { data: meProfile } = await supabase
      .from("profiles").select("name, email").eq("id", userId).maybeSingle();
    const { error } = await supabase
      .from("owner_compensation")
      .delete()
      .eq("firm_id", me.firm_id)
      .eq("profile_id", userId);
    if (error) throw new Error(error.message);
    await recordAlignedRate(supabase, me.firm_id, "Compensation updated");
    const costReview = await attachCostReview(supabase, me.firm_id);
    await logChange(supabase, {
      firmId: me.firm_id, userId, category: "owner_compensation",
      entityLabel: (meProfile?.name as string) || (meProfile?.email as string) || "Principal",
      changes: [{ field: "Removed compensation record", key: "comp_draw_annual", old_value: prev?.comp_draw_annual ?? null, new_value: null, type: "currency_annual" }],
    });
    return { ok: true, costReview };
  });