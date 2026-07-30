import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { markCapacityBlocksOnboarded } from "@/lib/capacity.functions";

export function CapacityCommitmentPrompt({
  firmId,
  onAddCommitment,
  onDismiss,
}: {
  firmId: string;
  onAddCommitment: () => void;
  onDismiss: () => void;
}) {
  const qc = useQueryClient();
  const markFn = useServerFn(markCapacityBlocksOnboarded);

  const dismissMutation = useMutation({
    mutationFn: () => markFn({ data: { firmId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["capacity-planner", firmId] });
    },
    onError: (e: Error) => {
      if (e.message.includes("capacity_blocks_onboarded")) return;
      toast.error(e.message || "Could not save your preference");
    },
  });

  const addMutation = useMutation({
    mutationFn: () => markFn({ data: { firmId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["capacity-planner", firmId] });
    },
    onError: (e: Error) => {
      if (e.message.includes("capacity_blocks_onboarded")) return;
      toast.error(e.message || "Could not save your preference");
    },
  });

  const handleAdd = () => {
    onAddCommitment();
    addMutation.mutate();
  };

  const handleDismiss = () => {
    onDismiss();
    dismissMutation.mutate();
  };

  return (
    <div className="mb-5 rounded-xl border border-border bg-cream px-5 py-5">
      <p className="font-display text-base text-ch">
        Do you have any regular commitments outside of your design firm that affect when you can work?
      </p>
      <ul className="mt-3 space-y-1 font-sans text-xs text-muted-foreground">
        <li>A part-time job or second career</li>
        <li>A weekly class or standing appointment</li>
        <li>A seasonal busy period or school-year schedule</li>
        <li>Travel, caregiving, or religious observance</li>
        <li>A conference or one-time event</li>
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleAdd}
          disabled={addMutation.isPending}
          className="cursor-pointer rounded-lg bg-ch px-4 py-2 font-sans text-xs font-medium text-white"
        >
          Yes, add a commitment
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={dismissMutation.isPending}
          className="cursor-pointer rounded-lg border border-border bg-white px-4 py-2 font-sans text-xs text-ch"
        >
          No, I&apos;m all in
        </button>
      </div>
    </div>
  );
}
