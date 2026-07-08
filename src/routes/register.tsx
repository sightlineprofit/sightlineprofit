import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { getFoundingQuote, type FoundingBillingFrequency } from "@/lib/founding.functions";
import { StripeEmbeddedCheckoutPane } from "@/components/billing/StripeEmbeddedCheckout";
import { getBillingSummary } from "@/lib/billing.functions";
import type { CheckoutPriceKey } from "@/lib/stripe.server";

type Step = "account" | "payment";

export const Route = createFileRoute("/register")({
  head: () => ({ meta: [{ title: "Start your trial — Sightline" }] }),
  validateSearch: (
    s: Record<string, unknown>,
  ): { billing?: FoundingBillingFrequency; step?: Step } => ({
    billing: s.billing === "annual" ? "annual" : s.billing === "monthly" ? "monthly" : undefined,
    step: s.step === "payment" ? "payment" : s.step === "account" ? "account" : undefined,
  }),
  component: RegisterPage,
});

// ────────────────────────────────────────────── shared bits ──

const PAGE_BG = "#FAF7F2";

function Wordmark() {
  return (
    <Link to="/" className="mx-auto flex flex-col items-center gap-0.5 text-center">
      <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: "#2C2C2C" }}>Sightline</span>
      <span
        style={{
          fontFamily: "Jost, sans-serif",
          fontSize: 10,
          color: "#8A7F75",
          textTransform: "uppercase",
          letterSpacing: "0.14em",
        }}
      >
        by Propos'Ability
      </span>
    </Link>
  );
}

function Progress({ current }: { current: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: "account", label: "Your account" },
    { id: "payment", label: "Payment" },
  ];
  const currentIdx = steps.findIndex((s) => s.id === current);
  return (
    <div className="mt-6 flex items-center justify-center gap-3">
      {steps.map((s, i) => {
        const state: "active" | "done" | "upcoming" =
          i < currentIdx ? "done" : i === currentIdx ? "active" : "upcoming";
        const color = state === "active" ? "#B8860B" : state === "done" ? "#2C2C2C" : "#B9AFA4";
        return (
          <div key={s.id} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: state === "upcoming" ? "transparent" : color,
                  border: `1px solid ${color}`,
                }}
              />
              <span
                style={{
                  fontFamily: "Jost, sans-serif",
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color,
                }}
              >
                {i + 1} · {state === "done" ? "✓ " : ""}
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && <span style={{ width: 24, height: 1, background: "#D9D2C6" }} />}
          </div>
        );
      })}
    </div>
  );
}

const fieldInputStyle: React.CSSProperties = {
  border: "0.5px solid rgba(44,44,44,0.18)",
  borderRadius: 2,
  padding: "12px 14px",
  fontFamily: "Jost, sans-serif",
  fontSize: 14,
  color: "#2C2C2C",
  background: "#FFFFFF",
  width: "100%",
  outline: "none",
};

const fieldLabelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "Jost, sans-serif",
  fontSize: 11,
  fontWeight: 500,
  color: "#2C2C2C",
  marginBottom: 6,
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={fieldLabelStyle}>{label}</label>
      {children}
    </div>
  );
}

// ────────────────────────────────────────────── page ──

