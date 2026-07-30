import { getWorkerStringEnv } from "@/lib/public-app-url.server";

function viteEnv(key: string): string | undefined {
  const value = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Supabase project URL — Worker var, build-time VITE_*, or process.env fallback. */
export function getSupabaseUrl(): string | undefined {
  return getWorkerStringEnv("SUPABASE_URL") ?? viteEnv("VITE_SUPABASE_URL");
}

/** Anon/publishable key — safe to expose to clients; required for auth middleware. */
export function getSupabasePublishableKey(): string | undefined {
  return getWorkerStringEnv("SUPABASE_PUBLISHABLE_KEY") ?? viteEnv("VITE_SUPABASE_PUBLISHABLE_KEY");
}

/** Service role key — Cloudflare secret only; never baked into the client bundle. */
export function getSupabaseServiceRoleKey(): string | undefined {
  return getWorkerStringEnv("SUPABASE_SERVICE_ROLE_KEY");
}

export function requireSupabasePublicConfig(): { url: string; publishableKey: string } {
  const url = getSupabaseUrl();
  const publishableKey = getSupabasePublishableKey();
  const missing = [
    ...(!url ? ["SUPABASE_URL"] : []),
    ...(!publishableKey ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
  ];
  if (missing.length > 0) {
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Set Worker vars or rebuild with VITE_SUPABASE_* in .env.production.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }
  return { url: url!, publishableKey: publishableKey! };
}

export function requireSupabaseServiceConfig(): {
  url: string;
  serviceRoleKey: string;
} {
  const url = getSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  const missing = [
    ...(!url ? ["SUPABASE_URL"] : []),
    ...(!serviceRoleKey ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
  ];
  if (missing.length > 0) {
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Run npm run setup:supabase-secrets and redeploy.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }
  return { url: url!, serviceRoleKey: serviceRoleKey! };
}

export function getSupabaseEnvStatus() {
  return {
    hasUrl: !!getSupabaseUrl(),
    hasPublishableKey: !!getSupabasePublishableKey(),
    hasServiceRoleKey: !!getSupabaseServiceRoleKey(),
    projectRef: getSupabaseUrl()?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? null,
  };
}
