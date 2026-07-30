/** Copy and helpers for separating capacity planning from realized revenue. */

import type { calc } from "@/lib/finance";
import { normalizePricingStructure } from "@/lib/pricing-structure";

export function annualRunRateFromYtd(totalRevenueYtd: number, monthIndex: number): number {
  const m = Math.max(1, monthIndex);
  return (totalRevenueYtd / m) * 12;
}

export const REVENUE_CAPACITY_LABEL = "Revenue capacity (if targets are met)";

export const REVENUE_CAPACITY_SHORT =
  "Planning math only: billed rate × configured hours × weeks. Not cash collected or contracted revenue.";

export type RevenueDashboardCopy = {
  tileEyebrow: string;
  dualLensTitle: string;
  dualLensDefinition: string;
  footerNote: string | null;
  portfolioRateDefinition: string;
  feesProgressLabel: string;
  emptyInsight: string;
  paceTargetNoun: string;
};

export function getRevenueDashboardCopy(structure: unknown): RevenueDashboardCopy {
  const s = normalizePricingStructure(structure);
  if (s === "retainer") {
    return {
      tileEyebrow: "Retainer revenue · year to date",
      dualLensTitle: "Retainer revenue vs. structural target",
      dualLensDefinition:
        "This tile tracks retainer fees from active retainer projects — not hourly billing. Your aligned rate still reflects cost per productive hour; compare retainer $/hr from logged time to that floor in Rate architecture.",
      footerNote: null,
      portfolioRateDefinition:
        "Average revenue per hour logged on retainer projects — compare to your aligned rate per productive hour.",
      feesProgressLabel: "Retainer fees",
      emptyInsight: "Add retainer projects and log time to see monthly retainer revenue and pace.",
      paceTargetNoun: "retainer revenue target",
    };
  }
  if (s === "flat_fee") {
    return {
      tileEyebrow: "Project fees · year to date",
      dualLensTitle: "Flat fees vs. capacity planning",
      dualLensDefinition:
        "YTD reflects fees you've recorded on projects. Portfolio realized rate is revenue per hour actually logged — the scorecard for flat-fee work. Revenue capacity in Settings is hour-and-rate scenario math, not a forecast of project fees.",
      footerNote:
        "Flat fees aren't tied to a single hourly volume. Use realized $/hr on each project and YTD collections; use capacity planning only for hiring and hours.",
      portfolioRateDefinition:
        "Average revenue per hour logged across active projects — use this to judge flat-fee and scoped work against your aligned floor.",
      feesProgressLabel: "Project fees collected",
      emptyInsight: "Record project payments and log time to see run rate and realized $/hr.",
      paceTargetNoun: "structural revenue target",
    };
  }
  if (s === "both") {
    return {
      tileEyebrow: "Revenue · year to date",
      dualLensTitle: "Mixed pricing · actual vs. planning",
      dualLensDefinition:
        "YTD is recorded payments across hourly and flat work. Portfolio realized rate blends all active projects into one $/hr. Revenue capacity in Settings is billed-rate × hours — a planning scenario, not guaranteed revenue.",
      footerNote:
        "When a project is flat-fee or priced above your floor, lean on realized $/hr and YTD collections rather than capacity alone.",
      portfolioRateDefinition:
        "Blended revenue per logged hour across active projects — hourly and flat-fee work combined.",
      feesProgressLabel: "Fees collected",
      emptyInsight: "Log time and record payments to see run rate vs your billed-rate capacity target.",
      paceTargetNoun: "billed-rate capacity",
    };
  }
  return {
    tileEyebrow: "Fees collected · year to date",
    dualLensTitle: "Hourly billing · actual vs. planning",
    dualLensDefinition:
      "YTD is client payments you've recorded. Portfolio realized rate is revenue per billable hour logged on active projects. Revenue capacity in Settings is your billed rate × target hours — planning math, not a forecast.",
    footerNote:
      "Log billable time and record payments when clients pay. Compare portfolio realized $/hr to your aligned floor on the rate panel.",
    portfolioRateDefinition:
      "Average revenue per billable hour logged on active projects this year — your hourly firm’s ground-truth $/hr.",
    feesProgressLabel: "Hourly fees collected",
    emptyInsight:
      "Record client payments and log billable hours to see run rate vs your billed-rate capacity target.",
    paceTargetNoun: "billed-rate capacity",
  };
}

/** Annual target for YTD pace bars — matches how the firm charges. */
export function ytdAnnualPaceTarget(c: ReturnType<typeof calc>, pricingStructure: unknown): number {
  const s = normalizePricingStructure(pricingStructure);
  const structural = (c.alignedRate || 0) * (c.annualBillableHrs || 0);
  if (s === "hourly" || s === "both") {
    const billedCap = c.revenueCapacityAtUtilization ?? c.annualRevenue ?? 0;
    return billedCap > 0 ? billedCap : structural;
  }
  return structural;
}
