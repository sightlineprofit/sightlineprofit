import {
  fmtUsd,
  formatHours,
  type LeaveScenarioResult,
  type LeaveScenarioPhases,
  type calc,
} from "@/lib/finance";

const AVG_PROJECT_FEE = 25_000;

export type { LeaveScenarioPhases };

export function defaultLeavePhases(): LeaveScenarioPhases {
  return {
    rampDownMonths: 1,
    rampDownCapacityPct: 50,
    fullLeaveMonths: 2,
    returnMonths: 2,
    returnCapacityPct: 50,
  };
}

export function maternityPresetPhases(): LeaveScenarioPhases {
  return defaultLeavePhases();
}

export function capacityPctLabel(pct: number): string {
  if (pct === 0) return "full leave";
  if (pct === 100) return "full capacity";
  return `${pct}% capacity`;
}

export function describeLeaveTimeline(phases: LeaveScenarioPhases): string {
  const parts: string[] = [];
  if (phases.rampDownMonths > 0) {
    parts.push(
      `${phases.rampDownMonths} mo wind-down at ${phases.rampDownCapacityPct}%`,
    );
  }
  if (phases.fullLeaveMonths > 0) {
    parts.push(`${phases.fullLeaveMonths} mo full leave`);
  }
  if (phases.returnMonths > 0) {
    parts.push(
      `${phases.returnMonths} mo return at ${phases.returnCapacityPct}%`,
    );
  }
  return parts.join(" → ") || "No leave planned";
}

export type LeaveImpactBreakdowns = {
  hoursLost: string[];
  revenueImpact: string[];
  reserveNeeded: string[];
  monthsToSave: string[];
  startSavingBy: string[];
  projectsNeeded: string[];
  additionalRevenuePerMonth: string[];
};

type CalcResult = ReturnType<typeof calc>;

