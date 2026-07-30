import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createFirmForCurrentUser, getAuthBootstrapState, getMyContext } from "@/lib/firm.functions";
import { syncFirmFromStripeSession } from "@/lib/billing.functions";
import { resolveCheckoutEnvironment, type StripeEnv } from "@/lib/stripe";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { landingPathFor } from "@/lib/role";
import { firmHasAppAccess } from "@/lib/firm-access";
import { waitForAuthSession } from "@/lib/auth-session";

export const Route = createFileRoute("/post-auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Setting up — Sightline" }] }),
  validateSearch: (s: Record<string, unknown>): { session_id?: string; env?: StripeEnv } => ({
    session_id: typeof s.session_id === "string" ? s.session_id : undefined,
    env: s.env === "sandbox" || s.env === "live" ? s.env : undefined,
  }),
  component: PostAuth,
});

function PostAuth() {
  const nav = useNavigate();
  const search = Route.useSearch();
  const createFirm = useServerFn(createFirmForCurrentUser);
  const getCtx = useServerFn(getMyContext);
  const getBootstrap = useServerFn(getAuthBootstrapState);
  const syncFromSession = useServerFn(syncFirmFromStripeSession);
  const [status, setStatus] = useState<
    | { kind: "working"; message: string }
    | { kind: "timeout"; detail?: string }
  >({ kind: "working", message: "Setting up your studio…" });
  const [attempt, setAttempt] = useState(0);

  const fromStripe = !!search.session_id;

  const goToApp = useCallback(
    (ctx: Awaited<ReturnType<typeof getCtx>>) => {
      if (!ctx?.profile) {
        toast.error("Your account is still setting up. Please try again in a moment.");
        setAttempt((n) => n + 1);
        return;
      }
      const target = landingPathFor(ctx.profile, ctx.firm as any);
      nav({ to: target as any });
    },
    [nav],
  );

  const run = useCallback(async (): Promise<void> => {
    await waitForAuthSession();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      toast.error("Could not complete sign-in. Please try Google again.");
      nav({ to: "/login" });
      return;
    }
    let bootstrap = await getBootstrap();
    let ctx = await getCtx();
    const meta = (data.user.user_metadata ?? {}) as Record<string, string>;
    const isSuper = bootstrap.isSuperAdmin || !!ctx?.profile?.is_super_admin;
    if (isSuper) {
      try {
        sessionStorage.removeItem("sightline.viewAs.v1");
      } catch {
        /* ignore */
      }
      if (!bootstrap.firmId && !ctx?.profile?.firm_id) {
        const ownerName = meta.name || meta.full_name || data.user.email!.split("@")[0];
        await createFirm({ data: { firmName: "Sightline Studio", ownerName } });
        sessionStorage.removeItem("sightline_pending_firm");
        bootstrap = await getBootstrap();
        ctx = await getCtx();
      }
      nav({ to: "/admin" as any });
      return;
    }

    const hasFirm = !!(bootstrap.firmId ?? ctx?.profile?.firm_id);
    if (!hasFirm) {
      const pendingRaw =
        localStorage.getItem("sightline_pending_firm") ??
        sessionStorage.getItem("sightline_pending_firm");
      const pending = pendingRaw ? JSON.parse(pendingRaw) : null;
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
      bootstrap = await getBootstrap();
      ctx = await getCtx();
    }

    let firmId = bootstrap.firmId ?? ctx?.profile?.firm_id;
    let firm = ctx?.firm as any;

    if (firmId && !firm) {
      ctx = await getCtx();
      firm = ctx?.firm as any;
      firmId = bootstrap.firmId ?? ctx?.profile?.firm_id ?? firmId;
    }

    if (firmId && firmHasAppAccess(firm)) {
      goToApp(ctx);
      return;
    }

    if (!firmId) {
      nav({ to: "/register", search: { step: "payment", env: resolveCheckoutEnvironment(search.env) } as any });
      return;
    }

    // Firm exists but billing is not active yet.
    if (fromStripe) {
      const maxAttempts = 20;
      const intervalMs = 1500;
      let lastSyncError: string | undefined;

      for (let i = 0; i < maxAttempts; i++) {
        setStatus({
          kind: "working",
          message:
            i < 2
              ? "Confirming your payment with Stripe…"
              : i < 8
                ? "Almost there — finalizing your subscription…"
                : "Still working on it — this can take up to a minute…",
        });
        await new Promise((r) => setTimeout(r, intervalMs));
        const next = await getCtx();
        const nextFirm = next?.firm as any;
        if (next?.profile && firmHasAppAccess(nextFirm)) {
          goToApp(next);
          return;
        }
      }

      if (search.session_id) {
        setStatus({ kind: "working", message: "Finalizing your account…" });
        const env = resolveCheckoutEnvironment(search.env);
        for (let syncAttempt = 0; syncAttempt < 3; syncAttempt++) {
          try {
            const res = await syncFromSession({
              data: { session_id: search.session_id, environment: env },
            });
            if ("ok" in res && res.ok) {
              const refreshed = await getCtx();
              const refFirm = refreshed?.firm as any;
              if (refreshed?.profile && firmHasAppAccess(refFirm)) {
                goToApp(refreshed);
                return;
              }
              break;
            }
            if ("error" in res) {
              lastSyncError = res.error;
              console.warn("[post-auth] fallback sync error:", res.error);
            }
          } catch (e) {
            lastSyncError = e instanceof Error ? e.message : "Could not finalize billing";
            console.warn("[post-auth] fallback sync failed:", e);
          }
          if (syncAttempt < 2) {
            await new Promise((r) => setTimeout(r, 2000));
          }
        }

        const refreshed = await getCtx();
        const refFirm = refreshed?.firm as any;
        if (refreshed?.profile && firmHasAppAccess(refFirm)) {
          goToApp(refreshed);
          return;
        }
      }

      setStatus({
        kind: "timeout",
        detail: lastSyncError,
      });
      return;
    }

    nav({ to: "/register", search: { step: "payment", env: resolveCheckoutEnvironment(search.env) } as any });
  }, [nav, createFirm, getCtx, getBootstrap, syncFromSession, fromStripe, search.session_id, search.env, goToApp]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (cancelled) return;
        await run();
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Setup failed";
        console.error("[post-auth]", e);
        if (/Unauthorized|Invalid token|No authorization/i.test(msg)) {
          toast.error("Sign-in session expired. Please try again.");
          nav({ to: "/login" });
          return;
        }
        if (/Google sign-in|Unable to exchange external code|invalid grant|PKCE/i.test(msg)) {
          toast.error(msg);
          nav({ to: "/login" });
          return;
        }
        toast.error(msg);
        setStatus({
          kind: "timeout",
          detail: msg,
        });
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
              Your payment was received. Your account is still being activated —
              this usually resolves within a minute. Please refresh, or contact us
              if it persists.
            </p>
            {status.detail ? (
              <p className="mt-3 rounded-md bg-white/60 px-3 py-2 text-xs text-ch/70">
                {status.detail}
              </p>
            ) : null}
            <div className="mt-6 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  window.location.reload();
                }}
                className="rounded-md bg-ch px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
                style={{ fontFamily: "Jost, sans-serif" }}
              >
                Refresh now →
              </button>
              <a
                href="mailto:hello@proposability.com"
                className="text-xs text-ch/60 hover:text-ch underline"
                style={{ fontFamily: "Jost, sans-serif" }}
              >
                Contact support →
              </a>
              <button
                type="button"
                onClick={() => nav({ to: "/register", search: { step: "payment", env: resolveCheckoutEnvironment(search.env) } as any })}
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