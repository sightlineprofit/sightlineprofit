#!/usr/bin/env node
/**
 * Verifies calculateProjectBreakEven() against the spec worked example.
 * Run: npm run verify:project-break-even
 */
import { calculateProjectBreakEven, type ProjectCostSnapshot } from "./finance.ts";

const snapshot: ProjectCostSnapshot = {
  annual_billable_hrs: 1400,
  target_margin_pct: 25,
  weeks_per_year: 48,
  comp_per_hour: 105,
  opex_per_hour: 38,
  team_per_hour: 52,
  break_even_rate: 195,
  aligned_rate: 260,
  tax_reserve_pct: 0.25,
  total_owner_comp: 147000,
  total_opex: 53200,
  total_team_cost: 72800,
  total_cost_floor: 273000,
};

const result = calculateProjectBreakEven(snapshot, [
  {
    firmMemberId: null,
    memberName: "Principal",
    isPrincipal: true,
    burdenedRatePerHour: 105,
    estimatedHrs: 60,
    isBillable: true,
  },
  {
    firmMemberId: "associate-1",
    memberName: "Associate",
    isPrincipal: false,
    burdenedRatePerHour: 52,
    estimatedHrs: 80,
    isBillable: true,
  },
]);

const expectedTotalCost = 6300 + 4160 + 140 * 38;
const expectedRate = expectedTotalCost / 140;

let failed = 0;

function assert(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "✓" : "✗"} ${label}: ${detail}`);
  if (!ok) failed += 1;
}

assert("method", result.method === "task_assignee", result.method);
assert("hasAssigneeData", result.hasAssigneeData === true, String(result.hasAssigneeData));
assert(
  "totalAssigneeCost",
  Math.abs(result.totalAssigneeCost - 10460) < 0.01,
  `$${result.totalAssigneeCost.toFixed(2)} (expected $10,460)`,
);
assert(
  "opexContribution",
  Math.abs(result.opexContribution - 5320) < 0.01,
  `$${result.opexContribution.toFixed(2)} (expected $5,320)`,
);
assert(
  "totalProjectCost",
  Math.abs(result.totalProjectCost - expectedTotalCost) < 0.01,
  `$${result.totalProjectCost.toFixed(2)} (expected $${expectedTotalCost.toFixed(2)})`,
);
assert(
  "projectBreakEvenRate",
  Math.abs(result.projectBreakEvenRate - expectedRate) < 0.01,
  `$${result.projectBreakEvenRate.toFixed(2)}/hr (expected $${expectedRate.toFixed(2)}/hr)`,
);
assert(
  "spec example rate",
  Math.abs(result.projectBreakEvenRate - 112.71) < 0.01,
  `$${result.projectBreakEvenRate.toFixed(2)}/hr ≈ $112.71/hr`,
);
assert("totalScopedHrs", result.totalScopedHrs === 140, String(result.totalScopedHrs));

const fallback = calculateProjectBreakEven(snapshot, []);
assert("empty assignees → firm_average", fallback.method === "firm_average", fallback.method);
assert(
  "fallback rate",
  fallback.projectBreakEvenRate === snapshot.break_even_rate,
  `$${fallback.projectBreakEvenRate}/hr`,
);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}

console.log("\nAll project break-even checks passed.");
