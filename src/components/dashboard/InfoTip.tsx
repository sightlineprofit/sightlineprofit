import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function InfoTip({ term, definition, why }: { term: string; definition: string; why?: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="inline-flex items-center text-ch/30 hover:text-gold transition-colors" aria-label={`What is ${term}?`}>
            <Info className="h-3 w-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs bg-ch text-cream border-ch px-3 py-2 text-xs">
          <div className="font-display text-sm text-cream mb-1">{term}</div>
          <div className="text-cream/85 leading-relaxed">{definition}</div>
          {why && <div className="text-cream/60 mt-1.5 italic">{why}</div>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export const GLOSSARY = {
  alignedRate: {
    term: "Aligned Rate",
    definition: "Your floor. Calculated from your total annual costs divided by your annual billable hours, adjusted for your target margin. The minimum you can charge and still run a financially healthy firm.",
    why: "Break-even is survival. This is health.",
  },
  breakEvenRate: {
    term: "Break-Even Rate",
    definition: "The absolute minimum hourly rate to cover your costs with nothing left over. Billing above break-even means you're not losing money — it does not mean you're meeting your financial goals.",
    why: "Your aligned rate is the number that actually matters.",
  },
  utilizationRate: {
    term: "Utilization Rate",
    definition: "The share of your available working hours that turn into billable client work.",
    why: "Most studios overestimate this. The honest number is usually 55–70%.",
  },
  marginAboveFloor: {
    term: "Margin Above Floor",
    definition: "The difference between what you bill and your aligned rate — the minimum your cost structure requires to hit your margin target. Different from break-even, which only covers costs; aligned rate covers costs AND target profit margin.",
    why: "True financial health requires billing above your aligned rate, not just above break-even.",
  },
  fullyBurdenedCost: {
    term: "Fully Burdened Cost",
    definition: "A team member's hourly cost including payroll taxes, benefits, retirement — not just salary.",
    why: "It's what someone really costs you per hour they're at the desk.",
  },
  amortizedContribution: {
    term: "Amortized Contribution",
    definition: "A one-time investment spread across the months it's expected to pay back, so it shows up in your rate evenly.",
    why: "Stops large purchases from distorting a single month's math.",
  },
  rateSafetyBuffer: {
    term: "Rate Safety Buffer",
    definition: "How much room your billed rate has above the break-even rate, as a percentage.",
    why: "Below 20% is fragile. Above 50% is healthy.",
  },
  grossMargin: {
    term: "Gross Margin",
    definition: "Revenue minus the direct cost of delivering the work, expressed as a percentage of revenue.",
    why: "The single number that tells you whether the business model works.",
  },
} as const;