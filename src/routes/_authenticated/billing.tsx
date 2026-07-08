import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { getBillingSummary, createBillingPortalSession } from "@/lib/billing.functions";
import { getStripeEnvironment, paymentsConfigured } from "@/lib/stripe";
import { StripeEmbeddedCheckoutPane } from "@/components/billing/StripeEmbeddedCheckout";

type Tier = "foundation" | "studio" | "practice";

const PLANS: { tier: Tier; name: string; price: string; blurb: string; features: string[] }[] = [
  {
    tier: "foundation",
    name: "Foundation",
    price: "$39/mo",
    blurb: "Financial fundamentals.",
    features: ["Firm financial dashboard", "Aligned hourly rate", "Budget vs actual", "Scenario planning"],
  },
  {
    tier: "studio",
    name: "Studio",
    price: "$89/mo",
    blurb: "Foundation plus time & utilization.",
    features: ["Mon–Sun time calendar", "Per-user & combined views", "Live utilization", "Everything in Foundation"],
  },
  {
    tier: "practice",
    name: "Practice",
    price: "$149/mo",
    blurb: "The full operating picture.",
    features: ["Project profitability", "SOP library", "Scope-creep in dollars", "Everything in Studio"],
  },
];

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({ meta: [{ title: "Billing — Sightline" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    tier: (s.tier as Tier | undefined) ?? undefined,
  }),
  component: BillingPage,
});

function BillingPage() {
  const { tier: initialTier } = Route.useSearch();
  const fetchSummary = useServerFn(getBillingSummary);
  const openPortal = useServerFn(createBillingPortalSession);

  const summaryQ = useQuery({
    queryKey: ["billing-summary"],
    queryFn: () => fetchSummary(),
  });

  const [checkoutTier, setCheckoutTier] = useState<Tier | null>(initialTier ?? null);
  const [portalPending, setPortalPending] = useState(false);

  const configured = paymentsConfigured();
  const firm = summaryQ.data ?? null;
  const status = firm?.subscription_status ?? null;
  const currentTier = firm?.subscription_tier ?? null;
  const hasSubscription = !!firm?.stripe_subscription_id;
  const trialEnds = firm?.trial_ends_at ? new Date(firm.trial_ends_at) : null;
  const trialActive = status === "trialing" && trialEnds && trialEnds > new Date() && !hasSubscription;

  async function handlePortal() {
    setPortalPending(true);
    try {
      const res = await openPortal({
        data: {
          returnUrl: `${window.location.origin}/billing`,
          environment: getStripeEnvironment(),
        },
      });
      if ("error" in res) throw new Error(res.error);
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open billing portal");
    } finally {
      setPortalPending(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream px-6 py-12 text-ch">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-4xl tracking-tight">Billing</h1>
            <p className="mt-2 text-sm text-ch/70">Manage your Sightline subscription.</p>
          </div>
          <Link to="/dashboard" className="text-sm text-gold hover:text-goldl">← Back to dashboard</Link>
        </div>

        {!configured && (
          <div className="mb-6 rounded-md border border-orange-300 bg-orange-50 p-4 text-sm text-orange-900">
            Payments aren't configured for this build yet. Complete Stripe go-live to enable checkout.
          </div>
        )}

        {/* Status card */}
        <div className="mb-8 rounded-lg border border-border bg-white p-5">
          {summaryQ.isLoading ? (
            <p className="text-sm text-ch/60">Loading…</p>
          ) : !firm ? (
            <p className="text-sm text-ch/70">No firm found.</p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-ch/50">Current plan</div>
                <div className="mt-1 font-display text-2xl capitalize">
                  {currentTier ?? "—"}{" "}
                  <span className="text-sm font-normal text-ch/60">
                    · {status === "past_due" ? "payment failed" : status ?? "—"}
                  </span>
                </div>
                {trialActive && trialEnds && (
                  <div className="mt-1 text-sm text-ch/70">
                    Trial ends {trialEnds.toLocaleDateString()}
                  </div>
                )}
                {status === "past_due" && (
                  <div className="mt-1 text-sm text-danger">
                    Your last payment failed — update it in the billing portal.
                  </div>
                )}
              </div>
              {hasSubscription && (
                <button
                  onClick={handlePortal}
                  disabled={portalPending}
                  className="rounded-[4px] border border-border bg-white px-4 py-2 text-[12px] hover:bg-cream disabled:opacity-50"
                >
                  {portalPending ? "Opening…" : "Manage billing"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Checkout pane */}
        {checkoutTier && configured && (
          <div className="mb-8 rounded-lg border border-border bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-display text-lg capitalize">Subscribe to {checkoutTier}</div>
              <button
                onClick={() => setCheckoutTier(null)}
                className="text-sm text-ch/60 hover:text-ch"
              >
                Cancel
              </button>
            </div>
            <StripeEmbeddedCheckoutPane
              tier={checkoutTier}
              returnUrl={`${window.location.origin}/billing?checkout=success`}
            />
          </div>
        )}

        {/* Plan cards */}
        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((p) => {
            const isCurrent = currentTier === p.tier && hasSubscription;
            const cta = !hasSubscription
              ? trialActive
                ? "Start subscription"
                : "Subscribe"
              : isCurrent
                ? "Current plan"
                : "Switch to this plan";
            return (
              <div
                key={p.tier}
                className={`flex flex-col rounded-lg border bg-white p-5 ${
                  isCurrent ? "border-gold ring-1 ring-gold/30" : "border-border"
                }`}
              >
                <div className="font-display text-xl">{p.name}</div>
                <div className="mt-1 text-2xl">{p.price}</div>
                <p className="mt-2 text-sm text-ch/70">{p.blurb}</p>
                <ul className="mt-4 flex-1 space-y-1.5 text-sm text-ch/80">
                  {p.features.map((f) => (
                    <li key={f}>• {f}</li>
                  ))}
                </ul>
                {isCurrent && hasSubscription ? (
                  <button
                    onClick={handlePortal}
                    disabled={portalPending}
                    className="mt-5 rounded-[4px] border border-border bg-white px-4 py-2 text-[12px] hover:bg-cream disabled:opacity-50"
                  >
                    {portalPending ? "Opening…" : "Manage in portal"}
                  </button>
                ) : hasSubscription ? (
                  <button
                    onClick={handlePortal}
                    disabled={portalPending || !configured}
                    className="mt-5 rounded-[4px] bg-ch px-4 py-2 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {cta}
                  </button>
                ) : (
                  <button
                    onClick={() => setCheckoutTier(p.tier)}
                    disabled={!configured}
                    className="mt-5 rounded-[4px] bg-gold px-4 py-2 text-[12px] font-medium text-white hover:bg-goldl disabled:opacity-50"
                  >
                    {cta}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-xs text-ch/50">
          Prices in USD. Taxes calculated at checkout. Cancel anytime from the billing portal.
        </p>
      </div>
    </div>
  );
}