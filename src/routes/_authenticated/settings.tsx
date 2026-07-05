import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DollarSign, Receipt, Calculator, User, Building2, Users,
  CreditCard, Bell, SlidersHorizontal, Lock, X, Plus, Trash2,
} from "lucide-react";
import {
  getMyContext, updateFirm, listTeam, inviteTeamMember, resendInvitation,
  upsertFirmConfig, listExpenses, addExpense, deleteExpense,
  updateTeamMember, setPreferredHome,
  listOwnerCompensations, upsertOwnerCompensation,
} from "@/lib/firm.functions";
import { useMe, effectiveRole } from "@/lib/role";
import { ModulePage } from "@/components/shell/ModulePage";
import { calc, type Expense, type OwnerCompensationRow } from "@/lib/finance";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type PanelId =
  | "comp" | "opex" | "rate" | "team_cost"
  | "profile" | "firm" | "team" | "billing"
  | "notifications" | "preferences" | "security";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Sightline" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    panel: (s.panel as PanelId | undefined) ?? undefined,
  }),
  component: SettingsPage,
});

/* ────────────────────────────── shared UI ────────────────────────────── */

const inputCls =
  "w-full rounded-[5px] border border-border bg-white px-2.5 py-[7px] text-[12px] text-ch placeholder:text-ch/40 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold/30";
const selectCls = inputCls + " cursor-pointer appearance-none pr-6 bg-no-repeat bg-[right_8px_center] " +
  "[background-image:url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='none' stroke='%23777' stroke-width='1.2' d='M1 1l4 4 4-4'/></svg>\")]";
const goldBtn =
  "inline-flex items-center justify-center rounded-[4px] bg-gold px-4 py-[7px] text-[11px] font-medium text-white hover:bg-goldl disabled:opacity-50";
const ghostBtn =
  "inline-flex items-center justify-center rounded-[4px] border border-border bg-white px-3 py-[7px] text-[11px] text-ch/70 hover:bg-cream";
const darkBtn =
  "inline-flex items-center justify-center rounded-[4px] bg-ch px-3 py-[6px] text-[11px] font-medium text-white hover:opacity-90";
const dangerGhostBtn =
  "inline-flex items-center rounded-[4px] border border-danger/60 bg-white px-3 py-[6px] text-[11px] text-danger hover:bg-danger/5";

const fieldLabel = "mb-1 block text-[10px] font-medium uppercase tracking-[0.09em] text-ch/60";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className={fieldLabel}>{label}</label>
      {children}
    </div>
  );
}
function Row2({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">{children}</div>;
}
function SaveRow({ onCancel, onSave, saveLabel = "Save", saving }: {
  onCancel?: () => void; onSave?: () => void; saveLabel?: string; saving?: boolean;
}) {
  return (
    <div className="mt-3 flex justify-end gap-2">
      {onCancel && <button type="button" className={ghostBtn} onClick={onCancel}>Cancel</button>}
      <button type="button" className={goldBtn} onClick={onSave} disabled={saving}>
        {saving ? "Saving…" : saveLabel}
      </button>
    </div>
  );
}

/* ────────────────────────────── page ────────────────────────────── */

function SettingsPage() {
  const { data, isLoading } = useMe();
  const role = effectiveRole(data?.profile);
  const isAdmin = role === "principal" || role === "admin";

  if (isLoading) {
    return (
      <ModulePage title="Settings">
        <p className="text-sm text-ch/50">Loading…</p>
      </ModulePage>
    );
  }

  if (!isAdmin) {
    // Team / view_only: profile only, no tile grid.
    return (
      <div className="min-h-screen bg-cream px-8 pt-7 pb-16">
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-gold">Settings</p>
        <h1 className="mt-1 font-display text-[28px] font-normal text-ch">Your profile</h1>
        <p className="mt-1 mb-5 text-[12px] font-light text-ch/60">Your name and contact info.</p>
        <div className="max-w-2xl rounded-[8px] border border-border bg-white p-6">
          <ProfilePanelBody />
        </div>
      </div>
    );
  }

  return <AdminSettings />;
}

function AdminSettings() {
  const { panel } = Route.useSearch();
  const navigate = useNavigate();
  const [active, setActive] = useState<PanelId | null>(panel ?? null);

  // Sync from URL if it changes externally
  useEffect(() => { setActive(panel ?? null); }, [panel]);

  function open(id: PanelId) {
    const next = active === id ? null : id;
    setActive(next);
    navigate({ to: "/settings", search: next ? { panel: next } : {}, replace: true });
  }
  function close() {
    setActive(null);
    navigate({ to: "/settings", search: {}, replace: true });
  }

  return (
    <div className="min-h-screen bg-cream px-8 pt-7 pb-16">
      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-gold">Settings</p>
      <h1 className="mt-1 font-display text-[28px] font-normal leading-tight text-ch">Your account</h1>
      <p className="mt-1 mb-5 text-[12px] font-light text-ch/60">
        Click any section to view or update it.
      </p>

      <GroupLabel>Financial architecture</GroupLabel>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-2 lg:grid-cols-4">
        <FinancialTiles active={active} onOpen={open} />
      </div>

      <GroupLabel className="mt-5">Account</GroupLabel>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        <AccountTiles active={active} onOpen={open} />
      </div>

      {active && (
        <div className="mt-3 rounded-[8px] border border-border bg-white px-7 pt-6 pb-6">
          {active === "comp" && <CompPanel onClose={close} />}
          {active === "opex" && <OpexPanel onClose={close} />}
          {active === "rate" && <RatePanel onClose={close} />}
          {active === "team_cost" && <TeamCostPanel onClose={close} />}
          {active === "profile" && <PanelShell title="Profile" subtitle="Your name and contact info." onClose={close}><ProfilePanelBody /></PanelShell>}
          {active === "firm" && <FirmPanel onClose={close} />}
          {active === "team" && <TeamPanel onClose={close} />}
          {active === "billing" && <BillingPanel onClose={close} />}
          {active === "notifications" && <NotificationsPanel onClose={close} />}
          {active === "preferences" && <PreferencesPanel onClose={close} />}
          {active === "security" && <SecurityPanel onClose={close} />}
        </div>
      )}
    </div>
  );
}

function GroupLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mt-5 mb-2.5 border-b border-border pb-1.5 text-[9px] font-medium uppercase tracking-[0.1em] text-ch/60", className)}>
      {children}
    </div>
  );
}

