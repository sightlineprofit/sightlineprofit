import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { markWelcomed } from "@/lib/firm.functions";
import { useMe, effectiveRole } from "@/lib/role";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/welcome")({
  head: () => ({ meta: [{ title: "Welcome — Sightline" }] }),
  component: WelcomePage,
});

function WelcomePage() {
  const nav = useNavigate();
  const { data, isLoading } = useMe();
  const qc = useQueryClient();
  const mark = useServerFn(markWelcomed);
  const [going, setGoing] = useState(false);

  if (isLoading || !data?.profile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm text-ch/50">Loading…</div>
      </div>
    );
  }

  const role = effectiveRole(data.profile);
  if (role !== "team") {
    // Not a team member — bounce to the appropriate home.
    if (role === "principal" || role === "admin") nav({ to: "/dashboard", replace: true });
    else if (role === "view_only") nav({ to: "/sightline", replace: true });
    return null;
  }
  if (data.profile.welcomed_at) {
    nav({ to: "/time-calendar", replace: true });
    return null;
  }

  async function go() {
    setGoing(true);
    try {
      await mark();
      await qc.invalidateQueries({ queryKey: ["me"] });
      nav({ to: "/time-calendar", replace: true });
    } finally {
      setGoing(false);
    }
  }

  return (
    <div className="min-h-[80vh] bg-cream">
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <p className="text-xs uppercase tracking-[0.28em] text-gold">Welcome</p>
        <h1
          className="mt-6 text-5xl leading-tight tracking-tight text-ch"
          style={{ fontFamily: '"Cormorant Garamond", serif' }}
        >
          Welcome to {data.firm?.name ?? "your firm"} on Sightline.
        </h1>
        <p
          className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-ch/70"
          style={{ fontFamily: "Jost, sans-serif" }}
        >
          You have access to your time calendar, your assigned projects, and
          the knowledge base. Your firm principal manages the financial
          settings.
        </p>
        <button
          type="button"
          onClick={go}
          disabled={going}
          className="mt-10 inline-flex items-center gap-2 rounded-md bg-gold px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-gold/90 disabled:opacity-60"
          style={{ fontFamily: "Jost, sans-serif" }}
        >
          {going ? "Loading…" : "Go to my calendar →"}
        </button>
      </div>
    </div>
  );
}