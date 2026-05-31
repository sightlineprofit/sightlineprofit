import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

    return { firmId: firm.id, alreadyExists: false };
  });

export const getMyContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, firm_id, role, name, email, is_super_admin, impersonated_firm_id")
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
  business_structure: z.enum(["sole_prop", "s_corp", "other"]).optional(),
  comp_distribution_annual: z.number().min(0).max(1e9).nullable().optional(),
  comp_reserve_target_annual: z.number().min(0).max(1e9).nullable().optional(),
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
});

export const inviteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => inviteSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("firm_id, role")
      .eq("id", userId)
      .single();
    if (!profile?.firm_id) throw new Error("No firm");
    if (!["principal", "admin"].includes(profile.role)) throw new Error("Not allowed");
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
        },
        { onConflict: "firm_id,email" },
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Reserved for future flag; the dashboard is reachable once a firm exists.
    return { ok: true, userId: context.userId };
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
        .select("id, name, email, role, billable_rate, cost_rate, accepted_at")
        .eq("firm_id", profile.firm_id)
        .order("created_at", { ascending: true }),
      supabase
        .from("team_invitations")
        .select("id, name, email, role, billable_rate, cost_rate, accepted_at, invited_at")
        .eq("firm_id", profile.firm_id)
        .is("accepted_at", null)
        .order("invited_at", { ascending: false }),
    ]);
    return { members: members ?? [], invites: invites ?? [] };
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