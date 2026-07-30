/**
 * One-off: seed missing default SOP templates for a firm.
 * Usage: set -a && source .env.local && source .env && set +a && node scripts/backfill-sop-seed-once.mjs [firmId]
 */
import { seedDefaultSops } from "../src/lib/sop-seed.server.ts";

const firmId =
  process.argv[2] ?? "02c91eff-364f-4ae7-b11a-4b72f371572c";

const result = await seedDefaultSops(firmId);
console.log(JSON.stringify({ firmId, ...result }, null, 2));
