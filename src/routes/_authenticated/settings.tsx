import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DollarSign, Receipt, Calculator, User, Users,
  CreditCard, Bell, SlidersHorizontal, Lock, X, Plus, Trash2, History, ChevronDown, ChevronRight,
  Database,
} from "lucide-react";
import {
  getMyContext, updateFirm, listTeam, inviteTeamMember, resendInvitation,
  upsertFirmConfig, listExpenses, addExpense, deleteExpense,
  updateTeamMember, setPreferredHome, setDefaultLandingPage,
  listOwnerCompensations, upsertOwnerCompensation,
  listFirmMembers, saveFirmMember, deleteFirmMember,
} from "@/lib/firm.functions";
import { useMe, effectiveRole } from "@/lib/role";
import { ModulePage } from "@/components/shell/ModulePage";
import { calc, type Expense, type OwnerCompensationRow, effectivePrincipalBillableHrsWeek } from "@/lib/finance";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { getDefaultEmployerTaxRate, FEDERAL_FICA_PCT } from "@/lib/sui-rates";
import { AlignedRateBreakdown } from "@/components/dashboard/AlignedRateBreakdown";
import { MetricBreakdown, type MetricKind } from "@/components/dashboard/MetricBreakdown";
import { listChangeLog } from "@/lib/change-log.functions";
import { switchBillingFrequency } from "@/lib/billing.functions";
import { getFoundingQuote, firmUsesFoundingPricing } from "@/lib/founding.functions";
import { getStripeEnvironment } from "@/lib/stripe";
import { PricingStructureSelector } from "@/components/pricing/PricingStructureSelector";
import {
  normalizePricingStructure,
  requiresBilledRate,
  type PricingStructure,
} from "@/lib/pricing-structure";
import {
  BurdenedCostCalculator,
  type BurdenedCostValue,
} from "@/components/team/BurdenedCostCalculator";
import { estimateBurdenedCost, BURDEN_EMPLOYER_TAX_PCT } from "@/lib/team-cost";
import { useTour } from "@/components/tour/TourProvider";
import { TimeImportWizard, formatSourceLabel } from "@/components/settings/TimeImportWizard";
import { listTimeImportLogs } from "@/lib/time-import.functions";
import type { ImportSource } from "@/lib/time-import/types";

type PanelId =
  | "comp" | "opex" | "rate" | "team_cost"
  | "profile" | "data" | "team" | "billing"
  | "notifications" | "preferences" | "security" | "history";

const LEGACY_PANEL_MAP: Record<string, PanelId> = {
  firm: "profile",
  time_import: "data",
};

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Sightline" }] }),
  validateSearch: (s: Record<string, unknown>) => {
    const raw = s.panel as string | undefined;
    const panel = raw
      ? (LEGACY_PANEL_MAP[raw] ?? (raw as PanelId))
      : undefined;
    return { panel };
  },
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

const fieldLabel = "mb-1 block text-[11px] font-medium uppercase tracking-[0.09em] text-ch/60";

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
          style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: "#888" }}
        >
          Federal FICA: {FEDERAL_FICA_PCT}% · {stateLabel} SUI:{" "}
          {def.state_sui}% · Total (yours): {Number(current).toFixed(2)}%
          <button
            type="button"
            onClick={() => onChange(def.total)}
            className="ml-2 cursor-pointer text-gold hover:opacity-80"
            style={{ fontFamily: "Jost, sans-serif", fontSize: 11 }}
          >
            Reset to {stateLabel} default ({def.total}%)
          </button>
        </div>
      ) : (
        <div
          className="mt-1 leading-[1.5]"
          style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: "#888" }}
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">Settings</p>
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
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">Settings</p>
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

      <GettingStartedSection />

      {active && (
        <div className="mt-3 rounded-[8px] border border-border bg-white px-7 pt-6 pb-6">
          {active === "comp" && <CompPanel onClose={close} />}
          {active === "opex" && <OpexPanel onClose={close} />}
          {active === "rate" && <RatePanel onClose={close} />}
          {active === "team_cost" && <TeamCostPanel onClose={close} onOpenPanel={open} />}
          {active === "profile" && <ProfileFirmPanel onClose={close} />}
          {active === "data" && <DataPanel onClose={close} />}
          {active === "team" && <TeamPanel onClose={close} />}
          {active === "billing" && <BillingPanel onClose={close} />}
          {active === "notifications" && <NotificationsPanel onClose={close} />}
          {active === "preferences" && <PreferencesPanel onClose={close} />}
          {active === "security" && <SecurityPanel onClose={close} />}
          {active === "history" && <HistoryPanel onClose={close} />}
        </div>
      )}
    </div>
  );
}

function GroupLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mt-5 mb-2.5 border-b border-border pb-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-ch/60", className)}>
      {children}
    </div>
  );
}