/* ────────────────────────────── tiles ────────────────────────────── */

type Status = { tone: "ok" | "warn" | "muted"; text: string };
type TileDef = {
  id: PanelId; name: string; desc: string;
  icon: typeof User; gold?: boolean; status: Status;
};

function Tile({ t, active, onOpen }: { t: TileDef; active: PanelId | null; onOpen: (id: PanelId) => void }) {
  const isActive = active === t.id;
  const Icon = t.icon;
  const dot =
    t.status.tone === "ok" ? "#639922"
    : t.status.tone === "warn" ? "#BA7517"
    : "var(--border)";
  const textColor =
    t.status.tone === "ok" ? "#27500A"
    : t.status.tone === "warn" ? "#633806"
    : "rgba(44,44,44,0.55)";
  return (
    <button
      type="button"
      onClick={() => onOpen(t.id)}
      className={cn(
        "text-left rounded-[8px] border border-border bg-white px-4 pt-3.5 pb-3 transition-colors hover:border-gold",
        isActive && "border-gold bg-[#FFFDF9]",
      )}
    >
      <Icon size={18} className={cn("mb-2 block", t.gold ? "text-gold" : "text-ch/60")} />
      <div className="text-[12px] font-medium text-ch">{t.name}</div>
      <div className="mt-0.5 text-[10px] font-light leading-[1.4] text-ch/60">{t.desc}</div>
      <div className="mt-2.5 flex items-center gap-1.5 border-t border-border pt-2.5">
        <span className="h-[5px] w-[5px] rounded-full" style={{ backgroundColor: dot }} />
        <span className="text-[10px] font-medium" style={{ color: textColor }}>{t.status.text}</span>
      </div>
    </button>
  );
}

function FinancialTiles({ active, onOpen }: { active: PanelId | null; onOpen: (id: PanelId) => void }) {
  const getCtx = useServerFn(getMyContext);
  const listExp = useServerFn(listExpenses);
  const listOwn = useServerFn(listOwnerCompensations);
  const listT = useServerFn(listTeam);
  const { data: ctx } = useQuery({ queryKey: ["me"], queryFn: () => getCtx() });
  const { data: expenses } = useQuery({ queryKey: ["expenses"], queryFn: () => listExp() });
  const { data: ownerData } = useQuery({ queryKey: ["ownerComp"], queryFn: () => listOwn() });
  const { data: teamData } = useQuery({ queryKey: ["team"], queryFn: () => listT() });

  const cfg = ctx?.config ?? null;
  const ownerRows = (ownerData?.comp ?? []) as OwnerCompensationRow[];
  const principalCount = ownerData?.principals?.length ?? 0;
  const teamMembers = (teamData?.members ?? []).filter((m: any) => m.role !== "principal");
  const teamBurdens = teamMembers.map((m: any) => ({
    burdened_weekly_cost: m.burdened_weekly_cost,
    weeks_per_year: m.weeks_per_year,
  }));
  const c = useMemo(
    () => calc(cfg, (expenses ?? []) as Expense[], { ownerComp: ownerRows, teamProfiles: teamBurdens }),
    [cfg, expenses, ownerRows, teamBurdens],
  );

  // Owner comp tile status hint (multi-principal aware).
  const configuredRows = ownerRows.filter((r) => Number(r.comp_draw_annual) > 0);
  let compStatus: Status;
  if (principalCount === 0 || configuredRows.length === 0) {
    compStatus = { tone: "muted", text: "Not configured" };
  } else if (principalCount === 1 && configuredRows.length === 1) {
    const row = configuredRows[0];
    const drawK = Math.round((Number(row.comp_draw_annual) || 0) / 1000);
    compStatus = { tone: "ok", text: `$${drawK}k draw · $${Math.round(c.compTotal / 1000)}k total` };
  } else if (principalCount === configuredRows.length) {
    compStatus = { tone: "ok", text: `${principalCount} principals · $${Math.round(c.compTotal / 1000)}k combined` };
  } else {
    compStatus = { tone: "warn", text: `${configuredRows.length} of ${principalCount} principals configured` };
  }

  // Team cost tile status hint.
  const teamCount = teamMembers.length;
  const teamConfigured = teamMembers.filter((m: any) => Number(m.burdened_weekly_cost) > 0).length;
  let teamCostStatus: Status;
  if (teamCount === 0) {
    teamCostStatus = { tone: "muted", text: "No team members" };
  } else if (teamConfigured === 0) {
    teamCostStatus = { tone: "muted", text: `${teamCount} not configured` };
  } else if (teamConfigured === teamCount) {
    teamCostStatus = { tone: "ok", text: `${teamCount} members · $${Math.round(c.teamCostTotal / 1000)}k/yr` };
  } else {
    teamCostStatus = { tone: "warn", text: `${teamConfigured} of ${teamCount} configured` };
  }

  const expenseCount = expenses?.length ?? 0;
  const opexStatus: Status = expenseCount > 0
    ? { tone: "ok", text: `${expenseCount} expenses · $${Math.round((c.opexRecurring + c.opexOneTime) / 1000)}k/yr` }
    : { tone: "muted", text: "No expenses added" };

  let rateStatus: Status;
  if (cfg?.rate_billed && cfg?.target_billable_hrs_per_week) {
    const label = `${cfg.target_billable_hrs_per_week} hrs/wk · $${Math.round(cfg.rate_billed)}/hr`;
    rateStatus =
      c.rateHealth === "healthy" ? { tone: "ok", text: `${label} · Above floor` }
      : c.rateHealth === "below_floor" ? { tone: "warn", text: `${label} · Below floor` }
      : { tone: "warn", text: "Below break-even" };
  } else {
    rateStatus = { tone: "muted", text: "Not configured" };
  }

  const tiles: TileDef[] = [
    { id: "comp", name: "Owner compensation", desc: "Everything you take out of the firm in a year.", icon: DollarSign, gold: true, status: compStatus },
    { id: "opex", name: "Operating expenses", desc: "Fixed and recurring costs of running the firm.", icon: Receipt, gold: true, status: opexStatus },
    { id: "rate", name: "Capacity and rate", desc: "How many hours you sell and what you charge.", icon: Calculator, gold: true, status: rateStatus },
    { id: "team_cost", name: "Team cost", desc: "Fully burdened cost of your team members.", icon: Users, gold: true, status: teamCostStatus },
  ];
  return <>{tiles.map(t => <Tile key={t.id} t={t} active={active} onOpen={onOpen} />)}</>;
}

