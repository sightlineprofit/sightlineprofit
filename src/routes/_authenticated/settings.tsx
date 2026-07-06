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
  listFirmMembers, saveFirmMember, deleteFirmMember,
} from "@/lib/firm.functions";
import { useMe, effectiveRole } from "@/lib/role";
import { ModulePage } from "@/components/shell/ModulePage";
import { calc, type Expense, type OwnerCompensationRow } from "@/lib/finance";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { getDefaultEmployerTaxRate, FEDERAL_FICA_PCT } from "@/lib/sui-rates";
import { AlignedRateBreakdown } from "@/components/dashboard/AlignedRateBreakdown";
import { MetricBreakdown, type MetricKind } from "@/components/dashboard/MetricBreakdown";

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

/**
 * State-aware employer payroll tax input.
 * - Default value = federal FICA (7.65%) + state new-employer SUI rate.
 * - Renders a small breakdown below the input.
 * - "Reset to state default" link snaps back to the computed default.
 */
function EmployerTaxField({
  label = "Employer payroll tax %",
  firmState,
  value,
  onChange,
}: {
  label?: string;
  firmState?: string | null;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
}) {
  const def = getDefaultEmployerTaxRate(firmState);
  const current = value ?? def.total;
  const displayed = value == null ? def.total.toString() : String(value);
  const stateLabel = def.state_code ?? "State";
  return (
    <div className="mb-3">
      <label className={fieldLabel}>{label}</label>
      <NumInput
        value={displayed}
        onChange={(x) => onChange(x === "" ? null : Number(x))}
        suffix="%"
      />
      {def.state_code ? (
        <div
          className="mt-1 leading-[1.5]"
          style={{ fontFamily: "Jost, sans-serif", fontSize: 9, color: "#888" }}
        >
          Federal FICA: {FEDERAL_FICA_PCT}% · {stateLabel} SUI:{" "}
          {def.state_sui}% · Total (yours): {Number(current).toFixed(2)}%
          <button
            type="button"
            onClick={() => onChange(def.total)}
            className="ml-2 cursor-pointer text-gold hover:opacity-80"
            style={{ fontFamily: "Jost, sans-serif", fontSize: 9 }}
          >
            Reset to {stateLabel} default ({def.total}%)
          </button>
        </div>
      ) : (
        <div
          className="mt-1 leading-[1.5]"
          style={{ fontFamily: "Jost, sans-serif", fontSize: 9, color: "#888" }}
        >
          Add your state in Firm settings to include state unemployment tax.
        </div>
      )}
    </div>
  );
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
          {active === "comp" && <CompPanel onClose={close} onOpenPanel={open} />}
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
  const listFM = useServerFn(listFirmMembers);
  const { data: ctx } = useQuery({ queryKey: ["me"], queryFn: () => getCtx() });
  const { data: expenses } = useQuery({ queryKey: ["expenses"], queryFn: () => listExp() });
  const { data: ownerData } = useQuery({ queryKey: ["ownerComp"], queryFn: () => listOwn() });
  const { data: firmMembers } = useQuery({ queryKey: ["firmMembers"], queryFn: () => listFM() });

  const cfg = ctx?.config ?? null;
  const ownerRows = (ownerData?.comp ?? []) as OwnerCompensationRow[];
  const principalCount = ownerData?.principals?.length ?? 0;
  const teamMembers = (firmMembers ?? []).filter((m: any) => m.role_type !== "principal");
  const teamBurdens = teamMembers.map((m: any) => ({
    burdened_weekly_cost: m.burdened_weekly_cost,
    weeks_per_year: m.weeks_per_year,
    expected_hrs_per_week: m.expected_hrs_per_week,
    billed_rate: m.billed_rate ?? null,
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
  const listFM = useServerFn(listFirmMembers);
  const { data: ownerData } = useQuery({ queryKey: ["ownerComp"], queryFn: () => listOwn() });
  const { data: firmMembers } = useQuery({ queryKey: ["firmMembers"], queryFn: () => listFM() });
  const ownerComp = (cfg?.__ownerCompOverride as OwnerCompensationRow[] | undefined)
    ?? ((ownerData?.comp ?? []) as OwnerCompensationRow[]);
  const teamProfiles = (firmMembers ?? [])
    .filter((m: any) => m.role_type !== "principal")
    .map((m: any) => ({
      burdened_weekly_cost: m.burdened_weekly_cost,
      weeks_per_year: m.weeks_per_year,
      expected_hrs_per_week: m.expected_hrs_per_week,
      billed_rate: m.billed_rate ?? null,
    }));
  const c = useMemo(
    () => calc(cfg, expenses, { ownerComp, teamProfiles }),
    [cfg, expenses, ownerComp, teamProfiles],
  );
  const rateStatus =
    c.rateHealth === "healthy" ? "Above floor"
    : c.rateHealth === "below_floor" ? "Below floor"
    : "Below break-even";
  // Full firm budget revenue: principal + each billable team member.
  // calc() already sums principal (rate × target hrs × weeks) + Σ (member.billed_rate ?? firm rate) × expected_hrs_per_week × weeks
  // for every member whose expected_hrs_per_week > 0.
  const budgetRevenue = c.annualRevenue;
  const marginVal = c.marginAboveFloor;
  const marginStr = `${marginVal >= 0 ? "+" : "-"}$${Math.round(Math.abs(marginVal))}/hr`;
  const rows: Array<{ label: string; value: string; gold?: boolean; metric: MetricKind }> = [
    { label: "Billed rate", value: `$${Math.round(c.billedRate)}/hr`, gold: true, metric: "billed" },
    { label: "Rate health", value: rateStatus, metric: "health" },
    { label: "Margin", value: marginStr, gold: marginVal >= 0, metric: "margin" },
    { label: "Break-even", value: `$${Math.round(c.breakEvenRate)}/hr`, metric: "breakeven" },
    { label: "Cost floor", value: `$${Math.round(c.totalCost).toLocaleString()}`, metric: "cost_floor" },
    { label: "Budget revenue", value: `$${Math.round(budgetRevenue).toLocaleString()}`, metric: "budget_revenue" },
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
            <div className="font-display text-[32px] leading-none text-ch flex items-center">
              <span>${Math.round(c.alignedRate)}</span>
              <AlignedRateBreakdown c={c} targetMarginPct={Number(cfg?.target_gross_margin_pct) || 0} side="left" />
            </div>
            <div className="mt-1 text-[10px] text-ch/60 mb-2.5">Your floor.</div>
            <div className="border-t border-border">
              {rows.map((r, i) => (
                <div key={r.label} className={cn("flex items-center justify-between py-1 text-[11px]", i < rows.length - 1 && "border-b border-border")}>
                  <span className="text-ch/60">{r.label}</span>
                  <span className="flex items-center">
                    <span className={cn("font-medium", r.gold ? "text-gold" : "text-ch")}>{r.value}</span>
                    <MetricBreakdown
                      metric={r.metric}
                      c={c}
                      cfg={cfg}
                      targetMarginPct={Number(cfg?.target_gross_margin_pct) || 0}
                      members={firmMembers ?? []}
                      expenses={expenses}
                      side="left"
                      iconSize={12}
                    />
                  </span>
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

function CompPanel({ onClose, onOpenPanel }: { onClose: () => void; onOpenPanel?: (id: PanelId) => void }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { liveConfig, expenses, cfg } = useFinancialDraft();
  const listOwn = useServerFn(listOwnerCompensations);
  const updCfg = useServerFn(upsertFirmConfig);
  const { data: ownerData } = useQuery({ queryKey: ["ownerComp"], queryFn: () => listOwn() });

  // Simple ↔ Advanced mode is a UI preference only.
  const [mode, setMode] = useState<"simple" | "advanced">(() => {
    if (typeof window === "undefined") return "simple";
    return (localStorage.getItem("comp_panel_mode") as "simple" | "advanced") || "simple";
  });
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("comp_panel_mode", mode);
  }, [mode]);

  // Live-editing of business structure in advanced mode.
  const savedStructure = (cfg?.business_structure as string | null) ?? null;
  const [structure, setStructure] = useState<string | null>(savedStructure);
  useEffect(() => { setStructure(savedStructure); }, [savedStructure]);

  async function onStructureChange(next: string) {
    setStructure(next);
    try {
      await updCfg({ data: { business_structure: next as any } });
      qc.invalidateQueries({ queryKey: ["dash"] });
      qc.invalidateQueries({ queryKey: ["financialDraft"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save structure.");
    }
  }

  // One-time review note when user first switches to advanced.
  const [reviewNote, setReviewNote] = useState(false);
  function toggleMode(next: "simple" | "advanced") {
    if (next === "advanced" && mode !== "advanced") setReviewNote(true);
    setMode(next);
  }

  const principals = ownerData?.principals ?? [];
  const compByProfile = new Map<string, OwnerCompensationRow>();
  for (const r of (ownerData?.comp ?? []) as any[]) {
    compByProfile.set(r.profile_id as string, r as OwnerCompensationRow);
  }

  // Sort: current user first, then by name.
  const myId = me?.profile?.id;
  const sorted = [...principals].sort((a: any, b: any) => {
    if (a.id === myId) return -1;
    if (b.id === myId) return 1;
    return (a.name || a.email).localeCompare(b.name || b.email);
  });

  // Live editing state — one draft per principal id (only my own is editable).
  const [drafts, setDrafts] = useState<Record<string, OwnerCompensationRow>>({});
  useEffect(() => {
    const next: Record<string, OwnerCompensationRow> = {};
    for (const p of principals as any[]) {
      const existing = compByProfile.get(p.id);
      next[p.id] = existing ?? {
        profile_id: p.id,
        comp_draw_annual: null,
        payroll_tax_pct: 15.3,
        health_insurance_annual: null,
        retirement_annual: null,
        distribution_annual: null,
        reserve_target: null,
        reserve_months: null,
      };
    }
    setDrafts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerData?.comp?.length, principals.length]);

  // Merge drafts back for live-calc: use my draft (live), others use saved rows.
  const liveRows: OwnerCompensationRow[] = principals.map((p: any) => {
    if (p.id === myId) return drafts[p.id] ?? { profile_id: p.id, comp_draw_annual: null, payroll_tax_pct: 15.3, health_insurance_annual: null, retirement_annual: null, distribution_annual: null, reserve_target: null };
    return compByProfile.get(p.id) ?? { profile_id: p.id, comp_draw_annual: null, payroll_tax_pct: 15.3, health_insurance_annual: null, retirement_annual: null, distribution_annual: null, reserve_target: null };
  });

  // In advanced mode with a structure selected, override the config's structure live.
  const cfgForCalc: any =
    mode === "advanced"
      ? { ...(liveConfig as any), business_structure: structure, __ownerCompOverride: liveRows }
      : { ...(liveConfig as any), business_structure: null, __ownerCompOverride: liveRows };

  return (
    <FinancialLayout
      title="Owner compensation"
      subtitle="Everything you take out of the firm in a year."
      onClose={onClose}
      cfg={cfgForCalc} expenses={expenses}
      left={
        <>
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-[11px] font-medium text-ch">Principal compensation</span>
            <div className="inline-flex overflow-hidden rounded-[4px] border border-border text-[10px]">
              <button
                type="button"
                onClick={() => toggleMode("simple")}
                className={cn("px-2.5 py-[3px]", mode === "simple" ? "bg-ch text-white" : "bg-white text-ch/60 hover:bg-cream")}
              >Simple</button>
              <button
                type="button"
                onClick={() => toggleMode("advanced")}
                className={cn("px-2.5 py-[3px]", mode === "advanced" ? "bg-ch text-white" : "bg-white text-ch/60 hover:bg-cream")}
              >Advanced</button>
            </div>
          </div>
          {mode === "advanced" && (
            <div className="mb-3 rounded-[6px] border border-border bg-cream/40 p-3">
              <div className={fieldLabel}>Business structure</div>
              <select
                className={selectCls}
                value={structure ?? ""}
                onChange={(e) => onStructureChange(e.target.value)}
              >
                <option value="" disabled>Select structure…</option>
                <option value="sole_prop">Sole proprietor / LLC</option>
                <option value="s_corp">S-Corporation</option>
                <option value="partnership">Partnership</option>
                <option value="c_corp">C-Corporation</option>
              </select>
              <p className="mt-2 text-[10px] leading-[1.5] text-ch/60">{structureExplainer(structure)}</p>
              {reviewNote && (
                <p className="mt-2 text-[10px] leading-[1.5] text-gold">
                  We've pre-filled these fields from your initial setup. Review each value — especially if your structure splits salary from distributions.
                </p>
              )}
            </div>
          )}
          <div className="space-y-2.5">
            {sorted.map((p: any) => (
              <PrincipalCard
                key={p.id}
                principal={p}
                isMe={p.id === myId}
                mode={mode}
                structure={mode === "advanced" ? structure : null}
                firmState={(me?.firm as any)?.state ?? null}
                value={drafts[p.id]}
                savedValue={compByProfile.get(p.id) ?? null}
                onChange={(v) => { setDrafts((d) => ({ ...d, [p.id]: v })); if (reviewNote) setReviewNote(false); }}
                onSaved={() => qc.invalidateQueries({ queryKey: ["ownerComp"] })}
              />
            ))}
          </div>
          {principals.length === 1 && (
            <p className="mt-3 text-[10px] leading-[1.5] text-ch/55">
              Co-owned firm? A second principal can join using the invite flow in{" "}
              <button
                type="button"
                onClick={() => onOpenPanel?.("team")}
                className="text-gold underline underline-offset-2 hover:text-ch"
              >
                Account → Team
              </button>
              . Invite them with the Principal role and their compensation card will appear here.
            </p>
          )}
        </>
      }
    />
  );
}

function structureExplainer(s: string | null): string {
  switch (s) {
    case "sole_prop":
      return "All profit is subject to 15.3% self-employment tax. No salary required.";
    case "s_corp":
      return "Pay yourself a reasonable W-2 salary first. Additional distributions avoid payroll tax.";
    case "partnership":
      return "Guaranteed payments are subject to SE tax. Distributions generally are not.";
    case "c_corp":
      return "You are an employee of your own firm. Salary subject to standard payroll taxes.";
    default:
      return "Choose the structure that matches how you file taxes.";
  }
}

function PrincipalCard({ principal, isMe, mode, structure, firmState, value, savedValue, onChange, onSaved }: {
  principal: any; isMe: boolean;
  mode: "simple" | "advanced";
  structure: string | null;
  firmState?: string | null;
  value: OwnerCompensationRow | undefined;
  savedValue: OwnerCompensationRow | null;
  onChange: (v: OwnerCompensationRow) => void;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const save = useServerFn(upsertOwnerCompensation);

  const v = value ?? {
    comp_draw_annual: null, payroll_tax_pct: 15.3,
    health_insurance_annual: null, retirement_annual: null,
    distribution_annual: null, reserve_target: null,
  };
  const display = savedValue ?? (v as OwnerCompensationRow);
  const configured = Number(display.comp_draw_annual) > 0;

  const isAdv = mode === "advanced";
  const struct = isAdv ? structure : null;
  const isSCorp = struct === "s_corp";
  // In simple mode we present salary + distributions as separate inputs but persist
  // comp_draw_annual = salary + distributions (per onboarding contract).
  const draw = Number(v.comp_draw_annual) || 0;
  const dist = Number(v.distribution_annual) || 0;
  const simpleSalary = Math.max(0, draw - dist);
  const health = Number(v.health_insurance_annual) || 0;
  const retire = Number(v.retirement_annual) || 0;
  const reserve = Number(v.reserve_target) || 0;
  const empePct = Number(v.employee_payroll_tax_pct) || 0;
  const ptaxPct = Number(v.payroll_tax_pct) || 0;
  const ptax =
    isAdv && isSCorp ? (draw * (ptaxPct + empePct)) / 100 : (draw * ptaxPct) / 100;
  const total =
    draw + ptax + health + retire + (isAdv && isSCorp ? dist + reserve : 0);

  function setSimpleSalary(x: string) {
    const s = x === "" ? 0 : Number(x);
    onChange({ ...v, comp_draw_annual: s + dist });
  }
  function setSimpleDist(x: string) {
    const d = x === "" ? 0 : Number(x);
    onChange({ ...v, distribution_annual: d, comp_draw_annual: simpleSalary + d });
  }

  const initials = ((principal.name || principal.email) as string)
    .split(/\s+/).map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();

  async function onSave() {
    if (!isMe) return;
    setSaving(true);
    try {
      await save({
        data: {
          comp_draw_annual: v.comp_draw_annual,
          payroll_tax_pct: v.payroll_tax_pct,
          health_insurance_annual: v.health_insurance_annual,
          retirement_annual: v.retirement_annual,
          distribution_annual: v.distribution_annual,
          reserve_target: v.reserve_target,
          employee_payroll_tax_pct: v.employee_payroll_tax_pct,
        } as any,
      });
      toast.success("Compensation saved.");
      onSaved();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally { setSaving(false); }
  }

  return (
    <div className="overflow-hidden rounded-[7px] border border-border bg-white">
      <button
        type="button"
        onClick={() => isMe && setOpen(!open)}
        className={cn(
          "flex w-full items-center gap-3 px-3.5 py-2.5 text-left",
          isMe ? "cursor-pointer hover:bg-cream/50" : "cursor-default",
        )}
      >
        <div className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border border-gold bg-cream text-[9px] font-medium text-gold">{initials}</div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium text-ch">
            {principal.name || principal.email}
            <span className="ml-1.5 text-[10px] font-normal text-ch/60">
              · Principal{isMe && " · (You)"}
            </span>
          </div>
          <div
            className="mt-0.5 text-[10px]"
            style={{ color: configured ? "rgba(44,44,44,0.6)" : "#BA7517" }}
          >
            {configured
              ? `$${Math.round((Number(display.comp_draw_annual) || 0) / 1000)}k draw · $${Math.round(computeCardTotal(display, isSCorp) / 1000)}k total`
              : (isMe ? "Not configured — click to add" : "Not configured")}
          </div>
        </div>
        {isMe && (
          <span className="text-[10px] text-ch/40">{open ? "▲" : "▼"}</span>
        )}
      </button>

      {open && isMe && (
        <div className="border-t border-border px-3.5 py-3">
          {!isAdv ? (
            <>
              <Row2>
                <Field label="Regular salary or draw (annual)">
                  <NumInput value={simpleSalary ? simpleSalary.toString() : ""} onChange={setSimpleSalary} prefix="$" />
                </Field>
                <Field label="Additional distributions (annual)">
                  <NumInput value={dist ? dist.toString() : ""} onChange={setSimpleDist} prefix="$" placeholder="0" />
                </Field>
              </Row2>
              <Row2>
                <Field label="Health insurance (annual)">
                  <NumInput value={v.health_insurance_annual?.toString() ?? ""} onChange={(x) => onChange({ ...v, health_insurance_annual: x === "" ? null : Number(x) })} prefix="$" placeholder="0" />
                </Field>
                <Field label="Retirement contribution (annual)">
                  <NumInput value={v.retirement_annual?.toString() ?? ""} onChange={(x) => onChange({ ...v, retirement_annual: x === "" ? null : Number(x) })} prefix="$" placeholder="0" />
                </Field>
              </Row2>
              <Field label="Tax and payroll rate">
                <NumInput value={v.payroll_tax_pct?.toString() ?? "15.3"} onChange={(x) => onChange({ ...v, payroll_tax_pct: x === "" ? null : Number(x) })} suffix="%" />
              </Field>
            </>
          ) : struct === "s_corp" ? (
            <>
              <Field label="W-2 salary (annual)">
                <NumInput value={v.comp_draw_annual?.toString() ?? ""} onChange={(x) => onChange({ ...v, comp_draw_annual: x === "" ? null : Number(x) })} prefix="$" />
              </Field>
              <Row2>
                <EmployerTaxField
                  firmState={firmState}
                  value={v.payroll_tax_pct}
                  onChange={(x) => onChange({ ...v, payroll_tax_pct: x })}
                />
                <Field label="Employee payroll tax %">
                  <NumInput value={v.employee_payroll_tax_pct?.toString() ?? "7.65"} onChange={(x) => onChange({ ...v, employee_payroll_tax_pct: x === "" ? null : Number(x) })} suffix="%" />
                </Field>
              </Row2>
              <Row2>
                <Field label="Distributions (annual)">
                  <NumInput value={v.distribution_annual?.toString() ?? ""} onChange={(x) => onChange({ ...v, distribution_annual: x === "" ? null : Number(x) })} prefix="$" placeholder="0" />
                </Field>
                <Field label="Business reserve (annual)">
                  <NumInput value={v.reserve_target?.toString() ?? ""} onChange={(x) => onChange({ ...v, reserve_target: x === "" ? null : Number(x) })} prefix="$" placeholder="0" />
                </Field>
              </Row2>
              <Row2>
                <Field label="Health insurance">
                  <NumInput value={v.health_insurance_annual?.toString() ?? ""} onChange={(x) => onChange({ ...v, health_insurance_annual: x === "" ? null : Number(x) })} prefix="$" placeholder="0" />
                </Field>
                <Field label="Retirement">
                  <NumInput value={v.retirement_annual?.toString() ?? ""} onChange={(x) => onChange({ ...v, retirement_annual: x === "" ? null : Number(x) })} prefix="$" placeholder="0" />
                </Field>
              </Row2>
            </>
          ) : struct === "partnership" ? (
            <>
              <Row2>
                <Field label="Guaranteed payment (annual)">
                  <NumInput value={v.comp_draw_annual?.toString() ?? ""} onChange={(x) => onChange({ ...v, comp_draw_annual: x === "" ? null : Number(x) })} prefix="$" />
                </Field>
                <Field label="SE tax %">
                  <NumInput value={v.payroll_tax_pct?.toString() ?? "15.3"} onChange={(x) => onChange({ ...v, payroll_tax_pct: x === "" ? null : Number(x) })} suffix="%" />
                </Field>
              </Row2>
              <Row2>
                <Field label="Health insurance">
                  <NumInput value={v.health_insurance_annual?.toString() ?? ""} onChange={(x) => onChange({ ...v, health_insurance_annual: x === "" ? null : Number(x) })} prefix="$" placeholder="0" />
                </Field>
                <Field label="Retirement">
                  <NumInput value={v.retirement_annual?.toString() ?? ""} onChange={(x) => onChange({ ...v, retirement_annual: x === "" ? null : Number(x) })} prefix="$" placeholder="0" />
                </Field>
              </Row2>
            </>
          ) : struct === "c_corp" ? (
            <>
              <Field label="W-2 salary (annual)">
                <NumInput value={v.comp_draw_annual?.toString() ?? ""} onChange={(x) => onChange({ ...v, comp_draw_annual: x === "" ? null : Number(x) })} prefix="$" />
              </Field>
              <EmployerTaxField
                firmState={firmState}
                value={v.payroll_tax_pct}
                onChange={(x) => onChange({ ...v, payroll_tax_pct: x })}
              />
              <Row2>
                <Field label="Health insurance">
                  <NumInput value={v.health_insurance_annual?.toString() ?? ""} onChange={(x) => onChange({ ...v, health_insurance_annual: x === "" ? null : Number(x) })} prefix="$" placeholder="0" />
                </Field>
                <Field label="Retirement">
                  <NumInput value={v.retirement_annual?.toString() ?? ""} onChange={(x) => onChange({ ...v, retirement_annual: x === "" ? null : Number(x) })} prefix="$" placeholder="0" />
                </Field>
              </Row2>
            </>
          ) : (
            // sole_prop / null structure — advanced layout
            <>
              <Row2>
                <Field label="Owner's draw (annual)">
                  <NumInput value={v.comp_draw_annual?.toString() ?? ""} onChange={(x) => onChange({ ...v, comp_draw_annual: x === "" ? null : Number(x) })} prefix="$" />
                </Field>
                <Field label="Self-employment tax %">
                  <NumInput value={v.payroll_tax_pct?.toString() ?? "15.3"} onChange={(x) => onChange({ ...v, payroll_tax_pct: x === "" ? null : Number(x) })} suffix="%" />
                </Field>
              </Row2>
              <Row2>
                <Field label="Health insurance">
                  <NumInput value={v.health_insurance_annual?.toString() ?? ""} onChange={(x) => onChange({ ...v, health_insurance_annual: x === "" ? null : Number(x) })} prefix="$" placeholder="0" />
                </Field>
                <Field label="Retirement">
                  <NumInput value={v.retirement_annual?.toString() ?? ""} onChange={(x) => onChange({ ...v, retirement_annual: x === "" ? null : Number(x) })} prefix="$" placeholder="0" />
                </Field>
              </Row2>
            </>
          )}
          <div className="mt-1 flex justify-between border-t border-border pt-2.5 text-[12px]">
            <span className="text-ch/60">Total compensation</span>
            <span className="font-medium text-ch">${Math.round(total).toLocaleString()}</span>
          </div>
          <SaveRow onCancel={() => setOpen(false)} onSave={onSave} saving={saving} />
        </div>
      )}
    </div>
  );
}

function computeCardTotal(r: OwnerCompensationRow, isSCorp: boolean): number {
  const salary = Number(r.comp_draw_annual) || 0;
  const empPct = Number(r.payroll_tax_pct) || 0;
  const empePct = isSCorp ? Number(r.employee_payroll_tax_pct) || 0 : 0;
  const ptax = (salary * (empPct + empePct)) / 100;
  const health = Number(r.health_insurance_annual) || 0;
  const retire = Number(r.retirement_annual) || 0;
  const dist = Number(r.distribution_annual) || 0;
  const reserve = Number(r.reserve_target) || 0;
  return salary + ptax + health + retire + (isSCorp ? dist + reserve : 0);
}

/* ────────────────────────── Team cost panel ────────────────────────── */

function TeamCostPanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { liveConfig, expenses } = useFinancialDraft();
  const { data: me } = useMe();
  const firmState = ((me?.firm as any)?.state ?? null) as string | null;
  const stateDefault = getDefaultEmployerTaxRate(firmState).total;

  const listFM = useServerFn(listFirmMembers);
  const save = useServerFn(saveFirmMember);
  const del = useServerFn(deleteFirmMember);
  const { data: fmData } = useQuery({ queryKey: ["firmMembers"], queryFn: () => listFM() });
  const members = ((fmData ?? []) as any[]).filter((m: any) => m.role_type !== "principal");

  // sort: active users → internal records → pending invites
  const sorted = [...members].sort((a, b) => {
    const rank = (m: any) =>
      m.is_platform_user ? 0 : m.invite_sent_at && !m.invite_accepted_at ? 2 : 1;
    return rank(a) - rank(b);
  });

  const [openId, setOpenId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<any>({
    name: "", email: "", role_type: "team", employment_type: "employee",
  });

  async function saveMember(id: string | undefined, d: any) {
    try {
      const res = await save({ data: { id, ...d } });
      toast.success(id ? "Team member saved." : "Team member added.");
      qc.invalidateQueries({ queryKey: ["firmMembers"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      if (!id && res?.id) setOpenId(res.id);
      return res?.id;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    }
  }

  async function addQuick() {
    if (!addForm.name.trim()) { toast.error("Name required."); return; }
    const newId = await saveMember(undefined, {
      name: addForm.name.trim(),
      email: addForm.email.trim() || null,
      role_type: addForm.role_type,
      employment_type: addForm.employment_type,
      compensation_type: addForm.employment_type === "employee" ? "hourly" : "contract_hourly",
      employer_payroll_tax_pct: addForm.employment_type === "employee" ? stateDefault : null,
      expected_hrs_per_week: 40,
      weeks_per_year: 48,
    });
    setAddForm({ name: "", email: "", role_type: "team", employment_type: "employee" });
    setAddOpen(false);
    if (newId) setOpenId(newId);
  }

  const initials = (name: string, email: string | null) =>
    (name || email || "?").split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <FinancialLayout
      title="Team cost"
      subtitle="Fully burdened cost of each team member. Add cost records independently of Sightline access."
      onClose={onClose}
      cfg={liveConfig} expenses={expenses}
      left={
        <>
          {sorted.length === 0 && !addOpen ? (
            <div className="rounded-[7px] border border-border bg-cream/50 px-4 py-6 text-center text-[11px] text-ch/60">
              No team members yet. Click <span className="text-gold">+ Add team member</span> below.
            </div>
          ) : (
            <div className="space-y-2.5">
              {sorted.map((m: any) => (
                <MemberCard
                  key={m.id}
                  m={m}
                  open={openId === m.id}
                  onToggle={() => setOpenId(openId === m.id ? null : m.id)}
                  onSave={(d) => saveMember(m.id, d)}
                  onDelete={async () => {
                    if (!window.confirm(`Remove ${m.name}?`)) return;
                    await del({ data: { id: m.id } });
                    qc.invalidateQueries({ queryKey: ["firmMembers"] });
                    qc.invalidateQueries({ queryKey: ["dashboard"] });
                  }}
                  firmState={firmState}
                  stateDefault={stateDefault}
                  initials={initials}
                  firmRate={(liveConfig as any)?.rate_billed ?? null}
                />
              ))}
            </div>
          )}

          <div className="mt-3">
            {!addOpen ? (
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="inline-flex items-center gap-1.5 text-[11px] text-gold hover:underline"
              >
                <Plus size={13} /> Add team member
              </button>
            ) : (
              <div className="rounded-[7px] border border-border bg-cream/50 p-3">
                <div className="mb-2 text-[11px] font-medium text-ch">New team member</div>
                <Row2>
                  <Field label="Name">
                    <input className={inputCls} value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} autoFocus />
                  </Field>
                  <Field label="Role">
                    <select className={selectCls} value={addForm.role_type} onChange={(e) => setAddForm({ ...addForm, role_type: e.target.value })}>
                      <option value="admin">Admin</option>
                      <option value="team">Team</option>
                      <option value="contractor">Contractor</option>
                      <option value="view_only">View only</option>
                    </select>
                  </Field>
                </Row2>
                <Row2>
                  <Field label="Employment type">
                    <select className={selectCls} value={addForm.employment_type} onChange={(e) => setAddForm({ ...addForm, employment_type: e.target.value })}>
                      <option value="employee">Employee</option>
                      <option value="contractor">Contractor</option>
                      <option value="1099">1099</option>
                    </select>
                  </Field>
                  <Field label="Email (optional)">
                    <input className={inputCls} type="email" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} placeholder="Only needed to invite later" />
                  </Field>
                </Row2>
                <p className="mb-2 text-[10px] text-ch/60">
                  Only needed if you want to invite them to Sightline later. You can add cost data now without an email.
                </p>
                <div className="flex justify-end gap-2">
                  <button type="button" className={ghostBtn} onClick={() => setAddOpen(false)}>Cancel</button>
                  <button type="button" className={goldBtn} onClick={addQuick}>Add member</button>
                </div>
              </div>
            )}
          </div>
        </>
      }
    />
  );
}

function MemberCard({
  m, open, onToggle, onSave, onDelete, firmState, stateDefault, initials, firmRate,
}: {
  m: any; open: boolean; onToggle: () => void;
  onSave: (d: any) => Promise<any>; onDelete: () => Promise<void>;
  firmState: string | null; stateDefault: number;
  initials: (n: string, e: string | null) => string;
  firmRate?: number | null;
}) {
  const isContract = m.employment_type === "contractor" || m.employment_type === "1099";
  const [d, setD] = useState<any>(() => ({
    name: m.name,
    email: m.email,
    role_type: m.role_type,
    employment_type: m.employment_type ?? "employee",
    compensation_type: m.compensation_type ?? (isContract ? "contract_hourly" : "hourly"),
    hourly_wage: m.hourly_wage,
    annual_base_salary: m.annual_base_salary,
    employer_payroll_tax_pct: m.employer_payroll_tax_pct ?? stateDefault,
    annual_benefits: m.annual_benefits,
    other_annual_costs: m.other_annual_costs,
    expected_hrs_per_week: m.expected_hrs_per_week ?? 40,
    weeks_per_year: m.weeks_per_year ?? 48,
    billed_rate: m.billed_rate ?? null,
  }));

  const status: { dot: string; label: string; border: string } = m.is_platform_user
    ? { dot: "#3B7A57", label: "Sightline user", border: "border-gold" }
    : m.invite_sent_at && !m.invite_accepted_at
      ? { dot: "#BA7517", label: "Invite pending", border: "border-gold border-dashed" }
      : { dot: "#C0B8AA", label: "Internal record · Not invited", border: "border-border" };

  const configured = Number(m.burdened_weekly_cost) > 0;
  const summary = configured
    ? `$${Math.round(Number(m.burdened_hourly_rate) || 0)}/hr burdened · $${Math.round((Number(m.burdened_weekly_cost) || 0) * (Number(m.weeks_per_year) || 48) / 1000)}k/yr`
    : "No cost data";

  const empType = d.employment_type;
  const contract = empType === "contractor" || empType === "1099";

  return (
    <div className="overflow-hidden rounded-[7px] border border-border bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-cream/50"
      >
        <span className="h-[6px] w-[6px] shrink-0 rounded-full" style={{ backgroundColor: status.dot }} />
        <div className={cn("grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border bg-cream text-[9px] font-medium text-gold", status.border)}>
          {initials(m.name, m.email)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium text-ch">
            {m.name}
            <span className="ml-1.5 text-[10px] font-normal text-ch/60 capitalize">· {String(m.role_type).replace("_", " ")}</span>
          </div>
          <div className="mt-0.5 text-[10px] text-ch/60">
            {status.label}{configured ? ` · ${summary}` : ""}
          </div>
        </div>
        <span className="text-[10px] text-ch/40">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t border-border px-3.5 py-3">
          <Row2>
            <Field label="Name">
              <input className={inputCls} value={d.name ?? ""} onChange={(e) => setD({ ...d, name: e.target.value })} />
            </Field>
            <Field label="Employment type">
              <select className={selectCls} value={empType} onChange={(e) => {
                const et = e.target.value;
                const nextCT = et === "employee" ? "hourly" : "contract_hourly";
                setD({ ...d, employment_type: et, compensation_type: nextCT });
              }}>
                <option value="employee">Employee</option>
                <option value="contractor">Contractor</option>
                <option value="1099">1099</option>
              </select>
            </Field>
          </Row2>

          {contract ? (
            <>
              <Row2>
                <Field label="Rate type">
                  <select className={selectCls} value={d.compensation_type} onChange={(e) => setD({ ...d, compensation_type: e.target.value })}>
                    <option value="contract_hourly">Contract rate ($/hr)</option>
                    <option value="contract_annual">Annual contract amount</option>
                  </select>
                </Field>
                {d.compensation_type === "contract_hourly" ? (
                  <Field label="Contract rate ($/hr)">
                    <NumInput value={d.hourly_wage?.toString() ?? ""} onChange={(v) => setD({ ...d, hourly_wage: v === "" ? null : Number(v) })} prefix="$" />
                  </Field>
                ) : (
                  <Field label="Annual contract amount">
                    <NumInput value={d.annual_base_salary?.toString() ?? ""} onChange={(v) => setD({ ...d, annual_base_salary: v === "" ? null : Number(v) })} prefix="$" />
                  </Field>
                )}
              </Row2>
              <Row2>
                <Field label="Expected hours / week">
                  <NumInput value={d.expected_hrs_per_week?.toString() ?? "40"} onChange={(v) => setD({ ...d, expected_hrs_per_week: v === "" ? null : Number(v) })} />
                </Field>
                <Field label="Weeks / year">
                  <NumInput value={d.weeks_per_year?.toString() ?? "48"} onChange={(v) => setD({ ...d, weeks_per_year: v === "" ? null : Number(v) })} />
                </Field>
              </Row2>
              <Field label="Billed rate (optional)">
                <NumInput
                  value={d.billed_rate?.toString() ?? ""}
                  onChange={(v) => setD({ ...d, billed_rate: v === "" ? null : Number(v) })}
                  prefix="$"
                  placeholder={firmRate ? `Defaults to firm rate ($${Math.round(Number(firmRate))}/hr)` : "Defaults to firm rate"}
                />
              </Field>
              <p className="mb-2 text-[10px] leading-[1.5] text-ch/60">
                Contractor costs are not subject to employer payroll tax. Ensure you are correctly classifying this worker — misclassification carries significant legal and tax risk.
              </p>
            </>
          ) : (
            <>
              <Row2>
                <Field label="Compensation type">
                  <select className={selectCls} value={d.compensation_type} onChange={(e) => setD({ ...d, compensation_type: e.target.value })}>
                    <option value="hourly">Hourly</option>
                    <option value="salaried">Salaried</option>
                  </select>
                </Field>
                <EmployerTaxField
                  firmState={firmState}
                  value={d.employer_payroll_tax_pct}
                  onChange={(v) => setD({ ...d, employer_payroll_tax_pct: v })}
                />
              </Row2>
              {d.compensation_type === "salaried" ? (
                <Row2>
                  <Field label="Annual base salary">
                    <NumInput value={d.annual_base_salary?.toString() ?? ""} onChange={(v) => setD({ ...d, annual_base_salary: v === "" ? null : Number(v) })} prefix="$" />
                  </Field>
                  <Field label="Weeks per year">
                    <NumInput value={d.weeks_per_year?.toString() ?? "48"} onChange={(v) => setD({ ...d, weeks_per_year: v === "" ? null : Number(v) })} />
                  </Field>
                </Row2>
              ) : (
                <Row2>
                  <Field label="Hourly wage">
                    <NumInput value={d.hourly_wage?.toString() ?? ""} onChange={(v) => setD({ ...d, hourly_wage: v === "" ? null : Number(v) })} prefix="$" />
                  </Field>
                  <Field label="Weeks per year">
                    <NumInput value={d.weeks_per_year?.toString() ?? "48"} onChange={(v) => setD({ ...d, weeks_per_year: v === "" ? null : Number(v) })} />
                  </Field>
                </Row2>
              )}
              <Row2>
                <Field label="Annual benefits">
                  <NumInput value={d.annual_benefits?.toString() ?? ""} onChange={(v) => setD({ ...d, annual_benefits: v === "" ? null : Number(v) })} prefix="$" placeholder="0" />
                </Field>
                <Field label="Other annual costs">
                  <NumInput value={d.other_annual_costs?.toString() ?? ""} onChange={(v) => setD({ ...d, other_annual_costs: v === "" ? null : Number(v) })} prefix="$" placeholder="0" />
                </Field>
              </Row2>
              <Field label="Expected hours per week">
                <NumInput value={d.expected_hrs_per_week?.toString() ?? "40"} onChange={(v) => setD({ ...d, expected_hrs_per_week: v === "" ? null : Number(v) })} />
              </Field>
              <Field label="Billed rate (optional)">
                <NumInput
                  value={d.billed_rate?.toString() ?? ""}
                  onChange={(v) => setD({ ...d, billed_rate: v === "" ? null : Number(v) })}
                  prefix="$"
                  placeholder={firmRate ? `Defaults to firm rate ($${Math.round(Number(firmRate))}/hr)` : "Defaults to firm rate"}
                />
              </Field>
            </>
          )}

          <div className="mt-2 flex items-center justify-between">
            <button type="button" onClick={onDelete} className="text-[10px] text-danger/70 hover:text-danger inline-flex items-center gap-1">
              <Trash2 size={11} /> Remove
            </button>
            <SaveRow onCancel={onToggle} onSave={() => onSave(d)} />
          </div>
        </div>
      )}
    </div>
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
  const firmRate = Number(liveConfig?.rate_billed) || 0;
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
          <TeamBillableCapacitySection firmRate={firmRate} />
        </>
      }
    />
  );
}

/* ────────────────────────────── account panels ────────────────────────────── */

function TeamBillableCapacitySection({ firmRate }: { firmRate: number }) {
  const qc = useQueryClient();
  const listFM = useServerFn(listFirmMembers);
  const save = useServerFn(saveFirmMember);
  const { data: members } = useQuery({ queryKey: ["firmMembers"], queryFn: () => listFM() });
  const team = (members ?? []).filter((m: any) => m.role_type !== "principal" && m.is_active !== false);

  const [drafts, setDrafts] = useState<Record<string, { hrs: string; rate: string }>>({});
  const [savedFlash, setSavedFlash] = useState<Record<string, number>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Seed drafts from server whenever the roster changes.
  useEffect(() => {
    const next: Record<string, { hrs: string; rate: string }> = {};
    for (const m of team) {
      next[m.id] = {
        hrs: m.expected_hrs_per_week != null ? String(m.expected_hrs_per_week) : "",
        rate: m.billed_rate != null ? String(m.billed_rate) : "",
      };
    }
    setDrafts((prev) => ({ ...next, ...Object.fromEntries(Object.entries(prev).filter(([id]) => next[id] !== undefined && (prev[id]?.hrs !== next[id].hrs || prev[id]?.rate !== next[id].rate) ? false : true)) }));
    // simpler: overwrite with server values on roster change
    setDrafts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team.map((m: any) => `${m.id}:${m.expected_hrs_per_week ?? ""}:${m.billed_rate ?? ""}`).join("|")]);

  function schedule(m: any, patch: Partial<{ hrs: string; rate: string }>) {
    setDrafts((prev) => ({ ...prev, [m.id]: { ...prev[m.id], ...patch } }));
    if (timers.current[m.id]) clearTimeout(timers.current[m.id]);
    timers.current[m.id] = setTimeout(async () => {
      const cur = { ...drafts[m.id], ...patch };
      const hrsNum = cur.hrs === "" ? null : Number(cur.hrs);
      const rateNum = cur.rate === "" ? null : Number(cur.rate);
      try {
        await save({
          data: {
            id: m.id,
            name: m.name,
            email: m.email ?? null,
            role_type: m.role_type,
            employment_type: m.employment_type ?? "employee",
            notes: m.notes ?? null,
            compensation_type: m.compensation_type ?? "hourly",
            hourly_wage: m.hourly_wage ?? null,
            annual_base_salary: m.annual_base_salary ?? null,
            employer_payroll_tax_pct: m.employer_payroll_tax_pct ?? null,
            employer_tax_rate_is_custom: m.employer_tax_rate_is_custom ?? false,
            annual_benefits: m.annual_benefits ?? null,
            other_annual_costs: m.other_annual_costs ?? null,
            expected_hrs_per_week: hrsNum,
            weeks_per_year: m.weeks_per_year ?? null,
            billed_rate: rateNum,
          },
        });
        setSavedFlash((s) => ({ ...s, [m.id]: Date.now() }));
        qc.invalidateQueries({ queryKey: ["firmMembers"] });
        qc.invalidateQueries({ queryKey: ["dashboard"] });
        setTimeout(() => {
          setSavedFlash((s) => {
            const copy = { ...s };
            delete copy[m.id];
            return copy;
          });
        }, 1800);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Save failed");
      }
    }, 500);
  }

  return (
    <div className="mt-5 border-t border-border pt-4">
      <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, color: "#2C2C2C" }}>
        Team billable capacity
      </h3>
      <p
        className="mt-1 mb-3"
        style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, fontWeight: 300, color: "rgba(44,44,44,0.6)" }}
      >
        Set each team member's expected billable hours and rate. These feed your budget revenue and aligned rate calculation.
      </p>

      {team.length === 0 ? (
        <div className="rounded-[7px] border border-border bg-cream/50 px-3.5 py-3 text-[11px] text-ch/70">
          Add team members in{" "}
          <Link to="/settings" search={{ panel: "team_cost" as any }} className="text-gold hover:underline">
            Team Cost
          </Link>{" "}
          to set their billable capacity.
        </div>
      ) : (
        <div className="space-y-2">
          {team.map((m: any) => {
            const d = drafts[m.id] ?? { hrs: "", rate: "" };
            const flashed = !!savedFlash[m.id];
            const ratePlaceholder = firmRate > 0 ? `Defaults to firm rate ($${Math.round(firmRate)})` : "Defaults to firm rate";
            return (
              <div key={m.id} className="rounded-[6px] border border-border bg-white px-3 py-2.5">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-medium text-ch">{m.name}</div>
                    <div className="text-[10px] text-ch/55 capitalize">
                      {String(m.role_type || "team").replace(/_/g, " ")}
                    </div>
                  </div>
                  {flashed ? (
                    <span
                      style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, color: "#5C8A6E" }}
                    >
                      Saved
                    </span>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={fieldLabel}>Billable hrs/wk</label>
                    <NumInput
                      value={d.hrs}
                      onChange={(v) => schedule(m, { hrs: v })}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className={fieldLabel}>Billed rate/hr</label>
                    <NumInput
                      value={d.rate}
                      onChange={(v) => schedule(m, { rate: v })}
                      prefix="$"
                      placeholder={ratePlaceholder}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
  const listFM = useServerFn(listFirmMembers);
  const { data } = useQuery({ queryKey: ["team"], queryFn: () => list() });
  const { data: fmData } = useQuery({ queryKey: ["firmMembers"], queryFn: () => listFM() });
  const [email, setEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [role, setRole] = useState<"principal" | "team" | "admin" | "view_only">("team");
  const [sending, setSending] = useState(false);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["team"] });
    qc.invalidateQueries({ queryKey: ["firmMembers"] });
  }

  async function send() {
    if (!email) return;
    setSending(true);
    try {
      await invite({ data: { email, role, name: inviteName || null } as any });
      toast.success("Invitation sent.");
      setEmail("");
      setInviteName("");
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not send."); }
    finally { setSending(false); }
  }

  function inviteExisting(m: any) {
    setEmail(m.email ?? "");
    setInviteName(m.name ?? "");
    setRole((m.role_type === "contractor" ? "team" : m.role_type) || "team");
    // Scroll invite form into view via focus.
    setTimeout(() => {
      const el = document.getElementById("invite-email-input");
      if (el) (el as HTMLInputElement).focus();
    }, 60);
  }

  async function changeRole(id: string, r: string, name: string) {
    if (r === "principal") {
      const ok = window.confirm(
        `Changing ${name || "this member"} to Principal will give them full ownership access to all financial settings and billing. Are you sure?`,
      );
      if (!ok) { refresh(); return; }
    }
    try {
      const payload: any = { id, role: r };
      if (r === "principal") {
        // Clear per-profile cost hint — their cost now lives in owner_compensation.
        Object.assign(payload, { cost_rate: null });
      }
      await update({ data: payload });
      toast.success("Role updated.");
      qc.invalidateQueries({ queryKey: ["ownerComp"] });
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not update."); }
  }

  const initials = (name: string, email: string) =>
    (name || email).split(/\s+/).map(s => s[0]).slice(0, 2).join("").toUpperCase();

  // Unified list: every firm_members row. Rows with profile_id use the profile
  // role selector; others show status + optional "Invite to Sightline".
  const rows = ((fmData ?? []) as any[]).filter(m => m.role_type !== "principal");
  // Also surface invitations that don't yet have a firm_members mirror
  // (rare, legacy). Merge by email so we don't double-list.
  const seenEmails = new Set(rows.map(r => (r.email || "").toLowerCase()));
  const orphanInvites = (data?.invites ?? []).filter(
    (i: any) => !seenEmails.has((i.email || "").toLowerCase()),
  );

  const rowStatus = (m: any) => {
    if (m.is_platform_user) return { label: "Active", dot: "#3F7A4E", tone: "ok" };
    if (m.invite_sent_at && !m.invite_accepted_at)
      return { label: "Pending invite", dot: "#B8860B", tone: "warn" };
    return { label: "Internal record", dot: "#C0B8AA", tone: "muted" };
  };

  return (
    <PanelShell title="Team" subtitle="Members, roles, and invitations." onClose={onClose}>
      <div className="mb-3 overflow-hidden rounded-[6px] border border-border bg-white">
        {/* Principals (from profiles) — shown first, no editing here */}
        {(data?.members ?? []).filter(m => m.role === "principal").map((m) => (
          <div key={`p-${m.id}`} className="flex items-center gap-2.5 border-b border-border px-3 py-2.5">
            <div className="grid h-[26px] w-[26px] place-items-center rounded-full border border-gold bg-cream text-[9px] font-medium text-gold">{initials(m.name || "", m.email)}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-medium text-ch">{m.name || m.email}</div>
              <div className="truncate text-[10px] text-ch/60">{m.email}</div>
            </div>
            <span className="text-[10px] text-ch/60">Principal</span>
          </div>
        ))}
        {rows.map((m, i) => {
          const st = rowStatus(m);
          const profile = (data?.members ?? []).find(p => p.id === m.profile_id);
          const pendingInvite = (data?.invites ?? []).find(
            (inv: any) => (inv.email || "").toLowerCase() === (m.email || "").toLowerCase(),
          );
          return (
            <div key={m.id} className={cn("flex items-center gap-2.5 px-3 py-2.5", i < rows.length - 1 && "border-b border-border")}>
              <div className="grid h-[26px] w-[26px] place-items-center rounded-full border border-border bg-cream text-[9px] font-medium text-ch/70">
                {initials(m.name || "", m.email || "")}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium text-ch">{m.name || m.email || "Unnamed"}</div>
                <div className="truncate text-[10px] text-ch/60">{m.email || "No email"}</div>
              </div>
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: st.dot }} />
                <span className="text-ch/60">{st.label}</span>
              </div>
              {profile ? (
                <select
                  className={cn(selectCls, "w-[110px] py-[3px] text-[10px]")}
                  value={profile.role}
                  onChange={(e) => changeRole(profile.id, e.target.value, profile.name || profile.email)}
                >
                  <option value="principal">Principal</option>
                  <option value="admin">Admin</option>
                  <option value="team">Team</option>
                  <option value="view_only">View only</option>
                </select>
              ) : pendingInvite ? (
                <button
                  type="button"
                  onClick={async () => {
                    try { await resend({ data: { id: pendingInvite.id } }); toast.success("Resent."); refresh(); }
                    catch { toast.error("Could not resend."); }
                  }}
                  className="text-[10px] text-ch/60 hover:text-gold"
                >Resend</button>
              ) : m.email ? (
                <button
                  type="button"
                  onClick={() => inviteExisting(m)}
                  className="rounded-[3px] border border-gold px-2 py-[3px] text-[10px] font-medium text-gold hover:bg-gold hover:text-white transition-colors"
                >
                  Invite to Sightline
                </button>
              ) : (
                <span className="text-[10px] italic text-ch/40">Add email to invite</span>
              )}
            </div>
          );
        })}
        {orphanInvites.map((i: any) => (
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
        {!rows.length && !(data?.members?.length) && !orphanInvites.length && (
          <div className="px-3 py-6 text-center text-[11px] text-ch/50">No team members yet.</div>
        )}
      </div>

      <div className="rounded-[6px] border border-border bg-cream/70 p-3">
        <div className="mb-2 text-[11px] font-medium text-ch">Invite a team member</div>
        <div className="mb-2 flex gap-2">
          <input id="invite-email-input" type="email" className={cn(inputCls, "flex-1")} placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select className={cn(selectCls, "w-[110px]")} value={role} onChange={(e) => setRole(e.target.value as any)}>
            <option value="principal">Principal</option>
            <option value="team">Team</option>
            <option value="admin">Admin</option>
            <option value="view_only">View only</option>
          </select>
        </div>
        {inviteName && (
          <div className="mb-2 text-[10px] text-ch/60">
            Inviting <span className="font-medium text-ch">{inviteName}</span> — their cost data will link on accept.
          </div>
        )}
        <p className="mb-2.5 text-[10px] leading-[1.5] text-ch/60">
          Principal: full ownership access, own compensation settings, and billing. Team: time calendar and assigned projects only. Admin: full access except billing. View only: read-only.
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