export function buildLeaveImpactBreakdowns(
  result: LeaveScenarioResult,
  params: {
    phases: LeaveScenarioPhases;
    savingsPerMonth: number;
    monthsUntilLeave: number;
    leaveStartMonth: number;
    calcResult: CalcResult;
  },
): LeaveImpactBreakdowns {
  const { phases, savingsPerMonth, monthsUntilLeave, leaveStartMonth, calcResult } = params;
  const {
    rampDownMonths,
    rampDownCapacityPct,
    fullLeaveMonths,
    returnMonths,
    returnCapacityPct,
  } = phases;

  const hrsPerMonth = calcResult.annualBillableHrs / 12;
  const monthlyObligations =
    (calcResult.compTotal + calcResult.opexRecurring + calcResult.opexOneTime) / 12;

  const lossFactor = (pct: number) => Math.round((1 - pct / 100) * 100);

  const hoursLost: string[] = [];
  if (rampDownMonths > 0) {
    const lost = rampDownMonths * hrsPerMonth * (1 - rampDownCapacityPct / 100);
    hoursLost.push(
      `Wind-down: ${rampDownMonths} mo × ${formatHours(Math.round(hrsPerMonth))}/mo × ${lossFactor(rampDownCapacityPct)}% lost = ${formatHours(Math.round(lost))}`,
    );
  }
  if (fullLeaveMonths > 0) {
    hoursLost.push(
      `Full leave: ${fullLeaveMonths} mo × ${formatHours(Math.round(hrsPerMonth))}/mo = ${formatHours(Math.round(fullLeaveMonths * hrsPerMonth))}`,
    );
  }
  if (returnMonths > 0) {
    const lost = returnMonths * hrsPerMonth * (1 - returnCapacityPct / 100);
    hoursLost.push(
      `Return: ${returnMonths} mo × ${formatHours(Math.round(hrsPerMonth))}/mo × ${lossFactor(returnCapacityPct)}% lost = ${formatHours(Math.round(lost))}`,
    );
  }
  hoursLost.push(`Total hours lost: ${formatHours(Math.round(result.hoursLost))}`);

  const revenueImpact: string[] = [
    `${formatHours(Math.round(result.hoursLost))} × ${fmtUsd(calcResult.breakEvenRate, { decimals: 0 })}/hr break-even rate`,
    `= ${fmtUsd(result.revenueGap, { decimals: 0 })} revenue impact`,
  ];

  const reserveLines: string[] = [];
  if (rampDownMonths > 0) {
    reserveLines.push(
      `Wind-down: ${rampDownMonths} mo × ${Math.round((1 - rampDownCapacityPct / 100) * 100)}% obligation gap`,
    );
  }
  if (fullLeaveMonths > 0) {
    reserveLines.push(`Full leave: ${fullLeaveMonths} mo × 100% obligations`);
  }
  if (returnMonths > 0) {
    reserveLines.push(
      `Return: ${returnMonths} mo × ${Math.round((1 - returnCapacityPct / 100) * 100)}% obligation gap`,
    );
  }
  reserveLines.push(
    `At ${fmtUsd(monthlyObligations, { decimals: 0 })}/mo fixed obligations`,
    `= ${fmtUsd(result.reserveNeeded, { decimals: 0 })} reserve needed`,
  );
  const reserveNeeded = reserveLines;

  const monthsToSave: string[] =
    savingsPerMonth > 0
      ? [
          `${fmtUsd(result.reserveNeeded, { decimals: 0 })} reserve ÷ ${fmtUsd(savingsPerMonth, { decimals: 0 })}/mo savings`,
          `= ${result.monthsToSave.toFixed(1)} months to save`,
        ]
      : ["Set a monthly savings target to calculate months to save"];

  const startSavingBy: string[] = result.isAlreadyLate
    ? [
        `You need ${result.monthsToSave.toFixed(1)} months of savings but have less time before ${leaveStartMonthLabel(leaveStartMonth)}`,
        "Start saving this month to catch up",
      ]
    : [
        `${result.monthsToSave.toFixed(1)} months of saving before leave begins`,
        `Target start date: ${result.startSavingByStr}`,
        `Leave begins ${leaveStartMonthLabel(leaveStartMonth)} (${monthsUntilLeave} month${monthsUntilLeave === 1 ? "" : "s"} from now)`,
      ];

  const projectsNeeded: string[] = [
    `${fmtUsd(result.revenueGap, { decimals: 0 })} revenue impact ÷ ${fmtUsd(AVG_PROJECT_FEE, { decimals: 0 })} avg project fee`,
    `≈ ${result.additionalProjectsNeeded} additional projects to offset the gap`,
  ];

  const additionalRevenuePerMonth: string[] =
    result.additionalRevenuePerMonth > 0
      ? [
          `${fmtUsd(result.revenueGap, { decimals: 0 })} revenue impact ÷ ${monthsUntilLeave} month${monthsUntilLeave === 1 ? "" : "s"} before leave`,
          `= ${fmtUsd(result.additionalRevenuePerMonth, { decimals: 0 })}/mo additional revenue`,
        ]
      : ["No additional monthly revenue needed — savings timeline covers the gap"];

  return {
    hoursLost,
    revenueImpact,
    reserveNeeded,
    monthsToSave,
    startSavingBy,
    projectsNeeded,
    additionalRevenuePerMonth,
  };
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function leaveStartMonthLabel(month: number): string {
  return MONTH_NAMES[Math.max(1, Math.min(12, month)) - 1];
}

export function getLeaveInsight(
  result: LeaveScenarioResult,
  params: {
    phases: LeaveScenarioPhases;
    savingsPerMonth: number;
    leaveStartMonth: number;
  },
): string {
  const { phases, savingsPerMonth, leaveStartMonth } = params;
  const { fullLeaveMonths } = phases;
  const leaveStart = leaveStartMonthLabel(leaveStartMonth);
  const timeline = describeLeaveTimeline(phases);
  const reserve = fmtUsd(result.reserveNeeded, { decimals: 0 });
  const savings = fmtUsd(savingsPerMonth, { decimals: 0 });
  const months = result.monthsToSave.toFixed(1);
  const hrs = formatHours(Math.round(result.hoursLost));

  const readyBy = new Date();
  readyBy.setHours(12, 0, 0, 0);
  readyBy.setMonth(readyBy.getMonth() + Math.ceil(result.monthsToSave));
  const readyByStr = readyBy.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  if (result.isAlreadyLate) {
    return `Your plan (${timeline}) needs ${reserve} in reserves. At ${savings}/month you'll need ${months} months to save — start now and you'll have enough by ${readyByStr}.`;
  }

  if (result.monthsToSave <= 12) {
    return `Starting in ${leaveStart} (${timeline}), your firm loses ${hrs} of capacity. You need ${reserve} in reserves — at ${savings}/month you'll be ready well before leave begins.`;
  }

  if (result.monthsToSave <= 24) {
    return `With ${timeline}, you need ${reserve} in reserves. At your current savings rate that takes ${months} months — start now and you'll be ready by ${result.startSavingByStr}.`;
  }

  return `At ${savings}/month, saving ${reserve} for this leave plan takes ${months} months. Consider increasing your monthly savings or taking on additional projects in the coming months.`;
}

export function monthsUntilLeaveStart(leaveStartMonth: number): number {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  let year = now.getFullYear();
  if (leaveStartMonth <= currentMonth) year += 1;
  return Math.max(1, (year - now.getFullYear()) * 12 + (leaveStartMonth - currentMonth));
}

export function defaultLeaveStartMonth(): number {
  const now = new Date();
  return ((now.getMonth() + 3) % 12) + 1;
}

export function eventLeaveMonths(event: { start_date: string; end_date: string }): number {
  const start = new Date(`${event.start_date.slice(0, 10)}T12:00:00`);
  const end = new Date(`${event.end_date.slice(0, 10)}T12:00:00`);
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
  return Math.max(1, Math.min(12, months));
}

export function eventLeaveStartMonth(event: { start_date: string }): number {
  return new Date(`${event.start_date.slice(0, 10)}T12:00:00`).getMonth() + 1;
}

export { MONTH_NAMES as LEAVE_MONTH_NAMES };
