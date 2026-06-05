import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { validateInviteToken, acceptInvite } from "@/lib/firm.functions";
import { supabase } from "@/integrations/supabase/client";

type Search = { token?: string };

export const Route = createFileRoute("/accept-invite")({
  head: () => ({ meta: [{ title: "Accept invitation — Sightline" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    token: typeof s.token === "string" ? s.token : undefined,
  }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { token } = Route.useSearch();
  const nav = useNavigate();
  const validate = useServerFn(validateInviteToken);
  const accept = useServerFn(acceptInvite);

  const { data, isLoading } = useQuery({
    queryKey: ["invite", token ?? ""],
    queryFn: () => validate({ data: { token: token ?? "" } }),
    enabled: !!token,
    retry: false,
  });

  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (data && "name" in data && data.name && !name) setName(data.name as string);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!token) {
    return <Centered title="Invalid invitation link" body="This link is missing its token." />;
  }
  if (isLoading || !data) {
    return <Centered title="Loading…" body="Checking your invitation." />;
  }
  if (data.status === "invalid") {
    return <Centered title="Invitation not found" body="This link is not valid. Ask your firm principal to send a new invitation." />;
  }
  if (data.status === "accepted") {
    return (
      <Centered
        title="Invitation already used"
        body="This invitation has already been accepted. Try signing in instead."
        cta={{ label: "Go to sign in", onClick: () => nav({ to: "/login" }) }}
      />
    );
  }
  if (data.status === "expired") {
    return (
      <Centered
        title="This invitation link has expired"
        body={`Ask ${data.firmName ?? "your firm"} to resend your invitation from their Settings page.`}
      />
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return toast.error("Password must be at least 8 characters.");
    if (pw !== pw2) return toast.error("Passwords don't match.");
    if (!name.trim()) return toast.error("Please enter your name.");
    setSubmitting(true);
    try {
      const res = await accept({ data: { token: token!, password: pw, name: name.trim() } });
      const { error } = await supabase.auth.signInWithPassword({ email: res.email, password: pw });
      if (error) throw new Error(error.message);
      toast.success("Account created. Welcome!");
      nav({ to: "/welcome" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create account.");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream text-ch">
      <div className="mx-auto max-w-md px-6 py-20">
        <p className="text-xs uppercase tracking-[0.28em] text-gold">You've been invited</p>
        <h1 className="mt-4" style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: 28, lineHeight: 1.15 }}>
          You've been invited to join {data.firmName}
        </h1>
        <p className="mt-3" style={{ fontFamily: "Jost, sans-serif", fontSize: 13, fontWeight: 300, color: "#777" }}>
          {data.principalName} uses Sightline to manage their studio's time and projects. Create your account to get started.
        </p>
        <form onSubmit={submit} className="mt-8 space-y-4 rounded-lg border border-border bg-white p-6">
          <FieldRow label="Your name">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
          </FieldRow>
          <FieldRow label="Email">
            <input className={`${inputCls} opacity-70`} value={data.email} readOnly />
          </FieldRow>
          <FieldRow label="Password">
            <input type="password" className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} />
          </FieldRow>
          <FieldRow label="Confirm password">
            <input type="password" className={inputCls} value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={8} />
          </FieldRow>
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 w-full rounded-md bg-gold px-4 py-3 text-sm font-medium text-white transition hover:bg-gold/90 disabled:opacity-60"
            style={{ fontFamily: "Jost, sans-serif" }}
          >
            {submitting ? "Creating account…" : "Create my account"}
          </button>
        </form>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-input bg-white px-3 py-2 text-sm text-ch focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20";

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs uppercase tracking-wider text-ch/50">{label}</label>
      {children}
    </div>
  );
}

function Centered({ title, body, cta }: { title: string; body: string; cta?: { label: string; onClick: () => void } }) {
  return (
    <div className="min-h-screen bg-cream text-ch flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: 28 }}>{title}</h1>
        <p className="mt-3" style={{ fontFamily: "Jost, sans-serif", fontSize: 13, fontWeight: 300, color: "#777" }}>
          {body}
        </p>
        {cta && (
          <button
            type="button"
            onClick={cta.onClick}
            className="mt-6 rounded-md bg-gold px-5 py-2.5 text-sm font-medium text-white hover:bg-gold/90"
          >
            {cta.label}
          </button>
        )}
      </div>
    </div>
  );
}