function GettingStartedSection() {
  const { resetTour, startTour } = useTour();
  const [confirming, setConfirming] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <GroupLabel className="mt-6">Getting started</GroupLabel>
      <div className="rounded-[8px] border border-border bg-white px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[14px] font-normal text-ch">Setup tour</div>
            <div className="text-[12px] text-ch/60">Walk through setting up your aligned rate, first project, and time tracking.</div>
          </div>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-[5px] border border-ch/20 px-4 py-1.5 text-[12px] font-medium text-ch hover:bg-ch/5"
          >
            Redo tour
          </button>
        </div>
        {confirming && (
          <div className="mt-3 rounded-md border border-ch/10 bg-cream/60 p-3">
            <p className="text-[12px] text-ch/70">
              This will restart the setup tour from the beginning. Your existing data won't be affected.
            </p>
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-[5px] border border-ch/20 px-3 py-1 text-[12px] text-ch"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await resetTour();
                  setConfirming(false);
                  navigate({ to: "/dashboard" });
                  startTour({ fromBeginning: true });
                }}
                className="rounded-[5px] bg-ch px-3 py-1 text-[12px] font-medium text-cream"
              >
                Restart tour
              </button>
            </div>
          </div>
        )}
      </div>
    </>
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
  const tourAttr =
    t.id === "comp" ? "settings-compensation"
    : t.id === "opex" ? "settings-expenses"
    : t.id === "rate" ? "settings-capacity"
    : t.id === "team_cost" ? "settings-team"
    : undefined;
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
      data-tour={tourAttr}
      onClick={() => onOpen(t.id)}
      className={cn(
        "text-left rounded-[8px] border border-border bg-white px-4 pt-3.5 pb-3 transition-colors hover:border-gold",
        isActive && "border-gold bg-[#FFFDF9]",
      )}
    >
      <Icon size={18} className={cn("mb-2 block", t.gold ? "text-gold" : "text-ch/60")} />
      <div className="text-[12px] font-medium text-ch">{t.name}</div>
      <div className="mt-0.5 text-[11px] font-light leading-[1.4] text-ch/60">{t.desc}</div>
      <div className="mt-2.5 flex items-center gap-1.5 border-t border-border pt-2.5">
        <span className="h-[5px] w-[5px] rounded-full" style={{ backgroundColor: dot }} />
        <span className="text-[11px] font-medium" style={{ color: textColor }}>{t.status.text}</span>
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
  const pricingStructure = normalizePricingStructure((cfg as { pricing_structure?: string } | null)?.pricing_structure);
  if (cfg?.target_billable_hrs_per_week) {
    if (requiresBilledRate(pricingStructure) && cfg?.rate_billed) {
      const label = `${cfg.target_billable_hrs_per_week} hrs/wk · $${Math.round(cfg.rate_billed)}/hr`;
      rateStatus =
        c.rateHealth === "healthy" ? { tone: "ok", text: `${label} · Above floor` }
        : c.rateHealth === "below_floor" ? { tone: "warn", text: `${label} · Below floor` }
        : { tone: "warn", text: "Below break-even" };
    } else if (pricingStructure === "flat_fee") {
      rateStatus = {
        tone: "ok",
        text: `${cfg.target_billable_hrs_per_week} hrs/wk · Flat fee pricing`,
      };
    } else {
      rateStatus = { tone: "muted", text: "Billed rate not set" };
    }
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
  const listLogsFn = useServerFn(listTimeImportLogs);
  const { data: ctx } = useQuery({ queryKey: ["me"], queryFn: () => getCtx() });
  const { data: team } = useQuery({ queryKey: ["team"], queryFn: () => list() });
  const { data: importLogs } = useQuery({
    queryKey: ["time-import-logs"],
    queryFn: () => listLogsFn(),
  });

  const firmName = ctx?.firm?.name;
  const memberCount = team?.members?.length ?? 0;
  const pendingCount = team?.invites?.length ?? 0;
  const lastImport = importLogs?.logs?.[0] ?? null;

  const tier = ctx?.firm?.subscription_tier as string | undefined;
  const status = ctx?.firm?.subscription_status as string | undefined;
  const trialEnds = ctx?.firm?.trial_ends_at;
  const trialDays = trialEnds ? Math.max(0, Math.ceil((new Date(trialEnds).getTime() - Date.now()) / 86400000)) : 0;
  const tierPrice: Record<string, string> = { studio: "$69", practice: "$129" };
  const tierName: Record<string, string> = { studio: "Studio", practice: "Practice" };

  const billingStatus: Status =
    status === "trialing" ? { tone: "warn", text: `Trial · ${trialDays} days remaining` }
    : status === "active" && tier ? { tone: "ok", text: `${tierName[tier] ?? tier} · ${tierPrice[tier] ?? ""}${tierPrice[tier] ? "/mo" : ""}` }
    : { tone: "muted", text: "No active plan" };

  const teamStatus: Status =
    pendingCount > 0 ? { tone: "warn", text: `${pendingCount} invite${pendingCount === 1 ? "" : "s"} pending` }
    : memberCount > 1 ? { tone: "ok", text: `${memberCount} members` }
    : { tone: "muted", text: "Solo — no team yet" };

  const profileStatus: Status = firmName
    ? { tone: "ok", text: "Complete" }
    : { tone: "muted", text: "Firm name not set" };

  const dataStatus: Status = lastImport
    ? {
        tone: "ok",
        text: `Last import · ${lastImport.rows_imported} entries`,
      }
    : { tone: "muted", text: "No imports yet" };

  const tiles: TileDef[] = [
    { id: "profile", name: "Profile & firm", desc: "Your info and firm configuration.", icon: User, status: profileStatus },
    { id: "data", name: "Data", desc: "Import time history from Clockify, Harvest, Toggl, and more.", icon: Database, status: dataStatus },
    { id: "team", name: "Team", desc: "Roster, Sightline invitations, and roles.", icon: Users, status: teamStatus },
    { id: "billing", name: "Billing", desc: "Your current plan and payment method.", icon: CreditCard, status: billingStatus },
    { id: "notifications", name: "Notifications", desc: "Alerts and email preferences.", icon: Bell, status: { tone: "muted", text: "Default settings" } },
    { id: "preferences", name: "Preferences", desc: "Display and regional settings.", icon: SlidersHorizontal, status: { tone: "muted", text: "Default settings" } },
    { id: "security", name: "Security", desc: "Password and account access.", icon: Lock, status: { tone: "ok", text: "Secure" } },
    { id: "history", name: "Historical reference", desc: "Change log across your financial settings.", icon: History, status: { tone: "muted", text: "View change history" } },
  ];
  return <>{tiles.map(t => <Tile key={t.id} t={t} active={active} onOpen={onOpen} />)}</>;
}

