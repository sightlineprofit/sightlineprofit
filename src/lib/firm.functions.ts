import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeBurden } from "@/lib/cost";
import { seedDefaultSops } from "@/lib/sop-seed.server";

const tierEnum = z.enum(["foundation", "studio", "practice"]);

export const createFirmForCurrentUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        firmName: z.string().trim().min(1).max(120),
        ownerName: z.string().trim().min(1).max(120),
        tier: tierEnum,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // If user already has a firm, return it (idempotent).
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id, name")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.firm_id) {
      return { firmId: profile.firm_id, alreadyExists: true };
    }

    // Bootstrap uses admin client: the firms_select policy requires
    // current_firm_id() to match, but the user's profile.firm_id is still
    // null at this point — so RETURNING via the user-scoped client fails.
    const { data: firm, error: firmErr } = await supabaseAdmin
      .from("firms")
      .insert({
        name: data.firmName,
        owner_id: userId,
        subscription_tier: data.tier,
        subscription_status: "trialing",
      })
      .select("id")
      .single();
    if (firmErr || !firm) throw new Error(firmErr?.message ?? "Failed to create firm");

    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({
        firm_id: firm.id,
        role: "principal",
        name: data.ownerName,
        accepted_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (profErr) throw new Error(profErr.message);

    await supabaseAdmin.from("firm_config").insert({ firm_id: firm.id });

    // Seed the 10 starter SOP templates for this firm (idempotent by name).
    try {
      await seedDefaultSops(firm.id);
    } catch (e) {
      console.error("[createFirmForCurrentUser] seedDefaultSops failed:", e);
    }

    return { firmId: firm.id, alreadyExists: false };
  });

export const getMyContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, firm_id, role, name, email, is_super_admin, impersonated_firm_id, preferred_home, welcomed_at")
      .eq("id", userId)
      .maybeSingle();
    const effectiveFirmId = profile?.impersonated_firm_id ?? profile?.firm_id ?? null;
    if (!effectiveFirmId) return { profile, firm: null, config: null };
    const [{ data: firm }, { data: config }] = await Promise.all([
      supabase.from("firms").select("*").eq("id", effectiveFirmId).single(),
      supabase.from("firm_config").select("*").eq("firm_id", effectiveFirmId).maybeSingle(),
    ]);
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

const configSchema = z.object({
  comp_draw_annual: z.number().min(0).max(1e9).nullable().optional(),
  comp_ptax_pct: z.number().min(0).max(100).nullable().optional(),
  comp_health_annual: z.number().min(0).max(1e9).nullable().optional(),
  comp_retire_annual: z.number().min(0).max(1e9).nullable().optional(),
  available_hrs_per_week: z.number().min(0).max(168).nullable().optional(),
  target_billable_hrs_per_week: z.number().min(0).max(168).nullable().optional(),
  target_gross_margin_pct: z.number().min(0).max(100).nullable().optional(),
  rate_billed: z.number().min(0).max(100000).nullable().optional(),
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
    const { error } = await supabase
      .from("firm_config")
      .upsert(
        { firm_id: profile.firm_id, ...data, updated_at: new Date().toISOString() },
        { onConflict: "firm_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
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
    return row;
  });

export const deleteExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("expenses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
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

    // Fire off invitation email (async, non-blocking on failure) +
    // log to webhook_log so Ivorey.io / observability has a record.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: firm }] = await Promise.all([
      supabaseAdmin.from("firms").select("name").eq("id", profile.firm_id).single(),
    ]);
    await supabaseAdmin.from("webhook_log").insert({
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
    });
    try {
      await sendInvitationEmail({
        to: data.email,
        memberName: data.name ?? null,
        principalName: profile.name || profile.email,
        firmName: firm?.name ?? "their studio",
        role: data.role,
        token: newToken,
      });
    } catch (e) {
      // Email infrastructure may not be wired yet — record was saved, token is valid.
      console.warn("[inviteTeamMember] email send failed:", e);
    }
    return row;
  });

// ─────────────── Invitation: token validation + acceptance + resend ───────────────

