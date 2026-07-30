/** Local dev: `cloudflare:workers` is aliased here (see vite.config.ts). */
export const env: Record<string, string | undefined> =
  typeof process !== "undefined" ? (process.env as Record<string, string | undefined>) : {};