function DataPanel({ onClose }: { onClose: () => void }) {
  const listLogsFn = useServerFn(listTimeImportLogs);
  const { data } = useQuery({
    queryKey: ["time-import-logs"],
    queryFn: () => listLogsFn(),
  });
  const logs = data?.logs ?? [];
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <>
      {logs.length > 0 && (
        <div className="mb-5 rounded-[6px] border border-border bg-cream/40 px-4 py-3">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="flex w-full items-center justify-between text-left text-[12px] text-[#8A7F75] hover:text-ch"
          >
            <span>Import history ({logs.length})</span>
            {historyOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {historyOpen && (
            <ul className="mt-2 space-y-1.5 border-t border-border pt-2 text-[11px] text-[#8A7F75]">
              {logs.map((log) => (
                <li key={log.id} className="flex flex-wrap gap-x-2">
                  <span className="text-ch">{new Date(log.imported_at).toLocaleDateString()}</span>
                  <span>·</span>
                  <span>{formatSourceLabel(log.source as ImportSource)}</span>
                  <span>·</span>
                  <span>{log.rows_imported} imported</span>
                  <span>·</span>
                  <span>{log.filename}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <TimeImportWizard onClose={onClose} />
    </>
  );
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
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gold">Live output</p>
            <h3 className="mt-0.5 mb-3 font-display text-[18px] text-ch">Your numbers</h3>
            <div className="text-[11px] uppercase tracking-[0.1em] text-ch/60">Aligned rate</div>
            <div className="font-display text-[32px] leading-none text-ch flex items-center">
              <span>${Math.round(c.alignedRate)}</span>
              <AlignedRateBreakdown c={c} targetMarginPct={Number(cfg?.target_gross_margin_pct) || 0} side="left" />
            </div>
            <div className="mt-1 text-[11px] text-ch/60 mb-2.5">Your floor.</div>
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
            <p className="mt-2.5 text-[11px] text-ch/60">Changes save automatically.</p>
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
      pricing_structure: normalizePricingStructure((cfg as { pricing_structure?: string }).pricing_structure),
    });
    hydrated.current = true;
  }, [cfg]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function patch(p: Record<string, string>) {
    setDraft(d => {
      const next = { ...d, ...p };
      const availN = Number(next.available_hrs_per_week) || 0;
      const targetN = Number(next.target_billable_hrs_per_week) || 0;
      if (availN > 0 && targetN > availN) {
        next.target_billable_hrs_per_week = String(availN);
      }
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const payload: Record<string, number | string | null> = {};
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
        payload.pricing_structure = normalizePricingStructure(next.pricing_structure);
        if (!requiresBilledRate(payload.pricing_structure as PricingStructure)) {
          payload.rate_billed = null;
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
    pricing_structure: normalizePricingStructure(draft.pricing_structure),
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
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { liveConfig, expenses, cfg } = useFinancialDraft();
  const listOwn = useServerFn(listOwnerCompensations);
  const listTeamFn = useServerFn(listTeam);
  const invitePrincipal = useServerFn(inviteTeamMember);
  const resendInvite = useServerFn(resendInvitation);
  const updCfg = useServerFn(upsertFirmConfig);
  const { data: ownerData } = useQuery({ queryKey: ["ownerComp"], queryFn: () => listOwn() });
  const { data: teamData } = useQuery({ queryKey: ["team"], queryFn: () => listTeamFn() });
  const isPrincipal = me?.profile?.role === "principal";
  const [coOwnerEmail, setCoOwnerEmail] = useState("");
  const [coOwnerName, setCoOwnerName] = useState("");
  const [invitingCoOwner, setInvitingCoOwner] = useState(false);
  const pendingPrincipalInvites = (teamData?.invites ?? []).filter(
    (i: any) => i.role === "principal",
  );

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

  async function sendCoOwnerInvite() {
    if (!coOwnerEmail.trim()) {
      toast.error("Email required.");
      return;
    }
    setInvitingCoOwner(true);
    try {
      await invitePrincipal({
        data: {
          email: coOwnerEmail.trim().toLowerCase(),
          role: "principal",
          name: coOwnerName.trim() || null,
        } as any,
      });
      toast.success("Co-owner invitation sent.");
      setCoOwnerEmail("");
      setCoOwnerName("");
      qc.invalidateQueries({ queryKey: ["team"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send invitation.");
    } finally {
      setInvitingCoOwner(false);
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

  // Always calc() against the firm's saved business_structure so the modal's
  // Live Output panel matches the dashboard's cost floor / break-even /
  // aligned rate for the same underlying data. Advanced mode may preview a
  // different structure live; simple mode inherits the saved structure
  // rather than forcing it to null (which would drop distributions and
  // reserve contributions and produce a lower cost floor than the
  // dashboard shows).
  const cfgForCalc: any =
    mode === "advanced"
      ? { ...(liveConfig as any), business_structure: structure ?? savedStructure, __ownerCompOverride: liveRows }
      : { ...(liveConfig as any), business_structure: savedStructure, __ownerCompOverride: liveRows };

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
            <div className="inline-flex overflow-hidden rounded-[4px] border border-border text-[11px]">
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
              <p className="mt-2 text-[11px] leading-[1.5] text-ch/60">{structureExplainer(structure)}</p>
              {reviewNote && (
                <p className="mt-2 text-[11px] leading-[1.5] text-gold">
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
            {pendingPrincipalInvites.map((inv: any) => (
              <div
                key={inv.id}
                className="rounded-[7px] border border-gold border-dashed bg-cream/40 px-3.5 py-3"
              >
                <div className="text-[12px] font-medium text-ch">
                  {inv.name || inv.email}
                  <span className="ml-1.5 text-[11px] font-normal text-ch/60">· Co-owner invite pending</span>
                </div>
                <div className="mt-0.5 text-[11px] text-ch/60">{inv.email}</div>
                <p className="mt-2 text-[11px] leading-[1.5] text-ch/55">
                  Their compensation card appears once they accept. Each co-owner configures their own pay.
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await resendInvite({ data: { id: inv.id } });
                      toast.success("Invitation resent.");
                    } catch {
                      toast.error("Could not resend.");
                    }
                  }}
                  className="mt-2 text-[11px] text-gold hover:underline"
                >
                  Resend invitation
                </button>
              </div>
            ))}
          </div>
          {isPrincipal && (
            <div className="mt-4 rounded-[7px] border border-border bg-cream/50 p-3">
              <div className="mb-2 text-[11px] font-medium text-ch">Invite a co-owner / principal</div>
              <Row2>
                <Field label="Name">
                  <input
                    className={inputCls}
                    value={coOwnerName}
                    onChange={(e) => setCoOwnerName(e.target.value)}
                    placeholder="Optional"
                  />
                </Field>
                <Field label="Email">
                  <input
                    className={inputCls}
                    type="email"
                    value={coOwnerEmail}
                    onChange={(e) => setCoOwnerEmail(e.target.value)}
                    placeholder="Required"
                  />
                </Field>
              </Row2>
              <p className="mb-2.5 text-[11px] leading-[1.5] text-ch/60">
                Co-owners get full ownership access, their own compensation settings, and billing access.
                Their pay is configured here after they join — not in Team cost.
              </p>
              <button
                type="button"
                onClick={sendCoOwnerInvite}
                disabled={invitingCoOwner}
                className={darkBtn}
              >
                {invitingCoOwner ? "Sending…" : "Send co-owner invitation"}
              </button>
            </div>
          )}
          {principals.length === 1 && !pendingPrincipalInvites.length && isPrincipal && (
            <p className="mt-3 text-[11px] leading-[1.5] text-ch/55">
              Co-owned firm? Use the invite form above to add a second principal. Their compensation card
              will appear here once they accept.
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
  // comp_draw_annual stores the salary/draw ONLY (matches finance.ts calc()).
  // Distributions live in distribution_annual and are added separately —
  // never folded into comp_draw_annual (that produced double-counting when
  // toggling Simple ↔ Advanced).
  const draw = Number(v.comp_draw_annual) || 0;
  const dist = Number(v.distribution_annual) || 0;
  const simpleSalary = draw;
  const health = Number(v.health_insurance_annual) || 0;
  const retire = Number(v.retirement_annual) || 0;
  const reserve = Number(v.reserve_target) || 0;
  const empePct = Number(v.employee_payroll_tax_pct) || 0;
  const ptaxPct = Number(v.payroll_tax_pct) || 0;
  const ptax =
    isAdv && isSCorp ? (draw * (ptaxPct + empePct)) / 100 : (draw * ptaxPct) / 100;
  // Simple mode always surfaces distributions in the total; Advanced only
  // exposes them for S-Corp.
  const includeDist = !isAdv || isSCorp;
  const total =
    draw + ptax + health + retire + (includeDist ? dist : 0) + (isAdv && isSCorp ? reserve : 0);

  function setSimpleSalary(x: string) {
    const s = x === "" ? 0 : Number(x);
    onChange({ ...v, comp_draw_annual: s });
  }
  function setSimpleDist(x: string) {
    const d = x === "" ? 0 : Number(x);
    onChange({ ...v, distribution_annual: d });
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
        <div className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border border-gold bg-cream text-[11px] font-medium text-gold">{initials}</div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium text-ch">
            {principal.name || principal.email}
            <span className="ml-1.5 text-[11px] font-normal text-ch/60">
              · Principal{isMe && " · (You)"}
            </span>
          </div>
          <div
            className="mt-0.5 text-[11px]"
            style={{ color: configured ? "rgba(44,44,44,0.6)" : "#BA7517" }}
          >
            {configured
              ? `$${Math.round((Number(display.comp_draw_annual) || 0) / 1000)}k draw · $${Math.round(computeCardTotal(display, isSCorp) / 1000)}k total`
              : (isMe ? "Not configured — click to add" : "Not configured")}
          </div>
        </div>
        {isMe && (
          <span className="text-[11px] text-ch/40">{open ? "▲" : "▼"}</span>
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

function TeamCostPanel({ onClose, onOpenPanel }: { onClose: () => void; onOpenPanel?: (id: PanelId) => void }) {
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

  const initials = (name: string, email: string | null) =>
    (name || email || "?").split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  // Team totals: sum of members' burdened annual cost + per-hour impact on aligned rate.
  const teamTotals = useMemo(() => {
    const totalCost = members.reduce(
      (s, m: any) => s + (Number(m.burdened_weekly_cost) || 0) * (Number(m.weeks_per_year) || 48),
      0,
    );
    const principalHrs = effectivePrincipalBillableHrsWeek(liveConfig as any);
    const teamBillableHrs = members.reduce((s, m: any) => s + (Number(m.expected_hrs_per_week) || 0), 0);
    const annualBillableHrs = (principalHrs + teamBillableHrs) * 48;
    const perHour = annualBillableHrs > 0 ? totalCost / annualBillableHrs : 0;
    return { totalCost, perHour };
  }, [members, liveConfig]);

  return (
    <FinancialLayout
      title="Team cost"
      subtitle="Fully burdened cost of each team member. Add people in Account → Team — they appear here automatically."
      onClose={onClose}
      cfg={liveConfig} expenses={expenses}
      left={
        <>
          {sorted.length === 0 ? (
            <div className="rounded-[7px] border border-border bg-cream/50 px-4 py-6 text-center text-[11px] text-ch/60">
              No team members yet.{" "}
              {onOpenPanel ? (
                <button
                  type="button"
                  onClick={() => onOpenPanel("team")}
                  className="text-gold underline underline-offset-2 hover:text-ch"
                >
                  Add team members in Account → Team
                </button>
              ) : (
                "Add team members in Account → Team."
              )}
            </div>
          ) : (
            <>
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

              {members.length > 0 ? (
                <div className="mt-3 rounded-[6px] border border-border bg-cream/50 px-3.5 py-2.5">
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: "#2C2C2C" }}>
                    Total team cost: ${Math.round(teamTotals.totalCost).toLocaleString()}/yr
                  </div>
                  <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, color: "rgba(44,44,44,0.6)", marginTop: 2 }}>
                    {teamTotals.perHour > 0
                      ? `Adds $${teamTotals.perHour.toFixed(2)}/hr to your aligned rate`
                      : "Set billable hours on principal or team to see per-hour impact"}
                  </div>
                </div>
              ) : null}
            </>
          )}

          {sorted.length > 0 && onOpenPanel ? (
            <p className="mt-3 text-[11px] text-ch/55">
              Need to add someone?{" "}
              <button
                type="button"
                onClick={() => onOpenPanel("team")}
                className="text-gold underline underline-offset-2 hover:text-ch"
              >
                Go to Account → Team
              </button>
            </p>
          ) : null}
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

  // Quick-estimate calculator (locked-formula shared component). Independent
  // UI state that writes back to the draft `d` via an explicit Apply button.
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickInput, setQuickInput] = useState<BurdenedCostValue>(() => ({
    basis: m.compensation_type === "salaried" ? "salary" : "hourly",
    hourlyRate: m.hourly_wage != null ? String(m.hourly_wage) : "",
    annualSalary: m.annual_base_salary != null ? String(m.annual_base_salary) : "",
    hoursPerWeek: m.expected_hrs_per_week != null ? String(m.expected_hrs_per_week) : "40",
    hasBenefits: Number(m.annual_benefits) > 0,
    hasRetirement: false,
  }));
  const applyQuickEstimate = () => {
    const est = estimateBurdenedCost({
      basis: quickInput.basis,
      hourlyRate: Number(quickInput.hourlyRate) || 0,
      annualSalary: Number(quickInput.annualSalary) || 0,
      hoursPerWeek: Number(quickInput.hoursPerWeek) || 0,
      hasBenefits: quickInput.hasBenefits,
      hasRetirement: quickInput.hasRetirement,
    });
    const isSalary = quickInput.basis === "salary";
    setD({
      ...d,
      compensation_type: isSalary ? "salaried" : "hourly",
      hourly_wage: !isSalary ? Number(quickInput.hourlyRate) || 0 : null,
      annual_base_salary: isSalary ? Number(quickInput.annualSalary) || 0 : null,
      employer_payroll_tax_pct: BURDEN_EMPLOYER_TAX_PCT,
      annual_benefits:
        est.benefitsAmount + est.retirementAmount > 0
          ? est.benefitsAmount + est.retirementAmount
          : null,
      expected_hrs_per_week: Number(quickInput.hoursPerWeek) || 40,
    });
  };

  // Debounced auto-save + "Saved" flash. billable-capacity fields (expected_hrs_per_week
  // and billed_rate) are preserved in state but never edited here — Capacity & Rate owns them.
  const initial = useRef(JSON.stringify(d));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  useEffect(() => {
    const snap = JSON.stringify(d);
    if (snap === initial.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await onSave(d);
      initial.current = snap;
      setSavedAt(Date.now());
      window.setTimeout(() => setSavedAt(null), 1800);
    }, 500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(d)]);

  // Live burdened cost derived from current draft
  const burden = useMemo(() => computeBurden(d), [d]);
  const perBillable = useMemo(() => {
    const hrs = Number(m.expected_hrs_per_week) || 0;
    const wks = Number(m.weeks_per_year) || 48;
    const denom = hrs * wks;
    return denom > 0 ? burden.total / denom : 0;
  }, [burden.total, m.expected_hrs_per_week, m.weeks_per_year]);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

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
        <div className={cn("grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border bg-cream text-[11px] font-medium text-gold", status.border)}>
          {initials(m.name, m.email)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium text-ch">
            {m.name}
            <span className="ml-1.5 text-[11px] font-normal text-ch/60 capitalize">· {String(m.role_type).replace("_", " ")}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-ch/60">
            {status.label}{configured ? ` · ${summary}` : ""}
          </div>
        </div>
        <span className="text-[11px] text-ch/40">{open ? "▲" : "▼"}</span>
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

          <div className="mt-1 mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-ch/50">
            Compensation
          </div>

          {/* Quick-estimate calculator (shared with onboarding) — locked formula
              output. Users who need precise figures use the advanced fields below. */}
          <div className="mb-3 rounded-md border border-border/70 bg-cream/40">
            <button
              type="button"
              onClick={() => setQuickOpen((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2 text-left"
            >
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ch/70">
                Quick estimate
              </span>
              <span className="text-[11px] text-ch/45">{quickOpen ? "Hide ▲" : "Show ▼"}</span>
            </button>
            {quickOpen && (
              <div className="border-t border-border/60 p-3">
                <BurdenedCostCalculator
                  value={quickInput}
                  onChange={setQuickInput}
                  showHeader={false}
                />
                <div className="mt-3 flex items-center justify-between">
                  <p
                    className="text-[11px] italic text-ch/55"
                    style={{ fontFamily: "Jost, sans-serif" }}
                  >
                    Applying overwrites wage, payroll tax, and benefits below.
                  </p>
                  <button
                    type="button"
                    onClick={applyQuickEstimate}
                    className="rounded border border-gold/50 bg-gold/10 px-3 py-1 text-[11px] text-ch hover:bg-gold/20"
                    style={{ fontFamily: "Jost, sans-serif" }}
                  >
                    Apply estimate
                  </button>
                </div>
              </div>
            )}
          </div>

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
              <Field label="Weeks / year">
                <NumInput value={d.weeks_per_year?.toString() ?? "48"} onChange={(v) => setD({ ...d, weeks_per_year: v === "" ? null : Number(v) })} />
              </Field>
              <Field label="Other annual costs">
                <NumInput value={d.other_annual_costs?.toString() ?? ""} onChange={(v) => setD({ ...d, other_annual_costs: v === "" ? null : Number(v) })} prefix="$" placeholder="0" />
              </Field>
              <p className="mb-2 text-[11px] leading-[1.5] text-ch/60">
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
            </>
          )}

          {/* Fully burdened cost display */}
          <div
            className="mt-2.5"
            style={{ background: "rgba(184,134,11,0.04)", borderRadius: 6, padding: "10px 14px" }}
          >
            <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(44,44,44,0.55)" }}>
              Fully burdened annual cost
            </div>
            <div className="mt-0.5 flex items-baseline justify-between gap-3">
              <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: "#2C2C2C" }}>
                ${Math.round(burden.total).toLocaleString()}/yr
              </span>
              <button
                type="button"
                onClick={() => setBreakdownOpen((v) => !v)}
                className="text-[11px] text-ch/55 hover:text-ch"
              >
                {breakdownOpen ? "Hide breakdown ▲" : "Show breakdown ▼"}
              </button>
            </div>
            {breakdownOpen ? (
              <div className="mt-2 space-y-[3px]" style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, color: "#2C2C2C" }}>
                <BurdenRow label="Base compensation" value={burden.base} />
                {!contract ? <BurdenRow label="Employer payroll tax" value={burden.tax} /> : null}
                {!contract ? <BurdenRow label="Benefits" value={burden.benefits} /> : null}
                <BurdenRow label="Equipment/overhead" value={burden.other} />
                <div className="mt-1 border-t border-border pt-1 flex justify-between">
                  <span className="text-ch/70">Total burdened cost</span>
                  <span className="font-medium">${Math.round(burden.total).toLocaleString()}/yr</span>
                </div>
              </div>
            ) : null}
            <div className="mt-1.5" style={{ fontFamily: "'Jost', sans-serif", fontSize: 11 }}>
              {Number(m.expected_hrs_per_week) > 0 ? (
                <span style={{ color: "#B8860B" }}>
                  Per billable hour: ${perBillable.toFixed(2)}/hr
                </span>
              ) : (
                <span className="italic text-ch/50">
                  Set billable hours in Capacity to see per-hour cost
                </span>
              )}
            </div>
          </div>

          <div className="mt-2.5 flex items-center justify-between">
            <button type="button" onClick={onDelete} className="text-[11px] text-danger/70 hover:text-danger inline-flex items-center gap-1">
              <Trash2 size={11} /> Remove
            </button>
            <span className="text-[11px]" style={{ color: savedAt ? "#5C8A6E" : "rgba(44,44,44,0.45)" }}>
              {savedAt ? "Saved" : "Auto-saves as you type"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function BurdenRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-ch/60">{label}</span>
      <span className="text-ch">${Math.round(value).toLocaleString()}/yr</span>
    </div>
  );
}

function computeBurden(d: any): { base: number; tax: number; benefits: number; other: number; total: number } {
  const empType = d.employment_type;
  const contract = empType === "contractor" || empType === "1099";
  const wks = Number(d.weeks_per_year) || 48;
  const hpw = Number(d.expected_hrs_per_week) || 40;
  const ptaxPct = contract ? 0 : Number(d.employer_payroll_tax_pct ?? 7.65) || 0;
  const benefits = contract ? 0 : Number(d.annual_benefits) || 0;
  const other = Number(d.other_annual_costs) || 0;
  let base = 0;
  if (d.compensation_type === "salaried" || d.compensation_type === "contract_annual") {
    base = Number(d.annual_base_salary) || 0;
  } else {
    base = (Number(d.hourly_wage) || 0) * hpw * wks;
  }
  const tax = base * (ptaxPct / 100);
  const total = base + tax + benefits + other;
  return { base, tax, benefits, other, total };
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
            <div className="grid grid-cols-[1fr_100px_100px_28px] bg-creamd/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-ch/60">
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
  const target = effectivePrincipalBillableHrsWeek(liveConfig as any);
  const utilization = avail > 0 ? (target / avail) * 100 : 0;
  const firmRate = Number(liveConfig?.rate_billed) || 0;
  const pricingStructure = normalizePricingStructure(draft.pricing_structure);
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
              <NumInput
                value={draft.target_billable_hrs_per_week ?? ""}
                onChange={(v) => patch({ target_billable_hrs_per_week: v })}
              />
              {avail > 0 ? (
                <p className="mt-1 text-[10px] text-ch/45">Capped at available hours ({avail}/wk).</p>
              ) : null}
            </Field>
          </Row2>
          <Row2>
            <Field label="Target gross margin %">
              <NumInput value={draft.target_gross_margin_pct ?? ""} onChange={(v) => patch({ target_gross_margin_pct: v })} suffix="%" />
            </Field>
            <div />
          </Row2>
          <PricingStructureSelector
            value={pricingStructure}
            onChange={(value) => {
              patch({
                pricing_structure: value,
                ...(requiresBilledRate(value) ? {} : { rate_billed: "" }),
              });
            }}
          />
          {requiresBilledRate(pricingStructure) ? (
            <Row2>
              <Field label="Your billed rate ($/hr) *">
                <NumInput value={draft.rate_billed ?? ""} onChange={(v) => patch({ rate_billed: v })} prefix="$" />
              </Field>
              <div />
            </Row2>
          ) : null}
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
        style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, fontWeight: 400, color: "rgba(44,44,44,0.6)" }}
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
                    <div className="text-[11px] text-ch/55 capitalize">
                      {String(m.role_type || "team").replace(/_/g, " ")}
                    </div>
                  </div>
                  {flashed ? (
                    <span
                      style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, color: "#5C8A6E" }}
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

function ProfileFirmPanel({ onClose }: { onClose: () => void }) {
  return (
    <PanelShell title="Profile & firm" subtitle="Your personal info and firm configuration." onClose={onClose}>
      <div className="mb-6 border-b border-border pb-6">
        <p className="mb-3 text-[12px] font-medium text-ch">Your profile</p>
        <ProfilePanelBody />
      </div>
      <div>
        <p className="mb-3 text-[12px] font-medium text-ch">Firm</p>
        <FirmPanelBody onClose={onClose} />
      </div>
    </PanelShell>
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

function FirmPanelBody({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data } = useMe();
  const upd = useServerFn(updateFirm);
  const updCfg = useServerFn(upsertFirmConfig);
  const saveHome = useServerFn(setPreferredHome);
  const saveLanding = useServerFn(setDefaultLandingPage);
  const [name, setName] = useState(data?.firm?.name ?? "");
  const [structure, setStructure] = useState((data?.config?.business_structure as string) ?? "sole_prop");
  const [basis, setBasis] = useState((data?.config?.accounting_basis as string) ?? "cash");
  const [home, setHome] = useState(((data?.profile as any)?.preferred_home as string) ?? "dashboard");
  const [landing, setLanding] = useState(((data?.firm as any)?.default_landing_page as string) ?? "dashboard");
  const [landingSaved, setLandingSaved] = useState(false);
  const [state, setState] = useState((data?.firm as any)?.state ?? "");
  const [saving, setSaving] = useState(false);

  async function onLandingChange(v: string) {
    setLanding(v);
    try {
      await saveLanding({ data: { page: v as any } });
      setLandingSaved(true);
      qc.invalidateQueries({ queryKey: ["me"] });
      setTimeout(() => setLandingSaved(false), 2000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  }

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
    <>
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
      <div className="mt-3">
        <div style={{ fontFamily: "Jost, sans-serif", fontSize: 11, fontWeight: 500, color: "#2C2C2C", marginBottom: 8 }}>
          Default landing page
        </div>
        <div style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: "#6B6259", marginBottom: 10 }}>
          Choose where Sightline takes you each time you log in.
        </div>
        <div className="flex items-center gap-3">
          <select className={selectCls} value={landing} onChange={(e) => onLandingChange(e.target.value)}>
            <option value="dashboard">Dashboard</option>
            <option value="projects">Projects</option>
            <option value="capacity">Capacity</option>
            <option value="time_calendar">Time calendar</option>
            <option value="rate_architecture">Rate architecture</option>
          </select>
          {landingSaved && (
            <span style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: "#5C8A6E" }}>Saved ✓</span>
          )}
        </div>
      </div>
      <SaveRow onCancel={onClose} onSave={save} saving={saving} />
    </>
  );
}

const US_STATES = ["Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming"];

function TeamPanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const firmState = ((me?.firm as any)?.state ?? null) as string | null;
  const stateDefault = getDefaultEmployerTaxRate(firmState).total;
  const list = useServerFn(listTeam);
  const invite = useServerFn(inviteTeamMember);
  const update = useServerFn(updateTeamMember);
  const resend = useServerFn(resendInvitation);
  const saveMember = useServerFn(saveFirmMember);
  const listFM = useServerFn(listFirmMembers);
  const { data } = useQuery({ queryKey: ["team"], queryFn: () => list() });
  const { data: fmData } = useQuery({ queryKey: ["firmMembers"], queryFn: () => listFM() });
  const [email, setEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [role, setRole] = useState<"team" | "admin" | "view_only">("team");
  const [sending, setSending] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    email: "",
    role_type: "team",
    employment_type: "employee",
  });
  const [adding, setAdding] = useState(false);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["team"] });
    qc.invalidateQueries({ queryKey: ["firmMembers"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  }

  async function send() {
    if (!email.trim()) {
      toast.error("Email required.");
      return;
    }
    setSending(true);
    try {
      await invite({
        data: {
          email: email.trim().toLowerCase(),
          role,
          name: inviteName.trim() || null,
        } as any,
      });
      toast.success("Invitation sent. They'll appear in Team cost for compensation setup.");
      setEmail("");
      setInviteName("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setSending(false);
    }
  }

  async function addToRoster() {
    if (!addForm.name.trim()) {
      toast.error("Name required.");
      return;
    }
    setAdding(true);
    try {
      await saveMember({
        data: {
          name: addForm.name.trim(),
          email: addForm.email.trim() || null,
          role_type: addForm.role_type as any,
          employment_type: addForm.employment_type as any,
          compensation_type: addForm.employment_type === "employee" ? "hourly" : "contract_hourly",
          employer_payroll_tax_pct: addForm.employment_type === "employee" ? stateDefault : null,
          expected_hrs_per_week: 40,
          weeks_per_year: 48,
        },
      });
      toast.success("Team member added. Set up their compensation in Team cost.");
      setAddForm({ name: "", email: "", role_type: "team", employment_type: "employee" });
      setAddOpen(false);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add member.");
    } finally {
      setAdding(false);
    }
  }

  function inviteExisting(m: any) {
    setEmail(m.email ?? "");
    setInviteName(m.name ?? "");
    setRole(
      m.role_type === "admin" || m.role_type === "view_only" ? m.role_type : "team",
    );
    setTimeout(() => {
      const el = document.getElementById("invite-email-input");
      if (el) (el as HTMLInputElement).focus();
    }, 60);
  }

  async function changeRole(id: string, r: string) {
    try {
      await update({ data: { id, role: r } });
      toast.success("Role updated.");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update.");
    }
  }

  const initials = (name: string, email: string) =>
    (name || email).split(/\s+/).map(s => s[0]).slice(0, 2).join("").toUpperCase();

  const rows = ((fmData ?? []) as any[]).filter((m) => m.role_type !== "principal");
  const seenEmails = new Set(rows.map((r) => (r.email || "").toLowerCase()));
  const orphanInvites = (data?.invites ?? []).filter(
    (i: any) =>
      i.role !== "principal" && !seenEmails.has((i.email || "").toLowerCase()),
  );

  const rowStatus = (m: any) => {
    if (m.is_platform_user) return { label: "Active", dot: "#3F7A4E", tone: "ok" };
    if (m.invite_sent_at && !m.invite_accepted_at)
      return { label: "Pending invite", dot: "#B8860B", tone: "warn" };
    return { label: "Not invited yet", dot: "#C0B8AA", tone: "muted" };
  };

  const principals = (data?.members ?? []).filter((m) => m.role === "principal");

  return (
    <PanelShell
      title="Team"
      subtitle="Add team members and invite them to Sightline. They appear in Team cost for compensation setup. Co-owners are invited from Owner compensation."
      onClose={onClose}
    >
      {principals.length > 0 ? (
        <div className="mb-3 rounded-[6px] border border-border bg-cream/40 px-3 py-2">
          <div className="text-[11px] font-medium text-ch/70">Owners</div>
          <div className="mt-1 space-y-1">
            {principals.map((m) => (
              <div key={m.id} className="text-[11px] text-ch/60">
                {m.name || m.email} · Principal
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mb-3 overflow-hidden rounded-[6px] border border-border bg-white">
        {rows.map((m, i) => {
          const st = rowStatus(m);
          const profile = (data?.members ?? []).find((p) => p.id === m.profile_id);
          const pendingInvite = (data?.invites ?? []).find(
            (inv: any) =>
              inv.role !== "principal" &&
              (inv.email || "").toLowerCase() === (m.email || "").toLowerCase(),
          );
          return (
            <div
              key={m.id}
              className={cn("flex items-center gap-2.5 px-3 py-2.5", i < rows.length - 1 && "border-b border-border")}
            >
              <div className="grid h-[26px] w-[26px] place-items-center rounded-full border border-border bg-cream text-[11px] font-medium text-ch/70">
                {initials(m.name || "", m.email || "")}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium text-ch">{m.name || m.email || "Unnamed"}</div>
                <div className="truncate text-[11px] text-ch/60">{m.email || "No email"}</div>
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: st.dot }} />
                <span className="text-ch/60">{st.label}</span>
              </div>
              {profile ? (
                <select
                  className={cn(selectCls, "w-[110px] py-[3px] text-[11px]")}
                  value={profile.role}
                  onChange={(e) => changeRole(profile.id, e.target.value)}
                >
                  <option value="admin">Admin</option>
                  <option value="team">Team</option>
                  <option value="view_only">View only</option>
                </select>
              ) : pendingInvite ? (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await resend({ data: { id: pendingInvite.id } });
                      toast.success("Resent.");
                      refresh();
                    } catch {
                      toast.error("Could not resend.");
                    }
                  }}
                  className="text-[11px] text-ch/60 hover:text-gold"
                >
                  Resend
                </button>
              ) : m.email ? (
                <button
                  type="button"
                  onClick={() => inviteExisting(m)}
                  className="rounded-[3px] border border-gold px-2 py-[3px] text-[11px] font-medium text-gold transition-colors hover:bg-gold hover:text-white"
                >
                  Invite to Sightline
                </button>
              ) : (
                <span className="text-[11px] italic text-ch/40">Add email to invite</span>
              )}
            </div>
          );
        })}
        {orphanInvites.map((i: any) => (
          <div key={i.id} className="flex items-center gap-2.5 border-t border-border bg-cream/50 px-3 py-2.5">
            <div className="grid h-[26px] w-[26px] place-items-center rounded-full border border-border bg-creamd/50 text-[11px] text-ch/50">
              {initials(i.name || "", i.email)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] text-ch/60">{i.name || i.email}</div>
              <div className="truncate text-[11px] text-ch/50">{i.role}</div>
            </div>
            <span className="rounded-[3px] bg-[#FAEEDA] px-1.5 py-[2px] text-[11px] font-medium text-[#633806]">Pending</span>
            <button
              type="button"
              onClick={async () => {
                try {
                  await resend({ data: { id: i.id } });
                  toast.success("Resent.");
                  refresh();
                } catch {
                  toast.error("Could not resend.");
                }
              }}
              className="text-[11px] text-ch/60 hover:text-gold"
            >
              Resend
            </button>
          </div>
        ))}
        {!rows.length && !orphanInvites.length ? (
          <div className="px-3 py-6 text-center text-[11px] text-ch/50">No team members yet.</div>
        ) : null}
      </div>

      <div className="mb-3 rounded-[6px] border border-border bg-cream/70 p-3">
        <div className="mb-2 text-[11px] font-medium text-ch">Add team member</div>
        {!addOpen ? (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 text-[11px] text-gold hover:underline"
          >
            <Plus size={13} /> Add to roster
          </button>
        ) : (
          <>
            <Row2>
              <Field label="Name">
                <input
                  className={inputCls}
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  autoFocus
                />
              </Field>
              <Field label="Role">
                <select
                  className={selectCls}
                  value={addForm.role_type}
                  onChange={(e) => setAddForm({ ...addForm, role_type: e.target.value })}
                >
                  <option value="admin">Admin</option>
                  <option value="team">Team</option>
                  <option value="contractor">Contractor</option>
                  <option value="view_only">View only</option>
                </select>
              </Field>
            </Row2>
            <Row2>
              <Field label="Employment type">
                <select
                  className={selectCls}
                  value={addForm.employment_type}
                  onChange={(e) => setAddForm({ ...addForm, employment_type: e.target.value })}
                >
                  <option value="employee">Employee</option>
                  <option value="contractor">Contractor</option>
                  <option value="1099">1099</option>
                </select>
              </Field>
              <Field label="Email (optional)">
                <input
                  className={inputCls}
                  type="email"
                  value={addForm.email}
                  onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                  placeholder="For Sightline invite later"
                />
              </Field>
            </Row2>
            <p className="mb-2 text-[11px] text-ch/60">
              Adds them to Team cost for compensation setup. Invite to Sightline when ready.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className={ghostBtn} onClick={() => setAddOpen(false)}>Cancel</button>
              <button type="button" className={goldBtn} onClick={addToRoster} disabled={adding}>
                {adding ? "Adding…" : "Add member"}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="rounded-[6px] border border-border bg-cream/70 p-3">
        <div className="mb-2 text-[11px] font-medium text-ch">Invite to Sightline</div>
        <Row2>
          <Field label="Name">
            <input
              className={inputCls}
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="Optional"
            />
          </Field>
          <Field label="Email">
            <input
              id="invite-email-input"
              type="email"
              className={inputCls}
              placeholder="Required"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
        </Row2>
        <div className="mb-2">
          <div className={fieldLabel}>Role</div>
          <select className={selectCls} value={role} onChange={(e) => setRole(e.target.value as any)}>
            <option value="team">Team</option>
            <option value="admin">Admin</option>
            <option value="view_only">View only</option>
          </select>
        </div>
        <p className="mb-2.5 text-[11px] leading-[1.5] text-ch/60">
          Team: time calendar and assigned projects. Admin: full access except billing. View only: read-only.
          Co-owners / principals are invited from{" "}
          <span className="text-ch/80">Financial → Owner compensation</span>.
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
  const qc = useQueryClient();
  const switchFreq = useServerFn(switchBillingFrequency);
  const quoteFn = useServerFn(getFoundingQuote);
  const [busy, setBusy] = useState(false);
  const firm: any = data?.firm ?? null;
  const status = firm?.subscription_status;
  const isTrial = status === "trialing";
  const freq: "monthly" | "annual" = firm?.billing_frequency === "annual" ? "annual" : "monthly";
  const quoteQ = useQuery({
    queryKey: ["founding-quote", freq],
    queryFn: () => quoteFn({ data: { frequency: freq } }),
    enabled: !!firm,
  });
  const isFounding = firmUsesFoundingPricing(firm, quoteQ.data?.foundingActive ?? false);
  const prices = isFounding
    ? { monthly: 3999, annual: 39990, save: 7998 }
    : { monthly: 6999, annual: 69990, save: 13998 };
  const priceCents = prices[freq];
  const priceLabel = `$${(priceCents / 100).toFixed(2)}/${freq === "monthly" ? "month" : "year"}`;
  const nextBillRaw = firm?.current_period_end ?? firm?.trial_ends_at ?? null;
  const nextBillLabel = nextBillRaw
    ? new Date(nextBillRaw).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "—";

  const trialEndLabel = firm?.trial_ends_at
    ? new Date(firm.trial_ends_at).toLocaleDateString(undefined, { month: "long", day: "numeric" })
    : "the end of your trial";

  async function doSwitch(target: "monthly" | "annual") {
    const currentPrice = prices[freq];
    const targetPrice = prices[target];
    const targetLabel = `$${(targetPrice / 100).toFixed(2)}`;
    const message =
      target === "annual"
        ? `Switch to annual billing?\n\nYou'll be charged ${targetLabel} on ${nextBillLabel} and annually thereafter.`
        : `Switch to monthly billing?\n\nYour annual subscription ends on ${nextBillLabel}. From that date you'll be charged $${(prices.monthly / 100).toFixed(2)}/mo.`;
    if (!window.confirm(message)) return;
    setBusy(true);
    try {
      const res = await switchFreq({
        data: { target, environment: (getStripeEnvironment() as any) },
      });
      if ("error" in res) throw new Error(res.error);
      toast.success(target === "annual" ? "Switched to annual billing." : "Switch scheduled for end of period.");
      qc.invalidateQueries({ queryKey: ["me"] });
      void currentPrice;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not switch billing frequency.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PanelShell title="Billing" subtitle="Your current plan and payment method." onClose={onClose}>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: "#2C2C2C" }}>
        Sightline by Propos'Ability
      </div>
      <div style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: "#6B6259", marginTop: 2 }}>
        {freq === "annual" ? "Annual" : "Monthly"} billing
      </div>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: "#2C2C2C", marginTop: 8 }}>
        {priceLabel}
      </div>
      <div style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: "#8A7F75", marginTop: 4 }}>
        {isTrial
          ? `Trial ends ${nextBillLabel}`
          : `Next charge: ${nextBillLabel} · $${(priceCents / 100).toFixed(2)}`}
      </div>
      {isFounding && (
        <div style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: "#5C8A6E", marginTop: 4 }}>
          Founding rate — locked permanently.
        </div>
      )}

      <div className="mt-4">
        {isTrial ? (
          <div style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: "#8A7F75" }}>
            You can switch between monthly and annual billing when your trial ends on {trialEndLabel}.
          </div>
        ) : freq === "monthly" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => doSwitch("annual")}
            style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: "#B8860B" }}
            className="hover:underline disabled:opacity-50"
          >
            Switch to annual and save ${(prices.save / 100).toFixed(2)}/yr →
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => doSwitch("monthly")}
            style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: "#8A7F75" }}
            className="hover:underline disabled:opacity-50"
          >
            Switch to monthly billing →
          </button>
        )}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Link to="/billing" className={ghostBtn}>Manage in Stripe portal</Link>
      </div>
    </PanelShell>
  );
}