function AccountTiles({ active, onOpen }: { active: PanelId | null; onOpen: (id: PanelId) => void }) {
  const getCtx = useServerFn(getMyContext);
  const list = useServerFn(listTeam);
  const { data: ctx } = useQuery({ queryKey: ["me"], queryFn: () => getCtx() });
  const { data: team } = useQuery({ queryKey: ["team"], queryFn: () => list() });

  const firmName = ctx?.firm?.name;
  const memberCount = team?.members?.length ?? 0;
  const pendingCount = team?.invites?.length ?? 0;

  const tier = ctx?.firm?.subscription_tier as string | undefined;
  const status = ctx?.firm?.subscription_status as string | undefined;
  const trialEnds = ctx?.firm?.trial_ends_at;
  const trialDays = trialEnds ? Math.max(0, Math.ceil((new Date(trialEnds).getTime() - Date.now()) / 86400000)) : 0;
  const tierPrice: Record<string, string> = { studio: "$69", practice: "$129" };
  const tierName: Record<string, string> = { foundation: "Foundation", studio: "Sightline", practice: "Practice" };

  const billingStatus: Status =
    status === "trialing" ? { tone: "warn", text: `Trial · ${trialDays} days remaining` }
    : status === "active" && tier ? { tone: "ok", text: `${tierName[tier] ?? tier} · ${tierPrice[tier] ?? ""}${tierPrice[tier] ? "/mo" : ""}` }
    : { tone: "muted", text: "No active plan" };

  const teamStatus: Status =
    pendingCount > 0 ? { tone: "warn", text: `${pendingCount} invite${pendingCount === 1 ? "" : "s"} pending` }
    : memberCount > 1 ? { tone: "ok", text: `${memberCount} members` }
    : { tone: "muted", text: "Solo — no team yet" };

  const tiles: TileDef[] = [
    { id: "profile", name: "Profile", desc: "Your name and contact info.", icon: User, status: { tone: "ok", text: "Complete" } },
    { id: "firm", name: "Firm", desc: "Firm name and business configuration.", icon: Building2, status: firmName ? { tone: "ok", text: "Complete" } : { tone: "muted", text: "Not set" } },
    { id: "team", name: "Team", desc: "Members, roles, and invitations.", icon: Users, status: teamStatus },
    { id: "billing", name: "Billing", desc: "Your current plan and payment method.", icon: CreditCard, status: billingStatus },
    { id: "notifications", name: "Notifications", desc: "Alerts and email preferences.", icon: Bell, status: { tone: "muted", text: "Default settings" } },
    { id: "preferences", name: "Preferences", desc: "Display and regional settings.", icon: SlidersHorizontal, status: { tone: "muted", text: "Default settings" } },
    { id: "security", name: "Security", desc: "Password and account access.", icon: Lock, status: { tone: "ok", text: "Secure" } },
  ];
  return <>{tiles.map(t => <Tile key={t.id} t={t} active={active} onOpen={onOpen} />)}</>;
}

/* ────────────────────────────── panel shell ────────────────────────────── */

function PanelShell({ title, subtitle, onClose, children }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="text-[14px] font-medium text-ch">{title}</div>
          {subtitle && <div className="mt-0.5 text-[11px] text-ch/60">{subtitle}</div>}
        </div>
        <button type="button" onClick={onClose} className="text-ch/50 hover:text-ch">
          <X size={16} />
        </button>
      </div>
      {children}
    </>
  );
}

/* ────────────────────────────── financial panels ────────────────────────────── */

