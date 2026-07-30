export type TimeLogFraming = {
  pageTitle: string;
  pageSubtitle: string;
  entryFormHeading: string;
  entryFormSubtitle: string;
  emptyStateMessage: string;
  ownerNote: string | null;
};

const FLAT_FEE_FRAMING: TimeLogFraming = {
  pageTitle: "Time",
  pageSubtitle: "Every hour worked affects your project's realized rate",
  entryFormHeading: "Log time",
  entryFormSubtitle:
    "On flat fee projects, every hour you or your team works consumes part of the fixed fee. Logging time shows whether the fee is actually covering your costs.",
  emptyStateMessage:
    "No time logged yet. On flat fee projects, every hour worked — billable or not — affects how profitable the project actually is. Start logging to see your true realized rate.",
  ownerNote:
    "Your time has a cost even when it's not on the invoice. Log your hours so Sightline can calculate your firm's true realized rate.",
};

const HOURLY_FRAMING: TimeLogFraming = {
  pageTitle: "Time",
  pageSubtitle: "Log billable hours to track project scope",
  entryFormHeading: "Log time",
  entryFormSubtitle: "Billable hours are tracked against your project scope.",
  emptyStateMessage:
    "No time logged yet. Start logging billable hours to track project progress and see your effective rate.",
  ownerNote: null,
};

const RETAINER_FRAMING: TimeLogFraming = {
  pageTitle: "Time",
  pageSubtitle: "Track labor against your monthly retainer revenue",
  entryFormHeading: "Log time",
  entryFormSubtitle:
    "Your retainer fee is fixed. Every hour your team works — including yours — is being paid for by that fee. Logging time shows whether each retainer client is worth what you're charging.",
  emptyStateMessage:
    "No time logged yet. Retainer profitability depends on knowing how many hours each client actually takes. Start logging to see your realized rate per client.",
  ownerNote:
    "Even if you work fewer hours by design, log your time. Your hours still have a cost, and without them Sightline can't calculate your firm's true realized rate per client.",
};

/** Returns time-logging copy for the firm's pricing structure. Pure — no side effects. */
export function getTimeLogFraming(pricingStructure: string | null | undefined): TimeLogFraming {
  if (pricingStructure === "hourly") return HOURLY_FRAMING;
  if (pricingStructure === "retainer") return RETAINER_FRAMING;
  if (pricingStructure === "flat_fee") return FLAT_FEE_FRAMING;
  return FLAT_FEE_FRAMING;
}

/** Billable toggle label for flat fee / retainer / mixed firms. */
export function getBillableToggleLabel(pricingStructure: string | null | undefined): string {
  if (pricingStructure === "hourly") return "Billable";
  return "Counts toward this project";
}

export function showOwnerPayTimeNote(pricingStructure: string | null | undefined): boolean {
  const s = pricingStructure ?? "";
  return s === "flat_fee" || s === "retainer";
}
