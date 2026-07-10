import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { markWelcomed } from "@/lib/firm.functions";
import { useMe, effectiveRole } from "@/lib/role";
import { useState } from "react";
import { Calendar, Folder, BookOpen } from "lucide-react";

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
      <div className="mx-auto max-w-4xl px-6 py-20">
        <p className="text-xs uppercase tracking-[0.28em] text-gold">Welcome</p>
        <h1 className="mt-4 text-ch" style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: 28, fontWeight: 400 }}>
          Welcome to {data.firm?.name ?? "your firm"}
        </h1>
        <p className="mt-3" style={{ fontFamily: "Jost, sans-serif", fontSize: 13, fontWeight: 400, color: "#777" }}>
          Here's what you have access to and how to get started.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          <AccessCard icon={<Calendar className="h-5 w-5 text-gold" />} title="Log your time"
            body="Use the time calendar to log hours against projects. Your principal can see all entries — log honestly and often." />
          <AccessCard icon={<Folder className="h-5 w-5 text-gold" />} title="Your projects"
            body="You'll see projects you've been assigned to. You can view phase status and log time directly from a project." />
          <AccessCard icon={<BookOpen className="h-5 w-5 text-gold" />} title="Learn the platform"
            body="Find articles and guidance on using Sightline in the knowledge base." />
        </div>

        <div
          className="mt-8 rounded-[3px] px-3.5 py-3"
          style={{ background: "var(--goldp, #F5EDD6)", borderLeft: "2px solid var(--gold)" }}
        >
          <p style={{ fontFamily: "Jost, sans-serif", fontSize: 11, fontWeight: 400, color: "#777", lineHeight: 1.6 }}>
            Financial information about the firm — rates, costs, revenue, and margins — is not part of your view. This is by design. If you have questions about project budgets or billing, speak with your firm principal directly.
          </p>
        </div>

        <div className="mt-10">
          <button
            type="button"
            onClick={go}
            disabled={going}
            className="inline-flex items-center gap-2 rounded-md bg-gold px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-gold/90 disabled:opacity-60"
            style={{ fontFamily: "Jost, sans-serif" }}
          >
            {going ? "Loading…" : "Go to my calendar →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AccessCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-white p-5">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-goldp">{icon}</div>
      <div className="text-ch" style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: 18 }}>{title}</div>
      <p className="mt-2" style={{ fontFamily: "Jost, sans-serif", fontSize: 12, fontWeight: 400, color: "#777", lineHeight: 1.55 }}>{body}</p>
    </div>
  );
}