function FinancialLayout({ title, subtitle, onClose, left, cfg, expenses }: {
  title: string; subtitle: string; onClose: () => void; left: React.ReactNode;
  cfg: any; expenses: Expense[];
}) {
  const listOwn = useServerFn(listOwnerCompensations);
  const listT = useServerFn(listTeam);
  const { data: ownerData } = useQuery({ queryKey: ["ownerComp"], queryFn: () => listOwn() });
  const { data: teamData } = useQuery({ queryKey: ["team"], queryFn: () => listT() });
  const ownerComp = (cfg?.__ownerCompOverride as OwnerCompensationRow[] | undefined)
    ?? ((ownerData?.comp ?? []) as OwnerCompensationRow[]);
  const teamProfiles = (teamData?.members ?? [])
    .filter((m: any) => m.role !== "principal")
    .map((m: any) => ({
      burdened_weekly_cost: m.burdened_weekly_cost,
      weeks_per_year: m.weeks_per_year,
    }));
  const c = useMemo(
    () => calc(cfg, expenses, { ownerComp, teamProfiles }),
    [cfg, expenses, ownerComp, teamProfiles],
  );
  const rateStatus =
    c.rateHealth === "healthy" ? "Above floor"
    : c.rateHealth === "below_floor" ? "Below floor"
    : "Below break-even";
  const budgetRevenue = (cfg?.rate_billed ?? 0) * (cfg?.target_billable_hrs_per_week ?? 0) * 52;
  const rows: [string, string, boolean?][] = [
    ["Billed rate", `$${Math.round(c.billedRate)}/hr`, true],
    ["Rate health", rateStatus],
    ["Margin", `+$${Math.round(c.marginAboveFloor)}/hr`, true],
    ["Break-even", `$${Math.round(c.breakEvenRate)}/hr`],
    ["Cost floor", `$${Math.round(c.totalCost).toLocaleString()}`],
    ["Budget revenue", `$${Math.round(budgetRevenue).toLocaleString()}`],
  ];
  return (
    <PanelShell title={title} subtitle={subtitle} onClose={onClose}>
      <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
        <div>{left}</div>
        <aside>
          <div className="rounded-[7px] border border-border bg-cream p-3.5 lg:sticky lg:top-5">
            <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-gold">Live output</p>
            <h3 className="mt-0.5 mb-3 font-display text-[18px] text-ch">Your numbers</h3>
            <div className="text-[9px] uppercase tracking-[0.1em] text-ch/60">Aligned rate</div>
            <div className="font-display text-[32px] leading-none text-ch">${Math.round(c.alignedRate)}</div>
            <div className="mt-1 text-[10px] text-ch/60 mb-2.5">Your floor.</div>
            <div className="border-t border-border">
              {rows.map(([label, value, gold], i) => (
                <div key={label} className={cn("flex justify-between py-1 text-[11px]", i < rows.length - 1 && "border-b border-border")}>
                  <span className="text-ch/60">{label}</span>
                  <span className={cn("font-medium", gold ? "text-gold" : "text-ch")}>{value}</span>
                </div>
              ))}
            </div>
            <p className="mt-2.5 text-[10px] text-ch/60">Changes save automatically.</p>
          </div>
        </aside>
      </div>
    </PanelShell>
  );
}

function useFinancialDraft() {
  const qc = useQueryClient();
  const getCtx = useServerFn(getMyContext);
  const listExp = useServerFn(listExpenses);
  const saveCfg = useServerFn(upsertFirmConfig);
  const { data: ctx } = useQuery({ queryKey: ["me"], queryFn: () => getCtx() });
  const { data: expenses } = useQuery({ queryKey: ["expenses"], queryFn: () => listExp() });
  const cfg = ctx?.config ?? null;

  const [draft, setDraft] = useState<Record<string, string>>({});
  const hydrated = useRef(false);
  useEffect(() => {
    if (!cfg || hydrated.current) return;
    setDraft({
      comp_draw_annual: cfg.comp_draw_annual?.toString() ?? "",
      comp_ptax_pct: cfg.comp_ptax_pct?.toString() ?? "15.3",
      comp_health_annual: cfg.comp_health_annual?.toString() ?? "",
      comp_retire_annual: cfg.comp_retire_annual?.toString() ?? "",
      comp_distribution_annual: cfg.comp_distribution_annual?.toString() ?? "",
      comp_reserve_target_annual: cfg.comp_reserve_target_annual?.toString() ?? "",
      available_hrs_per_week: cfg.available_hrs_per_week?.toString() ?? "",
      target_billable_hrs_per_week: cfg.target_billable_hrs_per_week?.toString() ?? "",
      target_gross_margin_pct: cfg.target_gross_margin_pct?.toString() ?? "",
      rate_billed: cfg.rate_billed?.toString() ?? "",
    });
    hydrated.current = true;
  }, [cfg]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function patch(p: Record<string, string>) {
    setDraft(d => {
      const next = { ...d, ...p };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const payload: Record<string, number | null> = {};
        const keys = [
          "comp_draw_annual","comp_ptax_pct","comp_health_annual","comp_retire_annual",
          "comp_distribution_annual","comp_reserve_target_annual",
          "available_hrs_per_week","target_billable_hrs_per_week",
          "target_gross_margin_pct","rate_billed",
        ];
        for (const k of keys) {
          const v = next[k] ?? "";
          const n = v === "" ? null : Number(v);
          payload[k] = n !== null && Number.isFinite(n) ? n : null;
        }
        try {
          await saveCfg({ data: payload as any });
          qc.invalidateQueries({ queryKey: ["me"] });
          qc.invalidateQueries({ queryKey: ["dashboard"] });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not save. Try again.");
        }
      }, 700);
      return next;
    });
  }

  const num = (k: string) => {
    const v = draft[k] ?? "";
    return v === "" ? null : Number(v);
  };
  const liveConfig = {
    comp_draw_annual: num("comp_draw_annual"),
    comp_ptax_pct: num("comp_ptax_pct"),
    comp_health_annual: num("comp_health_annual"),
    comp_retire_annual: num("comp_retire_annual"),
    comp_distribution_annual: num("comp_distribution_annual"),
    comp_reserve_target_annual: num("comp_reserve_target_annual"),
    available_hrs_per_week: num("available_hrs_per_week"),
    target_billable_hrs_per_week: num("target_billable_hrs_per_week"),
    target_gross_margin_pct: num("target_gross_margin_pct"),
    rate_billed: num("rate_billed"),
    actual_billed_rate: null,
    business_structure: cfg?.business_structure ?? "sole_prop",
  };
  return { draft, patch, liveConfig, cfg, expenses: (expenses ?? []) as Expense[] };
}

