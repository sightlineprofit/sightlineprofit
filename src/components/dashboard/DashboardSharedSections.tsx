import { UnderstandYourNumbers, understandPropsFromCalc } from "./UnderstandYourNumbers";
import type { calc } from "@/lib/finance";

type Calc = ReturnType<typeof calc>;

export function DashboardSharedSections({
  c,
  members,
  targetMarginPct,
}: {
  c: Calc;
  members: any[];
  targetMarginPct: number;
}) {
  const understand = understandPropsFromCalc(c, members, targetMarginPct);

  return (
    <div className="mt-4">
      <UnderstandYourNumbers {...understand} className="mt-0" />
    </div>
  );
}
