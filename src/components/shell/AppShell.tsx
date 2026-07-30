import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Calendar,
  LineChart,
  BookOpen,
  Sparkles,
  Settings,
  HelpCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User,
  Shield,
  EyeOff,
  Eye,
  LayoutGrid,
} from "lucide-react";
import { setImpersonation } from "@/lib/admin.functions";
import { useMe } from "@/lib/role";
import { useViewAs } from "@/lib/view-as";
import { supabase } from "@/integrations/supabase/client";
import { TrialBanner } from "@/components/TrialBanner";
import { ViewSwitcher, ViewSwitcherBanner } from "@/components/shell/ViewSwitcher";
import { RestrictedPreview } from "@/components/shell/RestrictedPreview";
import { cn } from "@/lib/utils";

type Role = "principal" | "admin" | "team" | "view_only";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  group: "financial" | "operational";
  allowRoles?: Role[];
  search?: Record<string, string>;
  nestedUnder?: string;
};

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "financial", allowRoles: ["principal", "admin"] },
  { to: "/my-work", label: "My work", icon: LayoutGrid, group: "operational", allowRoles: ["team", "view_only"] },
  { to: "/time-calendar", label: "Time", icon: Calendar, group: "operational" },
  { to: "/sightline", label: "Sightline", icon: LineChart, group: "financial", allowRoles: ["principal", "admin", "view_only"] },
  { to: "/capacity", label: "Capacity", icon: CalendarDays, group: "financial", allowRoles: ["principal", "admin"] },
  { to: "/future", label: "Future", icon: Sparkles, group: "operational", allowRoles: ["principal", "admin"] },
  { to: "/sop-library", label: "SOP Library", icon: BookOpen, group: "operational", allowRoles: ["principal", "admin", "view_only"] },
  { to: "/knowledge-base", label: "Knowledge", icon: HelpCircle, group: "operational" },
  { to: "/settings", label: "Settings", icon: Settings, group: "operational" },
];

const GROUP_LABELS: Record<NavItem["group"], string> = {
  financial: "Financial Architecture",
  operational: "Operational Infrastructure",
};

// Which routes each restricted role can actually reach. If the current
// pathname isn't in the allow-list, we render a preview panel instead.
// Keep in sync with the team/view_only redirect effect below.
const ROLE_ALLOWED_PATHS: Record<Role, string[] | "*"> = {
  principal: "*",
  admin: "*",
  team: ["/my-work", "/time-calendar", "/knowledge-base", "/settings", "/welcome"],
  view_only: ["/my-work", "/sightline", "/sop-library", "/knowledge-base", "/settings"],
};

function pathsAllowedForRole(role: Role): string[] | null {
  const allowed = ROLE_ALLOWED_PATHS[role];
  return allowed === "*" ? null : allowed;
}

