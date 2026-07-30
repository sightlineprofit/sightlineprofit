/** Days between two calendar dates (floor). */
export function daysBetween(from: Date, to: Date): number {
  const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const end = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.floor((end - start) / 86400000);
}

export function parseCostReviewDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function shouldShowQuarterlyReview(lastCostReviewDate: Date | null): boolean {
  if (!lastCostReviewDate) return false;
  return daysBetween(lastCostReviewDate, new Date()) >= 90;
}

export function shouldShowAnnualReview(lastCostReviewDate: Date | null): boolean {
  if (!lastCostReviewDate) return false;
  const currentYear = new Date().getFullYear();
  return lastCostReviewDate.getFullYear() < currentYear;
}

export type CostReviewNotifications = {
  rateChange?: {
    previousRate: number;
    newRate: number;
    delta: number;
    direction: "up" | "down";
  };
  affectedProjects?: {
    count: number;
  };
};
