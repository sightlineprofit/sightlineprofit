/** Stable ids so re-seeding / reset can target the same firm without touching other tenants. */
export const MERIDIAN_DEMO_FIRM_ID = "00000000-0000-0000-0000-000000000e01";
export const MERIDIAN_DEMO_FIRM_NAME = "Meridian Interiors";

export const MERIDIAN_MEMBER_ID = "00000000-0000-0000-0000-000000000e02";

export const MERIDIAN_SOP_FULL_RENO_ID = "00000000-0000-0000-0000-000000000e11";
export const MERIDIAN_SOP_KITCHEN_ID = "00000000-0000-0000-0000-000000000e12";
export const MERIDIAN_SOP_INTAKE_ID = "00000000-0000-0000-0000-000000000e13";

export function meridianProjectId(n: number): string {
  return `00000000-0000-4000-a000-${(0xe100 + n).toString(16).padStart(12, "0")}`;
}

export function meridianExpenseId(n: number): string {
  return `00000000-0000-4000-a000-${(0xe200 + n).toString(16).padStart(12, "0")}`;
}

/** Demo billing id — not a real Stripe subscription; satisfies firmHasAppAccess. */
export const MERIDIAN_DEMO_STRIPE_SUB_ID = "sub_meridian_presentations_demo";