function isPathAllowed(pathname: string, allowed: string[]): boolean {
  return allowed.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function simulatedRouteRestriction(role: Role, pathname: string): Role | null {
  const allowed = pathsAllowedForRole(role);
  if (!allowed) return null;
  return isPathAllowed(pathname, allowed) ? null : role;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const stopImpFn = useServerFn(setImpersonation);
  const { data, realIsSuper, viewAsRoleActive } = useMe();
  const va = useViewAs();

  // Chrome (admin nav, impersonation banner, pill) tracks the REAL super
  // admin status. `data` reflects view-as role simulation when active.
  const isSuper = realIsSuper;
  const impersonating = isSuper && !!data?.profile?.impersonated_firm_id;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const currentRole: Role =
    isSuper && !viewAsRoleActive
      ? "principal"
      : data?.profile?.is_super_admin
        ? "principal"
        : ((data?.profile?.role as Role) ?? "team");

  // Team-role route enforcement: redirect blocked paths to /my-work with a toast.
  useEffect(() => {
    if (!data?.profile) return;
    if (isSuper) return;
    if (currentRole !== "team" && currentRole !== "view_only") return;
    const allowed = pathsAllowedForRole(currentRole);
    if (!allowed) return;
    if (!isPathAllowed(pathname, allowed) && pathname !== "/") {
      toast.message("That section is managed by your firm principal.");
      nav({ to: "/my-work", replace: true });
    }
  }, [pathname, currentRole, nav, isSuper]);

  // Compute whether the current path is restricted for the simulated role
  // (only meaningful when a real super admin has a view-as override).
  const overrideActive = isSuper && viewAsRoleActive;
  const restrictedRole = overrideActive
    ? simulatedRouteRestriction(currentRole, pathname)
    : null;

  const groups: NavItem["group"][] = ["financial", "operational"];

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    nav({ to: "/login", replace: true });
  }

  async function stopImpersonating() {
    await stopImpFn({ data: { firm_id: null } });
    window.location.assign("/admin");
  }

  async function exitViewAsRole() {
    va.clearAll();
    await stopImpFn({ data: { firm_id: null } });
    await queryClient.invalidateQueries();
    toast.success("Back to super admin view");
    setUserMenu(false);
  }

  return (
    <div className="flex min-h-screen w-full bg-cream text-ch">
      <aside
        className={cn(
          "sticky top-0 z-30 flex h-screen shrink-0 flex-col border-r border-border bg-white transition-[width] duration-200",
          collapsed ? "w-[68px]" : "w-[244px]",
        )}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-4 pt-5 pb-6">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gold text-white font-display text-lg leading-none">
            S
          </div>
          {!collapsed && (
            <span className="font-display text-xl tracking-tight">Sightline</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {groups.map((g) => {
            const items = NAV.filter(
              (n) => n.group === g && (!n.allowRoles || n.allowRoles.includes(currentRole)),
            );
            if (items.length === 0) return null;
            const showDivider = g === "operational";
            return (
              <div key={g} className={cn("mt-1", showDivider && "mt-4 border-t border-border pt-3")}>
                {!collapsed && GROUP_LABELS[g] && (
                  <div className="px-3 pb-1.5 pt-2 text-[11px] font-medium uppercase tracking-[0.18em] text-gold">
                    {GROUP_LABELS[g]}
                  </div>
                )}
                <ul className="space-y-0.5">
                  {items
                    .filter((item) => !item.nestedUnder)
                    .map((item) => {
                      const children = items.filter((n) => n.nestedUnder === item.to);

                      const linkClass = (navItem: NavItem, nested: boolean) => {
                        const isActive =
                          pathname === navItem.to || pathname.startsWith(navItem.to + "/");
                        return cn(
                          "group flex w-full items-center gap-3 rounded-md py-2 text-sm transition-colors",
                          nested ? "pl-9 pr-3" : "px-3",
                          isActive
                            ? "bg-goldp text-ch font-medium"
                            : "text-ch/70 hover:bg-creamd hover:text-ch",
                          collapsed && !nested && "justify-center px-2",
                          collapsed && nested && "hidden",
                        );
                      };

                      const renderLink = (navItem: NavItem, nested = false) => {
                        const NavIcon = navItem.icon;
                        return (
                          <Link
                            key={navItem.to}
                            to={navItem.to as any}
                            search={navItem.search as any}
                            className={linkClass(navItem, nested)}
                            title={collapsed ? navItem.label : undefined}
                          >
                            <NavIcon className={cn("shrink-0", nested ? "h-3.5 w-3.5" : "h-4 w-4")} />
                            {!collapsed && (
                              <span className={cn("flex-1 truncate", nested && "text-[13px]")}>
                                {navItem.label}
                              </span>
                            )}
                          </Link>
                        );
                      };

                      return (
                        <li key={item.to}>
                          {renderLink(item)}
                          {children.length > 0 && !collapsed && (
                            <ul className="mt-0.5 space-y-0.5">
                              {children.map((child) => (
                                <li key={child.to}>{renderLink(child, true)}</li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                </ul>
              </div>
            );
          })}
          {isSuper && (
            <div className="mt-4 border-t border-border pt-3">
              {!collapsed && (
                <div className="px-3 pb-1.5 pt-2 text-[11px] font-medium uppercase tracking-[0.18em] text-gold">
                  Internal
                </div>
              )}
              <Link
                to={"/admin" as any}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  pathname.startsWith("/admin")
                    ? "bg-goldp text-ch font-medium"
                    : "text-ch/70 hover:bg-creamd hover:text-ch",
                  collapsed && "justify-center px-2",
                )}
                title={collapsed ? "Admin" : undefined}
              >
                <Shield className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="flex-1 truncate">Admin</span>}
              </Link>
            </div>
          )}
        </nav>

        {/* Collapse toggle */}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="mx-2 mb-2 flex items-center justify-center gap-2 rounded-md border border-border py-1.5 text-xs text-ch/60 hover:bg-creamd hover:text-ch"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : (
            <>
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Collapse</span>
            </>
          )}
        </button>

        {/* User menu */}
        <div className="relative border-t border-border p-2">
          <button
            type="button"
            onClick={() => setUserMenu((v) => !v)}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-creamd",
              collapsed && "justify-center px-1",
            )}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-goldp text-ch font-display text-sm">
              {(data?.profile?.name || data?.profile?.email || "?").slice(0, 1).toUpperCase()}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ch">
                  {data?.profile?.name || data?.profile?.email || "—"}
                </div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-gold">
                  {isSuper && !viewAsRoleActive
                    ? "Super Admin"
                    : viewAsRoleActive
                      ? `View as ${data?.profile?.role ?? "team"}`
                      : (data?.profile?.role ?? "team")}
                </div>
              </div>
            )}
          </button>
          {userMenu && (
            <div
              className={cn(
                "absolute bottom-full left-2 right-2 mb-1 rounded-md border border-border bg-white py-1 shadow-lg",
                collapsed && "right-auto w-44",
              )}
            >
              <Link
                to="/settings"
                onClick={() => setUserMenu(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-ch hover:bg-creamd"
              >
                <User className="h-4 w-4" /> Profile & settings
              </Link>
              {isSuper && viewAsRoleActive && (
                <button
                  type="button"
                  onClick={exitViewAsRole}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ch hover:bg-creamd"
                >
                  <EyeOff className="h-4 w-4" /> Exit team preview
                </button>
              )}
              <button
                type="button"
                onClick={signOut}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ch hover:bg-creamd"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {impersonating && (
          <div className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-gold/40 bg-gold px-6 py-2 text-sm text-white shadow-md">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              <span>
                Viewing as <strong>{data?.firm?.name ?? "another firm"}</strong> · You are impersonating.
              </span>
            </div>
            <button
              type="button"
              onClick={stopImpersonating}
              className="inline-flex items-center gap-1 rounded-md bg-white/15 px-3 py-1 text-xs hover:bg-white/25"
            >
              <EyeOff className="h-3 w-3" /> Exit Firm View
            </button>
          </div>
        )}
        {data?.firm && !data?.profile?.is_super_admin && (
          <TrialBanner firm={data.firm as any} />
        )}
        <ViewSwitcherBanner realIsSuper={isSuper} realImpersonating={impersonating} />
        <main className="flex-1">
          {restrictedRole ? <RestrictedPreview role={restrictedRole} /> : children}
        </main>
      </div>

      <ViewSwitcher realIsSuper={isSuper} realImpersonating={impersonating} />
    </div>
  );
}