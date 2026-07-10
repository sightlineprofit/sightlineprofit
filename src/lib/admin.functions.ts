import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createStripeClient, getStripeErrorMessage, type StripeEnv } from "@/lib/stripe.server";

async function assertSuper(supabase: any, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.is_super_admin) throw new Error("Forbidden");
}

export const listAllFirms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const { data: firms } = await supabaseAdmin
      .from("firms")
      .select("id, name, owner_id, subscription_tier, subscription_status, trial_ends_at, created_at, is_demo")
      .eq("is_demo", false)
      .order("created_at", { ascending: false });
    if (!firms) return [];
    const ids = firms.map((f) => f.id);
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, firm_id, email")
      .in("firm_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const owners = new Map((profiles ?? []).filter((p) => firms.some((f) => f.owner_id === p.id)).map((p) => [p.id, p.email]));
    const counts = new Map<string, number>();
    (profiles ?? []).forEach((p) => counts.set(p.firm_id!, (counts.get(p.firm_id!) ?? 0) + 1));
    return firms.map((f) => ({
      ...f,
      owner_email: owners.get(f.owner_id) ?? null,
      user_count: counts.get(f.id) ?? 0,
    }));
  });

export const listAllUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const [{ data: profiles }, { data: firms }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, name, email, role, firm_id, is_super_admin, accepted_at, created_at")
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("firms").select("id, name, subscription_tier"),
    ]);
    const firmMap = new Map((firms ?? []).map((f) => [f.id, f]));
    return (profiles ?? []).map((p) => ({
      ...p,
      firm_name: p.firm_id ? firmMap.get(p.firm_id)?.name ?? null : null,
      firm_tier: p.firm_id ? firmMap.get(p.firm_id)?.subscription_tier ?? null : null,
    }));
  });

export const setFirmOverrides = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        firm_id: z.string().uuid(),
        subscription_tier: z.enum(["studio", "practice"]).optional(),
        subscription_status: z.enum(["trialing", "active", "past_due", "canceled"]).optional(),
        trial_ends_at: z.string().datetime().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuper(context.supabase, context.userId);
    const patch: Record<string, any> = {};
    if (data.subscription_tier) patch.subscription_tier = data.subscription_tier;
    if (data.subscription_status) patch.subscription_status = data.subscription_status;
    if (data.trial_ends_at !== undefined) patch.trial_ends_at = data.trial_ends_at;
    const { error } = await supabaseAdmin.from("firms").update(patch as any).eq("id", data.firm_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setImpersonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ firm_id: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuper(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ impersonated_firm_id: data.firm_id })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listWebhookLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const [{ data: rows }, { data: firms }] = await Promise.all([
      supabaseAdmin
        .from("webhook_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin.from("firms").select("id, name"),
    ]);
    const fmap = new Map((firms ?? []).map((f) => [f.id, f.name]));
    return (rows ?? []).map((r) => ({
      ...r,
      firm_name: r.firm_id ? fmap.get(r.firm_id) ?? null : null,
    }));
  });

export const recordWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        event_tag: z.string().min(1).max(80),
        firm_id: z.string().uuid().nullable().optional(),
        recipient_email: z.string().email().nullable().optional(),
        payload: z.record(z.any()).default({}),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    // Records a pending webhook event; replay/delivery wiring happens when Ivory.io is connected.
    const { data: row, error } = await supabaseAdmin
      .from("webhook_log")
      .insert({
        event_tag: data.event_tag,
        firm_id: data.firm_id ?? null,
        recipient_email: data.recipient_email ?? null,
        payload: data.payload,
        status: "pending",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const replayWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuper(context.supabase, context.userId);
    // Marks as delivered for now — actual HTTP POST wires in once Ivory.io endpoint is set.
    const { error } = await supabaseAdmin
      .from("webhook_log")
      .update({ status: "delivered", delivered_at: new Date().toISOString(), error: null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getAppSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
    return data;
  });

export const updateAppSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        maintenance_mode: z.boolean().optional(),
        default_activity_groups: z
          .array(z.object({ name: z.string().min(1).max(80), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/) }))
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuper(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("app_settings")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Knowledge Base CMS ---------------- */

const kbItemSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(["article", "video"]),
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(200).regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, hyphens"),
  category: z.string().trim().min(1).max(80),
  summary: z.string().trim().max(500).optional().nullable(),
  body: z.any().optional().nullable(),
  video_url: z.string().url().nullable().optional(),
  video_file_path: z.string().nullable().optional(),
  thumbnail_path: z.string().nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
  tier_visibility: z.array(z.enum(["studio", "practice"])).min(1),
  status: z.enum(["draft", "published"]),
  featured: z.boolean().default(false),
  published_at: z.string().nullable().optional(),
});

export const listKbItemsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const { data } = await supabaseAdmin
      .from("knowledge_base_items")
      .select("*")
      .order("updated_at", { ascending: false });
    return data ?? [];
  });

export const getKbItem = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuper(context.supabase, context.userId);
    const { data: row } = await supabaseAdmin
      .from("knowledge_base_items")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    return row;
  });

