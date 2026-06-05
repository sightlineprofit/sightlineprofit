import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getMyContext,
  upsertFirmConfig,
  addExpense,
  inviteTeamMember,
} from "@/lib/firm.functions";
import { FieldLabel, inputClass, primaryBtnClass, ghostBtnClass } from "@/components/auth/AuthShell";
import { InfoTip } from "@/components/dashboard/InfoTip";

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
  const getCtx = useServerFn(getMyContext);
  const saveConfig = useServerFn(upsertFirmConfig);
  const saveExpense = useServerFn(addExpense);
  const sendInvite = useServerFn(inviteTeamMember);
  const { data: ctx } = useQuery({ queryKey: ["me-onboarding"], queryFn: () => getCtx() });

  const [step, setStep] = useState(0);

  // Compensation
  const [draw, setDraw] = useState<string>("120000");
  const [ptax, setPtax] = useState<string>("15.3");
  const [health, setHealth] = useState<string>("8400");
  const [retire, setRetire] = useState<string>("6000");

  // Capacity / target
  const [availHrs, setAvailHrs] = useState<string>("40");
  const [billHrs, setBillHrs] = useState<string>("24");
  const [targetMargin, setTargetMargin] = useState<string>("55");

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
  const [tCost, setTCost] = useState("45");
  const [tHrs, setTHrs] = useState("40");
  const [tWeeks, setTWeeks] = useState("48");
  const [tPct, setTPct] = useState("75");

  const tBurden = useMemo(() => {
    const cost = Number(tCost) || 0;
    const hrs = Number(tHrs) || 0;
    // Weekly fully burdened cost = cost rate * expected hrs (cost rate already includes burden)
    return cost * hrs;
  }, [tCost, tHrs]);

  const [saving, setSaving] = useState(false);
  const [sentInvites, setSentInvites] = useState<string[]>([]);

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
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

  const addTeamLocal = () => {
    if (!tName.trim() || !tEmail.trim()) {
      toast.error("Name and email required.");
      return;
    }
    const member: TeamDraft = {
      name: tName.trim(),
      email: tEmail.trim().toLowerCase(),
      role: tRole,
      billable_rate: Number(tBill) || 0,
      cost_rate: Number(tCost) || 0,
      expected_hrs_per_week: Number(tHrs) || 0,
      weeks_per_year: Number(tWeeks) || 0,
      billable_pct: Number(tPct) || 0,
    };
    setTeam((arr) => [...arr, member]);
    // Fire invitation email immediately
    sendInvite({ data: member })
      .then(() => {
        setSentInvites((s) => [...s, member.email]);
        toast.success(`Invitation sent to ${member.email}`);
      })
      .catch((e) => {
        toast.error(
          e instanceof Error ? e.message : `Could not send invitation to ${member.email}`,
        );
      });
    setTName(""); setTEmail(""); setTBill("125"); setTCost("45"); setTHrs("40"); setTWeeks("48"); setTPct("75");
  };

  // Legacy unused reference removed (placeholder to keep diff valid)
  const _unused = () => [
      ...arr,
      {
        name: tName.trim(),
        email: tEmail.trim().toLowerCase(),
        role: tRole,
        billable_rate: Number(tBill) || 0,
        cost_rate: Number(tCost) || 0,
        expected_hrs_per_week: Number(tHrs) || 0,
        weeks_per_year: Number(tWeeks) || 0,
        billable_pct: Number(tPct) || 0,
      },
    ];

  const finish = async () => {
    setSaving(true);
    try {
      await saveConfig({
        data: {
          comp_draw_annual: Number(draw) || null,
          comp_ptax_pct: Number(ptax) || null,
          comp_health_annual: Number(health) || null,
          comp_retire_annual: Number(retire) || null,
          available_hrs_per_week: Number(availHrs) || null,
          target_billable_hrs_per_week: Number(billHrs) || null,
          target_gross_margin_pct: Number(targetMargin) || null,
        },
      });
      for (const e of expenses) {
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
      }
      for (const t of team) {
        await sendInvite({ data: t });
      }
      toast.success("Studio set up. Welcome to Sightline.");
      nav({ to: "/dashboard" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream text-ch">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <div className="font-display text-xl tracking-tight">Sightline</div>
          <button className="text-xs uppercase tracking-[0.18em] text-ch/50 hover:text-ch" onClick={() => nav({ to: "/dashboard" })}>
            Skip for now
          </button>
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

        <ol className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-xs uppercase tracking-[0.18em]">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? "text-gold" : i < step ? "text-ch/70" : "text-ch/30"}>
              {String(i + 1).padStart(2, "0")} · {s}
            </li>
          ))}
        </ol>

        <section className="mt-8 rounded-lg border border-border bg-white p-8">
          {step === 0 && (
            <div className="space-y-5">
              <header>
                <h2 className="font-display text-2xl">What do you need to pay yourself?</h2>
                <p className="mt-1 text-sm text-ch/60">Your real compensation — not what's left over.</p>
              </header>
              <Row>
                <Field label="Owner's draw (annual)" prefix="$" value={draw} onChange={setDraw} />
                <Field label="Self-employment / payroll tax" suffix="%" value={ptax} onChange={setPtax} />
              </Row>
              <Row>
                <Field label="Health insurance (annual)" prefix="$" value={health} onChange={setHealth} />
                <Field label="Retirement contribution (annual)" prefix="$" value={retire} onChange={setRetire} />
              </Row>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <header>
                <h2 className="font-display text-2xl">How many hours can you actually sell?</h2>
                <p className="mt-1 text-sm text-ch/60">Available capacity vs. realistic billable time.</p>
              </header>
              <Row>
                <Field label="Available hours / week" value={availHrs} onChange={setAvailHrs} />
                <Field label="Target billable hours / week" value={billHrs} onChange={setBillHrs} />
              </Row>
              <Row>
                <Field label="Target gross margin" suffix="%" value={targetMargin} onChange={setTargetMargin} />
                <div />
              </Row>
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
                  <Field label="Billable % of hours" suffix="%" value={tPct} onChange={setTPct} />
                </Row>
                <Row>
                  <Field label="Billable rate" prefix="$" value={tBill} onChange={setTBill} />
                  <Field label="Cost rate (fully burdened)" prefix="$" value={tCost} onChange={setTCost} />
                </Row>
                <Row>
                  <Field label="Expected hours / week" value={tHrs} onChange={setTHrs} />
                  <Field label="Weeks / year" value={tWeeks} onChange={setTWeeks} />
                </Row>

                <div className="flex items-center justify-between border-t border-border pt-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-ch/50">Weekly burdened cost</div>
                    <div className="font-display text-3xl tabular-nums text-ch">
                      ${tBurden.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                  <button className={`${ghostBtnClass} w-auto`} onClick={addTeamLocal} type="button">Add team member</button>
                </div>
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
                  ["Draw", `$${Number(draw).toLocaleString()}/yr`],
                  ["Payroll tax", `${ptax}%`],
                  ["Health", `$${Number(health).toLocaleString()}/yr`],
                  ["Retirement", `$${Number(retire).toLocaleString()}/yr`],
                ]} />
                <Summary title="Capacity" rows={[
                  ["Available hrs/wk", availHrs],
                  ["Billable target hrs/wk", billHrs],
                  ["Target gross margin", `${targetMargin}%`],
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
  label, value, onChange, prefix, suffix, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void; prefix?: string; suffix?: string; type?: string;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
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