function RegisterPage() {
  const search = Route.useSearch();
  const nav = useNavigate();

  const [ownerName, setOwnerName] = useState("");
  const [firmName, setFirmName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [frequency, setFrequency] = useState<FoundingBillingFrequency>(
    search.billing === "annual" ? "annual" : "monthly",
  );
  const [step, setStep] = useState<Step>(search.step === "payment" ? "payment" : "account");
  const [busy, setBusy] = useState(false);

  const quoteFn = useServerFn(getFoundingQuote);
  const billingSummaryFn = useServerFn(getBillingSummary);

  // Live founding-slot / price quote for the currently-selected frequency.
  const quote = useQuery({
    queryKey: ["founding-quote", frequency],
    queryFn: () => quoteFn({ data: { frequency } }),
    staleTime: 30_000,
  });

  // If we land on step=payment, we must already have a session + firm.
  const currentFirm = useQuery({
    queryKey: ["register-firm"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return null;
      return billingSummaryFn();
    },
    enabled: step === "payment",
  });

  // If step is payment but there's no session yet (e.g. hard refresh),
  // send them back to step 1.
  useEffect(() => {
    if (step !== "payment") return;
    if (currentFirm.isLoading) return;
    if (!currentFirm.data) {
      setStep("account");
    }
  }, [step, currentFirm.data, currentFirm.isLoading]);

  // Persist the frequency toggle to the URL so back-button behaves.
  useEffect(() => {
    if (search.billing !== frequency) {
      nav({
        to: "/register",
        search: { billing: frequency, step },
        replace: true,
      });
    }
  }, [frequency, step, nav, search.billing]);

  // ─────────────── Step 1 submit ───────────────
  const submitAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerName.trim() || !firmName.trim()) {
      toast.error("Enter your name and firm name.");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (!quote.data) {
      toast.error("Fetching pricing… try again in a moment.");
      return;
    }
    setBusy(true);
    // Stash pending firm details BEFORE signUp so post-auth can pick them
    // up whether Supabase auto-confirms the session or requires a click.
    sessionStorage.setItem(
      "sightline_pending_firm",
      JSON.stringify({
        firmName,
        ownerName,
        billingFrequency: frequency,
        stripePriceId: quote.data.priceId,
        needsPayment: true,
      }),
    );
    const { data: signUp, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin + "/post-auth",
        data: { name: ownerName, firm_name: firmName },
      },
    });
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    if (!signUp.session) {
      setBusy(false);
      toast.success("Check your email to confirm, then finish setting up payment.");
      return;
    }
    // Session established immediately (auto-confirm on). Route through
    // /post-auth so the firm gets created, then it bounces us back to
    // /register?step=payment.
    nav({ to: "/post-auth" });
  };

  const onGoogle = async () => {
    if (!quote.data) {
      toast.error("Fetching pricing… try again in a moment.");
      return;
    }
    sessionStorage.setItem(
      "sightline_pending_firm",
      JSON.stringify({
        firmName: firmName || "",
        ownerName: ownerName || "",
        billingFrequency: frequency,
        stripePriceId: quote.data.priceId,
        needsPayment: true,
      }),
    );
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/post-auth",
    });
    if (result.error) {
      toast.error(result.error.message || "Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    window.location.href = "/post-auth";
  };

  // ─────────────── UI helpers ───────────────
  const trialEndDate = useMemo(() => {
    const d = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }, []);

  return (
    <div className="min-h-screen" style={{ background: PAGE_BG }}>
      <main
        style={{
          maxWidth: 480,
          margin: "0 auto",
          padding: "60px 24px",
          color: "#2C2C2C",
        }}
      >
        <Wordmark />
        <Progress current={step} />

        {step === "account" ? (
          <StepAccount
            ownerName={ownerName}
            setOwnerName={setOwnerName}
            firmName={firmName}
            setFirmName={setFirmName}
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            showPw={showPw}
            setShowPw={setShowPw}
            onSubmit={submitAccount}
            onGoogle={onGoogle}
            busy={busy}
          />
        ) : (
          <StepPayment
            firmPriceId={currentFirm.data?.stripe_price_id ?? quote.data?.priceId ?? null}
            frequency={frequency}
            setFrequency={setFrequency}
            quote={quote.data}
            trialEndDate={trialEndDate}
            loadingFirm={currentFirm.isLoading}
          />
        )}

        <p
          className="mt-6 text-center"
          style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: "#B8860B" }}
        >
          Already have an account?{" "}
          <Link to="/login" style={{ color: "#B8860B", textDecoration: "none" }}>
            Sign in →
          </Link>
        </p>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────── step 1 ──

