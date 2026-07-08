import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { getBillingSummary, createBillingPortalSession } from "@/lib/billing.functions";
import { getStripeEnvironment, paymentsConfigured } from "@/lib/stripe";
import { StripeEmbeddedCheckoutPane } from "@/components/billing/StripeEmbeddedCheckout";
import { CHECKOUT_PRICE_KEYS, type CheckoutPriceKey, type Tier } from "@/lib/stripe.server";

type Plan = {
  priceKey: CheckoutPriceKey;
  tier: Tier;
  name: string;
  price: string;
  blurb: string;
  features: string[];
  earlyAccess?: boolean;
};

const PLANS: Plan[] = [
  {
    priceKey: "sightline_foundation_monthly",
    tier: "foundation",
    name: "Foundation",
    price: "$39/mo",
    blurb: "Financial fundamentals.",
    features: ["Firm financial dashboard", "Aligned hourly rate", "Budget vs actual", "Scenario planning"],
  },
  {
    priceKey: "sightline_studio_monthly_v2",
    tier: "studio",
    name: "Studio",
    price: "$79/mo",
    blurb: "Foundation plus time & utilization.",
    features: ["Mon–Sun time calendar", "Per-user & combined views", "Live utilization", "Everything in Foundation"],
  },
  {
    priceKey: "sightline_practice_monthly_v2",
    tier: "practice",
    name: "Practice",
    price: "$129/mo",
    blurb: "The full operating picture.",
    features: ["Project profitability", "SOP library", "Scope-creep in dollars", "Everything in Studio"],
  },
  {
    priceKey: "sightline_early_foundation_monthly",
    tier: "foundation",
    name: "Early Access — Foundation",
    price: "$39/mo",
    blurb: "Foundation features, price locked for life.",
    features: ["Everything in Foundation", "Rate locked for the life of your subscription"],
    earlyAccess: true,
  },
  {
    priceKey: "sightline_early_practice_monthly",
    tier: "practice",
    name: "Early Access — Practice",
    price: "$79/mo",
    blurb: "Practice features at a founding-customer rate, locked for life.",
    features: ["Everything in Practice", "Rate locked for the life of your subscription"],
    earlyAccess: true,
  },
];

function isCheckoutPriceKey(v: unknown): v is CheckoutPriceKey {
  return typeof v === "string" && (CHECKOUT_PRICE_KEYS as readonly string[]).includes(v);
}

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({ meta: [{ title: "Billing — Sightline" }] }),
  validateSearch: (s: Record<string, unknown>): { priceKey?: CheckoutPriceKey } => ({
    priceKey: isCheckoutPriceKey(s.priceKey) ? s.priceKey : undefined,
  }),
  component: BillingPage,
});

function BillingPage() {
  const { priceKey: initialPriceKey } = Route.useSearch();
  const fetchSummary = useServerFn(getBillingSummary);
  const openPortal = useServerFn(createBillingPortalSession);
  const queryClient = useQueryClient();

  const summaryQ = useQuery({
    queryKey: ["billing-summary"],
    queryFn: () => fetchSummary(),
  });

  // After Stripe redirects back with ?checkout=success, poll for the webhook
  // to catch up (usually <2s). Clean the URL when done.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return;
    toast.success("Payment received — finalising your subscription…");
    let tries = 0;
    const maxTries = 8;
    const interval = window.setInterval(async () => {
      tries++;
      const fresh = await queryClient.fetchQuery({
        queryKey: ["billing-summary"],
        queryFn: () => fetchSummary(),
        staleTime: 0,
      });
      if (fresh?.stripe_subscription_id || tries >= maxTries) {
        window.clearInterval(interval);
        if (fresh?.stripe_subscription_id) toast.success("Subscription active.");
        params.delete("checkout");
        const q = params.toString();
        window.history.replaceState({}, "", `/billing${q ? `?${q}` : ""}`);
      }
    }, 1500);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [checkoutPriceKey, setCheckoutPriceKey] = useState<CheckoutPriceKey | null>(
    initialPriceKey ?? null,
  );
  const [portalPending, setPortalPending] = useState(false);

  const checkoutPlan = checkoutPriceKey
    ? PLANS.find((p) => p.priceKey === checkoutPriceKey) ?? null
    : null;

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
        {checkoutPlan && configured && (
          <div className="mb-8 rounded-lg border border-border bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-display text-lg">Subscribe to {checkoutPlan.name}</div>
              <button
                onClick={() => setCheckoutPriceKey(null)}
                className="text-sm text-ch/60 hover:text-ch"
              >
                Cancel
              </button>
            </div>
            <StripeEmbeddedCheckoutPane
              priceKey={checkoutPlan.priceKey}
              returnUrl={`${window.location.origin}/billing?checkout=success`}
            />
          </div>
        )}

        {/* Plan cards */}
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
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
                key={p.priceKey}
                className={`relative flex flex-col rounded-lg border bg-white p-5 ${
                  isCurrent
                    ? "border-gold ring-1 ring-gold/30"
                    : p.earlyAccess
                      ? "border-gold/50"
                      : "border-border"
                }`}
              >
                {p.earlyAccess && (
                  <div className="mb-2 inline-flex w-fit items-center rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-gold">
                    Early Access · locked for life
                  </div>
                )}
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
                    onClick={() => setCheckoutPriceKey(p.priceKey)}
                    disabled={!configured}
                    className={`mt-5 rounded-[4px] px-4 py-2 text-[12px] font-medium text-white disabled:opacity-50 ${
                      p.earlyAccess ? "bg-ch hover:opacity-90" : "bg-gold hover:bg-goldl"
                    }`}
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