import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { updateAcceptingNewClients } from "@/lib/capacity.functions";

export function AcceptingClientsStatus({
  firmId,
  accepting,
  until,
  variant = "header",
}: {
  firmId: string;
  accepting: boolean;
  until: string | null;
  variant?: "header" | "dashboard";
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateAcceptingNewClients);

  const mutation = useMutation({
    mutationFn: () => updateFn({ data: { firmId, accepting: true, until: null } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["capacity-planner", firmId] });
      qc.invalidateQueries({ queryKey: ["capacity-dashboard-summary", firmId] });
      toast.success("Accepting new clients again.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (accepting) return null;

  const untilLabel = until
    ? new Date(`${until.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  if (variant === "dashboard") {
    return (
      <div className="mt-2.5 rounded-r-md border-l-2 border-gold bg-gold/[0.07] px-3 py-2">
        <p className="font-sans text-xs text-gold">Not accepting new clients</p>
        {untilLabel && (
          <p className="font-sans text-[11px] text-muted-foreground">Until {untilLabel}</p>
        )}
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="mt-1 cursor-pointer font-sans text-[11px] text-gold underline"
        >
          Resume →
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="text-right">
        <span className="inline-block rounded-full border border-gold/25 bg-gold/10 px-3 py-1 font-sans text-[11px] font-medium text-gold">
          Paused
        </span>
        {untilLabel && (
          <p className="mt-0.5 font-sans text-[10px] text-muted-foreground">Until {untilLabel}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="cursor-pointer font-sans text-[11px] text-gold underline"
      >
        Resume →
      </button>
    </div>
  );
}