function StepAccount(props: {
  ownerName: string;
  setOwnerName: (v: string) => void;
  firmName: string;
  setFirmName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  showPw: boolean;
  setShowPw: (v: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
  onGoogle: () => void;
  busy: boolean;
}) {
  return (
    <form onSubmit={props.onSubmit} className="mt-8">
      <h2
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 24,
          color: "#2C2C2C",
          marginBottom: 6,
        }}
      >
        Create your account
      </h2>
      <p style={{ fontFamily: "Jost, sans-serif", fontSize: 13, color: "#6B6259", marginBottom: 24 }}>
        Your 14-day free trial starts the moment you finish signing up.
      </p>

      <Field label="Your name">
        <input
          style={fieldInputStyle}
          placeholder="First and last name"
          value={props.ownerName}
          onChange={(e) => props.setOwnerName(e.target.value)}
          required
          maxLength={120}
        />
      </Field>
      <Field label="Firm name">
        <input
          style={fieldInputStyle}
          placeholder="Your studio name"
          value={props.firmName}
          onChange={(e) => props.setFirmName(e.target.value)}
          required
          maxLength={120}
        />
      </Field>
      <Field label="Email address">
        <input
          style={fieldInputStyle}
          type="email"
          placeholder="you@yourstudio.com"
          value={props.email}
          onChange={(e) => props.setEmail(e.target.value)}
          required
        />
      </Field>
      <Field label="Password">
        <div style={{ position: "relative" }}>
          <input
            style={{ ...fieldInputStyle, paddingRight: 60 }}
            type={props.showPw ? "text" : "password"}
            placeholder="8 or more characters"
            value={props.password}
            onChange={(e) => props.setPassword(e.target.value)}
            required
            minLength={8}
          />
          <button
            type="button"
            onClick={() => props.setShowPw(!props.showPw)}
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
              background: "transparent",
              border: "none",
              color: "#8A7F75",
              fontFamily: "Jost, sans-serif",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            {props.showPw ? "Hide" : "Show"}
          </button>
        </div>
      </Field>

      <div className="my-5 flex items-center gap-3" style={{ color: "#8A7F75" }}>
        <span style={{ flex: 1, height: 1, background: "#D9D2C6" }} />
        <span style={{ fontFamily: "Jost, sans-serif", fontSize: 11 }}>or</span>
        <span style={{ flex: 1, height: 1, background: "#D9D2C6" }} />
      </div>

      <button
        type="button"
        onClick={props.onGoogle}
        style={{
          width: "100%",
          background: "#FFFFFF",
          border: "0.5px solid rgba(44,44,44,0.18)",
          borderRadius: 2,
          padding: "12px",
          fontFamily: "Jost, sans-serif",
          fontSize: 13,
          color: "#2C2C2C",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        <GoogleIcon /> Continue with Google
      </button>

      <SubmitButton busy={props.busy} label="Continue to payment →" busyLabel="Setting up your account…" />

      <p
        className="mt-3 text-center"
        style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: "#8A7F75" }}
      >
        By continuing you agree to our Terms of Service.
      </p>
    </form>
  );
}

// ─────────────────────────────────────────── step 2 ──

