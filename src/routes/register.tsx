import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell, FieldLabel, inputClass, primaryBtnClass } from "@/components/auth/AuthShell";
import { GoogleButton } from "@/components/auth/GoogleButton";

type Tier = "studio" | "practice";

const TIERS: { id: Tier; name: string; price: string; tagline: string; features: string[]; includesBelow?: boolean }[] = [
  {
    id: "studio",
    name: "Studio",
    price: "$79/mo",
    tagline: "Track the team.",
    features: [
      "Firm financial dashboard",
      "Aligned hourly rate & scenario planning",
      "Mon–Sun time calendar",
      "Live utilization & revenue",
    ],
  },
  {
    id: "practice",
    name: "Practice",
    price: "$129/mo",
    tagline: "Defend the margin.",
    features: ["Project profitability", "SOP template library", "Scope creep in dollar terms"],
    includesBelow: true,
  },
];

export const Route = createFileRoute("/register")({
  head: () => ({ meta: [{ title: "Start your trial — Sightline" }] }),
  component: RegisterPage,
});

function RegisterPage() {
  const nav = useNavigate();
  const [firmName, setFirmName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tier, setTier] = useState<Tier>("studio");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin + "/post-auth",
        data: { name: ownerName, firm_name: firmName, tier },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    sessionStorage.setItem("sightline_pending_firm", JSON.stringify({ firmName, ownerName, tier }));
    toast.success("Check your email to verify your account.");
    nav({ to: "/post-auth" });
  };

  return (
    <div className="min-h-screen bg-cream text-ch">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="font-display text-2xl tracking-tight">Sightline</Link>
        <Link to="/login" className="text-sm text-ch/70 hover:text-ch">Sign in</Link>
      </header>
      <main className="mx-auto grid max-w-6xl gap-10 px-6 py-10 lg:grid-cols-[1fr_1.1fr]">
        <section className="rounded-lg border border-border bg-white p-8">
          <p className="text-xs uppercase tracking-[0.25em] text-gold">14-day free trial</p>
          <h1 className="mt-3 font-display text-4xl leading-tight tracking-tight">Begin Sightline.</h1>
          <p className="mt-2 text-sm text-ch/70">No card required during trial. Billing activates only if you continue.</p>

          <div className="mt-4 rounded-md border border-border bg-cream/60 p-3 text-xs leading-relaxed text-ch/70">
            Creating a firm account. To join an existing firm as a team member,
            use the invitation link sent to your email.
          </div>

          <div className="mt-8">
            <GoogleButton label="Sign up with Google" />
            <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-ch/40">
              <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Firm name</FieldLabel>
                <input className={inputClass} required maxLength={120} value={firmName} onChange={(e) => setFirmName(e.target.value)} />
              </div>
              <div>
                <FieldLabel>Your name</FieldLabel>
                <input className={inputClass} required maxLength={120} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
              </div>
            </div>
            <div>
              <FieldLabel>Email</FieldLabel>
              <input className={inputClass} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <FieldLabel>Password</FieldLabel>
              <input className={inputClass} type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
              <p className="mt-1 text-xs text-ch/50">At least 8 characters.</p>
            </div>
            <button className={primaryBtnClass} disabled={loading}>
              {loading ? "Creating your firm…" : "Start 14-day trial"}
            </button>
            <p className="text-center text-xs text-ch/50">
              By continuing, you agree to Sightline's Terms and Privacy.
            </p>
          </form>
        </section>

        <section>
          <p className="mb-4 text-xs uppercase tracking-[0.25em] text-ch/50">Choose your plan</p>
          <div className="space-y-3">
            {TIERS.map((t) => {
              const selected = tier === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTier(t.id)}
                  className={`w-full rounded-lg border bg-white p-5 text-left transition ${
                    selected ? "border-gold ring-2 ring-goldp" : "border-border hover:border-ch/30"
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="font-display text-2xl tracking-tight">{t.name}</div>
                      <div className="text-sm text-ch/60">{t.tagline}</div>
                    </div>
                    <div className="font-display text-xl text-ch">{t.price}</div>
                  </div>
                  {t.includesBelow && (
                    <p className="mt-3 text-xs italic text-ch/50">Includes everything below.</p>
                  )}
                  <ul className="mt-3 space-y-1 text-sm text-ch/70">
                    {t.features.map((f) => (
                      <li key={f} className="flex gap-2"><span className="text-gold">—</span>{f}</li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}