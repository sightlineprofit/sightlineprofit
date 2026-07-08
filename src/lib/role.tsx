import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Navigate } from "@tanstack/react-router";
import { getMyContext } from "@/lib/firm.functions";
import { useViewAs } from "@/lib/view-as";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "principal" | "admin" | "team" | "view_only";
export type AppTier = "studio" | "practice";

export function useMe() {
  const getCtx = useServerFn(getMyContext);
  const va = useViewAs();
  const query = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      // Skip the RPC entirely if there's no session — otherwise the server
      // fn throws "Unauthorized: No authorization header provided" and blank
      // -screens the app before the _authenticated layout can redirect.
      const { data } = await supabase.auth.getSession();
      if (!data.session) return null;
      return await getCtx();
    },
    retry: false,
  });

  // If the server rejects the token (expired/revoked), sign out cleanly and
  // bounce to /login rather than leaving the app on a blank error boundary.
  useEffect(() => {
    const msg = (query.error as any)?.message ?? "";
    if (typeof window !== "undefined" && /Unauthorized/i.test(msg)) {
      supabase.auth.signOut().finally(() => {
        window.location.replace("/login");
      });
    }
  }, [query.error]);

  const realProfile = query.data?.profile ?? null;
  const realFirm = query.data?.firm ?? null;
  const realIsSuper = !!realProfile?.is_super_admin;

  let data = query.data;
  // Only super admins can drive view-as overrides. For non-supers (or while
  // they're impersonating a real firm) the overrides are inert.
  const overrideActive =
    realIsSuper && !realProfile?.impersonated_firm_id && (va.role || va.tier);

  if (data && overrideActive) {
    data = {
      ...data,
      profile: {
        ...data.profile,
        // Swap the role so RoleGuard / role-conditional UI behaves like the
        // selected role. Drop the super flag so tier gates apply naturally.
        role: (va.role ?? data.profile?.role) as any,
        is_super_admin: false,
      } as any,
      firm:
        data.firm && va.tier
          ? { ...data.firm, subscription_tier: va.tier as any }
          : data.firm,
    };
  }

  return Object.assign(query, {
    data,
    realIsSuper,
    realProfile,
    realFirm,
  }) as typeof query & {
    realIsSuper: boolean;
    realProfile: typeof realProfile;
    realFirm: typeof realFirm;
  };
}

/** Effective role — super admins always treated as principal. */
export function effectiveRole(profile: {
  role?: string | null;
  is_super_admin?: boolean | null;
} | null | undefined): AppRole | null {
  if (!profile) return null;
  if (profile.is_super_admin) return "principal";
  return (profile.role as AppRole) ?? null;
}

const LANDING_PAGE_MAP: Record<string, string> = {
  dashboard: "/dashboard",
  projects: "/projects",
  capacity: "/dashboard?open=capacity",
  time_calendar: "/time-calendar",
  rate_architecture: "/rate-architecture",
};

/** Where this user should land after auth. */
export function landingPathFor(
  profile: {
    role?: string | null;
    is_super_admin?: boolean | null;
    preferred_home?: string | null;
    welcomed_at?: string | null;
  },
  firm?: { default_landing_page?: string | null; onboarding_completed?: boolean | null } | null,
): string {
  if (profile.is_super_admin) return "/admin";
  const role = (profile.role as AppRole) ?? "team";
  if (role === "principal" || role === "admin") {
    if (firm && firm.onboarding_completed === false) return "/onboarding";
    const key = firm?.default_landing_page ?? profile.preferred_home ?? "dashboard";
    return LANDING_PAGE_MAP[key] ?? "/dashboard";
  }
  if (role === "view_only") return "/sightline";
  return profile.welcomed_at ? "/time-calendar" : "/welcome";
}

export function fallbackForRole(role: AppRole | null): string {
  if (role === "team") return "/time-calendar";
  if (role === "view_only") return "/sightline";
  return "/dashboard";
}

/** Whether the current user should see firm-level financial figures
 *  (rates, margins, costs, revenue). Principals and admins only. */
