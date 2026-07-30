import { RateArchitecturePanel } from "./RateArchitectureHeader";
import type { UnderstandYourNumbersProps } from "./UnderstandYourNumbers";
import type { calc } from "@/lib/finance";

type Calc = ReturnType<typeof calc>;

import type { RetainerPortfolioMetrics } from "@/lib/retainer-metrics";

/** Rate view — primary panel only; shared sections render full-width below the dashboard grid. */
export function AlignedRatePanel({
  c,
  cfg,
  members,
  expenses,
  targetMarginPct,
  configUpdatedAt,
  projectScopedHours,
  understandProps,
  className,
  retainerMetrics,
}: {
  c: Calc;
  cfg: any;
  members: any[];
  expenses: any[];
  targetMarginPct: number;
  configUpdatedAt?: string | null;
  projectScopedHours?: number[];
  understandProps?: UnderstandYourNumbersProps;
  className?: string;
  retainerMetrics?: RetainerPortfolioMetrics | null;
}) {
  return (
    <RateArchitecturePanel
      className={className}
      c={c}
      cfg={cfg}
      members={members}
      expenses={expenses}
      targetMarginPct={targetMarginPct}
      configUpdatedAt={configUpdatedAt}
      projectScopedHours={projectScopedHours}
      understandProps={understandProps}
      retainerMetrics={retainerMetrics}
    />
  );
}
