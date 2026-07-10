import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createFirmForCurrentUser, getMyContext } from "@/lib/firm.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { landingPathFor } from "@/lib/role";

export const Route = createFileRoute("/post-auth")({
  head: () => ({ meta: [{ title: "Setting up — Sightline" }] }),
  validateSearch: (s: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof s.session_id === "string" ? s.session_id : undefined,
  }),
  component: PostAuth,
});

function PostAuth() {
  const nav = useNavigate();
  const search = Route.useSearch();
  const createFirm = useServerFn(createFirmForCurrentUser);
  const getCtx = useServerFn(getMyContext);
  const [status, setStatus] = useState<
    | { kind: "working"; message: string }
    | { kind: "timeout" }
  >({ kind: "working", message: "Setting up your studio…" });
  const [attempt, setAttempt] = useState(0);

  const fromStripe = !!search.session_id;

  const run = useCallback(async (): Promise<void> => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      nav({ to: "/login" });
      return;
    }
    const ctx = await getCtx();
    const isSuper = !!ctx?.profile?.is_super_admin;
    if (isSuper) {
      if (!ctx?.profile?.firm_id) {
        const meta = (data.user.user_metadata ?? {}) as Record<string, string>;
        const ownerName = meta.name || meta.full_name || data.user.email!.split("@")[0];
        await createFirm({ data: { firmName: "Sightline Studio", ownerName } });
        sessionStorage.removeItem("sightline_pending_firm");
      }
      nav({ to: "/admin" as any });
      return;
    }

    if (!ctx?.profile?.firm_id) {
      const pendingRaw =
        localStorage.getItem("sightline_pending_firm") ??
        sessionStorage.getItem("sightline_pending_firm");
      const pending = pendingRaw ? JSON.parse(pendingRaw) : null;
      const meta = (data.user.user_metadata ?? {}) as Record<string, string>;
      const firmName = pending?.firmName || meta.firm_name || (meta.name ? `${meta.name}'s Studio` : "My Studio");
      const ownerName = pending?.ownerName || meta.name || meta.full_name || data.user.email!.split("@")[0];
      const billingFrequency: "monthly" | "annual" =
        pending?.billingFrequency === "annual" ? "annual" : "monthly";
      const stripePriceId: string | null = pending?.stripePriceId ?? null;
      await createFirm({
        data: { firmName, ownerName, billingFrequency, stripePriceId },
      });
      localStorage.removeItem("sightline_pending_firm");
      sessionStorage.removeItem("sightline_pending_firm");
      nav({ to: "/register", search: { step: "payment" } as any });
      return;
    }

    const firm = ctx.firm as any;
    const hasSub = !!firm?.stripe_subscription_id;
    if (hasSub) {
      const target = landingPathFor(ctx.profile, firm);
      nav({ to: target as any });
      return;
    }

    // No subscription on the firm yet.
    if (fromStripe) {
      // Poll for the webhook to land — up to ~15s.
      const maxAttempts = 10;
      const intervalMs = 1500;
      for (let i = 0; i < maxAttempts; i++) {
        setStatus({
          kind: "working",
          message:
            i < 2
              ? "Confirming your payment with Stripe…"
              : i < 5
                ? "Almost there — finalizing your subscription…"
                : "Still working on it — this can take a few seconds…",
        });
        await new Promise((r) => setTimeout(r, intervalMs));
        const next = await getCtx();
        const nextFirm = next?.firm as any;
        if (nextFirm?.stripe_subscription_id && next?.profile) {
          const target = landingPathFor(next.profile, nextFirm);
          nav({ to: target as any });
          return;
        }
      }
      setStatus({ kind: "timeout" });
      return;
    }

    // Not from Stripe (e.g. user hit /post-auth directly or reopened after
    // signing in) — send them to complete payment.
    nav({ to: "/register", search: { step: "payment" } as any });
  }, [nav, createFirm, getCtx, fromStripe]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (cancelled) return;
        await run();
      } catch (e) {
        if (cancelled) return;
        toast.error(e instanceof Error ? e.message : "Setup failed");
        nav({ to: "/login" });
      }
    })();
    return () => { cancelled = true; };
  }, [run, nav, attempt]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream text-ch">
      <div className="max-w-md px-6 text-center">
        {status.kind === "working" ? (
          <>
            <p className="font-display text-2xl">{status.message}</p>
            <p className="mt-2 text-sm text-ch/60">One moment.</p>
          </>
        ) : (
          <>
            <p className="font-display text-2xl">This is taking longer than expected.</p>
            <p className="mt-2 text-sm text-ch/60">
              Your payment likely went through, but we haven't received the confirmation
              from Stripe yet. This usually clears within a minute.
            </p>
            <div className="mt-6 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setStatus({ kind: "working", message: "Checking again…" });
                  setAttempt((a) => a + 1);
                }}
                className="rounded-md bg-ch px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
                style={{ fontFamily: "Jost, sans-serif" }}
              >
                Check again
              </button>
              <button
                type="button"
                onClick={() => nav({ to: "/register", search: { step: "payment" } as any })}
                className="text-xs text-ch/60 hover:text-ch underline"
                style={{ fontFamily: "Jost, sans-serif" }}
              >
                Return to payment
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}