export function useShowFinancials(): boolean {
  const { data } = useMe();
  const role = effectiveRole(data?.profile);
  return role === "principal" || role === "admin";
}

/**
 * Effective subscription tier. Super admins are always treated as the
 * highest tier so every module unlocks for them during build/test, unless
 * they are actively impersonating another firm (in which case that firm's
 * tier drives content — matching how AppShell already behaves).
 */
export function effectiveTier(
  profile: { is_super_admin?: boolean | null; impersonated_firm_id?: string | null } | null | undefined,
  firm:
    | {
        subscription_tier?: string | null;
        subscription_status?: string | null;
        current_period_end?: string | null;
        trial_ends_at?: string | null;
        past_due_since?: string | null;
      }
    | null
    | undefined,
): AppTier {
  // Single-plan model: every firm has full access. `AppTier` is retained for
  // back-compat with existing call sites and always resolves to "practice".
  void profile; void firm;
  return "practice";
}

/**
 * Whether the firm currently has active access to its tier.
 *  - trialing: yes, until trial_ends_at
 *  - active: yes
 *  - past_due: yes for the first 7 days, then read-only (returns "read_only")
 *  - canceled: yes until current_period_end, then no
 *  - incomplete / null: no
 * Super admins (not impersonating) always have full access.
 */
export type AccessState = "full" | "read_only" | "none";

export function accessState(
  profile: { is_super_admin?: boolean | null; impersonated_firm_id?: string | null } | null | undefined,
  firm:
    | {
        subscription_status?: string | null;
        current_period_end?: string | null;
        trial_ends_at?: string | null;
        past_due_since?: string | null;
      }
    | null
    | undefined,
): AccessState {
  if (profile?.is_super_admin && !profile?.impersonated_firm_id) return "full";
  if (!firm) return "none";
  // Single-plan model. Access is a function of subscription_status only,
  // with a shared 7-day grace after the trial or cancellation lapses.
  const now = Date.now();
  const GRACE_MS = 7 * 24 * 60 * 60 * 1000;
  const status = firm.subscription_status ?? null;
  const trialEnd = firm.trial_ends_at ? new Date(firm.trial_ends_at).getTime() : null;
  const periodEnd = firm.current_period_end ? new Date(firm.current_period_end).getTime() : null;
  switch (status) {
    case "trialing":
    case "active":
      return "full";
    case "past_due": {
      const anchor = trialEnd ?? periodEnd ?? now;
      return now - anchor > GRACE_MS ? "none" : "full";
    }
    case "canceled": {
      const anchor = periodEnd ?? trialEnd ?? now;
      return now - anchor > GRACE_MS ? "none" : "full";
    }
    case "expired":
      return "none";
    default:
      // Unknown / null status. If a trial deadline is still ahead, honor it.
      if (trialEnd && trialEnd > now) return "full";
      return "none";
  }
}

export function useAccessState(): AccessState {
  const { data } = useMe();
  return accessState(data?.profile, data?.firm);
}

export function useEffectiveTier(): AppTier {
  const { data } = useMe();
  return effectiveTier(data?.profile, data?.firm);
}

/**
 * Gate a page on the user's role. Renders a loading state while the role
 * resolves, redirects when the role is not allowed, and only renders
 * children once access is confirmed. Use at the top of any protected page.
 */
export function RoleGuard({
  allow,
  children,
}: {
  allow: AppRole[];
  children: React.ReactNode;
}) {
  const { data, isLoading } = useMe();
  if (isLoading || !data?.profile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm text-ch/50">Checking access…</div>
      </div>
    );
  }
  const role = effectiveRole(data.profile);
  if (!role || !allow.includes(role)) {
    return <Navigate to={fallbackForRole(role) as any} replace />;
  }
  return <>{children}</>;
}

export function SuperAdminGuard({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useMe();
  if (isLoading || !data?.profile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm text-ch/50">Checking access…</div>
      </div>
    );
  }
  if (!data.profile.is_super_admin) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}