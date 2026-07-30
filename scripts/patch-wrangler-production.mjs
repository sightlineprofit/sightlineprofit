/**
 * Nitro regenerates .output/server/wrangler.json on every build without custom
 * domain routes. Merge production routing so `npm run deploy` does not wipe
 * sightlineprofit.com from the Cloudflare Worker.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wranglerPath = join(root, ".output/server/wrangler.json");

function readEnvProduction(key) {
  try {
    const raw = readFileSync(join(root, ".env.production"), "utf8");
    const match = raw.match(new RegExp(`^${key}="([^"]*)"`, "m"));
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

const config = JSON.parse(readFileSync(wranglerPath, "utf8"));

config.workers_dev = false;
config.preview_urls = false;
config.routes = [
  {
    pattern: "sightlineprofit.com",
    custom_domain: true,
  },
  {
    pattern: "www.sightlineprofit.com",
    custom_domain: true,
  },
];

const publicAppUrl = readEnvProduction("PUBLIC_APP_URL") || "https://sightlineprofit.com";
const supabaseUrl =
  readEnvProduction("SUPABASE_URL") ||
  readEnvProduction("VITE_SUPABASE_URL") ||
  "https://nizjqvbxrmxkkmnnqzpy.supabase.co";
const supabasePublishableKey =
  readEnvProduction("SUPABASE_PUBLISHABLE_KEY") ||
  readEnvProduction("VITE_SUPABASE_PUBLISHABLE_KEY");

config.vars = {
  ...(config.vars ?? {}),
  PUBLIC_APP_URL: publicAppUrl,
  SUPABASE_URL: supabaseUrl,
  NODE_ENV: "production",
  ...(supabasePublishableKey ? { SUPABASE_PUBLISHABLE_KEY: supabasePublishableKey } : {}),
};

const flags = new Set(config.compatibility_flags ?? []);
flags.add("nodejs_compat");
flags.add("nodejs_compat_populate_process_env");
flags.delete("nodejs_compat_do_not_populate_process_env");
config.compatibility_flags = [...flags];

writeFileSync(wranglerPath, `${JSON.stringify(config, null, 2)}\n`);

const BINDING_KEYS = [
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
  "PINTEREST_CLIENT_ID",
  "PINTEREST_CLIENT_SECRET",
  "PAYMENTS_LIVE_WEBHOOK_SECRET",
  "PAYMENTS_SANDBOX_WEBHOOK_SECRET",
  "LOVABLE_API_KEY",
];

const indexPath = join(root, ".output/server/index.mjs");
let indexSrc = readFileSync(indexPath, "utf8");

const unenvImport = 'import "./_libs/unenv.mjs";';
const alsBootstrap = `${unenvImport}
import { AsyncLocalStorage } from "node:async_hooks";
if (!globalThis.__workerEnvStore__) {
  globalThis.__workerEnvStore__ = new AsyncLocalStorage();
}`;

if (!indexSrc.includes("__workerEnvStore__")) {
  if (!indexSrc.includes(unenvImport)) {
    throw new Error("[patch-wrangler-production] Could not inject AsyncLocalStorage — unenv import missing");
  }
  indexSrc = indexSrc.replace(unenvImport, alsBootstrap);
}

const mirrorFn = `(function mirrorWorkerBindingsToProcessEnv(env) {
        if (!env || typeof env !== "object") return;
        if (typeof process === "undefined" || !process.env) return;
        const keys = ${JSON.stringify(BINDING_KEYS)};
        for (const key of keys) {
          const value = env[key];
          if (typeof value === "string" && value.length > 0) process.env[key] = value.trim();
        }
      })(env)`;

const fetchEnvAnchor =
  "globalThis.__env__ = env;\n      augmentReq(request, {\n        env,\n        context\n      });";

if (!indexSrc.includes("mirrorWorkerBindingsToProcessEnv(env)")) {
  if (indexSrc.includes("mirrorBindingsToProcessEnv(env)")) {
    indexSrc = indexSrc.replace(
      /\(function mirrorBindingsToProcessEnv\(env\) \{[\s\S]*?\}\)\(env\);/,
      mirrorFn + ";",
    );
  } else if (indexSrc.includes(fetchEnvAnchor)) {
    indexSrc = indexSrc.replace(
      fetchEnvAnchor,
      `globalThis.__env__ = env;
      ${mirrorFn};
      augmentReq(request, {
        env,
        context
      });`,
    );
  } else {
    throw new Error(
      "[patch-wrangler-production] Could not patch index.mjs — Worker env mirror anchor missing",
    );
  }
}

const nitroFetchReturn = "return await nitroApp.fetch(request);";
const nitroFetchWrapped =
  "return await globalThis.__workerEnvStore__.run(env, () => nitroApp.fetch(request));";

if (!indexSrc.includes("__workerEnvStore__.run(env")) {
  if (!indexSrc.includes(nitroFetchReturn)) {
    throw new Error("[patch-wrangler-production] Could not wrap nitroApp.fetch in AsyncLocalStorage");
  }
  indexSrc = indexSrc.replace(nitroFetchReturn, nitroFetchWrapped);
}

writeFileSync(indexPath, indexSrc);

const augmentReqNeedle = "function augmentReq(cfReq, ctx) {\n  const req = cfReq;\n  req.ip =";
const augmentReqPatch = "function augmentReq(cfReq, ctx) {\n  const req = cfReq;\n  req.__sightlineWorkerEnv = ctx.env;\n  req.ip =";
if (!indexSrc.includes("__sightlineWorkerEnv")) {
  if (!indexSrc.includes(augmentReqNeedle)) {
    throw new Error("[patch-wrangler-production] augmentReq anchor missing in index.mjs");
  }
  indexSrc = indexSrc.replace(augmentReqNeedle, augmentReqPatch);
  writeFileSync(indexPath, indexSrc);
}

const lazyServiceNeedle = `function lazyService(loader) {
  let promise, mod;
  return {
    fetch(req) {
      if (mod) {
        return mod.fetch(req);
      }
      if (!promise) {
        promise = loader().then((_mod) => mod = _mod.default || _mod);
      }
      return promise.then((mod2) => mod2.fetch(req));
    }
  };
}`;

const lazyServicePatch = `function resolveWorkerEnvForSsr(passThrough) {
  if (passThrough && typeof passThrough === "object") return passThrough;
  const store = globalThis.__workerEnvStore__;
  const fromStore = store?.getStore?.();
  if (fromStore && typeof fromStore === "object") return fromStore;
  return globalThis.__env__;
}
function lazyService(loader) {
  let promise, mod;
  return {
    fetch(req, workerEnv) {
      const env = resolveWorkerEnvForSsr(workerEnv);
      if (mod) {
        return mod.fetch(req, env);
      }
      if (!promise) {
        promise = loader().then((_mod) => mod = _mod.default || _mod);
      }
      return promise.then((mod2) => mod2.fetch(req, env));
    }
  };
}`;

if (!indexSrc.includes("resolveWorkerEnvForSsr")) {
  if (!indexSrc.includes(lazyServiceNeedle)) {
    throw new Error("[patch-wrangler-production] lazyService anchor missing in index.mjs");
  }
  indexSrc = indexSrc.replace(lazyServiceNeedle, lazyServicePatch);
  writeFileSync(indexPath, indexSrc);
}

const ssrRendererPath = join(root, ".output/server/_chunks/ssr-renderer.mjs");
let ssrSrc = readFileSync(ssrRendererPath, "utf8");
const ssrFetchNeedle =
  '  return Promise.resolve(viteEnv.fetch(toRequest(input, init)));\n}';
const ssrFetchPatch = `  const workerEnv = (function resolveWorkerEnvForSsr(passThrough) {
    if (passThrough && typeof passThrough === "object") return passThrough;
    const store = globalThis.__workerEnvStore__;
    const fromStore = store?.getStore?.();
    if (fromStore && typeof fromStore === "object") return fromStore;
    return globalThis.__env__;
  })();
  return Promise.resolve(viteEnv.fetch(toRequest(input, init), workerEnv));
}`;
if (!ssrSrc.includes("viteEnv.fetch(toRequest(input, init), workerEnv)")) {
  if (!ssrSrc.includes(ssrFetchNeedle)) {
    throw new Error("[patch-wrangler-production] ssr-renderer fetch anchor missing");
  }
  ssrSrc = ssrSrc.replace(ssrFetchNeedle, ssrFetchPatch);
  writeFileSync(ssrRendererPath, ssrSrc);
}

console.log(
  `[patch-wrangler-production] Applied routes + PUBLIC_APP_URL=${publicAppUrl} + SUPABASE_URL=${supabaseUrl} + publishableKey=${supabasePublishableKey ? "set" : "missing"} + Worker env ALS/mirror/ssr-bridge`,
);