export const upsertKbItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => kbItemSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuper(context.supabase, context.userId);
    const payload: any = {
      type: data.type,
      title: data.title,
      slug: data.slug,
      category: data.category,
      summary: data.summary ?? null,
      body: data.body ?? null,
      video_url: data.video_url ?? null,
      video_file_path: data.video_file_path ?? null,
      thumbnail_path: data.thumbnail_path ?? null,
      tags: data.tags,
      tier_visibility: data.tier_visibility,
      status: data.status,
      featured: data.featured,
      published_at:
        data.status === "published" ? data.published_at ?? new Date().toISOString() : data.published_at ?? null,
      created_by: context.userId,
    };
    if (data.id) {
      const { data: row, error } = await supabaseAdmin
        .from("knowledge_base_items")
        .update(payload as any)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await supabaseAdmin
      .from("knowledge_base_items")
      .insert(payload as any)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteKbItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuper(context.supabase, context.userId);
    const { error } = await supabaseAdmin.from("knowledge_base_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- User-facing KB ---------------- */

export const listKbItemsForUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("knowledge_base_items")
      .select("id, type, title, slug, category, summary, video_url, video_file_path, thumbnail_path, tags, tier_visibility, featured, published_at")
      .eq("status", "published")
      .order("featured", { ascending: false })
      .order("published_at", { ascending: false });
    return data ?? [];
  });

export const getKbItemBySlug = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ slug: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("knowledge_base_items")
      .select("*")
      .eq("slug", data.slug)
      .maybeSingle();
    return row;
  });

type SubStatus = "trialing" | "active" | "past_due" | "canceled" | "incomplete";
function normStatus(s: string): SubStatus {
  if (s === "trialing" || s === "active" || s === "past_due" || s === "canceled" || s === "incomplete") return s;
  if (s === "unpaid") return "past_due";
  if (s === "incomplete_expired") return "canceled";
  return "incomplete";
}

/**
 * Super-admin manual backfill for firms whose Stripe subscription didn't get
 * written to the DB (e.g. webhook was misrouted). Looks up the Stripe
 * customer by firmId metadata (fallback: owner email), picks the most recent
 * subscription, and mirrors it onto the firm row using the same shape the
 * webhook uses.
 */
export const backfillFirmBillingFromStripe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        firmId: z.string().uuid(),
        environment: z.enum(["sandbox", "live"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuper(context.supabase, context.userId);

    const { data: firm } = await supabaseAdmin
      .from("firms")
      .select("id, owner_id, stripe_customer_id")
      .eq("id", data.firmId)
      .maybeSingle();
    if (!firm) throw new Error("Firm not found");

    let ownerEmail: string | null = null;
    if (firm.owner_id) {
      const { data: owner } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .eq("id", firm.owner_id)
        .maybeSingle();
      ownerEmail = owner?.email ?? null;
    }

    const env: StripeEnv = data.environment;
    const stripe = createStripeClient(env);

    try {
      // 1. Find the Stripe customer.
      let customerId: string | null = firm.stripe_customer_id ?? null;
      if (!customerId) {
        const found = await stripe.customers.search({
          query: `metadata['firmId']:'${firm.id}'`,
          limit: 1,
        });
        if (found.data.length) customerId = found.data[0].id;
      }
      if (!customerId && ownerEmail) {
        const byEmail = await stripe.customers.list({ email: ownerEmail, limit: 10 });
        if (byEmail.data.length) customerId = byEmail.data[0].id;
      }
      if (!customerId) {
        return { ok: false, reason: "no_customer" as const };
      }

      // 2. Pick the most relevant subscription.
      const subs = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 10,
        expand: ["data.items.data.price"],
      });
      const rank = (s: string) =>
        s === "active" ? 0 : s === "trialing" ? 1 : s === "past_due" ? 2 : s === "incomplete" ? 3 : 4;
      const sub = subs.data.slice().sort((a, b) => rank(a.status) - rank(b.status))[0];
      if (!sub) {
        return { ok: false, reason: "no_subscription" as const, customerId };
      }

      // 3. Mirror onto firm using the webhook's write shape.
      const item: any = (sub as any).items?.data?.[0];
      const periodEnd = item?.current_period_end ?? (sub as any).current_period_end;
      const trialEnd = (sub as any).trial_end ?? null;
      const interval = item?.price?.recurring?.interval;
      const freq: "monthly" | "annual" | null =
        interval === "month" ? "monthly" : interval === "year" ? "annual" : null;
      const lookup: string | null =
        item?.price?.lookup_key || item?.price?.metadata?.lovable_external_id || null;

      const patch: Record<string, unknown> = {
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        subscription_status: normStatus(sub.status),
        subscription_tier: "practice",
        trial_ends_at: trialEnd ? new Date(trialEnd * 1000).toISOString() : null,
        past_due_since: sub.status === "past_due" ? new Date().toISOString() : null,
      };
      if (periodEnd) patch.current_period_end = new Date(periodEnd * 1000).toISOString();
      if (freq) patch.billing_frequency = freq;
      if (lookup) patch.stripe_price_id = lookup;

      const { error: upErr } = await supabaseAdmin
        .from("firms")
        .update(patch as any)
        .eq("id", firm.id);
      if (upErr) throw upErr;

      // 4. Ensure firmId metadata is on the sub so future webhooks resolve.
      if (!sub.metadata?.firmId) {
        try {
          await stripe.subscriptions.update(sub.id, {
            metadata: { ...(sub.metadata ?? {}), firmId: firm.id },
          });
        } catch (e) {
          console.warn("[backfillFirmBillingFromStripe] failed to stamp sub metadata", e);
        }
      }

      return {
        ok: true as const,
        customerId,
        subscriptionId: sub.id,
        status: patch.subscription_status as SubStatus,
        priceLookup: lookup,
      };
    } catch (e) {
      console.error("[backfillFirmBillingFromStripe]", e);
      return { ok: false as const, reason: "stripe_error" as const, error: getStripeErrorMessage(e) };
    }
  });