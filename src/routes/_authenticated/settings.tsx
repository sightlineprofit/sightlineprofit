import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getMyContext,
  updateFirm,
  listTeam,
  inviteTeamMember,
  resendInvitation,
  listActivityGroups,
  addActivityGroup,
  deleteActivityGroup,
  upsertFirmConfig,
  listExpenses,
  updateTeamMember,
  setPreferredHome,
} from "@/lib/firm.functions";
import { useMe, effectiveRole } from "@/lib/role";
import { computeBurden } from "@/lib/cost";
import { ModulePage } from "@/components/shell/ModulePage";
import { Trash2, ChevronDown, ChevronRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Sightline" }] }),
  component: SettingsPage,
});

const TABS_FULL = [
  { id: "firm", label: "Firm" },
  { id: "team", label: "Team" },
  { id: "activities", label: "Activity Groups" },
  { id: "billing", label: "Billing" },
  { id: "notifications", label: "Notifications" },
] as const;
const TABS_LIMITED = [
  { id: "profile", label: "Profile" },
] as const;
type TabId =
  | (typeof TABS_FULL)[number]["id"]
  | (typeof TABS_LIMITED)[number]["id"];

const inputCls =
  "w-full rounded-md border border-input bg-white px-3 py-2 text-sm text-ch placeholder:text-ch/40 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20";
const btnCls =
  "inline-flex items-center justify-center rounded-md bg-gold px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-goldl disabled:opacity-50";
const ghostBtn =
  "inline-flex items-center justify-center rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-ch transition-colors hover:bg-creamd";

function SettingsPage() {
  const { data, isLoading } = useMe();
  const role = effectiveRole(data?.profile);
  const isAdmin = role === "principal" || role === "admin";
  const tabs = isAdmin ? TABS_FULL : TABS_LIMITED;
  const [tab, setTab] = useState<TabId>(isAdmin ? "firm" : "profile");
  if (isLoading) {
    return (
      <ModulePage title="Settings">
        <p className="text-sm text-ch/50">Loading…</p>
      </ModulePage>
    );
  }
  return (
    <ModulePage eyebrow="Studio" title="Settings" description="Configure your firm, team, and account.">
      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "border-b-2 px-4 py-2.5 text-sm transition-colors",
              tab === t.id
                ? "border-gold text-ch font-medium"
                : "border-transparent text-ch/60 hover:text-ch",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="pt-8">
        {isAdmin && tab === "firm" && <FirmTab />}
        {isAdmin && tab === "team" && <TeamTab />}
        {isAdmin && tab === "activities" && <ActivityGroupsTab />}
        {isAdmin && tab === "billing" && <BillingTab />}
        {isAdmin && tab === "notifications" && <NotificationsTab />}
        {!isAdmin && tab === "profile" && <ProfileTab />}
      </div>
    </ModulePage>
  );
}

/* ─────────────── Profile (team / view_only) ─────────────── */
function ProfileTab() {
  const { data } = useMe();
  const p = data?.profile;
  return (
    <div className="max-w-xl rounded-lg border border-border bg-white p-6 space-y-4">
      <div>
        <label className="mb-1.5 block text-sm text-ch/70">Name</label>
        <input className={inputCls} value={p?.name ?? ""} readOnly />
      </div>
      <div>
        <label className="mb-1.5 block text-sm text-ch/70">Email</label>
        <input className={inputCls} value={p?.email ?? ""} readOnly />
      </div>
      <div>
        <label className="mb-1.5 block text-sm text-ch/70">Role</label>
        <input className={inputCls} value={p?.role ?? ""} readOnly />
      </div>
      <p className="text-xs text-ch/50">
        Your firm principal manages financial settings, the team roster, and billing.
      </p>
    </div>
  );
}

