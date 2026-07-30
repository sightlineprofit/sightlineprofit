import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type CapacityHorizon = "16_weeks" | "12_months";

const VIEWS: Array<{ value: CapacityHorizon; label: string }> = [
  { value: "16_weeks", label: "16 weeks" },
  { value: "12_months", label: "12 months" },
];

export function CapacityHorizonToggle({
  value,
  onChange,
}: {
  value: CapacityHorizon;
  onChange: (v: CapacityHorizon) => void;
}) {
  return (
    <div
      className="inline-flex shrink-0"
      style={{
        background: "var(--cream)",
        border: "0.5px solid rgba(44,44,44,0.12)",
        borderRadius: 20,
        padding: 3,
      }}
    >
      {VIEWS.map((v) => {
        const active = value === v.value;
        return (
          <button
            key={v.value}
            type="button"
            onClick={() => onChange(v.value)}
            className={cn(
              "cursor-pointer border-none transition-all duration-150",
              active ? "bg-white text-ch shadow-sm" : "bg-transparent text-muted-foreground",
            )}
            style={{
              fontFamily: "Jost, sans-serif",
              fontSize: 11,
              fontWeight: 500,
              padding: "5px 14px",
              borderRadius: 17,
            }}
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

export function AddTimeBlockButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-white text-ch transition-colors hover:border-gold/40"
      style={{
        fontFamily: "Jost, sans-serif",
        fontSize: 12,
        fontWeight: 500,
        padding: "7px 14px",
      }}
    >
      <Plus className="h-3.5 w-3.5" />
      Add time block
    </button>
  );
}

/** @deprecated use AddTimeBlockButton */
export const AddLifeEventButton = AddTimeBlockButton;