function StepPayment(props: {
  firmPriceId: string | null;
  frequency: FoundingBillingFrequency;
  setFrequency: (v: FoundingBillingFrequency) => void;
  quote:
    | {
        priceId: string;
        amountCents: number;
        isFounding: boolean;
        foundingActive: boolean;
      }
    | undefined;
  trialEndDate: string;
  loadingFirm: boolean;
}) {
  const priceKey = (props.firmPriceId ?? props.quote?.priceId) as CheckoutPriceKey | undefined;
  const dollars = props.quote ? (props.quote.amountCents / 100).toFixed(2) : "—";
  const periodLabel = props.frequency === "monthly" ? "/month" : "/year";
  const perMonthEq =
    props.frequency === "annual" && props.quote
      ? (props.quote.amountCents / 100 / 12).toFixed(2)
      : null;
  const annualSavings = props.quote
    ? props.frequency === "annual"
      ? (props.quote.isFounding ? 3999 : 6999) * 12 - props.quote.amountCents
      : 0
    : 0;

  return (
    <div className="mt-8">
      <h2
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 24,
          color: "#2C2C2C",
          marginBottom: 6,
        }}
      >
        Payment details
      </h2>

      {/* Plan summary box */}
      <div
        style={{
          background: "rgba(184,134,11,0.07)",
          border: "0.5px solid rgba(184,134,11,0.2)",
          borderRadius: 4,
          padding: "20px 18px",
          marginBottom: 20,
          marginTop: 12,
        }}
      >
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: "#2C2C2C" }}>
          Sightline by Propos'Ability
        </div>
        <div style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: "#6B6259", marginTop: 2 }}>
          Full access · Unlimited team members
        </div>

        {/* Frequency toggle */}
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              background: "rgba(44,44,44,0.06)",
              borderRadius: 3,
              padding: 3,
              display: "inline-flex",
            }}
          >
            <TogglePill
              active={props.frequency === "monthly"}
              onClick={() => props.setFrequency("monthly")}
            >
              Monthly
            </TogglePill>
            <TogglePill
              active={props.frequency === "annual"}
              onClick={() => props.setFrequency("annual")}
            >
              Annual
              <span
                style={{
                  marginLeft: 5,
                  background: "#5C8A6E",
                  color: "white",
                  fontSize: 8,
                  fontWeight: 600,
                  padding: "1px 5px",
                  borderRadius: 2,
                }}
              >
                2 months free
              </span>
            </TogglePill>
          </div>
        </div>

        {/* Price */}
        <div style={{ marginTop: 14, display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, color: "#2C2C2C" }}>
            ${dollars}
          </span>
          <span style={{ fontFamily: "Jost, sans-serif", fontSize: 13, color: "#8A7F75" }}>
            {periodLabel}
          </span>
        </div>
        {perMonthEq && annualSavings > 0 && (
          <div
            style={{
              fontFamily: "Jost, sans-serif",
              fontSize: 12,
              fontWeight: 500,
              color: "#5C8A6E",
              marginTop: 4,
            }}
          >
            ${perMonthEq}/mo · You save ${(annualSavings / 100).toFixed(2)} per year
          </div>
        )}

        {props.quote && (
          <>
            {props.quote.isFounding ? (
              <p style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: "#5C8A6E", marginTop: 6 }}>
                Founding rate · locked permanently for early access members.
              </p>
            ) : null}
            {props.quote.isFounding && (
              <p style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: "#8A7F75", marginTop: 2 }}>
                After early access:{" "}
                {props.frequency === "monthly" ? "$69.99/mo" : "$699.90/yr"} for new members.
              </p>
            )}
          </>
        )}
      </div>

      {/* Trial reminder */}
      <div
        style={{
          background: "rgba(92,138,110,0.07)",
          border: "0.5px solid rgba(92,138,110,0.2)",
          borderRadius: 4,
          padding: "12px 14px",
          marginBottom: 20,
          fontFamily: "Jost, sans-serif",
          fontSize: 13,
          color: "#2C2C2C",
          lineHeight: 1.5,
        }}
      >
        Your card will not be charged today. Your 14-day free trial starts now. We'll charge $
        {dollars} on {props.trialEndDate} unless you cancel before then.
      </div>

      {/* Stripe embedded checkout (in subscription-with-trial mode) */}
      {props.loadingFirm ? (
        <div className="rounded-md bg-white p-6 text-center text-sm text-ch/60">
          Loading checkout…
        </div>
      ) : priceKey ? (
        <StripeEmbeddedCheckoutPane
          priceKey={priceKey}
          returnUrl={`${window.location.origin}/onboarding`}
        />
      ) : (
        <div className="rounded-md bg-white p-6 text-center text-sm text-ch/60">
          No pricing available.
        </div>
      )}

      <p
        className="mt-3 text-center"
        style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: "#8A7F75" }}
      >
        🔒 Secured by Stripe. Your card details are encrypted and never stored on our servers.
      </p>
    </div>
  );
}

function TogglePill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: "Jost, sans-serif",
        fontSize: 11,
        fontWeight: 500,
        padding: "6px 18px",
        borderRadius: 2,
        border: "none",
        cursor: "pointer",
        background: active ? "#FFFFFF" : "transparent",
        color: active ? "#2C2C2C" : "#8A7F75",
        boxShadow: active ? "0 1px 3px rgba(0,0,0,0.10)" : "none",
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      {children}
    </button>
  );
}

function SubmitButton({ busy, label, busyLabel }: { busy: boolean; label: string; busyLabel: string }) {
  return (
    <button
      type="submit"
      disabled={busy}
      style={{
        width: "100%",
        background: "#2C2C2C",
        color: "#FAF7F2",
        padding: "14px",
        borderRadius: 2,
        fontFamily: "Jost, sans-serif",
        fontSize: 11,
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.16em",
        border: "none",
        cursor: busy ? "not-allowed" : "pointer",
        opacity: busy ? 0.7 : 1,
        marginTop: 8,
      }}
    >
      {busy ? busyLabel : label}
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.3 29 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.3-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.3 29 4.5 24 4.5 16.3 4.5 9.7 8.6 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 43.5c5.1 0 9.7-1.7 13.3-4.7l-6.1-5c-2 1.4-4.5 2.2-7.2 2.2-5.3 0-9.7-3.1-11.3-7.4l-6.5 5C9.6 39.5 16.2 43.5 24 43.5z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.1 5c-.4.4 6.6-4.8 6.6-14.7 0-1.2-.1-2.4-.3-3.5z"/>
    </svg>
  );
}