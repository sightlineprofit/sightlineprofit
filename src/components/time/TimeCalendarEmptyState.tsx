import { Clock } from "lucide-react";
import type { TimeLogFraming } from "@/lib/time-framing";

export function TimeCalendarEmptyState({
  framing,
  onLogFirst,
}: {
  framing: TimeLogFraming;
  onLogFirst: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <Clock className="mb-2.5 h-7 w-7 text-muted-lt" aria-hidden />
      <p
        className="mx-auto max-w-[380px] font-display text-base italic leading-[1.7] text-muted-lt"
      >
        {framing.emptyStateMessage}
      </p>
      <button
        type="button"
        onClick={onLogFirst}
        className="mt-3.5 cursor-pointer rounded-lg border bg-white px-[18px] py-2 font-sans text-xs font-medium text-ch"
        style={{ borderWidth: "0.5px", borderColor: "rgba(44,44,44,0.15)" }}
      >
        Log your first entry →
      </button>
    </div>
  );
}
