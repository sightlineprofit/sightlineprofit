import { Link } from "@tanstack/react-router";

export function TrialBanner({ trialEndsAt, status }: { trialEndsAt: string; status: string }) {
  if (status !== "trialing") return null;
  const days = Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000));
  return (
    <div className="border-b border-border bg-goldp/60 px-6 py-2.5 text-sm text-ch">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <span>
          You're on a free trial — <span className="font-medium">{days} {days === 1 ? "day" : "days"} remaining</span>.
        </span>
        <Link to="/billing" className="font-medium text-gold underline-offset-4 hover:underline">
          Add billing details →
        </Link>
      </div>
    </div>
  );
}