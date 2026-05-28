import { Lock } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function TierLocked({
  tier,
  title,
  unlocks,
  blurb,
}: {
  tier: "studio" | "practice";
  title: string;
  unlocks: string[];
  blurb: string;
}) {
  const label = tier === "studio" ? "Studio" : "Practice";
  return (
    <div className="mx-auto max-w-2xl py-20 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-goldp">
        <Lock className="h-6 w-6 text-gold" />
      </div>
      <p className="mt-6 text-[11px] uppercase tracking-[0.25em] text-gold">
        Your next step when you're ready
      </p>
      <h2 className="mt-3 font-display text-4xl tracking-tight text-ch">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-ch/70">{blurb}</p>
      <ul className="mx-auto mt-6 max-w-md space-y-2 text-left text-sm text-ch/80">
        {unlocks.map((u) => (
          <li key={u} className="flex items-start gap-2">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-gold" />
            <span>{u}</span>
          </li>
        ))}
      </ul>
      <Link
        to="/billing"
        className="mt-8 inline-flex items-center justify-center rounded-md bg-gold px-6 py-3 text-sm font-medium text-white hover:bg-goldl"
      >
        Upgrade to {label}
      </Link>
      <p className="mt-4 text-xs text-ch/50">
        Time and project data is still tracked. It'll all be here when you unlock.
      </p>
    </div>
  );
}