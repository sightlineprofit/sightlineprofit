import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getMeridianDemoStatus,
  refreshMeridianTimeAndDraws,
  seedMeridianPrivateDemo,
} from "@/lib/meridian-demo-seed.server";

async function assertSuper(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("is_super_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.is_super_admin) throw new Error("Forbidden");
}

export const getPrivateMeridianDemoStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.userId);
    return getMeridianDemoStatus();
  });

export const seedPrivateMeridianDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.userId);
    return seedMeridianPrivateDemo();
  });

export const resetPrivateMeridianDemoDates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.userId);
    const status = await getMeridianDemoStatus();
    if (!status.accountExists) {
      throw new Error("Demo account does not exist yet. Seed it first.");
    }
    await refreshMeridianTimeAndDraws();
    return { ok: true as const };
  });
