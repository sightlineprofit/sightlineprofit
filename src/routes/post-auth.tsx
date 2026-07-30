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

/** Complete the Supabase OAuth PKCE redirect before post-auth routing runs. */
async function ensureOAuthSession(): Promise<void> {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;

    params.delete("code");
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    window.history.replaceState({}, "", next);
    return;
  }

  // Implicit/hash callback (some providers still return #access_token=...)
  const hash = window.location.hash;
  if (hash.includes("access_token=")) {
    const { error } = await supabase.auth.getSession();
    if (error) throw error;
    window.history.replaceState({}, "", window.location.pathname + window.location.search);
  }
}

export const Route = createFileRoute("/post-auth")({
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
    | { kind: "timeout" }
  >({ kind: "working", message: "Setting up your studio…" });
  const [attempt, setAttempt] = useState(0);

  const fromStripe = !!search.session_id;

  const goToApp = useCallback(
    (ctx: Awaited<ReturnType<typeof getCtx>>) => {
      if (!ctx?.profile) {
        nav({ to: "/login" });
        return;
      }
      const target = landingPathFor(ctx.profile, ctx.firm as any);
      nav({ to: target as any });
    },
    [nav],
  );

  const run = useCallback(async (): Promise<void> => {
    await ensureOAuthSession();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
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
      ctx = await getCtx();
    }

    const firmId = bootstrap.firmId ?? ctx?.profile?.firm_id;
    let firm = ctx?.firm as any;

    if (firmId && !firm) {
      ctx = await getCtx();
      firm = ctx?.firm as any;
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
        if (next?.profile && firmHasAppAccess(nextFirm)) {
          goToApp(next);
          return;
        }
      }
      if (search.session_id) {
        setStatus({ kind: "working", message: "Finalizing your account…" });
        try {
          const env = resolveCheckoutEnvironment(search.env);
          const res = await syncFromSession({ data: { session_id: search.session_id, environment: env } });
          if ("ok" in res && res.ok) {
            const refreshed = await getCtx();
            const refFirm = refreshed?.firm as any;
            if (refreshed?.profile && firmHasAppAccess(refFirm)) {
              goToApp(refreshed);
              return;
            }
          } else if ("error" in res) {
            console.warn("[post-auth] fallback sync error:", res.error);
          }
        } catch (e) {
          console.warn("[post-auth] fallback sync failed:", e);
        }
      }
      setStatus({ kind: "timeout" });
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
              Your payment was received. Your account is still being activated —
              this usually resolves within a minute. Please refresh, or contact us
              if it persists.
            </p>
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