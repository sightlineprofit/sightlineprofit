import { Link } from "@tanstack/react-router";

const FOUNDING_PRICES = new Set([
  "sightline_founding_monthly",
  "sightline_founding_annual",
]);

type TrialBannerFirm = {
  trial_ends_at?: string | null;
  subscription_status?: string | null;
  onboarding_completed_at?: string | null;
  stripe_price_id?: string | null;
};

export function TrialBanner({ firm }: { firm: TrialBannerFirm | null | undefined }) {
  if (!firm) return null;
  const status = firm.subscription_status ?? null;
  const trialEndsAt = firm.trial_ends_at ?? null;
  if (!trialEndsAt || status !== "trialing") return null;

  // Suppress on the very first dashboard session (within 5 minutes of finishing onboarding).
  if (firm.onboarding_completed_at) {
    const completedAt = new Date(firm.onboarding_completed_at).getTime();
    if (Date.now() - completedAt < 5 * 60 * 1000) return null;
  }

  const msLeft = new Date(trialEndsAt).getTime() - Date.now();
  const daysLeft = Math.ceil(msLeft / 86400000);
  const isFounding = firm.stripe_price_id ? FOUNDING_PRICES.has(firm.stripe_price_id) : false;
  const priceLabel = isFounding ? "$39.99/mo" : "$69.99/mo";

  if (daysLeft <= 0) {
    return (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center px-6"
        style={{ background: "rgba(250,247,242,0.97)", backdropFilter: "blur(8px)" }}
      >
        <div className="mx-auto max-w-[440px] text-center">
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, color: "#2C2C2C", marginBottom: 14 }}>
            Your free trial has ended.
          </h2>
          <p style={{ fontFamily: "Jost, sans-serif", fontSize: 15, color: "#6B6259", lineHeight: 1.8, marginBottom: 6 }}>
            Activate your plan to continue. Your aligned rate, projects, and capacity history are safe and waiting for you.
          </p>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, color: "#2C2C2C" }}>
            {priceLabel}
          </div>
          <div style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: "#8A7F75", marginBottom: 28 }}>
            Cancel anytime.
          </div>
          <Link
            to="/billing"
            className="mx-auto block w-full max-w-[320px] rounded-[4px] bg-ch px-4 py-3 text-center text-sm font-medium text-white hover:opacity-90"
          >
            Activate my plan →
          </Link>
          <div style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: "#8A7F75", textAlign: "center", marginTop: 14 }}>
            Questions? hello@proposability.com
          </div>
        </div>
      </div>
    );
  }

  // Urgency scales with the 27-day trial: calm 10–27, moderate 5–9, high 1–4.
  const urgent = daysLeft <= 4;
  const bg = urgent ? "rgba(196,113,74,0.07)" : "rgba(184,134,11,0.06)";
  const border = urgent ? "#C4714A" : "#B8860B";
  const linkColor = urgent ? "#C4714A" : "#B8860B";

  let message: string;
  let ctaText: string;
  if (daysLeft >= 10) {
    message = `Your free trial ends in ${daysLeft} days.`;
    ctaText = "Activate my plan →";
  } else if (daysLeft >= 5) {
    message = `Your trial ends in ${daysLeft} days. Activate now to keep access to your rate architecture and projects.`;
    ctaText = "Activate my plan →";
  } else {
    message =
      daysLeft === 1
        ? "Your trial ends tomorrow. Add payment now to avoid losing access."
        : `Your trial ends in ${daysLeft} days. Add payment now to avoid losing access.`;
    ctaText = "Activate now →";
  }

  return (
    <div
      style={{
        background: bg,
        borderLeft: `2px solid ${border}`,
        borderRadius: "0 4px 4px 0",
        padding: "10px 14px",
      }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <span style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: "#2C2C2C" }}>
          {message}
        </span>
        <Link
          to="/billing"
          style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: linkColor }}
          className="hover:underline"
        >
          {ctaText}
        </Link>
      </div>
    </div>
  );
}