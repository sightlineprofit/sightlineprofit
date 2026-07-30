export type PricingStructure = "hourly" | "flat_fee" | "both" | "retainer";

export const PRICING_STRUCTURE_OPTIONS: Array<{
  value: PricingStructure;
  title: string;
  description: string;
}> = [
  {
    value: "hourly",
    title: "Hourly",
    description: "You bill clients by the hour",
  },
  {
    value: "flat_fee",
    title: "Flat project fee",
    description: "You quote a fixed fee per project",
  },
  {
    value: "both",
    title: "Both (hourly and flat)",
    description: "You use hourly and flat fees depending on the project",
  },
  {
    value: "retainer",
    title: "Retainer",
    description: "Most clients pay a fixed monthly fee for ongoing work",
  },
];

export function normalizePricingStructure(value: unknown): PricingStructure {
  if (value === "flat_fee" || value === "both" || value === "hourly" || value === "retainer") {
    return value;
  }
  return "hourly";
}

export function isRetainerFirm(structure: unknown): boolean {
  return normalizePricingStructure(structure) === "retainer";
}

/** Whether the firm UI should collect and require a billed hourly rate. */
export function requiresBilledRate(structure: PricingStructure | null | undefined): boolean {
  const s = normalizePricingStructure(structure);
  return s === "hourly" || s === "both";
}

export type CapacitySetupCopy = {
  stepTitle: string;
  stepBody: string;
  hrsPerWeekLabel: string;
  hrsPerWeekHelper: string;
  marginHelper: string;
  requiredFieldsError: string;
  previewEmpty: string;
  previewNeedsTeam: string;
  breakEvenSuffix: string;
  teamNote: string;
};

/** Onboarding / capacity step copy keyed to how the firm charges clients. */
export function getCapacitySetupCopy(structure: PricingStructure | null | undefined): CapacitySetupCopy {
  const s = normalizePricingStructure(structure);
  if (s === "retainer") {
    return {
      stepTitle: "How much client work can your firm handle?",
      stepBody:
        "Your aligned rate divides your cost floor across productive hours. Start with your own weekly client-work time — team members add their hours separately and Sightline totals them automatically.",
      hrsPerWeekLabel: "Your client work hrs / week",
      hrsPerWeekHelper:
        "Enter 0 if you don't do client work yourself — team members' hours are added separately and drive your firm total.",
      marginHelper: "Profit % you want to retain after covering costs",
      requiredFieldsError: "Working weeks and target margin are required.",
      previewEmpty: "Complete compensation and expenses in earlier steps to see your rate.",
      previewNeedsTeam:
        "You entered 0 for your hours — add team members with their client-work hours to see your aligned rate.",
      breakEvenSuffix: "per productive hour — the minimum each hour of client work must generate",
      teamNote:
        "Have team members? Enter each person's client-work hours in Settings → Capacity. They're summed with yours for the firm total.",
    };
  }
  if (s === "flat_fee") {
    return {
      stepTitle: "How many hours go into client work?",
      stepBody:
        "Your cost floor spreads across productive hours. Enter your own weekly client-work time here — team hours are added per member and totaled automatically.",
      hrsPerWeekLabel: "Your client work hrs / week",
      hrsPerWeekHelper:
        "Enter 0 if you don't do client work yourself — team members' hours are added separately and drive your firm total.",
      marginHelper: "Profit % you want to retain after covering costs",
      requiredFieldsError: "Working weeks and target margin are required.",
      previewEmpty: "Complete compensation and expenses in earlier steps to see your rate.",
      previewNeedsTeam:
        "You entered 0 for your hours — add team members with their client-work hours to see your aligned rate.",
      breakEvenSuffix: "per project hour — the minimum before profit",
      teamNote:
        "Have team members? Enter each person's hours in Settings → Capacity. Sightline adds them to yours for the firm-wide total.",
    };
  }
  if (s === "both") {
    return {
      stepTitle: "How many hours do you sell or scope?",
      stepBody:
        "Your costs divide across billable and scoped hours. Enter your own weekly capacity here — each team member's hours are added separately.",
      hrsPerWeekLabel: "Your billable / scoped hrs / week",
      hrsPerWeekHelper:
        "Enter 0 if you don't do client work yourself — team members' hours are added separately.",
      marginHelper: "Profit % on each dollar of revenue",
      requiredFieldsError: "Working weeks and target margin are required.",
      previewEmpty: "Complete compensation and expenses in earlier steps to see your rate.",
      previewNeedsTeam:
        "You entered 0 for your hours — add team members with their billable hours to see your aligned rate.",
      breakEvenSuffix: "per hour — the minimum before profit",
      teamNote:
        "Have team members? Add each member's billable hours in Settings → Capacity.",
    };
  }
  return {
    stepTitle: "How many hours do you bill?",
    stepBody:
      "Your costs divide across billable hours. Enter your own weekly target here — team members' billable hours are added per person and totaled automatically.",
    hrsPerWeekLabel: "Your target billable hrs / week",
    hrsPerWeekHelper:
      "Enter 0 if you don't bill client time yourself — team members' billable hours are added separately.",
    marginHelper: "Profit % on each dollar billed",
    requiredFieldsError: "Working weeks and target margin are required.",
    previewEmpty: "Complete compensation and expenses in earlier steps to see your rate.",
    previewNeedsTeam:
      "You entered 0 for your hours — add team members with their billable hours to see your aligned rate.",
    breakEvenSuffix: "per billable hour — the minimum before profit",
    teamNote:
      "Have team members? Add each member's billable hours in Settings → Capacity.",
  };
}

export type AlignedRateOrientationCopy = {
  body: string;
};

/** Step 5 tour copy after aligned rate is calculated. */
export function getAlignedRateOrientationCopy(
  structure: PricingStructure | null | undefined,
): AlignedRateOrientationCopy {
  const s = normalizePricingStructure(structure);
  if (s === "retainer") {
    return {
      body:
        "Built from your compensation, expenses, team costs, and productive client hours — this is the minimum each hour of client work must generate for your firm to cover costs and hit your margin target.\n\nCompare this to what your retainer revenue actually produces per hour. That gap is what Sightline tracks.",
    };
  }
  if (s === "flat_fee") {
    return {
      body:
        "Built from your compensation, expenses, team costs, and client-work hours — this is the minimum each project hour must generate for your firm to cover costs and hit your margin target.\n\nCompare this to your realized rate on each flat-fee project. That gap is what Sightline tracks.",
    };
  }
  if (s === "both") {
    return {
      body:
        "Built from your compensation, expenses, team costs, and billable hours — this is the minimum your firm needs to earn per hour to cover costs and hit your margin target.\n\nThe gap between this number and what you actually bill or realize on projects is what Sightline tracks.",
    };
  }
  return {
    body:
      "Built from your compensation, expenses, team costs, and billable hours — this is the minimum your firm needs to charge per hour to cover costs and hit your margin target.\n\nThe gap between this number and your billed rate is what Sightline tracks.",
  };
}

/** Reference project sizes for flat-fee minimum fee guidance. */
export function referenceProjectHours(scopedHoursList: number[]): [number, number, number] {
  const valid = scopedHoursList.filter((h) => Number.isFinite(h) && h > 0);
  if (valid.length === 0) return [75, 120, 175];

  const avg = valid.reduce((sum, h) => sum + h, 0) / valid.length;
  return [
    Math.max(1, Math.round(avg * (75 / 120))),
    Math.max(1, Math.round(avg)),
    Math.max(1, Math.round(avg * (175 / 120))),
  ];
}
