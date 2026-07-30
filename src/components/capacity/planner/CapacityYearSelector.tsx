import { cn } from "@/lib/utils";
import { getPlanningYearOptions } from "@/lib/capacity-planning-years";

export function CapacityYearSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (year: number) => void;
}) {
  const options = getPlanningYearOptions();

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
      {options.map((opt) => {
        const active = value === opt.year;
        return (
          <button
            key={opt.year}
            type="button"
            onClick={() => onChange(opt.year)}
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
            title={opt.isCurrent ? "Current year" : "Forward planning"}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
