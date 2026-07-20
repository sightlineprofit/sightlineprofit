import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getMyContext,
  upsertFirmConfig,
  addExpense,
  inviteTeamMember,
  upsertOwnerCompensation,
  saveFirmMember,
  completeOnboarding,
} from "@/lib/firm.functions";
import { FieldLabel, inputClass, primaryBtnClass, ghostBtnClass } from "@/components/auth/AuthShell";
import { InfoTip } from "@/components/dashboard/InfoTip";
import {
  BurdenedCostCalculator,
  emptyBurdenedCostValue,
  type BurdenedCostValue,
} from "@/components/team/BurdenedCostCalculator";
import { estimateBurdenedCost, BURDEN_EMPLOYER_TAX_PCT } from "@/lib/team-cost";
import { PricingStructureSelector } from "@/components/pricing/PricingStructureSelector";
import {
  requiresBilledRate,
  type PricingStructure,
} from "@/lib/pricing-structure";
import { effectivePrincipalBillableHrsWeek } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Set up your studio — Sightline" }] }),
  component: Onboarding,
});

const STEPS = ["Compensation", "Capacity & target", "Operating expenses", "Your team", "Review"] as const;

type ExpenseDraft = {
  name: string;
  amount: number;
  frequency: "monthly" | "annual" | "quarterly" | "onetime";
  category?: string;
};

type TeamDraft = {
  name: string;
  email: string;
  role: "admin" | "team" | "view_only";
  billable_rate: number;
  cost_rate: number;
  expected_hrs_per_week: number;
  weeks_per_year: number;
  billable_pct: number;
};

