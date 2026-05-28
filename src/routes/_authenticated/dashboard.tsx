import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyContext } from "@/lib/firm.functions";
import { TrialBanner } from "@/components/TrialBanner";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Sightline" }] }),
  component: Dashboard,
});

function Dashboard() {
  const nav = useNavigate();
  const getCtx = useServerFn(getMyContext);
  const { data, isLoading } = useQuery({ queryKey: ["me"], queryFn: () => getCtx() });

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-cream text-ch/60">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-cream text-ch">
      {data?.firm && <TrialBanner trialEndsAt={data.firm.trial_ends_at} status={data.firm.subscription_status} />}
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="font-display text-xl tracking-tight">Sightline</div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-ch/60">{data?.profile?.name || data?.profile?.email}</span>
            <button
              className="text-ch/60 hover:text-ch"
              onClick={async () => { await supabase.auth.signOut(); nav({ to: "/" }); }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-16">
        <p className="text-xs uppercase tracking-[0.25em] text-gold">Foundation</p>
        <h1 className="mt-3 font-display text-5xl tracking-tight">{data?.firm?.name}</h1>
        <p className="mt-3 max-w-xl text-ch/70">
          Your firm-level dashboard is being built. Onboarding has been saved — you can revisit any step from settings.
        </p>
      </main>
    </div>
  );
}