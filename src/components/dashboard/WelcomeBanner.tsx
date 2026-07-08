import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { dismissWelcomeBanner } from "@/lib/firm.functions";
import { X } from "lucide-react";

type Firm = {
  onboarding_completed_at?: string | null;
  welcome_banner_dismissed?: boolean | null;
} | null | undefined;

/** Sage-bordered welcome banner shown only immediately after onboarding. */
export function WelcomeBanner({ firm, firstName }: { firm: Firm; firstName: string }) {
  const dismiss = useServerFn(dismissWelcomeBanner);
  const qc = useQueryClient();
  const [hidden, setHidden] = useState(false);

  if (!firm || hidden) return null;
  if (firm.welcome_banner_dismissed) return null;
  if (!firm.onboarding_completed_at) return null;
  const ageMs = Date.now() - new Date(firm.onboarding_completed_at).getTime();
  if (ageMs > 5 * 60 * 1000) return null;

  async function onDismiss() {
    setHidden(true);
    try {
      await dismiss();
      qc.invalidateQueries({ queryKey: ["me"] });
    } catch {
      /* non-fatal */
    }
  }

  return (
    <div
      className="mb-3.5 flex items-center justify-between rounded-md px-[18px] py-[14px]"
      style={{
        background: "rgba(92,138,110,0.07)",
        border: "0.5px solid rgba(92,138,110,0.20)",
      }}
    >
      <div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: "#2C2C2C" }}>
          Welcome to Sightline, {firstName}.
        </div>
        <div style={{ fontFamily: "Jost, sans-serif", fontSize: 13, color: "#6B6259", marginTop: 2 }}>
          Your aligned rate is ready. Here's what it means.
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Link
          to="/rate-architecture"
          style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: "#B8860B" }}
          className="hover:underline"
        >
          Explore your numbers →
        </Link>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-ch/40 hover:text-ch"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