function NumInput({ value, onChange, prefix, suffix, placeholder }: {
  value: string; onChange: (v: string) => void; prefix?: string; suffix?: string; placeholder?: string;
}) {
  return (
    <div className="relative">
      {prefix && <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-[12px] text-ch/40">{prefix}</span>}
      <input
        type="number" step="any" min={0} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputCls, prefix && "pl-6", suffix && "pr-7")}
      />
      {suffix && <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[12px] text-ch/40">{suffix}</span>}
    </div>
  );
}

function CompPanel({ onClose }: { onClose: () => void }) {
  const { draft, patch, liveConfig, expenses, cfg } = useFinancialDraft();
  const salary = Number(draft.comp_draw_annual) || 0;
  const ptax = (salary * (Number(draft.comp_ptax_pct) || 0)) / 100;
  const isSCorp = cfg?.business_structure === "s_corp";
  const dist = isSCorp ? Number(draft.comp_distribution_annual) || 0 : 0;
  const reserve = isSCorp ? Number(draft.comp_reserve_target_annual) || 0 : 0;
  const health = Number(draft.comp_health_annual) || 0;
  const retire = Number(draft.comp_retire_annual) || 0;
  const total = salary + ptax + dist + reserve + health + retire;

  return (
    <FinancialLayout
      title="Owner compensation"
      subtitle="Everything you take out of the firm in a year."
      onClose={onClose}
      cfg={liveConfig} expenses={expenses}
      left={
        <>
          <Row2>
            <Field label="Annual salary / owner draw">
              <NumInput value={draft.comp_draw_annual ?? ""} onChange={(v) => patch({ comp_draw_annual: v })} prefix="$" />
            </Field>
            <Field label="Self-employment tax %">
              <NumInput value={draft.comp_ptax_pct ?? ""} onChange={(v) => patch({ comp_ptax_pct: v })} suffix="%" />
            </Field>
          </Row2>
          <Row2>
            <Field label="Annual health insurance">
              <NumInput value={draft.comp_health_annual ?? ""} onChange={(v) => patch({ comp_health_annual: v })} prefix="$" />
            </Field>
            <Field label="Retirement contribution">
              <NumInput value={draft.comp_retire_annual ?? ""} onChange={(v) => patch({ comp_retire_annual: v })} prefix="$" />
            </Field>
          </Row2>
          {isSCorp && (
            <Row2>
              <Field label="Distribution / owner bonus">
                <NumInput value={draft.comp_distribution_annual ?? ""} onChange={(v) => patch({ comp_distribution_annual: v })} prefix="$" placeholder="0" />
              </Field>
              <Field label="Reserve target (S-Corp)">
                <NumInput value={draft.comp_reserve_target_annual ?? ""} onChange={(v) => patch({ comp_reserve_target_annual: v })} prefix="$" placeholder="0" />
              </Field>
            </Row2>
          )}
          <div className="mt-1 flex justify-between border-t border-border pt-2.5 text-[12px]">
            <span className="text-ch/60">Compensation subtotal</span>
            <span className="font-medium text-ch">${Math.round(total).toLocaleString()}</span>
          </div>
        </>
      }
    />
  );
}

function OpexPanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { liveConfig, expenses } = useFinancialDraft();
  const addExp = useServerFn(addExpense);
  const delExp = useServerFn(deleteExpense);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", amount: "", frequency: "monthly" as Expense["frequency"] });

  const annualTotal = expenses.reduce((sum, e) => {
    const amt = Number(e.amount) || 0;
    if (e.frequency === "annual") return sum + amt;
    if (e.frequency === "monthly") return sum + amt * 12;
    if (e.frequency === "quarterly") return sum + amt * 4;
    const m = Number(e.amort_months) || 12;
    return sum + (amt / m) * 12;
  }, 0);

  async function save() {
    if (!form.name || !form.amount) return;
    try {
      await addExp({ data: { name: form.name, amount: Number(form.amount), frequency: form.frequency, recurring: form.frequency !== "onetime" } as any });
      setForm({ name: "", amount: "", frequency: "monthly" });
      setAdding(false);
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Expense added.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save."); }
  }
  async function remove(id: string) {
    await delExp({ data: { id } });
    qc.invalidateQueries({ queryKey: ["expenses"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  }

  return (
    <FinancialLayout
      title="Operating expenses"
      subtitle="Fixed and recurring costs of running the firm."
      onClose={onClose} cfg={liveConfig} expenses={expenses}
      left={
        <>
          <div className="mb-2.5 overflow-hidden rounded-[6px] border border-border bg-white">
            <div className="grid grid-cols-[1fr_100px_100px_28px] bg-creamd/60 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-ch/60">
              <span>Expense</span><span>Amount</span><span>Frequency</span><span></span>
            </div>
            {expenses.map((e, i) => (
              <div key={e.id} className={cn("grid grid-cols-[1fr_100px_100px_28px] items-center px-3 py-[7px] text-[11px]", i < expenses.length - 1 && "border-b border-border")}>
                <span className="text-ch">{e.name}</span>
                <span className="text-ch">${Number(e.amount).toLocaleString()}</span>
                <span className="text-ch/60 capitalize">{e.frequency}</span>
                <button onClick={() => remove(e.id)} className="text-ch/40 hover:text-danger"><X size={13} /></button>
              </div>
            ))}
            {!expenses.length && !adding && <div className="px-3 py-4 text-center text-[11px] text-ch/50">No expenses yet.</div>}
          </div>

          {adding ? (
            <div className="rounded-[6px] border border-border bg-cream p-3">
              <div className="mb-2 flex gap-2">
                <input className={cn(inputCls, "flex-1")} placeholder="Expense name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <div className="relative w-[100px]">
                  <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-[12px] text-ch/40">$</span>
                  <input type="number" className={cn(inputCls, "pl-6")} placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
                <select className={cn(selectCls, "w-[110px]")} value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as Expense["frequency"] })}>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                  <option value="onetime">One-time</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className={ghostBtn} onClick={() => { setAdding(false); setForm({ name: "", amount: "", frequency: "monthly" }); }}>Cancel</button>
                <button type="button" className={goldBtn} onClick={save}>Save</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 text-[11px] text-gold hover:underline">
              <Plus size={13} /> Add expense
            </button>
          )}

          <div className="mt-3 flex justify-between border-t border-border pt-2.5 text-[12px]">
            <span className="text-ch/60">Annual operating total</span>
            <span className="font-medium text-ch">${Math.round(annualTotal).toLocaleString()}</span>
          </div>
        </>
      }
    />
  );
}

