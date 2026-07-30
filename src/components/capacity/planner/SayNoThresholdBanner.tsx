import { useState } from "react";
import { Check } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { fmtUsd } from "@/lib/finance";
import { updateAcceptingNewClients } from "@/lib/capacity.functions";
import type { CapacityPlannerData } from "@/lib/capacity.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function SayNoThresholdBanner({
  data,
  firmId,
}: {
  data: CapacityPlannerData;
  firmId: string;
}) {
  const { sayNo, acceptingNewClients } = data;
  const qc = useQueryClient();
  const updateFn = useServerFn(updateAcceptingNewClients);
  const [confirmPause, setConfirmPause] = useState(false);
  const [untilDate, setUntilDate] = useState("");

  const mutation = useMutation({
    mutationFn: (payload: { accepting: boolean; until?: string | null }) =>
      updateFn({ data: { firmId, accepting: payload.accepting, until: payload.until ?? null } }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["capacity-planner", firmId] });
      qc.invalidateQueries({ queryKey: ["capacity-dashboard-summary", firmId] });
      setConfirmPause(false);
      toast.success(variables.accepting ? "Accepting new clients again" : "New inquiries paused");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (sayNo.thresholdReached) {
    return (
      <div className="mb-5 flex flex-col items-start justify-between gap-4 rounded-xl border border-success/25 bg-success/[0.06] px-5 py-4 sm:flex-row sm:items-center">
        <div>
          <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-success px-3 py-1 font-sans text-[11px] font-medium text-white">
            <Check className="h-3 w-3" />
            Revenue target reached
          </span>
          <h3 className="font-display text-base font-normal text-ch">
            You can say no from {sayNo.canDeclineFromStr ?? "now"} onward
          </h3>
          <p className="mt-1 max-w-xl font-sans text-xs leading-relaxed text-muted-foreground">
            Your committed projects cover your annual revenue target. Any new work you take is above
            and beyond your goal — not a financial requirement.
          </p>
        </div>

        <div className="shrink-0">
          {confirmPause && acceptingNewClients ? (
            <div className="rounded-lg border border-border bg-white p-4">
              <p className="font-sans text-xs text-ch">
                This will mark you as not accepting new clients.
              </p>
              <label className="mt-3 block font-sans text-[11px] text-muted-foreground">
                Until (optional)
                <Input
                  type="date"
                  value={untilDate}
                  onChange={(e) => setUntilDate(e.target.value)}
                  className="mt-1 h-8 text-xs"
                />
              </label>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  size="sm"
                  className="bg-ch text-white hover:bg-ch/90"
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate({ accepting: false, until: untilDate || null })
                  }
                >
                  Confirm
                </Button>
                <button
                  type="button"
                  className="font-sans text-xs text-muted-foreground underline"
                  onClick={() => setConfirmPause(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="cursor-pointer rounded-lg border border-success/40 bg-white px-[18px] py-2 font-sans text-xs font-medium text-success transition-colors hover:border-success"
              onClick={() => {
                if (acceptingNewClients) setConfirmPause(true);
                else mutation.mutate({ accepting: true });
              }}
              disabled={mutation.isPending}
            >
              {acceptingNewClients ? "Pause new inquiries" : "Resume accepting clients →"}
            </button>
          )}
        </div>
      </div>
    );
  }

  const pct =
    sayNo.annualRevenueTarget > 0
      ? Math.min(100, (sayNo.committedRevenue / sayNo.annualRevenueTarget) * 100)
      : 0;

  return (
    <div className="mb-5 flex flex-col items-start justify-between gap-3 rounded-xl border border-border bg-cream px-5 py-4 sm:flex-row sm:items-center">
      <div>
        <p className="font-sans text-[13px] text-ch">
          {fmtUsd(sayNo.committedRevenue, { decimals: 0 })} of{" "}
          {fmtUsd(sayNo.annualRevenueTarget, { decimals: 0 })} booked
        </p>
        <div
          className="mt-2 h-1 w-60 overflow-hidden rounded-sm border border-border bg-cream"
        >
          <div className="h-full bg-success" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <p className="font-sans text-xs text-muted-foreground">
        {Math.round(pct)}% of your revenue target is committed
      </p>
    </div>
  );
}
