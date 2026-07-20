import { cn } from "@/lib/utils";
import {
  PRICING_STRUCTURE_OPTIONS,
  type PricingStructure,
} from "@/lib/pricing-structure";

export function PricingStructureSelector({
  value,
  onChange,
  className,
}: {
  value: PricingStructure;
  onChange: (value: PricingStructure) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-ch/50">
        How do you typically charge clients?
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {PRICING_STRUCTURE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex h-full flex-col items-start rounded-md border px-3 py-2.5 text-left transition-colors",
              value === opt.value
                ? "border-ch bg-ch text-white"
                : "border-border bg-white text-ch/80 hover:border-ch/40",
            )}
          >
            <span className="text-sm font-medium">{opt.title}</span>
            <span
              className={cn(
                "mt-1 text-[11px] leading-snug",
                value === opt.value ? "text-white/75" : "text-ch/55",
              )}
            >
              {opt.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
