import { toast } from "sonner";
import type { CostReviewNotifications } from "@/lib/cost-review.utils";

type NavigateFn = (opts: { to: string }) => void;

let navigateFn: NavigateFn | null = null;

/** Register SPA navigate for toast action links (call once from settings/dashboard). */
export function registerCostReviewNavigate(fn: NavigateFn) {
  navigateFn = fn;
}

function goToSightline() {
  if (navigateFn) navigateFn({ to: "/sightline" });
  else if (typeof window !== "undefined") window.location.assign("/sightline");
}

function sageToastStyle() {
  return {
    borderLeft: "3px solid var(--success)",
    background: "rgba(92,138,110,0.08)",
  } as const;
}

function goldToastStyle() {
  return {
    borderLeft: "3px solid var(--gold)",
    background: "rgba(184,134,11,0.08)",
  } as const;
}

export function showCostReviewNotifications(payload: CostReviewNotifications | null | undefined) {
  if (!payload) return;

  if (payload.rateChange) {
    const { previousRate, newRate, delta, direction } = payload.rateChange;
    const prev = Math.round(previousRate);
    const next = Math.round(newRate);
    const change = Math.abs(Math.round(delta));
    const isUp = direction === "up";

    toast("Your aligned rate updated", {
      description: `It moved from $${prev}/hr to $${next}/hr — ${isUp ? "up" : "down"} $${change}/hr.`,
      duration: 6000,
      style: isUp ? sageToastStyle() : goldToastStyle(),
    });
  }

  if (payload.affectedProjects && payload.affectedProjects.count > 0) {
    const n = payload.affectedProjects.count;
    toast("Check your active projects", {
      description: `${n} project${n === 1 ? "" : "s"} were quoted at a different cost structure. Worth a quick review.`,
      duration: 8000,
      style: goldToastStyle(),
      action: {
        label: "Review projects →",
        onClick: goToSightline,
      },
    });
  }
}

export function showCostReviewConfirmedToast() {
  toast("Got it — your cost structure is up to date.", {
    duration: 3000,
    style: sageToastStyle(),
  });
}
