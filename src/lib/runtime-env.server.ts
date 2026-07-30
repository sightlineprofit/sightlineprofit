import { getRequest } from "@tanstack/react-start/server";
import {
  listPresentCloudflareBindings,
  readCloudflareBinding,
} from "@/lib/cf-bindings.server";
import { mirrorWorkerEnvToProcessEnv, WORKER_STRING_BINDING_KEYS } from "@/lib/worker-env-mirror.server";

function readBinding(envRecord: Record<string, unknown>, key: string): string | undefined {
  const v = envRecord[key];
  return typeof v === "string" && v.length > 0 ? v.trim() : undefined;
}

type WorkerEnvStore = { getStore: () => unknown };

function getAsyncLocalWorkerEnv(): Record<string, unknown> | undefined {
  const store = (globalThis as { __workerEnvStore__?: WorkerEnvStore }).__workerEnvStore__;
  const env = store?.getStore();
  if (env && typeof env === "object") return env as Record<string, unknown>;
  return undefined;
}

function globalWorkerEnv(): Record<string, unknown> | undefined {
  const g = globalThis as { __env__?: Record<string, unknown> };
  if (g.__env__ && typeof g.__env__ === "object") return g.__env__;
  return undefined;
}

function getRequestWorkerEnv(): Record<string, unknown> | undefined {
  try {
    const req = getRequest() as {
      __sightlineWorkerEnv?: Record<string, unknown>;
      runtime?: { cloudflare?: { env?: Record<string, unknown> } };
    };
    const attached = req.__sightlineWorkerEnv;
    if (attached && typeof attached === "object") return attached;
    const env = req.runtime?.cloudflare?.env;
    if (env && typeof env === "object") return env;
  } catch {
    // outside TanStack request scope
  }
  return undefined;
}

function workerEnvSources(): Record<string, unknown>[] {
  const sources: Record<string, unknown>[] = [];
  const als = getAsyncLocalWorkerEnv();
  if (als) sources.push(als);
  const reqEnv = getRequestWorkerEnv();
  if (reqEnv) sources.push(reqEnv);
  const globalEnv = globalWorkerEnv();
  if (globalEnv) sources.push(globalEnv);
  if (typeof process !== "undefined" && process.env) {
    sources.push(process.env as Record<string, unknown>);
  }
  return sources;
}

/** Worker bindings: `cloudflare:workers` env first, then request/ALS fallbacks. */
export function getRuntimeEnv(key: string): string | undefined {
  const fromCf = readCloudflareBinding(key);
  if (fromCf) return fromCf;

  for (const record of workerEnvSources()) {
    const v = readBinding(record, key);
    if (v) return v;
  }
  return undefined;
}

export function getRuntimeEnvKeys(prefix: string): string[] {
  const keys = new Set<string>();
  for (const k of listPresentCloudflareBindings(WORKER_STRING_BINDING_KEYS)) {
    if (k.startsWith(prefix)) keys.add(k);
  }
  for (const record of workerEnvSources()) {
    for (const k of Object.keys(record)) {
      if (k.startsWith(prefix)) keys.add(k);
    }
  }
  return [...keys];
}

export function getWorkerEnvProbe() {
  const cfKeys = listPresentCloudflareBindings(WORKER_STRING_BINDING_KEYS);
  const resendKey = getRuntimeEnv("RESEND_API_KEY") || getRuntimeEnv("RESEND_KEY");
  const pickKeys = (record: Record<string, unknown> | undefined) =>
    record
      ? WORKER_STRING_BINDING_KEYS.filter((k) => typeof record[k] === "string" && String(record[k]).length > 0)
      : [];

  return {
    resendKeyLength: resendKey?.length ?? 0,
    hasCfBindings: cfKeys.length > 0,
    bindingKeysOnCf: cfKeys,
    hasAlsEnv: !!getAsyncLocalWorkerEnv(),
    hasRequestEnv: !!getRequestWorkerEnv(),
    hasGlobalEnv: !!globalWorkerEnv(),
    bindingKeysOnAls: pickKeys(getAsyncLocalWorkerEnv()),
    bindingKeysOnRequest: pickKeys(getRequestWorkerEnv()),
  };
}

export { mirrorWorkerEnvToProcessEnv };