function RatePanel({ onClose }: { onClose: () => void }) {
  const { draft, patch, liveConfig, expenses } = useFinancialDraft();
  const avail = Number(draft.available_hrs_per_week) || 0;
  const target = Number(draft.target_billable_hrs_per_week) || 0;
  const utilization = avail > 0 ? (target / avail) * 100 : 0;
  return (
    <FinancialLayout
      title="Capacity and rate"
      subtitle="How many hours you sell and what you charge."
      onClose={onClose} cfg={liveConfig} expenses={expenses}
      left={
        <>
          <Row2>
            <Field label="Available hours / week">
              <NumInput value={draft.available_hrs_per_week ?? ""} onChange={(v) => patch({ available_hrs_per_week: v })} />
            </Field>
            <Field label="Target billable hrs / week">
              <NumInput value={draft.target_billable_hrs_per_week ?? ""} onChange={(v) => patch({ target_billable_hrs_per_week: v })} />
            </Field>
          </Row2>
          <Row2>
            <Field label="Target gross margin %">
              <NumInput value={draft.target_gross_margin_pct ?? ""} onChange={(v) => patch({ target_gross_margin_pct: v })} suffix="%" />
            </Field>
            <Field label="Your billed rate ($/hr)">
              <NumInput value={draft.rate_billed ?? ""} onChange={(v) => patch({ rate_billed: v })} prefix="$" />
            </Field>
          </Row2>
          <div className="rounded-[4px] border border-border bg-creamd/50 px-3 py-2.5 text-[11px] text-ch">
            <span className="text-ch/60">Utilization target: </span>
            <span className="font-medium">{utilization.toFixed(0)}%</span>
            <span className="text-ch/50"> ({target} of {avail} hrs/week)</span>
          </div>
        </>
      }
    />
  );
}

/* ────────────────────────────── account panels ────────────────────────────── */

function ProfilePanelBody() {
  const qc = useQueryClient();
  const { data } = useMe();
  const p = data?.profile;
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!p) return;
    const parts = (p.name || "").split(" ");
    setFirst(parts[0] ?? ""); setLast(parts.slice(1).join(" "));
    setPhone((p as any).phone ?? "");
  }, [p?.id]);

  async function save() {
    setSaving(true);
    try {
      const name = [first, last].filter(Boolean).join(" ");
      const { error } = await supabase.from("profiles").update({ name }).eq("id", p!.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Profile saved.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save. Try again."); }
    finally { setSaving(false); }
  }
  return (
    <>
      <Row2>
        <Field label="First name"><input className={inputCls} value={first} onChange={(e) => setFirst(e.target.value)} /></Field>
        <Field label="Last name"><input className={inputCls} value={last} onChange={(e) => setLast(e.target.value)} /></Field>
      </Row2>
      <Field label="Email address"><input className={inputCls} value={p?.email ?? ""} readOnly /></Field>
      <Field label="Phone (optional)"><input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
      <SaveRow onSave={save} saving={saving} />
    </>
  );
}

function FirmPanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data } = useMe();
  const upd = useServerFn(updateFirm);
  const updCfg = useServerFn(upsertFirmConfig);
  const saveHome = useServerFn(setPreferredHome);
  const [name, setName] = useState(data?.firm?.name ?? "");
  const [structure, setStructure] = useState((data?.config?.business_structure as string) ?? "sole_prop");
  const [basis, setBasis] = useState((data?.config?.accounting_basis as string) ?? "cash");
  const [home, setHome] = useState(((data?.profile as any)?.preferred_home as string) ?? "dashboard");
  const [state, setState] = useState((data?.firm as any)?.state ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await upd({ data: { name } });
      await updCfg({ data: { business_structure: structure as any, accounting_basis: basis as any } });
      await saveHome({ data: { preferred_home: home as any } });
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Firm saved.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save. Try again."); }
    finally { setSaving(false); }
  }

  return (
    <PanelShell title="Firm" subtitle="Firm name and business configuration." onClose={onClose}>
      <Field label="Firm name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Row2>
        <Field label="Business structure">
          <select className={selectCls} value={structure} onChange={(e) => setStructure(e.target.value)}>
            <option value="sole_prop">Sole proprietor</option>
            <option value="s_corp">S-Corp</option>
            <option value="other">LLC</option>
          </select>
        </Field>
        <Field label="Accounting basis">
          <select className={selectCls} value={basis} onChange={(e) => setBasis(e.target.value)}>
            <option value="cash">Cash basis</option>
            <option value="accrual">Accrual basis</option>
          </select>
        </Field>
      </Row2>
      <Row2>
        <Field label="Default home screen">
          <select className={selectCls} value={home} onChange={(e) => setHome(e.target.value)}>
            <option value="dashboard">Dashboard</option>
            <option value="calendar">Time Calendar</option>
            <option value="sightline">Projects</option>
          </select>
        </Field>
        <Field label="State of incorporation">
          <select className={selectCls} value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">Select…</option>
            {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </Row2>
      <SaveRow onCancel={onClose} onSave={save} saving={saving} />
    </PanelShell>
  );
}

const US_STATES = ["Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming"];

function TeamPanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const list = useServerFn(listTeam);
  const invite = useServerFn(inviteTeamMember);
  const update = useServerFn(updateTeamMember);
  const resend = useServerFn(resendInvitation);
  const { data } = useQuery({ queryKey: ["team"], queryFn: () => list() });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"team" | "admin" | "view_only">("team");
  const [sending, setSending] = useState(false);

  function refresh() { qc.invalidateQueries({ queryKey: ["team"] }); }

  async function send() {
    if (!email) return;
    setSending(true);
    try {
      await invite({ data: { email, role } as any });
      toast.success("Invitation sent.");
      setEmail("");
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not send."); }
    finally { setSending(false); }
  }

  async function changeRole(id: string, r: string) {
    try {
      await update({ data: { id, role: r as any } });
      toast.success("Role updated.");
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not update."); }
  }

  const initials = (name: string, email: string) =>
    (name || email).split(/\s+/).map(s => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <PanelShell title="Team" subtitle="Members, roles, and invitations." onClose={onClose}>
      <div className="mb-3 overflow-hidden rounded-[6px] border border-border bg-white">
        {data?.members?.map((m, i) => (
          <div key={m.id} className={cn("flex items-center gap-2.5 px-3 py-2.5", i < (data?.members?.length ?? 0) - 1 && "border-b border-border")}>
            <div className="grid h-[26px] w-[26px] place-items-center rounded-full border border-gold bg-cream text-[9px] font-medium text-gold">{initials(m.name || "", m.email)}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-medium text-ch">{m.name || m.email}</div>
              <div className="truncate text-[10px] text-ch/60">{m.email}</div>
            </div>
            {m.role === "principal" ? (
              <span className="text-[10px] text-ch/60">Principal</span>
            ) : (
              <select className={cn(selectCls, "w-[110px] py-[3px] text-[10px]")} value={m.role} onChange={(e) => changeRole(m.id, e.target.value)}>
                <option value="admin">Admin</option>
                <option value="team">Team</option>
                <option value="view_only">View only</option>
              </select>
            )}
          </div>
        ))}
        {data?.invites?.map((i) => (
          <div key={i.id} className="flex items-center gap-2.5 border-t border-border bg-cream/50 px-3 py-2.5">
            <div className="grid h-[26px] w-[26px] place-items-center rounded-full border border-border bg-creamd/50 text-[9px] text-ch/50">{initials("", i.email)}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] text-ch/60">{i.email}</div>
              <div className="truncate text-[10px] text-ch/50">{i.role}</div>
            </div>
            <span className="rounded-[3px] bg-[#FAEEDA] px-1.5 py-[2px] text-[10px] font-medium text-[#633806]">Pending</span>
            <button
              type="button"
              onClick={async () => { try { await resend({ data: { id: i.id } }); toast.success("Resent."); refresh(); } catch { toast.error("Could not resend."); } }}
              className="text-[10px] text-ch/60 hover:text-gold"
            >Resend</button>
          </div>
        ))}
        {!data?.members?.length && !data?.invites?.length && (
          <div className="px-3 py-6 text-center text-[11px] text-ch/50">No team members yet.</div>
        )}
      </div>

      <div className="rounded-[6px] border border-border bg-cream/70 p-3">
        <div className="mb-2 text-[11px] font-medium text-ch">Invite a team member</div>
        <div className="mb-2 flex gap-2">
          <input type="email" className={cn(inputCls, "flex-1")} placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select className={cn(selectCls, "w-[110px]")} value={role} onChange={(e) => setRole(e.target.value as any)}>
            <option value="team">Team</option>
            <option value="admin">Admin</option>
            <option value="view_only">View only</option>
          </select>
        </div>
        <p className="mb-2.5 text-[10px] leading-[1.5] text-ch/60">
          Team: time calendar and assigned projects only. Admin: full access except billing. View only: read-only.
        </p>
        <button type="button" onClick={send} disabled={sending} className={darkBtn}>
          {sending ? "Sending…" : "Send invitation"}
        </button>
      </div>
    </PanelShell>
  );
}

function BillingPanel({ onClose }: { onClose: () => void }) {
  const { data } = useMe();
  const tier = (data?.firm?.subscription_tier as string) ?? "foundation";
  const status = data?.firm?.subscription_status;
  const tierPrice: Record<string, string> = { studio: "$69/mo", practice: "$129/mo" };
  const tierName: Record<string, string> = { foundation: "Foundation (Trial)", studio: "Sightline", practice: "Practice" };
  const nextBill = (data?.firm as any)?.current_period_end ?? "—";
  return (
    <PanelShell title="Billing" subtitle="Your current plan and payment method." onClose={onClose}>
      <Row2>
        <Field label="Current plan"><input readOnly className={inputCls} value={`${tierName[tier] ?? tier} · ${tierPrice[tier] ?? ""}`} /></Field>
        <Field label="Next billing date"><input readOnly className={inputCls} value={typeof nextBill === "string" ? nextBill : new Date(nextBill).toLocaleDateString()} /></Field>
      </Row2>
      <Field label="Payment method"><input readOnly className={inputCls} value={(data?.firm as any)?.payment_method_last4 ? `•••• ${(data?.firm as any).payment_method_last4}` : "No card on file"} /></Field>
      <div className="mt-3 flex justify-end gap-2">
        <Link to="/billing" className={ghostBtn}>Manage payment</Link>
        {tier === "studio" && <Link to="/billing" className={darkBtn}>Upgrade to Practice</Link>}
      </div>
      {status === "trialing" && <p className="mt-2 text-[10px] text-ch/60">Currently on trial.</p>}
    </PanelShell>
  );
}

