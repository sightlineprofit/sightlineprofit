import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Navigate } from "@tanstack/react-router";
import { getMyContext } from "@/lib/firm.functions";

export type AppRole = "principal" | "admin" | "team" | "view_only";

export function useMe() {
  const getCtx = useServerFn(getMyContext);
  return useQuery({ queryKey: ["me"], queryFn: () => getCtx() });
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

/** Where this user should land after auth. */
export function landingPathFor(profile: {
  role?: string | null;
  is_super_admin?: boolean | null;
  preferred_home?: string | null;
  welcomed_at?: string | null;
}): string {
  if (profile.is_super_admin) return "/admin";
  const role = (profile.role as AppRole) ?? "team";
  if (role === "principal" || role === "admin") {
    switch (profile.preferred_home) {
      case "calendar":
        return "/time-calendar";
      case "sightline":
        return "/sightline";
      case "dashboard":
      default:
        return "/dashboard";
    }
  }
  if (role === "view_only") return "/sightline";
  // team
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