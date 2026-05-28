import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell, FieldLabel, inputClass, primaryBtnClass } from "@/components/auth/AuthShell";
import { GoogleButton } from "@/components/auth/GoogleButton";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Sightline" }] }),
  component: LoginPage,
});

function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    nav({ to: "/post-auth" });
  };

  return (
    <AuthShell
      title="Welcome back."
      subtitle="Sign in to your Sightline account."
      footer={
        <>
          New to Sightline?{" "}
          <Link to="/register" className="text-gold hover:text-goldl">Create an account</Link>
        </>
      }
    >
      <GoogleButton label="Continue with Google" />
      <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-ch/40">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <FieldLabel>Email</FieldLabel>
          <input className={inputClass} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <FieldLabel>Password</FieldLabel>
          <input className={inputClass} type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className={primaryBtnClass} disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
      </form>
    </AuthShell>
  );
}