import { useState, type ReactNode } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  LayoutDashboard,
  Calculator,
  Calendar,
  LineChart,
  BookOpen,
  Compass,
  Settings,
  HelpCircle,
  Lock,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User,
  Shield,
  EyeOff,
  Eye,
} from "lucide-react";
import { getMyContext } from "@/lib/firm.functions";
import { setImpersonation } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { TrialBanner } from "@/components/TrialBanner";
import { UpgradeModal } from "@/components/shell/UpgradeModal";
import { cn } from "@/lib/utils";

type Tier = "foundation" | "studio" | "practice";
const TIER_RANK: Record<Tier, number> = { foundation: 0, studio: 1, practice: 2 };

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  tier: Tier;
  group: "foundation" | "studio" | "practice" | "general";
};

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, tier: "foundation", group: "foundation" },
  { to: "/setup", label: "Rate & Cost", icon: Calculator, tier: "foundation", group: "foundation" },
  { to: "/time-calendar", label: "Time Calendar", icon: Calendar, tier: "studio", group: "studio" },
  { to: "/sightline", label: "Sightline", icon: LineChart, tier: "practice", group: "practice" },
  { to: "/sop-library", label: "SOP Library", icon: BookOpen, tier: "practice", group: "practice" },
  { to: "/growth-roadmap", label: "Growth Roadmap", icon: Compass, tier: "foundation", group: "general" },
  { to: "/settings", label: "Settings", icon: Settings, tier: "foundation", group: "general" },
  { to: "/knowledge-base", label: "Knowledge Base", icon: HelpCircle, tier: "foundation", group: "general" },
];

const GROUP_LABELS: Record<NavItem["group"], string> = {
  foundation: "Foundation",
  studio: "Studio",
  practice: "Practice",
  general: "",
};

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [upgradeFor, setUpgradeFor] = useState<Tier | null>(null);
  const [userMenu, setUserMenu] = useState(false);
  const nav = useNavigate();
  const getCtx = useServerFn(getMyContext);
  const stopImpFn = useServerFn(setImpersonation);
  const { data } = useQuery({ queryKey: ["me"], queryFn: () => getCtx() });

  const isSuper = !!data?.profile?.is_super_admin;
  const impersonating = isSuper && !!data?.profile?.impersonated_firm_id;
  // Super admins always operate at the highest tier — every module unlocked,
  // no upgrade prompts, no trial nag. When impersonating, the impersonated
  // firm's data drives content, but tier gating stays off so the admin can
  // exercise every screen.
  const currentTier: Tier = isSuper
    ? "practice"
    : ((data?.firm?.subscription_tier as Tier) ?? "foundation");
  const currentTierRank = TIER_RANK[currentTier];
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const groups: NavItem["group"][] = ["foundation", "studio", "practice", "general"];

  async function signOut() {
    await supabase.auth.signOut();
    nav({ to: "/" });
  }

  async function stopImpersonating() {
    await stopImpFn({ data: { firm_id: null } });
    window.location.assign("/admin");
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
          {groups.map((g, gi) => {
            const items = NAV.filter((n) => n.group === g);
            if (items.length === 0) return null;
            const showDivider = g === "general" && gi > 0;
            return (
              <div key={g} className={cn("mt-1", showDivider && "mt-4 border-t border-border pt-3")}>
                {!collapsed && GROUP_LABELS[g] && (
                  <div className="px-3 pb-1.5 pt-2 text-[10px] font-medium uppercase tracking-[0.18em] text-ch/40">
                    {GROUP_LABELS[g]}
                  </div>
                )}
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const locked = TIER_RANK[item.tier] > currentTierRank;
                    const active = pathname === item.to || pathname.startsWith(item.to + "/");
                    const Icon = item.icon;
                    const content = (
                      <>
                        <Icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                        {!collapsed && locked && <Lock className="h-3 w-3 text-ch/30" />}
                      </>
                    );
                    const baseClass = cn(
                      "group flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-goldp text-ch font-medium"
                        : "text-ch/70 hover:bg-creamd hover:text-ch",
                      locked && "text-ch/40 hover:text-ch/60",
                      collapsed && "justify-center px-2",
                    );
                    return (
                      <li key={item.to}>
                        {locked ? (
                          <button
                            type="button"
                            onClick={() => setUpgradeFor(item.tier)}
                            className={baseClass}
                            title={collapsed ? `${item.label} — Upgrade required` : undefined}
                          >
                            {content}
                          </button>
                        ) : (
                          <Link to={item.to} className={baseClass} title={collapsed ? item.label : undefined}>
                            {content}
                          </Link>
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
                <div className="px-3 pb-1.5 pt-2 text-[10px] font-medium uppercase tracking-[0.18em] text-gold">
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
                  {data?.profile?.role ?? "team"}
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
        {data?.firm && !isSuper && (
          <TrialBanner trialEndsAt={data.firm.trial_ends_at} status={data.firm.subscription_status} />
        )}
        <main className="flex-1">{children}</main>
      </div>

      <UpgradeModal
        targetTier={upgradeFor}
        currentTier={currentTier}
        onClose={() => setUpgradeFor(null)}
      />
    </div>
  );
}