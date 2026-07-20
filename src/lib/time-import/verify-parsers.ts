#!/usr/bin/env node
/**
 * Parser verification script for time import (Step 8).
 * Run: npx tsx src/lib/time-import/verify-parsers.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseCsvFile,
  durationHmsToDecimal,
} from "./parsers.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "__fixtures__");

interface CheckResult {
  file: string;
  passed: boolean;
  messages: string[];
}

function check(name: string, ok: boolean, detail: string, messages: string[]): void {
  messages.push(`${ok ? "✓" : "✗"} ${name}: ${detail}`);
}

function verifyFixture(filename: string): CheckResult {
  const messages: string[] = [];
  const path = join(fixturesDir, filename);
  const text = readFileSync(path, "utf-8");

  const parsed = parseCsvFile(text);

  check("parse", parsed.ok, parsed.ok ? `${parsed.entries.length} entries` : (parsed as { error: string }).error, messages);

  if (!parsed.ok) return { file: filename, passed: false, messages };

  const entries = parsed.entries;
  const detected = parsed.detectedSource;
  const dates = [...new Set(entries.map((e) => e.date).filter(Boolean))].sort();
  const weeksSpan = dates.length;

  check("row count", entries.length >= 20, `${entries.length} rows (need ≥20)`, messages);
  check("date span", weeksSpan >= 4, `${weeksSpan} distinct dates across file`, messages);
  check("detected source", true, `${detected}`, messages);

  if (filename.includes("clockify")) {
    check("clockify detect", detected === "clockify", detected, messages);
    const withHrs = entries.filter((e) => e.hrs > 0).length;
    check("duration parsed", withHrs >= 20, `${withHrs} entries with hrs > 0`, messages);
    const billable = entries.filter((e) => e.billable).length;
    check("billable flag", billable > 0 && billable < entries.length, `${billable} billable / ${entries.length - billable} non-billable`, messages);
  }

  if (filename.includes("harvest")) {
    check("harvest detect", detected === "harvest", detected, messages);
    check("iso dates", entries.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date)), "all ISO dates", messages);
  }

  if (filename.includes("toggl")) {
    check("toggl detect", detected === "toggl", detected, messages);
    const sample = durationHmsToDecimal("01:30:00");
    check("hms conversion", Math.abs(sample - 1.5) < 0.01, `01:30:00 → ${sample}h`, messages);
  }

  if (filename.includes("studio")) {
    const billableVariants = entries.filter((e) => e.billable).length;
    check("billable variants", billableVariants > 0, `${billableVariants} billable entries`, messages);
  }

  if (filename.includes("generic")) {
    check("generic columns", entries.length >= 3, `${entries.length} data rows`, messages);
  }

  return { file: filename, passed: messages.every((m) => m.startsWith("✓")), messages };
}

const files = readdirSync(fixturesDir).filter((f) => f.endsWith(".csv"));
let allPassed = true;

console.log("Time import parser verification\n");

for (const file of files) {
  const result = verifyFixture(file);
  console.log(`\n── ${file} ──`);
  for (const m of result.messages) console.log(`  ${m}`);
  if (!result.passed) allPassed = false;
}

// Global generic parser error check
{
  const optionalOk = parseCsvFile("Date,Hours,Project\n2026-01-01,1,Test");
  const ok = optionalOk.ok && optionalOk.entries[0]?.billable === true;
  console.log(`\n── generic error handling ──`);
  console.log(`  ${ok ? "✓" : "✗"} missing optional columns: ${ok ? "Billable defaults to true" : "unexpected failure"}`);
  const bad = parseCsvFile("Hours,Project\n1,Test");
  const badOk = !bad.ok && (bad as { error: string }).error.includes("Required column 'Date'");
  console.log(`  ${badOk ? "✓" : "✗"} missing required column: ${(bad as { error?: string }).error ?? "no error"}`);
  if (!ok || !badOk) allPassed = false;
}

console.log(allPassed ? "\n✅ All parser checks passed" : "\n❌ Some checks failed");
process.exit(allPassed ? 0 : 1);
