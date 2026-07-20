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

writeFileSync(wranglerPath, `${JSON.stringify(config, null, 2)}\n`);
console.log("[patch-wrangler-production] Applied sightlineprofit.com custom domain routes");