async function sendInvitationEmail(args: {
  to: string;
  memberName: string | null;
  principalName: string;
  firmName: string;
  role: string;
  token: string;
}) {
  // Best-effort send via Lovable's transactional email route.
  // If the route hasn't been scaffolded yet (no email infra), this no-ops.
  const url = process.env.PUBLIC_APP_URL || "";
  if (!url) return;
  try {
    const res = await fetch(`${url}/lovable/email/transactional/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
      },
      body: JSON.stringify({
        templateName: "team-invitation",
        recipientEmail: args.to,
        idempotencyKey: `team-invite-${args.token}`,
        templateData: args,
      }),
    });
    if (!res.ok) throw new Error(`email send ${res.status}`);
  } catch (e) {
    throw e;
  }
}

export const validateInviteToken = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().min(8).max(200) }).parse(d))
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
    return { status: "valid" as const, ...meta };
  });

const acceptSchema = z.object({
  token: z.string().min(8).max(200),
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

    const newToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const expiry = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    await supabaseAdmin
      .from("team_invitations")
      .update({
        token: newToken,
        invite_token_expiry: expiry,
        invited_at: new Date().toISOString(),
      })
      .eq("id", inv.id);

    const { data: firm } = await supabaseAdmin
      .from("firms")
      .select("name")
      .eq("id", me.firm_id)
      .single();
    await supabaseAdmin.from("webhook_log").insert({
      event_tag: "team-invite",
      firm_id: me.firm_id,
      recipient_email: inv.email,
      payload: {
        invitation_id: inv.id,
        token: newToken,
        role: inv.role,
        firm_name: firm?.name ?? null,
        principal_name: me.name ?? me.email,
        resent: true,
      },
      status: "pending",
    });
    try {
      await sendInvitationEmail({
        to: inv.email,
        memberName: inv.name,
        principalName: me.name || me.email,
        firmName: firm?.name ?? "their studio",
        role: inv.role,
        token: newToken,
      });
    } catch (e) {
      console.warn("[resendInvitation] email send failed:", e);
    }
    return { ok: true, email: inv.email };
  });

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Reserved for future flag; the dashboard is reachable once a firm exists.
    return { ok: true, userId: context.userId };
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
          "id, name, email, role, billable_rate, cost_rate, accepted_at, expected_hrs_per_week, weeks_per_year, billable_pct, compensation_type, annual_base_salary, employer_payroll_tax_pct, annual_benefits, other_annual_costs, burdened_hourly_rate, burdened_weekly_cost",
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
  compensation_type: z.enum(["hourly", "salaried"]).optional(),
  annual_base_salary: z.number().min(0).max(1e9).optional().nullable(),
  employer_payroll_tax_pct: z.number().min(0).max(100).optional().nullable(),
  annual_benefits: z.number().min(0).max(1e9).optional().nullable(),
  other_annual_costs: z.number().min(0).max(1e9).optional().nullable(),
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

    // recompute burdened rates
    const burden = computeBurden({
      compensation_type: data.compensation_type,
      cost_rate: data.cost_rate,
      annual_base_salary: data.annual_base_salary,
      employer_payroll_tax_pct: data.employer_payroll_tax_pct,
      annual_benefits: data.annual_benefits,
      other_annual_costs: data.other_annual_costs,
      expected_hrs_per_week: data.expected_hrs_per_week,
      weeks_per_year: data.weeks_per_year,
    });

    const { id, name, ...rest } = data;
    const { error } = await supabase
      .from("profiles")
      .update({
        ...rest,
        ...(name !== undefined ? { name: name ?? "" } : {}),
        burdened_hourly_rate: burden.hr || null,
        burdened_weekly_cost: burden.wk || null,
      })
      .eq("id", id)
      .eq("firm_id", me.firm_id);
    if (error) throw new Error(error.message);
    return { ok: true };
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
        "This firm already has a principal. Ask them to update your role in Settings → Team.",
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
      .select("firm_id")
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
    return { principals: principals ?? [], comp: comp ?? [] };
  });

const ownerCompSchema = z.object({
  comp_draw_annual: z.number().min(0).max(1e9).nullable().optional(),
  payroll_tax_pct: z.number().min(0).max(100).nullable().optional(),
  health_insurance_annual: z.number().min(0).max(1e9).nullable().optional(),
  retirement_annual: z.number().min(0).max(1e9).nullable().optional(),
  distribution_annual: z.number().min(0).max(1e9).nullable().optional(),
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
    return { ok: true };
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
    const { error } = await supabase
      .from("owner_compensation")
      .delete()
      .eq("firm_id", me.firm_id)
      .eq("profile_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });