import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getBillingSummary,
  activateSubscription,
  createBillingPortalSession,
} from "@/lib/billing.functions";
import { getStripeEnvironment, paymentsConfigured } from "@/lib/stripe";
import { StripeEmbeddedCheckoutPane } from "@/components/billing/StripeEmbeddedCheckout";
import { FOUNDING_PRICE_KEYS } from "@/lib/stripe.server";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({ meta: [{ title: "Activate your subscription — Sightline" }] }),
  component: BillingPage,
});

type Frequency = "monthly" | "annual";

const PRICE_TABLE = {
  founding: { monthly: 3999, annual: 39990, monthlyEquiv: 3333, save: 7998 },
  standard: { monthly: 6999, annual: 69990, monthlyEquiv: 5833, save: 13998 },
} as const;

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const fmtInt = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;

function BillingPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const fetchSummary = useServerFn(getBillingSummary);
  const activate = useServerFn(activateSubscription);
  const openPortal = useServerFn(createBillingPortalSession);

  const summaryQ = useQuery({
    queryKey: ["billing-summary"],
    queryFn: () => fetchSummary(),
  });

  const firm: any = summaryQ.data ?? null;
  const isFounding = firm?.stripe_price_id ? FOUNDING_PRICE_KEYS.has(firm.stripe_price_id) : false;
  const priceCol = isFounding ? PRICE_TABLE.founding : PRICE_TABLE.standard;

  const [freq, setFreq] = useState<Frequency>(
    (firm?.billing_frequency === "annual" ? "annual" : "monthly") as Frequency,
  );
  const [showCardEntry, setShowCardEntry] = useState(false);
  const [saving, setSaving] = useState(false);
  const [portalPending, setPortalPending] = useState(false);

  const cents = priceCol[freq];
  const trialEnd = firm?.trial_ends_at ? new Date(firm.trial_ends_at) : null;
  const trialLabel = trialEnd
    ? trialEnd.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
    : "your trial end date";

  const hasCard = !!firm?.card;
  const hasSubscription = !!firm?.stripe_subscription_id;
  const configured = paymentsConfigured();

  const priceDisplay = useMemo(() => {
    if (freq === "monthly") return `${fmt(cents)}/month`;
    return `${fmt(cents)}/year`;
  }, [freq, cents]);

  async function handleActivate() {
    if (!hasCard) {
      setShowCardEntry(true);
      return;
    }
    setSaving(true);
    try {
      const res = await activate({
        data: { frequency: freq, environment: getStripeEnvironment() },
      });
      if ("error" in res) throw new Error(res.error);
      toast.success("Subscription activated.");
      qc.invalidateQueries({ queryKey: ["billing-summary"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      nav({ to: "/dashboard" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not activate subscription.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePortal() {
    setPortalPending(true);
    try {
      const res = await openPortal({
        data: { returnUrl: `${window.location.origin}/billing`, environment: getStripeEnvironment() },
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
    <div style={{ background: "#FAF7F2", minHeight: "100vh", padding: "60px 24px" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        {/* Wordmark */}
        <div className="mb-8 text-center">
          <Link
            to="/dashboard"
            style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: "#2C2C2C" }}
          >
            Sightline
          </Link>
        </div>

        {hasSubscription ? (
          <ActiveSubscription firm={firm} portalPending={portalPending} onPortal={handlePortal} />
        ) : (
          <>
            <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, color: "#2C2C2C", marginBottom: 8 }}>
              Activate your subscription
            </h1>
            <p
              style={{
                fontFamily: "Jost, sans-serif",
                fontSize: 14,
                color: "#6B6259",
                lineHeight: 1.7,
                marginBottom: 28,
              }}
            >
              You're currently on a free trial. Add payment details to continue after {trialLabel}.
            </p>

            {/* Plan summary */}
            <div
              style={{
                background: "rgba(184,134,11,0.07)",
                border: "0.5px solid rgba(184,134,11,0.20)",
                borderRadius: 4,
                padding: "20px 18px",
                marginBottom: 20,
              }}
            >
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: "#2C2C2C" }}>
                Sightline by Propos'Ability
              </div>
              <div style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: "#6B6259", marginTop: 2 }}>
                Full access · Unlimited team members
              </div>

              <FrequencyToggle value={freq} onChange={setFreq} />

              <div className="mt-3">
                <div
                  style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: 22,
                    color: "#2C2C2C",
                  }}
                >
                  {priceDisplay}
                </div>
                {freq === "annual" && (
                  <div style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: "#5C8A6E", marginTop: 2 }}>
                    {fmt(priceCol.monthlyEquiv)}/mo · Save {fmt(priceCol.save)}/yr
                  </div>
                )}
                {isFounding && (
                  <div style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: "#5C8A6E", marginTop: 4 }}>
                    Founding rate — locked permanently.
                  </div>
                )}
              </div>
            </div>

            {/* Trial reminder */}
            <div
              style={{
                background: "rgba(92,138,110,0.07)",
                border: "0.5px solid rgba(92,138,110,0.20)",
                borderRadius: 4,
                padding: "12px 14px",
                marginBottom: 20,
                fontFamily: "Jost, sans-serif",
                fontSize: 13,
                color: "#2C2C2C",
              }}
            >
              Your card will not be charged today. We'll charge {fmt(cents)} on {trialLabel}.
            </div>

            {/* Card section */}
            {hasCard && !showCardEntry ? (
              <div className="mb-5">
                <div style={{ fontFamily: "Jost, sans-serif", fontSize: 13, color: "#6B6259" }}>
                  Card on file: •••• •••• •••• {firm.card.last4}
                </div>
                <div style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: "#8A7F75", marginTop: 2 }}>
                  {firm.card.brand} expires{" "}
                  {String(firm.card.exp_month).padStart(2, "0")}/{String(firm.card.exp_year).slice(-2)}
                </div>
                <button
                  type="button"
                  onClick={() => setShowCardEntry(true)}
                  style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: "#B8860B", marginTop: 6 }}
                  className="hover:underline"
                >
                  Use a different card
                </button>
              </div>
            ) : configured ? (
              <div className="mb-5">
                <StripeEmbeddedCheckoutPane
                  priceKey={
                    (isFounding
                      ? freq === "annual"
                        ? "sightline_founding_annual"
                        : "sightline_founding_monthly"
                      : freq === "annual"
                        ? "sightline_standard_annual"
                        : "sightline_standard_monthly") as any
                  }
                  returnUrl={`${window.location.origin}/dashboard?checkout=success`}
                />
                {hasCard && (
                  <button
                    type="button"
                    onClick={() => setShowCardEntry(false)}
                    style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: "#6B6259", marginTop: 6 }}
                    className="hover:underline"
                  >
                    Use saved card instead
                  </button>
                )}
              </div>
            ) : (
              <div className="mb-5 text-sm text-danger">Payments aren't configured for this build yet.</div>
            )}

            {/* Activate button */}
            {hasCard && !showCardEntry && (
              <button
                type="button"
                onClick={handleActivate}
                disabled={saving}
                className="w-full rounded-[4px] bg-ch py-3 text-white hover:opacity-90 disabled:opacity-50"
                style={{ fontFamily: "Jost, sans-serif", fontSize: 14 }}
              >
                {saving
                  ? "Activating…"
                  : freq === "monthly"
                    ? `Activate at ${fmt(cents)}/month →`
                    : `Activate at ${fmt(cents)}/year →`}
              </button>
            )}

            <div
              style={{
                fontFamily: "Jost, sans-serif",
                fontSize: 11,
                color: "#8A7F75",
                textAlign: "center",
                marginTop: 10,
              }}
            >
              {freq === "monthly"
                ? `You'll be charged ${fmt(cents)}/mo starting ${trialLabel}. Cancel anytime from Settings.`
                : `You'll be charged ${fmt(cents)} on ${trialLabel} and annually thereafter. Equivalent to ${fmt(priceCol.monthlyEquiv)}/mo.`}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FrequencyToggle({ value, onChange }: { value: Frequency; onChange: (v: Frequency) => void }) {
  return (
    <div
      className="mt-4 inline-flex rounded-full border p-0.5"
      style={{ borderColor: "rgba(44,44,44,0.15)", background: "white" }}
    >
      {(["monthly", "annual"] as Frequency[]).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className="rounded-full px-4 py-1"
          style={{
            fontFamily: "Jost, sans-serif",
            fontSize: 11,
            background: value === v ? "#B8860B" : "transparent",
            color: value === v ? "white" : "#6B6259",
          }}
        >
          {v === "monthly" ? "Monthly" : "Annual"}
          {v === "annual" && (
            <span
              className="ml-1.5 rounded-full px-1.5 py-0.5"
              style={{
                background: value === "annual" ? "rgba(255,255,255,0.25)" : "rgba(92,138,110,0.15)",
                color: value === "annual" ? "white" : "#5C8A6E",
                fontSize: 9,
              }}
            >
              2 months free
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function ActiveSubscription({
  firm,
  portalPending,
  onPortal,
}: {
  firm: any;
  portalPending: boolean;
  onPortal: () => void;
}) {
  const isFounding = firm?.stripe_price_id ? FOUNDING_PRICE_KEYS.has(firm.stripe_price_id) : false;
  const freq: Frequency = firm?.billing_frequency === "annual" ? "annual" : "monthly";
  const priceCol = isFounding ? PRICE_TABLE.founding : PRICE_TABLE.standard;
  const cents = priceCol[freq];

  return (
    <div>
      <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, color: "#2C2C2C", marginBottom: 8 }}>
        Your subscription
      </h1>
      <p
        style={{
          fontFamily: "Jost, sans-serif",
          fontSize: 14,
          color: "#6B6259",
          lineHeight: 1.7,
          marginBottom: 28,
        }}
      >
        Sightline by Propos'Ability — {freq === "annual" ? "Annual" : "Monthly"} billing at {fmt(cents)}.
      </p>

      {isFounding && (
        <div style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: "#5C8A6E", marginBottom: 14 }}>
          Founding rate — locked permanently.
        </div>
      )}

      <button
        type="button"
        onClick={onPortal}
        disabled={portalPending}
        className="w-full rounded-[4px] border border-border bg-white py-2.5 hover:bg-cream disabled:opacity-50"
        style={{ fontFamily: "Jost, sans-serif", fontSize: 13 }}
      >
        {portalPending ? "Opening…" : "Manage billing in Stripe portal"}
      </button>

      <div className="mt-6 text-center">
        <Link to="/settings" style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: "#B8860B" }}>
          Switch billing frequency in Settings →
        </Link>
      </div>
    </div>
  );
}
