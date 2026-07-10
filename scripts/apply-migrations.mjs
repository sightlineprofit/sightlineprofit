#!/usr/bin/env node
/**
 * Apply pending Supabase SQL migrations to a database.
 *
 * Why this exists: pushing to `main` (which Lovable auto-deploys) does NOT apply
 * files under `supabase/migrations/` to the live database. Run this after adding
 * migrations so the live schema matches the code.
 *
 * Usage:
 *   SUPABASE_DB_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres" \
 *     npm run db:migrate            # apply pending migrations
 *   ... npm run db:migrate -- --dry-run   # list pending migrations only
 *
 * Notes:
 * - Use the Supabase "Session/Transaction pooler" connection string. The direct
 *   host (db.<ref>.supabase.co) is IPv6-only and unreachable from many CI/cloud VMs.
 * - Passwords with special chars (@, $, :) are handled — paste the raw URI.
 * - Migrations are tracked in supabase_migrations.schema_migrations; only files
 *   whose version (the numeric filename prefix) is not recorded are applied.
 * - Benign "does not exist"/"already exists" errors on REVOKE/GRANT/ALTER/DROP
 *   are logged and skipped (e.g. Lovable-only email_queue_* functions). Any other
 *   error aborts the run.
 */
import pg from "pg";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");
const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");

const raw = process.env.SUPABASE_DB_URL;
if (!raw) {
  console.error("ERROR: SUPABASE_DB_URL is not set. Provide the Supabase pooler connection string.");
  process.exit(1);
}

// Parse a postgres URI where the password may contain '@' or ':'.
function parseDbUrl(url) {
  const withoutScheme = url.replace(/^postgres(ql)?:\/\//, "");
  const at = withoutScheme.lastIndexOf("@");
  if (at === -1) throw new Error("Invalid SUPABASE_DB_URL (missing '@').");
  const userinfo = withoutScheme.slice(0, at);
  const hostpart = withoutScheme.slice(at + 1);
  const colon = userinfo.indexOf(":");
  const user = colon === -1 ? userinfo : userinfo.slice(0, colon);
  const password = colon === -1 ? undefined : userinfo.slice(colon + 1);
  const [hostPort, dbAndQuery = "postgres"] = hostpart.split("/");
  const database = dbAndQuery.split("?")[0] || "postgres";
  const [host, port = "5432"] = hostPort.split(":");
  return { user, password, host, port: Number(port), database };
}

// Split SQL into statements, respecting dollar-quoted bodies, single quotes,
// and line/block comments (so function bodies with ';' are not split).
function splitStatements(sql) {
  const out = [];
  let cur = "";
  let i = 0;
  const n = sql.length;
  let inSingle = false, inLine = false, inBlock = false, dollarTag = null;
  while (i < n) {
    const ch = sql[i];
    const two = sql.slice(i, i + 2);
    if (inLine) { cur += ch; if (ch === "\n") inLine = false; i++; continue; }
    if (inBlock) { cur += ch; if (two === "*/") { cur += "/"; i += 2; inBlock = false; continue; } i++; continue; }
    if (inSingle) { cur += ch; if (ch === "'") inSingle = false; i++; continue; }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) { cur += dollarTag; i += dollarTag.length; dollarTag = null; continue; }
      cur += ch; i++; continue;
    }
    if (two === "--") { cur += two; i += 2; inLine = true; continue; }
    if (two === "/*") { cur += two; i += 2; inBlock = true; continue; }
    if (ch === "'") { cur += ch; i++; inSingle = true; continue; }
    if (ch === "$") {
      const m = sql.slice(i).match(/^\$[a-zA-Z0-9_]*\$/);
      if (m) { dollarTag = m[0]; cur += dollarTag; i += dollarTag.length; continue; }
    }
    if (ch === ";") { out.push(cur.trim()); cur = ""; i++; continue; }
    cur += ch; i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter((s) => s.length);
}

const benign = /(does not exist|already exists|already a member|must be member)/i;

const cfg = { ...parseDbUrl(raw), ssl: { rejectUnauthorized: false }, statement_timeout: 120000 };
const c = new pg.Client(cfg);
await c.connect();

await c.query("create schema if not exists supabase_migrations");
await c.query(
  "create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)",
);
const applied = new Set(
  (await c.query("select version from supabase_migrations.schema_migrations")).rows.map((r) => String(r.version)),
);

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
const pending = files.filter((f) => !applied.has(f.split("_")[0]));

console.log(`DB: ${cfg.host} | applied: ${applied.size} | files: ${files.length} | pending: ${pending.length}`);
if (pending.length === 0) {
  console.log("Nothing to apply. Schema is up to date.");
  await c.end();
  process.exit(0);
}
pending.forEach((f) => console.log("  pending:", f));
if (DRY_RUN) {
  console.log("\n--dry-run: no changes made.");
  await c.end();
  process.exit(0);
}

let totalSkipped = 0;
for (const f of pending) {
  const version = f.split("_")[0];
  const name = f.replace(/^[0-9]+_/, "").replace(/\.sql$/, "");
  const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
  process.stdout.write(`-> ${f} ... `);
  let localSkip = 0;
  for (const st of splitStatements(sql)) {
    try {
      await c.query(st);
    } catch (e) {
      if (benign.test(e.message)) { localSkip++; totalSkipped++; }
      else {
        console.log("FAILED");
        console.error("   ERROR:", e.message);
        console.error("   STATEMENT:", st.slice(0, 200).replace(/\s+/g, " "));
        await c.end();
        process.exit(3);
      }
    }
  }
  await c.query(
    "insert into supabase_migrations.schema_migrations(version, statements, name) values ($1,$2,$3) on conflict (version) do nothing",
    [version, [sql], name],
  );
  console.log(localSkip ? `OK (${localSkip} benign skips)` : "OK");
}
console.log(`\nDone. Applied ${pending.length} migration(s)${totalSkipped ? `, skipped ${totalSkipped} benign statement(s)` : ""}.`);
await c.end();
