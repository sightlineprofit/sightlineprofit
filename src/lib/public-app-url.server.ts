/** Resolve PUBLIC_APP_URL without pulling in TanStack request scope (safe for shared server modules). */
export function getPublicAppUrl(): string {
  if (typeof process !== "undefined" && process.env.PUBLIC_APP_URL) {
    return process.env.PUBLIC_APP_URL.replace(/\/$/, "");
  }
  const globalEnv = (globalThis as { __env__?: Record<string, unknown> }).__env__;
  const fromGlobal = globalEnv?.PUBLIC_APP_URL;
  if (typeof fromGlobal === "string" && fromGlobal.length > 0) {
    return fromGlobal.replace(/\/$/, "");
  }
  return "http://localhost:8080";
}

/** Read a Worker binding / mirrored process.env string. */
export function getWorkerStringEnv(key: string): string | undefined {
  if (typeof process !== "undefined" && process.env[key]) {
    return process.env[key]!.trim();
  }
  const globalEnv = (globalThis as { __env__?: Record<string, unknown> }).__env__;
  const value = globalEnv?.[key];
  return typeof value === "string" && value.length > 0 ? value.trim() : undefined;
}
