import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createFirmForCurrentUser, getMyContext } from "@/lib/firm.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { landingPathFor } from "@/lib/role";

export const Route = createFileRoute("/post-auth")({
  head: () => ({ meta: [{ title: "Setting up — Sightline" }] }),
  component: PostAuth,
});

function PostAuth() {
  const nav = useNavigate();
  const createFirm = useServerFn(createFirmForCurrentUser);
  const getCtx = useServerFn(getMyContext);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        nav({ to: "/login" });
        return;
      }
      try {
        const ctx = await getCtx();
        if (cancelled) return;
        const isSuper = !!ctx?.profile?.is_super_admin;
        if (isSuper) {
          // Super admins get a clean-slate firm and skip onboarding entirely.
          if (!ctx?.profile?.firm_id) {
            const meta = (data.user.user_metadata ?? {}) as Record<string, string>;
            const ownerName = meta.name || meta.full_name || data.user.email!.split("@")[0];
            await createFirm({ data: { firmName: "Sightline Studio", ownerName, tier: "practice" } });
            sessionStorage.removeItem("sightline_pending_firm");
          }
          nav({ to: "/admin" as any });
          return;
        }
        if (!ctx?.profile?.firm_id) {
          const pendingRaw = sessionStorage.getItem("sightline_pending_firm");
          const pending = pendingRaw ? JSON.parse(pendingRaw) : null;
          const meta = (data.user.user_metadata ?? {}) as Record<string, string>;
          const firmName = pending?.firmName || meta.firm_name || (meta.name ? `${meta.name}'s Studio` : "My Studio");
          const ownerName = pending?.ownerName || meta.name || meta.full_name || data.user.email!.split("@")[0];
          const rawTier = (pending?.tier || meta.tier || "studio") as string;
          const tier: "studio" | "practice" =
            rawTier === "practice" ? "practice" : "studio";
          await createFirm({ data: { firmName, ownerName, tier } });
          sessionStorage.removeItem("sightline_pending_firm");
          nav({ to: "/onboarding" });
        } else {
          const target = landingPathFor(ctx.profile);
          nav({ to: target as any });
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Setup failed");
        nav({ to: "/login" });
      }
    })();
    return () => { cancelled = true; };
  }, [nav, createFirm, getCtx]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream text-ch">
      <div className="text-center">
        <p className="font-display text-2xl">Setting up your studio…</p>
        <p className="mt-2 text-sm text-ch/60">One moment.</p>
      </div>
    </div>
  );
}