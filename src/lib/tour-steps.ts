/** Total steps in the principal setup + product guide tour. */
export const TOUR_STEP_COUNT = 8;

export const TOUR_JOURNEY = [
  { n: 1, label: "Welcome", detail: "How Sightline works" },
  { n: 2, label: "Compensation", detail: "What the firm must cover for you" },
  { n: 3, label: "Expenses", detail: "Operating costs" },
  { n: 4, label: "Capacity", detail: "Productive hours & pricing model" },
  { n: 5, label: "Team", detail: "Optional — adds cost & capacity" },
  { n: 6, label: "Aligned rate", detail: "Your financial floor" },
  { n: 7, label: "First project", detail: "Profitability tracking" },
  { n: 8, label: "Time", detail: "Log or import hours" },
] as const;

export const SIGHTLINE_FEATURES = [
  {
    title: "Dashboard",
    description: "Your aligned rate, cost floor, and weekly financial pulse.",
  },
  {
    title: "Sightline",
    description: "Project profitability, scope, and payments in one place.",
  },
  {
    title: "Time calendar",
    description: "Log hours to see utilization against your capacity target.",
  },
  {
    title: "Capacity",
    description: "Team productive hours, planning windows, and open capacity.",
  },
  {
    title: "Settings",
    description: "Refine compensation, expenses, rates, and team as you go.",
  },
] as const;