function Onboarding() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const getCtx = useServerFn(getMyContext);
  const saveConfig = useServerFn(upsertFirmConfig);
  const saveExpense = useServerFn(addExpense);
  const sendInvite = useServerFn(inviteTeamMember);
  const saveOwnerComp = useServerFn(upsertOwnerCompensation);
  const saveMember = useServerFn(saveFirmMember);
  const finishOnboarding = useServerFn(completeOnboarding);
  const { data: ctx } = useQuery({ queryKey: ["me-onboarding"], queryFn: () => getCtx() });

  const [step, setStep] = useState(0);

  // Compensation (simplified — 4 fields + tax rate)
  const [salary, setSalary] = useState<string>("120000");
  const [distributions, setDistributions] = useState<string>("");
  const [health, setHealth] = useState<string>("");
  const [retire, setRetire] = useState<string>("");
  const [ptax, setPtax] = useState<string>("15.3");

  const compTotal = useMemo(() => {
    const s = Number(salary) || 0;
    const d = Number(distributions) || 0;
    const h = Number(health) || 0;
    const r = Number(retire) || 0;
    const t = Number(ptax) || 0;
    return (s + d) * (1 + t / 100) + h + r;
  }, [salary, distributions, health, retire, ptax]);

  // Capacity / target
  const [availHrs, setAvailHrs] = useState<string>("40");
  const [billHrs, setBillHrs] = useState<string>("24");
  const [targetMargin, setTargetMargin] = useState<string>("55");
  const [pricingStructure, setPricingStructure] = useState<PricingStructure>("hourly");
  const [rateBilled, setRateBilled] = useState<string>("");
  const [weeksPerYear, setWeeksPerYear] = useState<string>("48");

  // Expenses
  const [expenses, setExpenses] = useState<ExpenseDraft[]>([
    { name: "Software & subscriptions", amount: 350, frequency: "monthly" },
    { name: "Insurance", amount: 220, frequency: "monthly" },
  ]);
  const [exName, setExName] = useState("");
  const [exAmt, setExAmt] = useState("");
  const [exFreq, setExFreq] = useState<ExpenseDraft["frequency"]>("monthly");

  // Team
  const [team, setTeam] = useState<TeamDraft[]>([]);
  const [tName, setTName] = useState("");
  const [tEmail, setTEmail] = useState("");
  const [tRole, setTRole] = useState<TeamDraft["role"]>("team");
  const [tBill, setTBill] = useState("125");
  const [tHrsBillable, setTHrsBillable] = useState("30");
  const [tBurdenInput, setTBurdenInput] = useState<BurdenedCostValue>(emptyBurdenedCostValue());
  const [tInviteNow, setTInviteNow] = useState(false);

  const tBurden = useMemo(() => {
    return estimateBurdenedCost({
      basis: tBurdenInput.basis,
      hourlyRate: Number(tBurdenInput.hourlyRate) || 0,
      annualSalary: Number(tBurdenInput.annualSalary) || 0,
      hoursPerWeek: Number(tBurdenInput.hoursPerWeek) || 0,
      hasBenefits: tBurdenInput.hasBenefits,
      hasRetirement: tBurdenInput.hasRetirement,
    });
  }, [tBurdenInput]);

  const [saving, setSaving] = useState(false);
  const [sentInvites, setSentInvites] = useState<string[]>([]);

  const capBillableHrs = (bill: string, avail: string) => {
    const availN = Number(avail) || 0;
    const billN = Number(bill) || 0;
    if (availN > 0 && billN > availN) return String(availN);
    return bill;
  };

  const next = () => {
    if (step === 1) {
      const availN = Number(availHrs) || 0;
      const billHrsN = effectivePrincipalBillableHrsWeek({
        available_hrs_per_week: availN || null,
        target_billable_hrs_per_week: Number(billHrs) || null,
      } as any);
      const marginN = Number(targetMargin);
      if (!Number.isFinite(billHrsN) || billHrsN <= 0) {
        toast.error("Enter target billable hours per week.");
        return;
      }
      if (availN > 0 && Number(billHrs) > availN) {
        setBillHrs(String(availN));
      }
      if (!Number.isFinite(marginN) || marginN <= 0) {
        toast.error("Enter a target gross margin.");
        return;
      }
      if (requiresBilledRate(pricingStructure)) {
        const rateN = Number(rateBilled);
        if (!Number.isFinite(rateN) || rateN <= 0) {
          toast.error("Enter your current billed rate.");
          return;
        }
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const addExpenseLocal = () => {
    const amt = Number(exAmt);
    if (!exName.trim() || !Number.isFinite(amt) || amt < 0) {
      toast.error("Enter a name and amount.");
      return;
    }
    setExpenses((arr) => [...arr, { name: exName.trim(), amount: amt, frequency: exFreq }]);
    setExName("");
    setExAmt("");
  };

  const addTeamLocal = async () => {
    if (!tName.trim()) {
      toast.error("Name required.");
      return;
    }
    const workingHrs = Number(tBurdenInput.hoursPerWeek) || 40;
    const billableHrs = Number(tHrsBillable) || 0;
    const isSalary = tBurdenInput.basis === "salary";
    const compType: "hourly" | "salaried" = isSalary ? "salaried" : "hourly";
    const hourlyWage = !isSalary ? Number(tBurdenInput.hourlyRate) || 0 : 0;
    const annualSalary = isSalary ? Number(tBurdenInput.annualSalary) || 0 : 0;
    const benefitsAnnual = tBurden.benefitsAmount + tBurden.retirementAmount;
    const member: TeamDraft = {
      name: tName.trim(),
      email: tEmail.trim().toLowerCase(),
      role: tRole,
      billable_rate: Number(tBill) || 0,
      cost_rate: tBurden.perHour,
      expected_hrs_per_week: billableHrs,
      weeks_per_year: 52,
      billable_pct: workingHrs > 0 ? Math.round((billableHrs / workingHrs) * 100) : 0,
    };
    setTeam((arr) => [...arr, member]);
    // Save an internal firm_members record (no invite by default).
    try {
      await saveMember({
        data: {
          name: member.name,
          email: member.email || null,
          role_type: tRole,
          employment_type: "employee",
          compensation_type: compType,
          hourly_wage: !isSalary ? hourlyWage : null,
          annual_base_salary: isSalary ? annualSalary : null,
          employer_payroll_tax_pct: BURDEN_EMPLOYER_TAX_PCT,
          annual_benefits: benefitsAnnual || null,
          expected_hrs_per_week: billableHrs || workingHrs,
          weeks_per_year: 52,
          billed_rate: member.billable_rate || null,
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save member.");
    }
    // Optionally send an invite if requested.
    if (tInviteNow && member.email) {
      sendInvite({ data: member })
        .then(() => {
          setSentInvites((s) => [...s, member.email]);
          toast.success(`Invitation sent to ${member.email}`);
        })
        .catch((e) => toast.error(e instanceof Error ? e.message : `Could not invite ${member.email}`));
    } else {
      toast.success(`Saved ${member.name}. Invite them later from Settings → Team.`);
    }
    setTName("");
    setTEmail("");
    setTBill("125");
    setTHrsBillable("30");
    setTBurdenInput(emptyBurdenedCostValue());
    setTInviteNow(false);
  };

  const finish = async () => {
    setSaving(true);
    try {
      const drawCombined = (Number(salary) || 0) + (Number(distributions) || 0);
      // 1) Capacity & targets → firm_config
      try {
        const billHrsN = effectivePrincipalBillableHrsWeek({
          available_hrs_per_week: Number(availHrs) || null,
          target_billable_hrs_per_week: Number(billHrs) || null,
        } as any);
        const marginN = Number(targetMargin);
        const rateN = Number(rateBilled);
        await saveConfig({
          data: {
            comp_draw_annual: drawCombined || null,
            comp_ptax_pct: Number(ptax) || null,
            comp_health_annual: Number(health) || null,
            comp_retire_annual: Number(retire) || null,
            available_hrs_per_week: Number(availHrs) || null,
            target_billable_hrs_per_week: Number.isFinite(billHrsN) ? billHrsN : 0,
            target_gross_margin_pct: Number.isFinite(marginN) && marginN > 0 ? marginN : 42,
            pricing_structure: pricingStructure,
            rate_billed:
              requiresBilledRate(pricingStructure) && Number.isFinite(rateN) && rateN > 0
                ? rateN
                : null,
          },
        });
      } catch (e) {
        console.error("[onboarding.finish] saveConfig failed", e);
        toast.error(
          `Couldn't save capacity & targets — ${e instanceof Error ? e.message : "unknown error"}`,
        );
        return;
      }

      // 2) Per-principal compensation (skip when everything is zero)
      const hasAnyComp =
        drawCombined > 0 ||
        Number(distributions) > 0 ||
        Number(health) > 0 ||
        Number(retire) > 0 ||
        Number(ptax) > 0;
      if (hasAnyComp) {
        try {
          await saveOwnerComp({
            data: {
              comp_draw_annual: drawCombined || null,
              distribution_annual: Number(distributions) || null,
              health_insurance_annual: Number(health) || null,
              retirement_annual: Number(retire) || null,
              payroll_tax_pct: Number(ptax) || null,
            },
          });
        } catch (e) {
          console.error("[onboarding.finish] saveOwnerComp failed", e);
          toast.error(
            `Couldn't save your compensation — ${e instanceof Error ? e.message : "unknown error"}`,
          );
          return;
        }
      }

      // 3) Operating expenses — non-blocking per row; report failures at the end
      const expenseFailures: Array<{ name: string; reason: string }> = [];
      let expenseOk = 0;
      for (const e of expenses) {
        try {
          await saveExpense({
            data: {
              name: e.name,
              amount: e.amount,
              frequency: e.frequency,
              recurring: e.frequency !== "onetime",
              category: e.category ?? null,
              amort_months: null,
            },
          });
          expenseOk += 1;
        } catch (err) {
          console.error("[onboarding.finish] saveExpense failed", e.name, err);
          expenseFailures.push({
            name: e.name,
            reason: err instanceof Error ? err.message : "unknown error",
          });
        }
      }
      if (expenseFailures.length) {
        toast.error(
          `Saved ${expenseOk} of ${expenses.length} expenses. Failed: ${expenseFailures
            .map((f) => `${f.name} (${f.reason})`)
            .join("; ")}`,
        );
      }

      for (const t of team) {
        // Records are already saved to firm_members when added in step 4.
        // Nothing to flush here unless the user has an unsaved draft they meant to invite.
        if (false && !sentInvites.includes(t.email)) {
          try { await sendInvite({ data: t }); } catch { /* handled above */ }
        }
      }
      toast.success("Studio set up. Welcome to Sightline.");
      try {
        await finishOnboarding();
      } catch (e) {
        console.warn("[completeOnboarding] failed", e);
      }
      // Ensure the dashboard's first read fetches the freshly-written firm_config
      // rather than any cached response from earlier `getMyContext` calls.
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
      await qc.invalidateQueries({ queryKey: ["me-onboarding"] });
      nav({ to: "/dashboard" });
    } catch (e) {
      console.error("[onboarding.finish] unexpected error", e);
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const trialEnd = (ctx?.firm as any)?.trial_ends_at
    ? new Date((ctx!.firm as any).trial_ends_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;
  const pct = ((step + 1) / STEPS.length) * 100;
  const STEP_LABELS = ["Compensation", "Capacity", "Expenses", "Team", "Review"];

  return (
    <div className="min-h-screen bg-cream text-ch">
      <header
        className="sticky top-0 z-40"
        style={{ background: "#FAF7F2", borderBottom: "0.5px solid rgba(44,44,44,0.10)" }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6" style={{ padding: "12px 24px" }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, color: "#2C2C2C" }}>
            Sightline
          </div>
          <div className="text-right">
            <div style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: "#8A7F75" }}>
              Step {step + 1} of {STEPS.length}
            </div>
            {trialEnd && (
              <div style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: "#5C8A6E" }}>
                Free trial active · No charge until {trialEnd}
              </div>
            )}
          </div>
        </div>
        <div style={{ height: 3, background: "rgba(44,44,44,0.08)" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "#B8860B", transition: "width 0.3s ease" }} />
        </div>
        <div className="mx-auto max-w-3xl px-6 py-2 flex justify-between">
          {STEP_LABELS.map((label, i) => {
            const state = i === step ? "active" : i < step ? "done" : "upcoming";
            const color = state === "active" ? "#B8860B" : state === "done" ? "#2C2C2C" : "#8A7F75";
            const weight = state === "active" ? 500 : state === "upcoming" ? 300 : 400;
            return (
              <span
                key={label}
                style={{
                  fontFamily: "Jost, sans-serif",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.10em",
                  color,
                  fontWeight: weight,
                }}
              >
                {label}
              </span>
            );
          })}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-xs uppercase tracking-[0.25em] text-gold">Set up your studio</p>
        <h1 className="mt-3 font-display text-4xl tracking-tight">
          {ctx?.firm?.name ? `Welcome, ${ctx.firm.name}.` : "Welcome."}
        </h1>
        <p className="mt-2 max-w-xl text-ch/70">
          A few questions so Sightline can tell you what your rate needs to be and whether you're hitting it.
        </p>

        <section className="mt-8 rounded-lg border border-border bg-white p-8">
          {step === 0 && (
            <div className="space-y-5">
              <header>
                <h2 className="font-display text-2xl">What do you need to pay yourself?</h2>
                <p className="mt-1 text-sm text-ch/60">Your real compensation — not what's left over.</p>
              </header>
              <Row>
                <Field
                  label="Regular salary or draw (annual)"
                  prefix="$"
                  value={salary}
                  onChange={setSalary}
                  tip={{
                    term: "Regular salary or draw",
                    definition:
                      "The amount you consistently pay yourself — whether that's a W-2 salary, owner's draw, or guaranteed payment. This is your personal income floor from the firm.",
                  }}
                />
                <Field
                  label="Additional distributions (annual)"
                  prefix="$"
                  value={distributions}
                  onChange={setDistributions}
                  tip={{
                    term: "Additional distributions",
                    definition:
                      "Profit you take out on top of your regular pay — bonuses, S-Corp distributions, or variable draws. Enter what you realistically plan to take, not just what's left over. Leave at zero if not applicable.",
                  }}
                />
              </Row>
              <Row>
                <Field
                  label="Health insurance (annual)"
                  prefix="$"
                  value={health}
                  onChange={setHealth}
                  tip={{
                    term: "Health insurance",
                    definition:
                      "What the firm pays for your health, dental, and vision coverage each year.",
                  }}
                />
                <Field
                  label="Retirement contribution (annual)"
                  prefix="$"
                  value={retire}
                  onChange={setRetire}
                  tip={{
                    term: "Retirement contribution",
                    definition:
                      "Your annual contribution to a SEP-IRA, Solo 401k, or similar retirement account funded through the firm.",
                  }}
                />
              </Row>
              <Field
                label="Tax and payroll rate"
                suffix="%"
                value={ptax}
                onChange={setPtax}
                tip={{
                  term: "Tax and payroll rate",
                  definition:
                    "The percentage applied to your compensation to cover employment taxes. Sole proprietors typically use 15.3% (self-employment tax). S-Corp owners may use a lower effective rate. You can refine this in Settings once you're set up. 15.3% is a safe starting point for most designers.",
                }}
              />
              <div
                className="mt-3 flex items-center justify-between"
                style={{
                  background: "#FAF7F2",
                  border: "0.5px solid var(--border, #E5DFD3)",
                  borderRadius: 4,
                  padding: "10px 14px",
                }}
              >
                <span style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: "#777" }}>
                  Total (salary + distributions + benefits + tax)
                </span>
                <span
                  className="tabular-nums"
                  style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: "#BA7517" }}
                >
                  ${Math.round(compTotal).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-ch/50">
                Empty fields default to zero. You can refine everything in Settings once you're set up.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <header>
                <h2 className="font-display text-2xl">How many hours can you actually sell?</h2>
                <p className="mt-1 text-sm text-ch/60">Available capacity vs. realistic billable time.</p>
              </header>
              <Row>
                <Field
                  label="Available hours / week"
                  value={availHrs}
                  onChange={(v) => {
                    setAvailHrs(v);
                    setBillHrs((prev) => capBillableHrs(prev, v));
                  }}
                  tip={{
                    term: "Available hours / week",
                    definition:
                      "The total hours you want to work each week — design, admin, client calls, business development, all of it. This is your full working week, not just billable hours. Be realistic rather than aspirational.",
                  }}
                  helper="If your typical week is 40 hours, enter 40. This sets the container your billable time lives inside."
                />
                <Field
                  label="Target billable hours / week"
                  value={billHrs}
                  onChange={(v) => setBillHrs(capBillableHrs(v, availHrs))}
                  tip={{
                    term: "Target billable hours / week",
                    definition:
                      "This number drives your aligned rate. Fewer billable hours means each hour carries more of the cost load, which raises your floor. Enter the number you actually hit most weeks — not your best week or your goal. Overestimating here produces a rate that looks right but won't hold up.",
                  }}
                  helper="Most designers bill 60–75% of their available hours once admin, business development, and non-client time are accounted for. If you work 40 hours, a realistic target is often 24–30 billable hours. Cannot exceed available hours."
                />
              </Row>
              <Row>
                <Field
                  label="Target gross margin"
                  suffix="%"
                  value={targetMargin}
                  onChange={setTargetMargin}
                  tip={{
                    term: "Target gross margin",
                    definition:
                      "This builds your profit target into your aligned rate. At 30%, every $100 you bill is designed to keep $30 as profit and use $70 to cover costs. A higher target means a higher aligned rate. A typical range for design firms is 25–40%.",
                  }}
                  helper="Your aligned rate is calculated so that billing at exactly that rate hits this target. Start with 30% if you are unsure — you can adjust this at any time and your rate updates immediately."
                />
                <Field
                  label="Working weeks per year"
                  value={weeksPerYear}
                  onChange={setWeeksPerYear}
                  helper="Most design firms work 46–48 weeks after accounting for holidays and time off."
                />
              </Row>
              <PricingStructureSelector
                value={pricingStructure}
                onChange={(nextStructure) => {
                  setPricingStructure(nextStructure);
                  if (!requiresBilledRate(nextStructure)) setRateBilled("");
                }}
                className="pt-1"
              />
              {requiresBilledRate(pricingStructure) ? (
                <Row>
                  <Field
                    label="Your current billed rate"
                    prefix="$"
                    value={rateBilled}
                    onChange={setRateBilled}
                    tip={{
                      term: "Billed rate",
                      definition:
                        "The hourly rate you currently charge clients. Sightline compares this against your aligned rate — the rate math says you need to charge to hit your margin target — so you can see whether you're pricing above or below your floor.",
                    }}
                    helper="Required for hourly and hybrid pricing."
                  />
                  <div />
                </Row>
              ) : null}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <header>
                <h2 className="font-display text-2xl">Operating expenses</h2>
                <p className="mt-1 text-sm text-ch/60">Rent, software, insurance — anything the studio costs each month.</p>
              </header>
              <ul className="divide-y divide-border border border-border rounded">
                {expenses.length === 0 && (
                  <li className="px-4 py-6 text-center text-sm text-ch/50">No expenses yet.</li>
                )}
                {expenses.map((e, i) => (
                  <li key={i} className="flex items-center justify-between px-4 py-3 text-sm">
                    <div>
                      <div className="font-medium">{e.name}</div>
                      <div className="text-xs text-ch/50 uppercase tracking-wider">{e.frequency}</div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-display tabular-nums text-lg">${e.amount.toLocaleString()}</span>
                      <button className="text-xs text-ch/40 hover:text-danger" onClick={() => setExpenses((a) => a.filter((_, j) => j !== i))}>
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-[1fr_140px_160px_auto] gap-3 items-end">
                <div>
                  <FieldLabel>Name</FieldLabel>
                  <input className={inputClass} value={exName} onChange={(e) => setExName(e.target.value)} placeholder="e.g. Studio rent" />
                </div>
                <div>
                  <FieldLabel>Amount</FieldLabel>
                  <input className={inputClass} value={exAmt} onChange={(e) => setExAmt(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <FieldLabel>Frequency</FieldLabel>
                  <select className={inputClass} value={exFreq} onChange={(e) => setExFreq(e.target.value as ExpenseDraft["frequency"])}>
                    <option value="monthly">Monthly</option>
                    <option value="annual">Annual</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="onetime">One-time</option>
                  </select>
                </div>
                <button className={`${ghostBtnClass} w-auto`} onClick={addExpenseLocal} type="button">Add</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <header>
                <h2 className="font-display text-2xl">Your team</h2>
                <p className="mt-1 text-sm text-ch/60">Optional. You can add team members later from settings.</p>
                <p
                  className="mt-2 italic"
                  style={{ fontFamily: "Jost, sans-serif", fontSize: 11, fontWeight: 400, color: "#aaa" }}
                >
                  Financial details are for your planning only and are never shown to the team member.
                </p>
              </header>

              {team.length > 0 && (
                <ul className="divide-y divide-border border border-border rounded">
                  {team.map((m, i) => (
                    <li key={i} className="flex items-center justify-between px-4 py-3 text-sm">
                      <div>
                        <div className="font-medium">{m.name} <span className="text-ch/40">· {m.email}</span></div>
                        <div className="text-xs text-ch/50 uppercase tracking-wider">
                          {m.role} · ${m.billable_rate}/hr billed · ${m.cost_rate}/hr cost
                        </div>
                      </div>
                      <button className="text-xs text-ch/40 hover:text-danger" onClick={() => setTeam((a) => a.filter((_, j) => j !== i))}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-4 rounded border border-border bg-creamd/40 p-5">
                <Row>
                  <Field label="Name" value={tName} onChange={setTName} />
                  <Field label="Email" value={tEmail} onChange={setTEmail} type="email" />
                </Row>
                <Row>
                  <div>
                    <FieldLabel>Role</FieldLabel>
                    <select className={inputClass} value={tRole} onChange={(e) => setTRole(e.target.value as TeamDraft["role"])}>
                      <option value="admin">Admin</option>
                      <option value="team">Team</option>
                      <option value="view_only">View only</option>
                    </select>
                  </div>
                  <Field
                    label="Expected billable hours / week"
                    value={tHrsBillable}
                    onChange={setTHrsBillable}
                  />
                </Row>
                <Row>
                  <Field label="Billable rate" prefix="$" value={tBill} onChange={setTBill} />
                  <div />
                </Row>

                <BurdenedCostCalculator
                  value={tBurdenInput}
                  onChange={setTBurdenInput}
                />

                <div className="flex items-center justify-between border-t border-border pt-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-ch/50">Weekly burdened cost</div>
                    <div className="font-display text-3xl tabular-nums text-ch">
                      ${Math.round(tBurden.perHour * (Number(tHrsBillable) || 0)).toLocaleString()}
                    </div>
                  </div>
                  <button className={`${ghostBtnClass} w-auto`} onClick={addTeamLocal} type="button">Save team member</button>
                </div>
                <p className="text-[11px] text-ch/60" style={{ fontFamily: "Jost, sans-serif" }}>
                  This saves their cost for your rate calculations. You can invite them to Sightline from Settings → Team when you're ready.
                </p>
                {tEmail.trim() && (
                  <label className="flex items-center gap-2 text-[11px] text-ch/70">
                    <input
                      type="checkbox"
                      checked={tInviteNow}
                      onChange={(e) => setTInviteNow(e.target.checked)}
                    />
                    Also send a Sightline invitation to {tEmail.trim()}?
                  </label>
                )}
                {sentInvites.length > 0 && (
                  <div
                    className="pt-3 text-xs"
                    style={{ fontFamily: "Jost, sans-serif", color: "#777", lineHeight: 1.6 }}
                  >
                    Invitation sent to{" "}
                    <span className="text-ch">{sentInvites[sentInvites.length - 1]}</span>. They'll receive
                    an email with instructions to set up their account.
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <header>
                <h2 className="font-display text-2xl">Review.</h2>
                <p className="mt-1 text-sm text-ch/60">Looks right? You can edit everything later from settings.</p>
              </header>
              <div className="grid grid-cols-2 gap-6 text-sm">
                <Summary title="Compensation" rows={[
                  ["Salary / draw", `$${Number(salary).toLocaleString()}/yr`],
                  ["Distributions", `$${Number(distributions || 0).toLocaleString()}/yr`],
                  ["Tax & payroll", `${ptax}%`],
                  ["Health", `$${Number(health).toLocaleString()}/yr`],
                  ["Retirement", `$${Number(retire).toLocaleString()}/yr`],
                  ["Total", `$${Math.round(compTotal).toLocaleString()}/yr`],
                ]} />
                <Summary title="Capacity" rows={[
                  ["Available hrs/wk", availHrs],
                  ["Billable target hrs/wk", billHrs],
                  ["Target gross margin", `${targetMargin}%`],
                  ["Working weeks/yr", weeksPerYear || "48"],
                  [
                    "Pricing structure",
                    pricingStructure === "flat_fee"
                      ? "Flat project fee"
                      : pricingStructure === "both"
                        ? "Hourly and flat"
                        : "Hourly",
                  ],
                  [
                    "Current billed rate",
                    requiresBilledRate(pricingStructure) && rateBilled
                      ? `$${Number(rateBilled).toLocaleString()}/hr`
                      : "Not applicable",
                  ],
                ]} />
                <Summary title={`Expenses (${expenses.length})`} rows={expenses.map((e) => [e.name, `$${e.amount.toLocaleString()} ${e.frequency}`])} />
                <Summary title={`Team (${team.length})`} rows={team.length ? team.map((t) => [t.name, t.role]) : [["No team members", "—"]]} />
              </div>
            </div>
          )}
        </section>

        <div className="mt-6 flex items-center justify-between">
          <button className="text-sm text-ch/60 hover:text-ch disabled:opacity-30" onClick={back} disabled={step === 0}>
            ← Back
          </button>
          {step < STEPS.length - 1 ? (
            <button className={`${primaryBtnClass} w-auto px-8`} onClick={next}>Continue</button>
          ) : (
            <button className={`${primaryBtnClass} w-auto px-8`} onClick={finish} disabled={saving}>
              {saving ? "Saving…" : "Finish setup"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-4">{children}</div>;
}

function Field({
  label, value, onChange, prefix, suffix, type = "text", tip, helper,
}: {
  label: string; value: string; onChange: (v: string) => void; prefix?: string; suffix?: string; type?: string;
  tip?: { term: string; definition: string; why?: string };
  helper?: string;
}) {
  return (
    <div>
      <FieldLabel>
        <span className="inline-flex items-center gap-1.5">
          {label}
          {tip && <InfoTip term={tip.term} definition={tip.definition} why={tip.why} />}
        </span>
      </FieldLabel>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ch/40">{prefix}</span>}
        <input
          type={type}
          className={`${inputClass} ${prefix ? "pl-7" : ""} ${suffix ? "pr-8" : ""}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ch/40">{suffix}</span>}
      </div>
      {helper && (
        <p
          className="mt-1"
          style={{ fontFamily: "Jost, sans-serif", fontSize: 11, fontWeight: 400, color: "#777", lineHeight: 1.6 }}
        >
          {helper}
        </p>
      )}
    </div>
  );
}

function Summary({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded border border-border bg-creamd/30 p-4">
      <div className="text-xs uppercase tracking-[0.18em] text-ch/50">{title}</div>
      <dl className="mt-3 space-y-1.5">
        {rows.map(([k, v], i) => (
          <div key={i} className="flex items-baseline justify-between gap-3 text-sm">
            <dt className="text-ch/60">{k}</dt>
            <dd className="font-medium text-ch">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}