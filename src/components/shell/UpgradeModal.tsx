import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";

type Tier = "foundation" | "studio" | "practice";

const TIER_DETAILS: Record<Tier, { name: string; tagline: string; solves: string; includes: string[] }> = {
  foundation: {
    name: "Foundation",
    tagline: "Your rate, your costs, your starting point.",
    solves: "Know what your rate needs to be to actually pay yourself.",
    includes: ["Dashboard", "Rate & Cost Architecture", "Growth Roadmap"],
  },
  studio: {
    name: "Studio",
    tagline: "Track where the hours actually go.",
    solves: "Stop guessing whether you're hitting your billable target each week.",
    includes: [
      "Everything in Foundation",
      "Time Calendar — log hours by project & activity",
      "Team utilization tracking",
      "Weekly billable target monitoring",
    ],
  },
  practice: {
    name: "Practice",
    tagline: "Project profitability, finally answered.",
    solves: "Find out which projects make money — and which quietly drain the studio.",
    includes: [
      "Everything in Studio",
      "Sightline — per-project profitability",
      "SOP Library — scope & phase benchmarks",
      "Pipeline planning & capacity forecasting",
    ],
  },
};

export function UpgradeModal({
  targetTier,
  currentTier,
  onClose,
}: {
  targetTier: Tier | null;
  currentTier: Tier;
  onClose: () => void;
}) {
  const open = targetTier !== null;
  const tier = targetTier ? TIER_DETAILS[targetTier] : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg border-border bg-white p-0">
        {tier && (
          <>
            <div className="bg-goldp/60 px-7 pt-7 pb-5">
              <p className="text-[11px] uppercase tracking-[0.22em] text-gold">
                Your next step when you're ready
              </p>
              <DialogHeader className="mt-2 space-y-2 text-left">
                <DialogTitle className="font-display text-3xl tracking-tight text-ch">
                  {tier.name}
                </DialogTitle>
                <DialogDescription className="font-display text-lg italic text-ch/70">
                  {tier.tagline}
                </DialogDescription>
              </DialogHeader>
            </div>
            <div className="space-y-5 px-7 pb-7 pt-5">
              <p className="text-sm leading-relaxed text-ch/80">{tier.solves}</p>
              <ul className="space-y-2.5">
                {tier.includes.map((line) => (
                  <li key={line} className="flex items-start gap-2.5 text-sm text-ch">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-ch/50">
                  Currently on <span className="font-medium capitalize text-ch/70">{currentTier}</span>
                </span>
                <Link
                  to="/billing"
                  onClick={onClose}
                  className="inline-flex items-center justify-center rounded-md bg-gold px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-goldl"
                >
                  Upgrade to {tier.name}
                </Link>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}