/* ─────────────── Firm ─────────────── */
function FirmTab() {
  const qc = useQueryClient();
  const getCtx = useServerFn(getMyContext);
  const upd = useServerFn(updateFirm);
  const updCfg = useServerFn(upsertFirmConfig);
  const expensesFn = useServerFn(listExpenses);
  const { data } = useQuery({ queryKey: ["me"], queryFn: () => getCtx() });
  const { data: expenses } = useQuery({ queryKey: ["expenses"], queryFn: () => expensesFn() });
  const [name, setName] = useState(data?.firm?.name ?? "");
  const [saving, setSaving] = useState(false);

  // Accounting basis + S-Corp / advanced compensation
  const cfg = data?.config ?? null;
  const [basis, setBasis] = useState<"cash" | "accrual">(
    (cfg?.accounting_basis as "cash" | "accrual") || "cash",
  );
  const [structure, setStructure] = useState<"sole_prop" | "s_corp" | "other">(
    (cfg?.business_structure as "sole_prop" | "s_corp" | "other") || "sole_prop",
  );
  const [salary, setSalary] = useState<string>(
    cfg?.comp_draw_annual != null ? String(cfg.comp_draw_annual) : "",
  );
  const [ptaxPct, setPtaxPct] = useState<string>(
    cfg?.comp_ptax_pct != null ? String(cfg.comp_ptax_pct) : "15.3",
  );
  const [distribution, setDistribution] = useState<string>(
    cfg?.comp_distribution_annual != null ? String(cfg.comp_distribution_annual) : "",
  );
  const [reserve, setReserve] = useState<string>(
    cfg?.comp_reserve_target_annual != null ? String(cfg.comp_reserve_target_annual) : "",
  );
  type ReserveMode = "months_1" | "months_2" | "months_3" | "months_6" | "months_12" | "custom";
  const [reserveMode, setReserveMode] = useState<ReserveMode>(
    ((cfg as { comp_reserve_mode?: string } | null)?.comp_reserve_mode as ReserveMode) || "custom",
  );
  const [advancedOpen, setAdvancedOpen] = useState(structure === "s_corp");

  // Re-sync local state when context loads
  // (useMemo trick keeps it cheap; runs only on data identity change)
  useMemo(() => {
    if (!cfg) return;
    setBasis((cfg.accounting_basis as "cash" | "accrual") || "cash");
    setStructure((cfg.business_structure as "sole_prop" | "s_corp" | "other") || "sole_prop");
    setSalary(cfg.comp_draw_annual != null ? String(cfg.comp_draw_annual) : "");
    setPtaxPct(cfg.comp_ptax_pct != null ? String(cfg.comp_ptax_pct) : "15.3");
    setDistribution(
      cfg.comp_distribution_annual != null ? String(cfg.comp_distribution_annual) : "",
    );
    setReserve(
      cfg.comp_reserve_target_annual != null ? String(cfg.comp_reserve_target_annual) : "",
    );
    setReserveMode(
      (((cfg as { comp_reserve_mode?: string }).comp_reserve_mode as ReserveMode) || "custom"),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.config]);

  // Annual OpEx total derived from expenses
  const annualOpex = useMemo(() => {
    const rows = expenses ?? [];
    let total = 0;
    for (const e of rows) {
      const amt = Number(e.amount) || 0;
      switch (e.frequency) {
        case "annual": total += amt; break;
        case "monthly": total += amt * 12; break;
        case "quarterly": total += amt * 4; break;
        case "onetime": {
          const months = Number(e.amort_months) || 12;
          total += (amt / months) * 12;
          break;
        }
      }
    }
    return total;
  }, [expenses]);
  const monthlyOpex = annualOpex / 12;

  const reserveMonths: Record<ReserveMode, number | null> = {
    months_1: 1, months_2: 2, months_3: 3, months_6: 6, months_12: 12, custom: null,
  };
  const computedReserve =
    reserveMode === "custom" ? Number(reserve) || 0 : (reserveMonths[reserveMode] ?? 0) * monthlyOpex;

  const salaryNum = Number(salary) || 0;
  const ptaxOnSalary = (salaryNum * (Number(ptaxPct) || 0)) / 100;
  const distNum = Number(distribution) || 0;
  const reserveNum = computedReserve;
  const totalPackage = salaryNum + ptaxOnSalary + distNum + reserveNum;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await upd({ data: { name } });
      await updCfg({
        data: {
          accounting_basis: basis,
          business_structure: structure,
          comp_draw_annual: salaryNum || null,
          comp_ptax_pct: Number(ptaxPct) || null,
          comp_distribution_annual: structure === "s_corp" ? distNum || null : null,
          comp_reserve_target_annual: structure === "s_corp" ? reserveNum || null : null,
          comp_reserve_mode: reserveMode,
        },
      });
      toast.success("Firm updated");
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="max-w-2xl space-y-8 rounded-lg border border-border bg-white p-6">
      <div>
        <label className="mb-1.5 block text-sm text-ch/70">Firm name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} required />
      </div>

      {/* ─────────── Accounting basis ─────────── */}
      <section className="space-y-3 border-t border-border pt-6">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-lg text-ch">How does your firm count revenue?</h3>
          <HoverCard openDelay={150}>
            <HoverCardTrigger asChild>
              <button type="button" aria-label="About accounting basis">
                <Info className="h-3.5 w-3.5 text-ch/40" />
              </button>
            </HoverCardTrigger>
            <HoverCardContent className="text-xs leading-relaxed">
              Drives how the dashboard counts revenue. Most solo designers and small studios
              use cash basis. Ask your accountant if you're unsure.
            </HoverCardContent>
          </HoverCard>
        </div>
        <div className="space-y-2">
          <label className="flex items-start gap-3 rounded-md border border-border bg-cream/40 p-3 cursor-pointer">
            <input
              type="radio"
              name="basis"
              value="cash"
              checked={basis === "cash"}
              onChange={() => setBasis("cash")}
              className="mt-1 accent-gold"
            />
            <div className="text-sm">
              <div className="font-medium text-ch">Cash basis <span className="text-xs text-ch/50 font-normal">(most common for small firms)</span></div>
              <div className="text-ch/60 mt-0.5">
                I count revenue when a client pays me. An invoice sent but not yet paid doesn't
                count as revenue until the money arrives.
              </div>
            </div>
          </label>
          <label className="flex items-start gap-3 rounded-md border border-border bg-cream/40 p-3 cursor-pointer">
            <input
              type="radio"
              name="basis"
              value="accrual"
              checked={basis === "accrual"}
              onChange={() => setBasis("accrual")}
              className="mt-1 accent-gold"
            />
            <div className="text-sm">
              <div className="font-medium text-ch">Accrual basis</div>
              <div className="text-ch/60 mt-0.5">
                I count revenue when I earn it — when work is delivered or invoiced, regardless
                of when payment arrives.
              </div>
            </div>
          </label>
        </div>
      </section>

      {/* ─────────── Owner compensation ─────────── */}
      <section className="space-y-3 border-t border-border pt-6">
        <h3 className="font-display text-lg text-ch">Owner compensation</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-ch/50">
              {structure === "s_corp" ? "W-2 reasonable salary (annual)" : "Annual salary / draw"}
            </label>
            <input
              type="number"
              min={0}
              step="1000"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              className={inputCls}
            />
            {structure === "s_corp" && (
              <p className="mt-1 text-xs text-ch/50">Subject to payroll/SE tax.</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-ch/50">
              Payroll / SE tax %
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={ptaxPct}
              onChange={(e) => setPtaxPct(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-sm text-ch/70 hover:text-ch"
            >
              {advancedOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              <span className="font-medium">S-Corp / Advanced compensation</span>
              <span className="text-xs text-ch/40">
                — Operating as an S-Corp? Factor in distributions and business reserve separately.
              </span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4 space-y-4 rounded-md border border-border bg-cream/40 p-4">
            <div>
              <div className="mb-2 text-xs uppercase tracking-wider text-ch/50">Business structure</div>
              <div className="space-y-1.5">
                {[
                  { id: "sole_prop", label: "Sole proprietor / Single-member LLC" },
                  { id: "s_corp", label: "S-Corporation" },
                  { id: "other", label: "Other" },
                ].map((opt) => (
                  <label key={opt.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="structure"
                      value={opt.id}
                      checked={structure === opt.id}
                      onChange={() => setStructure(opt.id as typeof structure)}
                      className="accent-gold"
                    />
                    <span className="text-ch/80">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {structure === "s_corp" && (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <div className="mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wider text-ch/50">
                      S-Corp distribution
                      <HoverCard openDelay={150}>
                        <HoverCardTrigger asChild>
                          <button type="button" aria-label="About distribution">
                            <Info className="h-3 w-3 text-ch/40" />
                          </button>
                        </HoverCardTrigger>
                        <HoverCardContent className="text-xs leading-relaxed">
                          S-Corp owners can take profits as distributions rather than salary.
                          Distributions avoid self-employment tax, which reduces your total tax
                          burden — but the IRS requires your W-2 salary to be reasonable for
                          your role.
                        </HoverCardContent>
                      </HoverCard>
                    </div>
                    <input
                      type="number"
                      min={0}
                      step="1000"
                      value={distribution}
                      onChange={(e) => setDistribution(e.target.value)}
                      className={inputCls}
                    />
                    <p className="mt-1 text-xs text-ch/50">
                      Shareholder income. Not subject to self-employment tax.
                    </p>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wider text-ch/50">
                      Business reserve target
                      <HoverCard openDelay={150}>
                        <HoverCardTrigger asChild>
                          <button type="button" aria-label="About business reserve">
                            <Info className="h-3 w-3 text-ch/40" />
                          </button>
                        </HoverCardTrigger>
                        <HoverCardContent className="text-xs leading-relaxed">
                          A business reserve is money kept in the firm for slow periods,
                          unexpected costs, or equipment. Most financial advisors recommend
                          3–6 months of operating expenses. Including this in your rate means
                          you're actively building toward it with every hour you bill.
                        </HoverCardContent>
                      </HoverCard>
                    </div>
                    <select
                      value={reserveMode}
                      onChange={(e) => setReserveMode(e.target.value as typeof reserveMode)}
                      className={inputCls}
                    >
                      <option value="months_1">1 month of operating expenses</option>
                      <option value="months_2">2 months of operating expenses</option>
                      <option value="months_3">3 months of operating expenses</option>
                      <option value="months_6">6 months of operating expenses</option>
                      <option value="months_12">12 months of operating expenses</option>
                      <option value="custom">Custom amount</option>
                    </select>
                    {reserveMode === "custom" ? (
                      <input
                        type="number"
                        min={0}
                        step="1000"
                        value={reserve}
                        onChange={(e) => setReserve(e.target.value)}
                        className={`${inputCls} mt-2`}
                        placeholder="Reserve target ($)"
                      />
                    ) : (
                      <p className="mt-2 text-xs text-ch/60">
                        {reserveMonths[reserveMode]} {(reserveMonths[reserveMode] ?? 0) === 1 ? "month" : "months"} ×{" "}
                        ${monthlyOpex.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo ={" "}
                        <span className="font-medium text-ch">
                          ${computedReserve.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                        {annualOpex === 0 && (
                          <span className="block mt-0.5 text-ch/50">
                            Add operating expenses to compute this automatically.
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-md border border-border bg-white p-3 text-sm">
                  <div className="flex justify-between text-ch/70">
                    <span>W-2 salary</span>
                    <span className="num text-ch">${salaryNum.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-ch/70">
                    <span>SE tax on salary</span>
                    <span className="num text-ch">${ptaxOnSalary.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="flex justify-between text-ch/70">
                    <span>Distribution (no SE tax)</span>
                    <span className="num text-ch">${distNum.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-ch/70">
                    <span>Business reserve</span>
                    <span className="num text-ch">${reserveNum.toLocaleString()}</span>
                  </div>
                  <div className="mt-2 flex justify-between border-t border-border pt-2 font-medium">
                    <span className="text-ch">Total package</span>
                    <span className="num font-display text-lg text-ch">${totalPackage.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              </>
            )}
          </CollapsibleContent>
        </Collapsible>
      </section>

      <button type="submit" className={btnCls} disabled={saving}>
        {saving ? "Saving…" : "Save changes"}
      </button>

      <DefaultHomeSection />
    </form>
  );
}

/* ─────────────── Default home (principal/admin) ─────────────── */
function DefaultHomeSection() {
  const qc = useQueryClient();
  const { data } = useMe();
  const saveHome = useServerFn(setPreferredHome);
  const current = (data?.profile?.preferred_home as
    | "dashboard"
    | "calendar"
    | "sightline"
    | null
    | undefined) ?? "dashboard";
  const [val, setVal] = useState<"dashboard" | "calendar" | "sightline">(current);

  // Resync when profile loads
  useMemo(() => {
    setVal(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.profile?.preferred_home]);

  async function pick(next: "dashboard" | "calendar" | "sightline") {
    setVal(next);
    try {
      await saveHome({ data: { preferred_home: next } });
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Home screen updated.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  }

  const options: { id: "dashboard" | "calendar" | "sightline"; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "calendar", label: "Time Calendar" },
    { id: "sightline", label: "Projects (Sightline)" },
  ];

  return (
    <section className="space-y-3 border-t border-border pt-6">
      <h3 className="font-display text-lg text-ch">Default home screen</h3>
      <p className="text-xs text-ch/60">
        Where you land after signing in. Takes effect on next login.
      </p>
      <div className="space-y-2">
        {options.map((o) => (
          <label
            key={o.id}
            className="flex items-start gap-3 rounded-md border border-border bg-cream/40 p-3 cursor-pointer"
          >
            <input
              type="radio"
              name="preferred_home"
              value={o.id}
              checked={val === o.id}
              onChange={() => pick(o.id)}
              className="mt-1 accent-gold"
            />
            <div className="text-sm font-medium text-ch">{o.label}</div>
          </label>
        ))}
      </div>
    </section>
  );
}

/* ─────────────── Team ─────────────── */
const ROLES = ["principal", "admin", "team", "view_only"] as const;
type MemberForm = {
  name: string; email: string; role: (typeof ROLES)[number];
  billable_rate: string; cost_rate: string;
  expected_hrs_per_week: string; weeks_per_year: string; billable_pct: string;
  compensation_type: "hourly" | "salaried";
  annual_base_salary: string; employer_payroll_tax_pct: string;
  annual_benefits: string; other_annual_costs: string;
};

const emptyMember: MemberForm = {
  name: "", email: "", role: "team",
  billable_rate: "", cost_rate: "",
  expected_hrs_per_week: "40", weeks_per_year: "48", billable_pct: "70",
  compensation_type: "hourly",
  annual_base_salary: "", employer_payroll_tax_pct: "7.65",
  annual_benefits: "", other_annual_costs: "",
};

function TeamTab() {
  const qc = useQueryClient();
  const list = useServerFn(listTeam);
  const invite = useServerFn(inviteTeamMember);
  const update = useServerFn(updateTeamMember);
  const resend = useServerFn(resendInvitation);
  const { data } = useQuery({ queryKey: ["team"], queryFn: () => list() });
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<MemberForm>(emptyMember);

  function refresh() { qc.invalidateQueries({ queryKey: ["team"] }); qc.invalidateQueries({ queryKey: ["calendar"] }); }

  function startEdit(m: NonNullable<typeof data>["members"][number]) {
    setAdding(false);
    setEditId(m.id);
    setForm({
      name: m.name || "",
      email: m.email,
      role: m.role as (typeof ROLES)[number],
      billable_rate: m.billable_rate != null ? String(m.billable_rate) : "",
      cost_rate: m.cost_rate != null ? String(m.cost_rate) : "",
      expected_hrs_per_week: m.expected_hrs_per_week != null ? String(m.expected_hrs_per_week) : "40",
      weeks_per_year: m.weeks_per_year != null ? String(m.weeks_per_year) : "48",
      billable_pct: m.billable_pct != null ? String(m.billable_pct) : "70",
      compensation_type: (m.compensation_type as "hourly" | "salaried") || "hourly",
      annual_base_salary: m.annual_base_salary != null ? String(m.annual_base_salary) : "",
      employer_payroll_tax_pct: m.employer_payroll_tax_pct != null ? String(m.employer_payroll_tax_pct) : "7.65",
      annual_benefits: m.annual_benefits != null ? String(m.annual_benefits) : "",
      other_annual_costs: m.other_annual_costs != null ? String(m.other_annual_costs) : "",
    });
  }

  function startAdd() { setEditId(null); setForm(emptyMember); setAdding(true); }
  function cancel() { setAdding(false); setEditId(null); setForm(emptyMember); }

  const burden = computeBurden({
    compensation_type: form.compensation_type,
    cost_rate: Number(form.cost_rate) || 0,
    annual_base_salary: Number(form.annual_base_salary) || 0,
    employer_payroll_tax_pct: Number(form.employer_payroll_tax_pct) || 0,
    annual_benefits: Number(form.annual_benefits) || 0,
    other_annual_costs: Number(form.other_annual_costs) || 0,
    expected_hrs_per_week: Number(form.expected_hrs_per_week) || 0,
    weeks_per_year: Number(form.weeks_per_year) || 0,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const payload = {
        name: form.name || null,
        role: form.role,
        billable_rate: form.billable_rate ? Number(form.billable_rate) : null,
        cost_rate: form.compensation_type === "hourly" && form.cost_rate ? Number(form.cost_rate) : null,
        expected_hrs_per_week: form.expected_hrs_per_week ? Number(form.expected_hrs_per_week) : null,
        weeks_per_year: form.weeks_per_year ? Number(form.weeks_per_year) : null,
        billable_pct: form.billable_pct ? Number(form.billable_pct) : null,
        compensation_type: form.compensation_type,
        annual_base_salary: form.compensation_type === "salaried" && form.annual_base_salary
          ? Number(form.annual_base_salary) : null,
        employer_payroll_tax_pct: form.employer_payroll_tax_pct ? Number(form.employer_payroll_tax_pct) : null,
        annual_benefits: form.annual_benefits ? Number(form.annual_benefits) : null,
        other_annual_costs: form.other_annual_costs ? Number(form.other_annual_costs) : null,
      };
      if (editId) {
        await update({ data: { id: editId, ...payload } });
        toast.success("Member updated");
      } else {
        await invite({ data: { ...payload, email: form.email } });
        toast.success("Invitation sent");
      }
      cancel();
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  const showForm = adding || editId;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-white">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="font-display text-xl">Team members</h3>
          <button type="button" onClick={showForm ? cancel : startAdd} className={btnCls}>
            {showForm ? "Cancel" : "Add member"}
          </button>
        </div>
        {showForm && (
          <form onSubmit={submit} className="grid grid-cols-2 gap-4 border-b border-border bg-cream/40 p-5">
            <Field label="Name">
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Email">
              <input
                type="email" required disabled={!!editId}
                className={cn(inputCls, editId && "opacity-60")}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label="Role">
              <select className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as (typeof ROLES)[number] })}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Billable rate ($/hr)">
              <input type="number" min={0} step="1" className={inputCls} value={form.billable_rate} onChange={(e) => setForm({ ...form, billable_rate: e.target.value })} />
            </Field>

            <div className="col-span-2">
              <div className="mb-1.5 block text-xs uppercase tracking-wider text-ch/50">Compensation type</div>
              <div className="flex gap-4 text-sm">
                {(["hourly", "salaried"] as const).map((t) => (
                  <label key={t} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio" name="comp_type" value={t}
                      checked={form.compensation_type === t}
                      onChange={() => setForm({ ...form, compensation_type: t })}
                      className="accent-gold"
                    />
                    <span className="capitalize text-ch/80">{t}</span>
                  </label>
                ))}
              </div>
            </div>

            {form.compensation_type === "hourly" ? (
              <Field label="Cost rate ($/hr)">
                <input type="number" min={0} step="1" className={inputCls} value={form.cost_rate} onChange={(e) => setForm({ ...form, cost_rate: e.target.value })} />
              </Field>
            ) : (
              <Field label="Annual base salary ($)">
                <input type="number" min={0} step="1000" className={inputCls} value={form.annual_base_salary} onChange={(e) => setForm({ ...form, annual_base_salary: e.target.value })} />
              </Field>
            )}
            <Field label="Payroll tax % (employer share)">
              <input type="number" min={0} max={100} step="0.01" className={inputCls} value={form.employer_payroll_tax_pct} onChange={(e) => setForm({ ...form, employer_payroll_tax_pct: e.target.value })} />
            </Field>
            <Field label="Benefits (annual $)">
              <input type="number" min={0} step="100" className={inputCls} value={form.annual_benefits} onChange={(e) => setForm({ ...form, annual_benefits: e.target.value })} />
            </Field>
            <Field label="Other annual costs ($)">
              <input type="number" min={0} step="100" className={inputCls} value={form.other_annual_costs} onChange={(e) => setForm({ ...form, other_annual_costs: e.target.value })} />
            </Field>
            <Field label="Expected hrs / week">
              <input type="number" min={0} max={168} className={inputCls} value={form.expected_hrs_per_week} onChange={(e) => setForm({ ...form, expected_hrs_per_week: e.target.value })} />
            </Field>
            <Field label="Weeks / year">
              <input type="number" min={0} max={52} className={inputCls} value={form.weeks_per_year} onChange={(e) => setForm({ ...form, weeks_per_year: e.target.value })} />
            </Field>
            <Field label="Billable % of hours">
              <input type="number" min={0} max={100} className={inputCls} value={form.billable_pct} onChange={(e) => setForm({ ...form, billable_pct: e.target.value })} />
            </Field>

            <div className="col-span-2 rounded-md border border-border bg-white p-3 text-sm">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs uppercase tracking-wider text-ch/50">
                Fully burdened cost
                <HoverCard openDelay={150}>
                  <HoverCardTrigger asChild>
                    <button type="button" aria-label="About fully burdened cost">
                      <Info className="h-3 w-3 text-ch/40" />
                    </button>
                  </HoverCardTrigger>
                  <HoverCardContent className="text-xs leading-relaxed">
                    The true cost of this team member including their wages, your share of
                    payroll taxes, and any benefits or equipment costs. This is the number
                    used in project profitability calculations — not just their wage.
                  </HoverCardContent>
                </HoverCard>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-ch/70">
                <span>{form.compensation_type === "salaried" ? "Base salary" : "Base wages"}</span>
                <span className="num text-right text-ch">${burden.base.toLocaleString(undefined,{maximumFractionDigits:0})}</span>
                <span>Payroll tax</span>
                <span className="num text-right text-ch">${burden.ptax.toLocaleString(undefined,{maximumFractionDigits:0})}</span>
                <span>Benefits</span>
                <span className="num text-right text-ch">${burden.benefits.toLocaleString(undefined,{maximumFractionDigits:0})}</span>
                <span>Other costs</span>
                <span className="num text-right text-ch">${burden.other.toLocaleString(undefined,{maximumFractionDigits:0})}</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 border-t border-border pt-2 text-center">
                <div><div className="text-[10px] uppercase tracking-wider text-ch/50">/ year</div><div className="num font-display text-lg text-ch">${burden.yr.toLocaleString(undefined,{maximumFractionDigits:0})}</div></div>
                <div><div className="text-[10px] uppercase tracking-wider text-ch/50">/ week</div><div className="num font-display text-lg text-ch">${burden.wk.toLocaleString(undefined,{maximumFractionDigits:0})}</div></div>
                <div><div className="text-[10px] uppercase tracking-wider text-ch/50">/ hour</div><div className="num font-display text-lg text-ch">${burden.hr.toFixed(2)}</div></div>
              </div>
            </div>

            <div className="col-span-2 flex items-center justify-end gap-2 border-t border-border pt-4">
              <button type="button" onClick={cancel} className={ghostBtn}>Cancel</button>
              <button type="submit" className={btnCls}>{editId ? "Save changes" : "Send invitation"}</button>
            </div>
          </form>
        )}
        <div className="divide-y divide-border">
          {data?.members?.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-5 py-3">
              <button type="button" onClick={() => startEdit(m)} className="text-left">
                <div className="text-sm font-medium text-ch hover:text-gold">{m.name || m.email}</div>
                <div className="text-xs text-ch/50">{m.email} · {m.role}</div>
              </button>
              <div className="flex items-center gap-4">
                <div className="text-right text-xs text-ch/60">
                  <div>{m.billable_rate ? `$${m.billable_rate}/hr billed` : "—"}</div>
                  <div className="text-ch/50">
                    {m.burdened_hourly_rate
                      ? `$${Number(m.burdened_hourly_rate).toFixed(2)}/hr burdened`
                      : m.cost_rate ? `$${m.cost_rate}/hr cost` : ""}
                  </div>
                </div>
                <button type="button" onClick={() => startEdit(m)} className={ghostBtn + " px-3 py-1.5 text-xs"}>Edit</button>
              </div>
            </div>
          ))}
          {data?.invites?.map((i) => {
            const days = i.invited_at
              ? Math.max(0, Math.floor((Date.now() - new Date(i.invited_at).getTime()) / 86400000))
              : 0;
            return (
              <div key={i.id} className="flex items-center justify-between px-5 py-3 bg-cream/40">
                <div>
                  <div className="text-sm font-medium text-ch">{i.name || i.email}</div>
                  <div className="text-xs text-ch/50">
                    {i.email} · {i.role} · Invited {days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center rounded-full bg-goldp px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-ch/70">
                    Invited · pending
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const r = await resend({ data: { id: i.id } });
                        toast.success(`Invitation resent to ${r.email}.`);
                        qc.invalidateQueries({ queryKey: ["team"] });
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Could not resend.");
                      }
                    }}
                    className="text-xs text-gold hover:underline"
                  >
                    Resend invitation
                  </button>
                </div>
              </div>
            );
          })}
          {!data?.members?.length && !data?.invites?.length && (
            <div className="px-5 py-8 text-center text-sm text-ch/50">No team members yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs uppercase tracking-wider text-ch/50">{label}</label>
      {children}
    </div>
  );
}

/* ─────────────── Activity Groups ─────────────── */
const PRESET_COLORS = ["#B8860B", "#5C8A6E", "#C4714A", "#B85C5C", "#6B7AA1", "#8E6B9C", "#3F6F66", "#A07549"];
function ActivityGroupsTab() {
  const qc = useQueryClient();
  const list = useServerFn(listActivityGroups);
  const add = useServerFn(addActivityGroup);
  const del = useServerFn(deleteActivityGroup);
  const { data } = useQuery({ queryKey: ["activity_groups"], queryFn: () => list() });
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await add({ data: { name, color } });
      setName("");
      qc.invalidateQueries({ queryKey: ["activity_groups"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function remove(id: string) {
    await del({ data: { id } });
    qc.invalidateQueries({ queryKey: ["activity_groups"] });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-white p-5">
        <h3 className="font-display text-xl">Add activity group</h3>
        <p className="mt-1 text-sm text-ch/60">Used across all time entries — design, admin, business development, etc.</p>
        <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-ch/50">Name</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-ch/50">Color</label>
            <div className="flex gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn("h-7 w-7 rounded-full border-2 transition-transform", color === c ? "border-ch scale-110" : "border-transparent")}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <button type="submit" className={btnCls}>Add</button>
        </form>
      </div>
      <div className="rounded-lg border border-border bg-white">
        <div className="divide-y divide-border">
          {data?.map((g) => (
            <div key={g.id} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="h-4 w-4 rounded-full" style={{ backgroundColor: g.color }} />
                <span className="text-sm text-ch">{g.name}</span>
              </div>
              <button onClick={() => remove(g.id)} className="text-ch/40 hover:text-danger">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {!data?.length && (
            <div className="px-5 py-8 text-center text-sm text-ch/50">No activity groups yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Billing ─────────────── */
function BillingTab() {
  const getCtx = useServerFn(getMyContext);
  const { data } = useQuery({ queryKey: ["me"], queryFn: () => getCtx() });
  const tier = data?.firm?.subscription_tier ?? "foundation";
  const status = data?.firm?.subscription_status ?? "trialing";
  const trialEnds = data?.firm?.trial_ends_at;
  const days = trialEnds ? Math.max(0, Math.ceil((new Date(trialEnds).getTime() - Date.now()) / 86400000)) : 0;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-gold">Current plan</p>
            <h3 className="mt-1 font-display text-3xl tracking-tight capitalize">{tier}</h3>
            <p className="mt-1 text-sm text-ch/60 capitalize">{status} {status === "trialing" && `· ${days} days remaining`}</p>
          </div>
          <Link to="/billing" className={btnCls}>Manage subscription</Link>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-white p-6">
        <h3 className="font-display text-xl">Payment method</h3>
        <p className="mt-1 text-sm text-ch/60">No card on file. Add one to continue after your trial.</p>
        <Link to="/billing" className={`${ghostBtn} mt-4`}>Add billing details</Link>
      </div>
    </div>
  );
}

/* ─────────────── Notifications ─────────────── */
function NotificationsTab() {
  const [prefs, setPrefs] = useState({
    weeklyDigest: true,
    targetAlerts: true,
    teamInvites: true,
    productUpdates: false,
  });
  const rows: { key: keyof typeof prefs; label: string; desc: string }[] = [
    { key: "weeklyDigest", label: "Weekly digest", desc: "Every Monday — how last week tracked against your targets." },
    { key: "targetAlerts", label: "Off-target alerts", desc: "When billable hours fall meaningfully below target." },
    { key: "teamInvites", label: "Team activity", desc: "New invites accepted, member changes." },
    { key: "productUpdates", label: "Product updates", desc: "New features, occasional and quiet." },
  ];
  return (
    <div className="max-w-2xl rounded-lg border border-border bg-white divide-y divide-border">
      {rows.map((r) => (
        <label key={r.key} className="flex items-start justify-between gap-6 p-5 cursor-pointer">
          <div>
            <div className="text-sm font-medium text-ch">{r.label}</div>
            <div className="text-xs text-ch/60 mt-0.5">{r.desc}</div>
          </div>
          <input
            type="checkbox"
            checked={prefs[r.key]}
            onChange={(e) => setPrefs({ ...prefs, [r.key]: e.target.checked })}
            className="mt-1 h-4 w-4 accent-gold"
          />
        </label>
      ))}
    </div>
  );
}