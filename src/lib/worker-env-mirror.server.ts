/** String bindings we read in server code (secrets + vars). Direct property access — do not rely on Object.entries(env). */
export const WORKER_STRING_BINDING_KEYS = [
  "RESEND_API_KEY",
  "RESEND_KEY",
  "TRANSACTIONAL_EMAIL_FROM",
  "EMAIL_FROM",
  "RESEND_TEAM_INVITE_TEMPLATE_ID",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "PUBLIC_APP_URL",
  "NODE_ENV",
  "STRIPE_LIVE_API_KEY",
  "STRIPE_SANDBOX_API_KEY",
  "GOOGLE_CALENDAR_CLIENT_ID",
  "GOOGLE_CALENDAR_CLIENT_SECRET",
  "DEMO_ACCOUNT_EMAIL",
  "DEMO_ACCOUNT_PASSWORD",
  "DEMO_TEAM_EMAIL",
] as const;

export function mirrorWorkerEnvToProcessEnv(env: unknown): void {
  if (!env || typeof env !== "object") return;
  if (typeof process === "undefined" || !process.env) return;
  const record = env as Record<string, unknown>;
  for (const key of WORKER_STRING_BINDING_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      process.env[key] = value.trim();
    }
  }
}
