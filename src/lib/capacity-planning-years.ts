export const PLANNING_YEARS_AHEAD = 2;

export function getPlanningYearOptions(
  baseYear = new Date().getFullYear(),
): Array<{ year: number; label: string; isCurrent: boolean }> {
  return Array.from({ length: PLANNING_YEARS_AHEAD + 1 }, (_, i) => {
    const year = baseYear + i;
    return {
      year,
      label: String(year),
      isCurrent: i === 0,
    };
  });
}

export function isFuturePlanningYear(year: number, baseYear = new Date().getFullYear()): boolean {
  return year > baseYear;
}