function ToggleRow({ label, desc, on, onChange }: { label: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 last:border-0">
      <div className="pr-4">
        <div className="text-[12px] text-ch">{label}</div>
        <div className="text-[11px] text-ch/60">{desc}</div>
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
        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.1em] text-danger">Danger zone</div>
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

/* ────────────────────────────── history panel ────────────────────────────── */

type ChangeCategory =
  | "rate_architecture" | "owner_compensation" | "team_cost" | "team_capacity" | "operating_expenses";

const CATEGORY_LABELS: Record<ChangeCategory, string> = {
  rate_architecture: "Rate architecture",
  owner_compensation: "Owner compensation",
  team_cost: "Team cost",
  team_capacity: "Team capacity",
  operating_expenses: "Operating expenses",
};

type ChangedField = {
  field: string;
  old_value: unknown;
  new_value: unknown;
  type: string;
};

type LogRow = {
  id: string;
  category: ChangeCategory;
  entity_label: string;
  changed_fields: ChangedField[];
  changed_by_name: string | null;
  created_at: string;
};

function formatValue(v: unknown, type: string): string {
  if (v === null || v === undefined || v === "") return "—";
  if (type === "boolean") return v ? "Active" : "Inactive";
  const num = typeof v === "number" ? v : Number(v);
  if (Number.isFinite(num) && (
    type === "currency" || type === "currency_annual" ||
    type === "rate_per_hour" || type === "hours_per_week" ||
    type === "weeks" || type === "percent"
  )) {
    if (type === "rate_per_hour") return `$${Math.round(num)}/hr`;
    if (type === "hours_per_week") return `${num} hrs/wk`;
    if (type === "weeks") return `${num} wks`;
    if (type === "percent") return `${num}%`;
    return `$${Math.round(num).toLocaleString()}`;
  }
  return String(v).replace(/_/g, " ");
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function HistoryPanel({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<ChangeCategory>("rate_architecture");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const list = useServerFn(listChangeLog);
  const { data, isLoading } = useQuery({
    queryKey: ["changeLog", category],
    queryFn: () => list({ data: { category } }),
  });

  const rows = (data ?? []) as LogRow[];

  function toggle(id: string) {
    const s = new Set(expanded);
    if (s.has(id)) s.delete(id); else s.add(id);
    setExpanded(s);
  }

  return (
    <PanelShell
      title="Historical reference"
      subtitle="Every change made to your financial settings, grouped by category."
      onClose={onClose}
    >
      <div className="mb-4 flex flex-wrap gap-1.5">
        {(Object.keys(CATEGORY_LABELS) as ChangeCategory[]).map((c) => {
          const on = c === category;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                "rounded-[4px] border px-2.5 py-[6px] text-[11px] transition-colors",
                on
                  ? "border-gold bg-gold text-white"
                  : "border-border bg-white text-ch/70 hover:border-gold/60",
              )}
            >
              {CATEGORY_LABELS[c]}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <p className="text-[11px] text-ch/50">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-[11px] italic text-ch/50">
          No changes recorded yet for {CATEGORY_LABELS[category].toLowerCase()}.
        </p>
      ) : (
        <div className="divide-y divide-border rounded-[6px] border border-border bg-white">
          {rows.map((r) => {
            const isOpen = expanded.has(r.id);
            const count = r.changed_fields?.length ?? 0;
            return (
              <div key={r.id}>
                <button
                  type="button"
                  onClick={() => toggle(r.id)}
                  className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-cream/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {isOpen ? <ChevronDown size={12} className="text-ch/50" /> : <ChevronRight size={12} className="text-ch/50" />}
                      <span className="truncate text-[12px] font-medium text-ch">{r.entity_label}</span>
                    </div>
                    <div className="mt-0.5 pl-[18px] text-[11px] text-ch/50">
                      {formatWhen(r.created_at)}
                      {r.changed_by_name ? ` · ${r.changed_by_name}` : ""}
                      {` · ${count} field${count === 1 ? "" : "s"} updated`}
                    </div>
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-border bg-cream/40 px-3.5 py-2.5">
                    <ul className="space-y-1.5">
                      {(r.changed_fields ?? []).map((f, i) => (
                        <li key={i} className="text-[11px] text-ch/80">
                          <span className="text-ch/60">{f.field}:</span>{" "}
                          <span className="line-through text-ch/40">{formatValue(f.old_value, f.type)}</span>
                          <span className="mx-1.5 text-ch/40">→</span>
                          <span className="font-medium text-ch">{formatValue(f.new_value, f.type)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PanelShell>
  );
}
