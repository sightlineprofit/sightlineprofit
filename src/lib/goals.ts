/** Pure goal insight + projection math for /future. No DB or network. */

import { fmtUsd } from "@/lib/finance";

export type GoalLinkedMetric =
  | "annual_draw"
  | "weekly_hours"
  | "min_project_fee"
  | "team_headcount"
  | "portfolio_realized_rate"
  | "annual_revenue"
  | null;

export type FirmGoalRow = {
  id: string;
  name: string;
  category: string;
  timeframe: string;
  target_date: string | null;
  target_value: number | null;
  target_unit: string | null;
  status: string;
  linked_metric: GoalLinkedMetric;
  sort_order: number;
  notes: string | null;
  achieved_at: string | null;
};

export type NumberCard = {
  label: string;
  value: string;
  color?: "sage" | "gold" | "terra" | null;
};

export type GoalInsightStatus = "achieved" | "on_track" | "watch" | "no_data";

export type GoalInsight = {
  currentValue: number | null;
  targetValue: number | null;
  gap: number | null;
  pctComplete: number | null;
  onTrack: boolean | null;
  insightSentence: string;
  numberCards: NumberCard[];
  status: GoalInsightStatus;
  primaryAction?: "income" | "team" | "min_fee" | "hours" | null;
};

export type GoalInsightsMap = Record<string, GoalInsight>;

export type GoalMetricsContext = {
  periodMonth: number;
  ytdTotalDrawn: number;
  avgWeeklyHours90d: number;
  minActiveProjectFee: number | null;
  activeProjectCount: number;
  activeProjectFees: number[];
  projectsBelowMinFee: number;
  averageProjectFee: number;
  activeTeamHeadcount: number;
  ytdRevenueCollected: number;
  totalAnnualCostFloor: number;
  targetMarginPct: number;
  alignedRate: number;
  breakEvenRate: number;
  annualBillableHrs: number;
};

function roundHalf(n: number): number {
  return Math.ceil(n * 2) / 2;
}

function fmtMoney(n: number): string {
  return fmtUsd(n, { decimals: 0 });
}

