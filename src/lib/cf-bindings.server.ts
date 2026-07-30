import { env } from "cloudflare:workers";

export function readCloudflareBinding(key: string): string | undefined {
  const v = env[key];
  return typeof v === "string" && v.length > 0 ? v.trim() : undefined;
}

export function listPresentCloudflareBindings(keys: readonly string[]): string[] {
  return keys.filter((k) => {
    const v = env[k];
    return typeof v === "string" && v.length > 0;
  });
}