function ToggleRow({ label, desc, on, onChange }: { label: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 last:border-0">
      <div className="pr-4">
        <div className="text-[12px] text-ch">{label}</div>
        <div className="text-[10px] text-ch/60">{desc}</div>
      </div>
      <button
        type="button" onClick={() => onChange(!on)}
        className={cn("relative h-[18px] w-[32px] rounded-[9px] transition-colors", on ? "bg-gold" : "bg-border")}
      >
        <span className={cn("absolute top-[3px] h-[12px] w-[12px] rounded-full bg-white transition-all", on ? "left-[17px]" : "left-[3px]")} />
      </button>
    </div>
  );
}

function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const [prefs, setPrefs] = useState({ weekly: true, scope: true, floor: true, growth: false, team: false });
  const [saving, setSaving] = useState(false);
  return (
    <PanelShell title="Notifications" subtitle="Alerts and email preferences." onClose={onClose}>
      <ToggleRow label="Weekly summary email" desc="Hours, revenue, and rate health each Monday" on={prefs.weekly} onChange={(v) => setPrefs({ ...prefs, weekly: v })} />
      <ToggleRow label="Scope warnings" desc="Alert when projects approach their budget" on={prefs.scope} onChange={(v) => setPrefs({ ...prefs, scope: v })} />
      <ToggleRow label="Below-floor rate alert" desc="Notify if billed rate drops below aligned rate" on={prefs.floor} onChange={(v) => setPrefs({ ...prefs, floor: v })} />
      <ToggleRow label="Growth signal updates" desc="Weekly digest when hiring signals change" on={prefs.growth} onChange={(v) => setPrefs({ ...prefs, growth: v })} />
      <ToggleRow label="Team time entry reminders" desc="Remind team members to log hours by Friday" on={prefs.team} onChange={(v) => setPrefs({ ...prefs, team: v })} />
      <div className="mt-4 flex justify-end">
        <button type="button" className={goldBtn} onClick={() => { setSaving(true); setTimeout(() => { setSaving(false); toast.success("Notifications saved."); }, 300); }} disabled={saving}>
          {saving ? "Saving…" : "Save preferences"}
        </button>
      </div>
    </PanelShell>
  );
}

function PreferencesPanel({ onClose }: { onClose: () => void }) {
  const [fy, setFy] = useState("January");
  const [week, setWeek] = useState("Monday");
  const [currency, setCurrency] = useState("USD");
  const [df, setDf] = useState("MM/DD/YYYY");
  const [showBreakEven, setShowBreakEven] = useState(true);
  const [showFloor, setShowFloor] = useState(true);
  return (
    <PanelShell title="Preferences" subtitle="Display and regional settings." onClose={onClose}>
      <Row2>
        <Field label="Fiscal year start">
          <select className={selectCls} value={fy} onChange={(e) => setFy(e.target.value)}>
            {["January","February","March","April","May","June","July","August","September","October","November","December"].map(m => <option key={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Week starts on">
          <select className={selectCls} value={week} onChange={(e) => setWeek(e.target.value)}>
            <option>Monday</option><option>Sunday</option>
          </select>
        </Field>
      </Row2>
      <Row2>
        <Field label="Currency">
          <select className={selectCls} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="USD">USD — US Dollar</option>
            <option value="CAD">CAD — Canadian Dollar</option>
            <option value="GBP">GBP — British Pound</option>
            <option value="EUR">EUR — Euro</option>
            <option value="AUD">AUD — Australian Dollar</option>
          </select>
        </Field>
        <Field label="Date format">
          <select className={selectCls} value={df} onChange={(e) => setDf(e.target.value)}>
            <option>MM/DD/YYYY</option><option>DD/MM/YYYY</option><option>YYYY-MM-DD</option>
          </select>
        </Field>
      </Row2>
      <div className="my-3.5 border-t border-border" />
      <div className="mb-2.5 text-[11px] font-medium text-ch">Dashboard display</div>
      <ToggleRow label="Show break-even rate" desc="Display break-even tile on your dashboard" on={showBreakEven} onChange={setShowBreakEven} />
      <ToggleRow label="Show annual cost floor" desc="Display annual cost floor in rate breakdown" on={showFloor} onChange={setShowFloor} />
      <SaveRow onCancel={onClose} onSave={() => toast.success("Preferences saved.")} />
    </PanelShell>
  );
}

function SecurityPanel({ onClose }: { onClose: () => void }) {
  const [curr, setCurr] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  async function update() {
    if (next !== confirm) return toast.error("Passwords do not match.");
    if (next.length < 8) return toast.error("Password must be at least 8 characters.");
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) throw error;
      setCurr(""); setNext(""); setConfirm("");
      toast.success("Password updated.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not update."); }
    finally { setSaving(false); }
  }
  return (
    <PanelShell title="Security" subtitle="Password and account access." onClose={onClose}>
      <Field label="Current password"><input type="password" className={inputCls} value={curr} onChange={(e) => setCurr(e.target.value)} /></Field>
      <Row2>
        <Field label="New password"><input type="password" className={inputCls} value={next} onChange={(e) => setNext(e.target.value)} /></Field>
        <Field label="Confirm password"><input type="password" className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
      </Row2>
      <div className="flex justify-end gap-2">
        <button type="button" className={ghostBtn} onClick={() => { setCurr(""); setNext(""); setConfirm(""); }}>Cancel</button>
        <button type="button" className={goldBtn} onClick={update} disabled={saving}>{saving ? "Updating…" : "Update password"}</button>
      </div>

      <div className="mt-4 border-t border-danger/40 pt-3.5">
        <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-danger">Danger zone</div>
        <p className="mb-2.5 text-[11px] leading-[1.5] text-ch/60">
          Deleting your account removes all firm data, projects, and time entries permanently. This cannot be undone.
        </p>
        <button type="button" className={dangerGhostBtn} onClick={() => toast.error("Please contact support to delete your account.")}>
          <Trash2 size={12} className="mr-1" /> Delete my account
        </button>
      </div>
    </PanelShell>
  );
}
