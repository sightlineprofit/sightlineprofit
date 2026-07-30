import { toast } from "sonner";

export type TeamCapacityToastPayload = {
  totalAnnualHrs: number;
};

export function showTeamCapacityToast(payload: TeamCapacityToastPayload | null | undefined) {
  if (!payload?.totalAnnualHrs) return;
  const hrs = Math.round(payload.totalAnnualHrs).toLocaleString();
  toast.success(
    `Your aligned rate has been updated to reflect your team's hours. Your firm now has ${hrs} productive hours available this year.`,
    {
      duration: 6000,
      style: {
        borderLeft: "3px solid var(--success)",
        background: "rgba(92,138,110,0.08)",
      },
    },
  );
}

export function applyTeamCapacityFromResult(result: unknown) {
  if (!result || typeof result !== "object" || !("teamCapacityToast" in result)) return;
  showTeamCapacityToast(
    (result as { teamCapacityToast?: TeamCapacityToastPayload | null }).teamCapacityToast,
  );
}