function fmtNum(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function buildGoalInsight(goal: FirmGoalRow, ctx: GoalMetricsContext): GoalInsight {
  const targetValue =
    goal.target_value != null ? Number(goal.target_value) : null;
  const metric = goal.linked_metric;

  if (goal.status === "achieved") {
    return {
      currentValue: targetValue,
      targetValue,
      gap: 0,
      pctComplete: 100,
      onTrack: true,
      insightSentence: "Marked achieved — nice work holding this intention.",
      numberCards: [],
      status: "achieved",
    };
  }

  if (!metric || targetValue == null || !Number.isFinite(targetValue)) {
    return {
      currentValue: null,
      targetValue,
      gap: null,
      pctComplete: null,
      onTrack: null,
      insightSentence:
        "Connect a metric or check in manually to track this goal.",
      numberCards: [],
      status: "no_data",
    };
  }

  switch (metric) {
    case "annual_draw":
      return insightAnnualDraw(goal, targetValue, ctx);
    case "weekly_hours":
      return insightWeeklyHours(goal, targetValue, ctx);
    case "min_project_fee":
      return insightMinProjectFee(goal, targetValue, ctx);
    case "team_headcount":
      return insightTeamHeadcount(goal, targetValue, ctx);
    default:
      return {
        currentValue: null,
        targetValue,
        gap: null,
        pctComplete: null,
        onTrack: null,
        insightSentence:
          "Connect a metric or check in manually to track this goal.",
        numberCards: [],
        status: "no_data",
      };
  }
}

function insightAnnualDraw(
  _goal: FirmGoalRow,
  targetValue: number,
  ctx: GoalMetricsContext,
): GoalInsight {
  const month = Math.max(1, ctx.periodMonth);
  const currentValue =
    month > 0 ? (ctx.ytdTotalDrawn / month) * 12 : ctx.ytdTotalDrawn;
  const gap = targetValue - currentValue;
  const avgFee = Math.max(ctx.averageProjectFee, 1);
  const projectsNeeded = gap > 0 ? roundHalf(gap / avgFee) : 0;
  const pctComplete =
    targetValue > 0 ? Math.min(100, (currentValue / targetValue) * 100) : null;

  let insightSentence: string;
  if (gap <= 0) {
    insightSentence = `You're on track for ${fmtMoney(currentValue)} this year — at or above your ${fmtMoney(targetValue)} target.`;
  } else {
    const projWord = projectsNeeded === 1 ? "project" : "projects";
    insightSentence = `You're on track for ${fmtMoney(currentValue)} — ${fmtMoney(gap)} below your target. ${fmtNum(projectsNeeded, 1)} more ${projWord} at your average fee closes the gap.`;
  }

  const status: GoalInsightStatus =
    gap <= 0 ? "on_track" : gap / targetValue > 0.15 ? "watch" : "on_track";

  return {
    currentValue,
    targetValue,
    gap,
    pctComplete,
    onTrack: gap <= 0,
    insightSentence,
    numberCards: [
      { label: "On track for", value: fmtMoney(currentValue) },
      {
        label: "Gap to target",
        value: gap > 0 ? fmtMoney(gap) : "$0",
        color: gap > 0 ? "gold" : "sage",
      },
      {
        label: "Projects needed",
        value: gap > 0 ? `${fmtNum(projectsNeeded, 1)} more` : "None",
      },
    ],
    status,
    primaryAction: gap > 0 ? "income" : null,
  };
}

function insightWeeklyHours(
  _goal: FirmGoalRow,
  targetValue: number,
  ctx: GoalMetricsContext,
): GoalInsight {
  const currentValue = ctx.avgWeeklyHours90d;
  const gap = currentValue - targetValue;
  const onTrack = gap <= 0;
  let insightSentence: string;
  if (gap <= 0) {
    insightSentence = `Your weekly average is ${fmtNum(currentValue, 1)} hours — already at or below your ${fmtNum(targetValue, 0)}-hour target.`;
  } else {
    insightSentence = `Your weekly average is ${fmtNum(currentValue, 1)} hours — ${fmtNum(gap, 1)} above your ${fmtNum(targetValue, 0)}-hour target.`;
  }

  return {
    currentValue,
    targetValue,
    gap,
    pctComplete: null,
    onTrack,
    insightSentence,
    numberCards: [
      {
        label: "Avg hrs/week",
        value: fmtNum(currentValue, 1),
        color: onTrack ? "sage" : null,
      },
      { label: "Target", value: `≤ ${fmtNum(targetValue, 0)}` },
      {
        label: "Gap",
        value: `${fmtNum(Math.abs(gap), 1)} hrs`,
        color: onTrack ? "sage" : "gold",
      },
    ],
    status: onTrack ? "on_track" : "watch",
    primaryAction: !onTrack ? "hours" : null,
  };
}

function insightMinProjectFee(
  _goal: FirmGoalRow,
  targetValue: number,
  ctx: GoalMetricsContext,
): GoalInsight {
  const currentValue = ctx.minActiveProjectFee;
  const total = ctx.activeProjectCount;
  const below = ctx.activeProjectFees.filter((f) => f < targetValue).length;

  if (total === 0 || currentValue == null) {
    return {
      currentValue,
      targetValue,
      gap: null,
      pctComplete: null,
      onTrack: null,
      insightSentence: "No active projects this year yet — add projects to track this threshold.",
      numberCards: [],
      status: "no_data",
    };
  }

  const allAbove = below === 0;
  const gap = targetValue - (currentValue ?? 0);
  let insightSentence: string;
  if (allAbove) {
    insightSentence = `All ${total} active projects are above your ${fmtMoney(targetValue)} threshold. Achieved and holding.`;
  } else {
    const word = below === 1 ? "project" : "projects";
    insightSentence = `${below} ${word} below your ${fmtMoney(targetValue)} threshold.`;
  }

  return {
    currentValue,
    targetValue,
    gap: allAbove ? 0 : gap,
    pctComplete: allAbove ? 100 : null,
    onTrack: allAbove,
    insightSentence,
    numberCards: allAbove
      ? [{ label: "Active projects", value: String(total), color: "sage" }]
      : [
          { label: "Below threshold", value: String(below), color: "terra" },
          { label: "Lowest fee", value: fmtMoney(currentValue ?? 0) },
          { label: "Target", value: fmtMoney(targetValue) },
        ],
    status: allAbove ? "achieved" : "watch",
    primaryAction: allAbove ? null : "min_fee",
  };
}

function insightTeamHeadcount(
  _goal: FirmGoalRow,
  targetValue: number,
  ctx: GoalMetricsContext,
): GoalInsight {
  const currentValue = ctx.activeTeamHeadcount;
  const avgTeamCost = 63_000;
  const margin = ctx.targetMarginPct / 100;
  const marginDenom = Math.max(0.01, 1 - margin);
  const revenueThreshold = ctx.totalAnnualCostFloor + avgTeamCost / marginDenom;
  const month = Math.max(1, ctx.periodMonth);
  const monthlyRevenue = ctx.ytdRevenueCollected / month;
  const annualizedRevenue = monthlyRevenue * 12;
  const gapRevenue = revenueThreshold - annualizedRevenue;
  const monthsToThreshold =
    monthlyRevenue > 0 && gapRevenue > 0
      ? Math.ceil(gapRevenue / monthlyRevenue)
      : gapRevenue <= 0
        ? 0
        : null;

  const selfFundPct =
    ctx.alignedRate > 0 && ctx.annualBillableHrs > 0
      ? Math.min(
          100,
          Math.round(
            ((avgTeamCost / marginDenom) /
              (ctx.alignedRate * ctx.annualBillableHrs)) *
              100,
          ),
        )
      : 0;

  let viableLabel = "Now";
  if (monthsToThreshold != null && monthsToThreshold > 0) {
    const d = new Date();
    d.setMonth(d.getMonth() + monthsToThreshold);
    viableLabel = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }

  let insightSentence: string;
  if (monthsToThreshold === 0) {
    insightSentence = `Revenue already supports a hire. Added capacity can cover about ${selfFundPct}% of a coordinator's burdened cost at your margin target.`;
  } else if (monthsToThreshold != null) {
    insightSentence = `Revenue reaches hiring threshold around ${viableLabel}. A coordinator at ${fmtMoney(avgTeamCost)} burdened pays for about ${selfFundPct}% of herself through added capacity.`;
  } else {
    insightSentence =
      "Log collected revenue to estimate when a hire becomes viable.";
  }

  const headcountGap = targetValue - currentValue;
  const status: GoalInsightStatus =
    headcountGap <= 0 ? "achieved" : monthsToThreshold === 0 ? "on_track" : "watch";

  return {
    currentValue,
    targetValue,
    gap: headcountGap,
    pctComplete: null,
    onTrack: monthsToThreshold === 0,
    insightSentence,
    numberCards: [
      { label: "Viable from", value: viableLabel },
      { label: "Self-funded", value: `${selfFundPct}%`, color: "sage" },
      {
        label: "Team today",
        value: `${currentValue} people`,
      },
    ],
    status,
    primaryAction: "team",
  };
}

export function buildGoalInsightsMap(
  goals: FirmGoalRow[],
  ctx: GoalMetricsContext,
): GoalInsightsMap {
  const out: GoalInsightsMap = {};
  for (const g of goals) {
    out[g.id] = buildGoalInsight(g, ctx);
  }
  return out;
}

export type BonusPaymentTiming =
  | "this_month"
  | "end_of_quarter"
  | "end_of_year"
  | "custom";

export type BonusAffordabilityResult = {
  totalBonusAmount: number;
  grossMarginYTD: number;
  taxReserveYTD: number;
  availableProfit: number;
  remainingAfterBonus: number;
  isAffordable: boolean;
  affordabilityPct: number;
  suggestedAmount: number;
  additionalRevenueNeeded: number;
  verdictKey: "no_data" | "no_profit" | "comfortable" | "tight" | "exceeds";
};

export function calcBonusAffordability(params: {
  bonusAmounts: Record<string, number>;
  ytdRevenueCollected: number;
  totalAnnualCostFloor: number;
  taxReservePct?: number;
  paymentTiming: BonusPaymentTiming;
  targetMarginPct?: number;
}): BonusAffordabilityResult {
  const taxPct = params.taxReservePct ?? 0.25;
  const marginPct = (params.targetMarginPct ?? 35) / 100;
  const totalBonusAmount = Object.values(params.bonusAmounts).reduce(
    (s, v) => s + (Number(v) || 0),
    0,
  );

  const grossMarginYTD = params.ytdRevenueCollected - params.totalAnnualCostFloor;
  const taxReserveYTD = Math.max(0, grossMarginYTD * taxPct);
  const availableProfit = grossMarginYTD - taxReserveYTD;
  const remainingAfterBonus = availableProfit - totalBonusAmount;
  const affordabilityPct =
    availableProfit > 0 ? totalBonusAmount / availableProfit : totalBonusAmount > 0 ? 1 : 0;

  let verdictKey: BonusAffordabilityResult["verdictKey"] = "no_data";
  if (totalBonusAmount <= 0) verdictKey = "no_data";
  else if (availableProfit <= 0) verdictKey = "no_profit";
  else if (totalBonusAmount > availableProfit) verdictKey = "exceeds";
  else if (affordabilityPct > 0.8) verdictKey = "tight";
  else verdictKey = "comfortable";

  const gap = totalBonusAmount - availableProfit;
  const additionalRevenueNeeded =
    gap > 0 ? gap / Math.max(0.01, 1 - marginPct) : 0;

  return {
    totalBonusAmount,
    grossMarginYTD,
    taxReserveYTD,
    availableProfit,
    remainingAfterBonus,
    isAffordable: totalBonusAmount > 0 && totalBonusAmount <= availableProfit,
    affordabilityPct,
    suggestedAmount: Math.max(0, availableProfit * 0.75),
    additionalRevenueNeeded,
    verdictKey,
  };
}

export type RaiseImpactResult = {
  totalRaiseAmount: number;
  burdenedRaiseCost: number;
  proratedThisYear: number;
  newAnnualCostFloor: number;
  newAlignedRate: number;
  alignedRateDelta: number;
  additionalRevenueNeeded: number;
  equivalentProjects: number;
  additionalPerProject: number;
  raiseDetails: RaiseDetail[];
};

export type RaiseDetail = {
  memberId: string;
  memberName: string;
  currentSalary: number;
  raiseAmount: number;
  raisePct: number;
  newSalary: number;
};

export function calcRaiseImpact(params: {
  raiseAmounts: Record<string, number>;
  currentCostFloor: number;
  currentAlignedRate: number;
  annualBillableHrs: number;
  targetMarginPct: number;
  averageProjectFee: number;
  effectiveDate: "this_year" | "next_year";
  currentMonth: number;
  currentProjectCount?: number;
  memberMeta?: Record<string, { name: string; salary: number }>;
}): RaiseImpactResult {
  const totalRaiseAmount = Object.values(params.raiseAmounts).reduce(
    (s, v) => s + (Number(v) || 0),
    0,
  );
  const burdenedRaiseCost = totalRaiseAmount * 1.0765;
  const monthsRemaining = Math.max(0, 12 - params.currentMonth);
  const proratedThisYear =
    params.effectiveDate === "this_year"
      ? burdenedRaiseCost * (monthsRemaining / 12)
      : 0;

  const newAnnualCostFloor = params.currentCostFloor + burdenedRaiseCost;
  const marginDenom = Math.max(0.01, 1 - params.targetMarginPct / 100);
  const newBreakEven =
    params.annualBillableHrs > 0
      ? newAnnualCostFloor / params.annualBillableHrs
      : 0;
  const newAlignedRate = newBreakEven / marginDenom;
  const alignedRateDelta = newAlignedRate - params.currentAlignedRate;
  const additionalRevenueNeeded = burdenedRaiseCost / marginDenom;
  const avgFee = Math.max(params.averageProjectFee, 1);
  const equivalentProjects = additionalRevenueNeeded / avgFee;
  const projectCount = Math.max(1, params.currentProjectCount ?? 1);
  const additionalPerProject =
    equivalentProjects < 1 ? additionalRevenueNeeded / projectCount : 0;

  const raiseDetails: RaiseDetail[] = Object.entries(params.raiseAmounts).map(
    ([memberId, raiseAmount]) => {
      const meta = params.memberMeta?.[memberId];
      const salary = meta?.salary ?? 0;
      const raisePct = salary > 0 ? (raiseAmount / salary) * 100 : 0;
      return {
        memberId,
        memberName: meta?.name ?? (memberId === "owner" ? "Owner" : "Team member"),
        currentSalary: salary,
        raiseAmount,
        raisePct,
        newSalary: salary + raiseAmount,
      };
    },
  );

  return {
    totalRaiseAmount,
    burdenedRaiseCost,
    proratedThisYear,
    newAnnualCostFloor,
    newAlignedRate,
    alignedRateDelta,
    additionalRevenueNeeded,
    equivalentProjects,
    additionalPerProject,
    raiseDetails,
  };
}

/** Fee increase scenario — same volume, higher minimum fee. */
export function calcFeeIncreaseScenario(params: {
  currentMinFee: number;
  newMinFee: number;
  projectsPerYear: number;
  currentAnnualRevenue: number;
  annualRevenueTarget: number;
}) {
  const ratio = params.newMinFee / Math.max(params.currentMinFee, 1);
  const projectedRevenue = params.currentMinFee * params.projectsPerYear * ratio;
  const delta = projectedRevenue - params.currentAnnualRevenue;
  const gapAfter = params.annualRevenueTarget - projectedRevenue;
  return { projectedRevenue, delta, gapAfter, ratio };
}

export function calcVolumeScenario(params: {
  projectsPerYear: number;
  averageProjectFee: number;
  annualBillableHrs: number;
  hoursPerProject: number;
}) {
  const revenue = params.projectsPerYear * params.averageProjectFee;
  const hoursRequired = params.projectsPerYear * params.hoursPerProject;
  const overCapacity = hoursRequired > params.annualBillableHrs;
  return { revenue, hoursRequired, overCapacity };
}

export function calcTeamHireScenario(params: {
  burdenedAnnualCost: number;
  currentCostFloor: number;
  annualBillableHrs: number;
  targetMarginPct: number;
  averageProjectFee: number;
}) {
  const marginDenom = Math.max(0.01, 1 - params.targetMarginPct / 100);
  const newCostFloor = params.currentCostFloor + params.burdenedAnnualCost;
  const newBreakEven =
    params.annualBillableHrs > 0 ? newCostFloor / params.annualBillableHrs : 0;
  const newAlignedRate = newBreakEven / marginDenom;
  const additionalRevenue = params.burdenedAnnualCost / marginDenom;
  const projects = additionalRevenue / Math.max(params.averageProjectFee, 1);
  return { newCostFloor, newAlignedRate, additionalRevenue, projects };
}

export function currentQuarterLabel(d = new Date()): string {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q} ${d.getFullYear()}`;
}

export function previousQuarterLabel(d = new Date()): string {
  const month = d.getMonth();
  const q = Math.floor(month / 3) + 1;
  const prevQ = q === 1 ? 4 : q - 1;
  const year = q === 1 ? d.getFullYear() - 1 : d.getFullYear();
  return `Q${prevQ} ${year}`;
}
