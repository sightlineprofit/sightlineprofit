/**
 * Local one-time Meridian private demo seed (requires DEMO_* env vars).
 * Usage: set -a && source .env.local && set +a && npx tsx scripts/seed-meridian-demo.mjs
 */
import { seedMeridianPrivateDemo } from "../src/lib/meridian-demo-seed.server.ts";

const result = await seedMeridianPrivateDemo();
console.log(JSON.stringify(result, null, 2));
