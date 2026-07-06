import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { getDashboardData } from "@/lib/dashboard.functions";
import { createCommitmentSet } from "@/lib/commitments.functions";
import { calc, fmtUsd, type FirmConfig, type Expense } from "@/lib/finance";
import { buildTeamCostBreakdown } from "@/lib/team-cost";
import type { MemberCostBreakdown } from "@/lib/team-cost";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/rate-architecture")({
  head: () => ({ meta: [{ title: "Rate Architecture — Sightline" }] }),
  component: Page,
});

const CHARCOAL = "#2C2C2C";
const GOLD = "#B8860B";
const SAGE = "#5C8A6E";
const TERRA = "#C4714A";
const BORDER = "rgba(44,44,44,0.10)";
const MUTED = "rgba(44,44,44,0.55)";

type TabId = "understand" | "model" | "commit";
type Scenario = {
  rateIncrease: number; // $/hr
  hrsPerWeek: number; // billable hrs/wk
  costReduction: number; // $/yr
};

function Page() {
  const fetchData = useServerFn(getDashboardData);
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchData() });
  const [tab, setTab] = useState<TabId>("understand");
  const cfg = (data?.config ?? null) as FirmConfig | null;
  const expenses = (data?.expenses ?? []) as Expense[];
  const members = ((data as any)?.capacity?.team ?? []) as any[];
  const ownerComp = ((data as any)?.ownerComp ?? []) as any[];
  const teamBurdens = ((data as any)?.teamBurdens ?? []) as any[];
  const baseC = useMemo(
    () => calc(cfg, expenses, { ownerComp: ownerComp as any, teamProfiles: teamBurdens as any }),
    [cfg, expenses, ownerComp, teamBurdens],
  );

  const [scenario, setScenario] = useState<Scenario>({
    rateIncrease: 0,
    hrsPerWeek: baseC.targetBillableHrsWeek || 20,
    costReduction: 0,
  });

  if (isLoading) {
    return <div className="mx-auto max-w-6xl px-8 py-10 text-ch/50">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-10" style={{ fontFamily: "Jost, sans-serif" }}>
      <div className="mb-6">
        <Link to="/dashboard" className="text-[10px] uppercase tracking-[0.16em] hover:underline" style={{ color: MUTED }}>
          ← Dashboard
        </Link>
        <h1 className="font-display text-4xl tracking-tight mt-2" style={{ color: CHARCOAL }}>
          Rate architecture
        </h1>
        <p className="text-sm mt-2" style={{ color: MUTED, maxWidth: 560 }}>
          Sit with your numbers. Every value here comes from what you entered in settings — nothing invented, nothing hidden.
        </p>
      </div>

      <TabsBar tab={tab} setTab={setTab} />

      <div style={{ marginTop: 20 }}>
        {tab === "understand" && (
          <UnderstandTab
            c={baseC}
            cfg={cfg}
            members={members}
            ownerComp={ownerComp}
            expenses={expenses}
            targetMarginPct={Number(cfg?.target_gross_margin_pct) || 0}
            onModel={() => setTab("model")}
            onCommit={() => setTab("commit")}
          />
        )}
        {tab === "model" && (
          <ModelTab
            baseC={baseC}
            cfg={cfg}
            expenses={expenses}
            ownerComp={ownerComp}
            teamBurdens={teamBurdens}
            scenario={scenario}
            setScenario={setScenario}
            onBack={() => setTab("understand")}
            onCommit={() => setTab("commit")}
          />
        )}
        {tab === "commit" && (
          <CommitTab
            baseC={baseC}
            cfg={cfg}
            expenses={expenses}
            ownerComp={ownerComp}
            teamBurdens={teamBurdens}
            scenario={scenario}
            onBack={() => setTab("model")}
          />
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Tabs ─────────────────────────── */

function TabsBar({ tab, setTab }: { tab: TabId; setTab: (t: TabId) => void }) {
  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "understand", label: "Understand my numbers" },
    { id: "model", label: "Model a change" },
    { id: "commit", label: "Commit to action" },
  ];
  return (
    <div
      role="tablist"
      style={{
        display: "inline-flex",
        background: "rgba(44,44,44,0.04)",
        border: `0.5px solid ${BORDER}`,
        borderRadius: 6,
        padding: 3,
        gap: 2,
      }}
    >
      {tabs.map((t) => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => setTab(t.id)}
            style={{
              padding: "8px 16px",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: active ? 500 : 400,
              background: active ? "white" : "transparent",
              color: active ? CHARCOAL : MUTED,
              border: active ? `0.5px solid ${BORDER}` : "0.5px solid transparent",
              cursor: "pointer",
              transition: "all 120ms ease",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────── Tab 1: Understand ─────────────────────────── */

type Calc = ReturnType<typeof calc>;

function UnderstandTab({
  c,
  cfg,
  members,
  ownerComp,
  expenses,
  targetMarginPct,
  onModel,
  onCommit,
}: {
  c: Calc;
  cfg: FirmConfig | null;
  members: any[];
  ownerComp: any[];
  expenses: Expense[];
  targetMarginPct: number;
  onModel: () => void;
  onCommit: () => void;
}) {
  // Layer 1 line items
  const l1Items: Array<{ label: string; amount: number }> = [];
  if (ownerComp.length > 0) {
    for (const r of ownerComp) {
      const d = Number(r.comp_draw_annual) || 0;
      const pct = Number(r.payroll_tax_pct ?? 15.3) || 0;
      if (d) l1Items.push({ label: "Owner draw / salary", amount: d });
      if (d && pct) l1Items.push({ label: "Self-employment tax", amount: d * (pct / 100) });
      const h = Number(r.health_insurance_annual) || 0;
      if (h) l1Items.push({ label: "Health insurance", amount: h });
      const ret = Number(r.retirement_annual) || 0;
      if (ret) l1Items.push({ label: "Retirement", amount: ret });
    }
  } else {
    if (c.draw) l1Items.push({ label: "Owner draw / salary", amount: c.draw });
    if (c.ptax) l1Items.push({ label: "Self-employment tax", amount: c.ptax });
    if (c.health) l1Items.push({ label: "Health insurance", amount: c.health });
    if (c.retire) l1Items.push({ label: "Retirement", amount: c.retire });
  }
  const l1Total = c.compTotal;

  // Layer 2: firm operating expenses — grouped by category if available
  const catMap = new Map<string, number>();
  for (const e of expenses) {
    const cat = ((e as any).category as string) || (e as any).name || "Operating expenses";
    const amt = annualize(e);
    catMap.set(cat, (catMap.get(cat) ?? 0) + amt);
  }
  const l2Items = Array.from(catMap.entries())
    .map(([label, amount]) => ({ label: friendlyCategory(label), amount }))
    .sort((a, b) => b.amount - a.amount);
  const l2Total = c.opexRecurring + c.opexOneTime;

  // Layer 3: team — shared breakdown feeds this card and the Cost Floor popover
  const teamBreakdown = buildTeamCostBreakdown(members);
  const l3Total = c.teamCostTotal;

  const annualHrs = c.annualBillableHrs || 1;

  return (
    <div className="space-y-4">
      <LayerCard
        tag="Layer 01 — Foundation"
        title="What you pay yourself"
        total={l1Total}
        totalColor={GOLD}
        items={l1Items}
        perHrColor={GOLD}
        annualHrs={annualHrs}
      />
      <LayerCard
        tag="Layer 02 — Structure"
        title="What it costs to run the firm"
        total={l2Total}
        totalColor={CHARCOAL}
        items={l2Items}
        perHrColor={SAGE}
        annualHrs={annualHrs}
      />
      <TeamLayerCard
        tag="Layer 03 — Delivery"
        title="What your team costs"
        total={l3Total}
        members={teamBreakdown}
        annualHrs={annualHrs}
      />

      <RateBuildPanel c={c} targetMarginPct={targetMarginPct} />

      <div className="flex gap-3 justify-end" style={{ marginTop: 8 }}>
        <SecondaryBtn onClick={onModel}>Model a change →</SecondaryBtn>
        <PrimaryBtn onClick={onCommit}>I'm ready to act →</PrimaryBtn>
      </div>
    </div>
  );
}

function annualize(e: Expense): number {
  const amt = Number(e.amount) || 0;
  if (e.frequency === "annual") return amt;
  if (e.frequency === "monthly") return amt * 12;
  if (e.frequency === "quarterly") return amt * 4;
  const months = (e.amort_months ?? 12) || 12;
  return (amt / months) * 12;
}

function friendlyCategory(cat: string): string {
  const map: Record<string, string> = {
    software: "Software & subscriptions",
    insurance: "Insurance",
    office: "Office & studio",
    marketing: "Marketing & education",
  };
  const k = cat.toLowerCase();
  return map[k] ?? cat;
}

function LayerCard({
  tag,
  title,
  total,
  totalColor,
  items,
  perHrColor,
  annualHrs,
  emptyLine,
}: {
  tag: string;
  title: string;
  total: number;
  totalColor: string;
  items: Array<{ label: string; amount: number }>;
  perHrColor: string;
  annualHrs: number;
  emptyLine?: string;
}) {
  const max = items.reduce((m, i) => Math.max(m, i.amount), 0) || 1;
  return (
    <div
      style={{
        background: "white",
        border: `0.5px solid ${BORDER}`,
        borderRadius: 10,
        padding: "16px 18px",
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div style={{ fontSize: 8, letterSpacing: "0.18em", textTransform: "uppercase", color: MUTED, fontWeight: 600 }}>
            {tag}
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: CHARCOAL, marginTop: 2 }}>
            {title}
          </div>
        </div>
        <div className="text-right">
          <div style={{ fontSize: 8, letterSpacing: "0.18em", textTransform: "uppercase", color: MUTED }}>Annual</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: totalColor, marginTop: 2 }}>
            {fmtUsd(total, { decimals: 0 })}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 14, borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
        {items.length === 0 ? (
          <div style={{ fontSize: 11, color: MUTED, fontStyle: "italic" }}>
            {emptyLine ?? "Nothing recorded here yet."}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((it, idx) => {
              const perHr = annualHrs > 0 ? it.amount / annualHrs : 0;
              const pct = (it.amount / max) * 100;
              return (
                <div key={idx} className="grid items-center gap-3" style={{ gridTemplateColumns: "1.4fr 1.4fr auto auto" }}>
                  <div style={{ fontSize: 12, color: CHARCOAL }}>{it.label}</div>
                  <div style={{ height: 6, borderRadius: 3, background: "rgba(44,44,44,0.06)", position: "relative" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: perHrColor, opacity: 0.55, borderRadius: 3 }} />
                  </div>
                  <div className="text-right tabular-nums" style={{ fontSize: 11, color: MUTED, minWidth: 80 }}>
                    {fmtUsd(it.amount, { decimals: 0 })}
                  </div>
                  <div className="text-right tabular-nums" style={{ fontSize: 11, color: perHrColor, minWidth: 70 }}>
                    {fmtUsd(perHr, { decimals: 2 })}/hr
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function TeamLayerCard({
  tag,
  title,
  total,
  members,
  annualHrs,
}: {
  tag: string;
  title: string;
  total: number;
  members: MemberCostBreakdown[];
  annualHrs: number;
}) {
  const max = members.reduce((m, r) => Math.max(m, r.total), 0) || 1;
  return (
    <div
      style={{
        background: "white",
        border: `0.5px solid ${BORDER}`,
        borderRadius: 10,
        padding: "16px 18px",
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div style={{ fontSize: 8, letterSpacing: "0.18em", textTransform: "uppercase", color: MUTED, fontWeight: 600 }}>
            {tag}
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: CHARCOAL, marginTop: 2 }}>
            {title}
          </div>
        </div>
        <div className="text-right">
          <div style={{ fontSize: 8, letterSpacing: "0.18em", textTransform: "uppercase", color: MUTED }}>Annual</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: CHARCOAL, marginTop: 2 }}>
            {fmtUsd(total, { decimals: 0 })}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 14, borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
        {members.length === 0 ? (
          <div style={{ fontSize: 11, color: MUTED, fontStyle: "italic" }}>
            No employed team members. Add them in settings to see their fully-burdened cost here.
          </div>
        ) : (
          <div className="space-y-4">
            {members.map((r, idx) => {
              const rows: Array<{ label: string; amount: number }> = [
                { label: r.baseLabel, amount: r.base },
              ];
              if (r.isW2 && r.tax > 0) rows.push({ label: "Employer payroll tax", amount: r.tax });
              if (r.benefits > 0) rows.push({ label: "Benefits contribution", amount: r.benefits });
              if (r.equipment > 0) rows.push({ label: "Equipment & overhead", amount: r.equipment });
              const first = (r.name.split(" ")[0] || r.name).trim();
              return (
                <div key={r.id} style={{ paddingTop: idx === 0 ? 0 : 10, borderTop: idx === 0 ? "none" : `1px solid ${BORDER}` }}>
                  <div className="flex items-baseline gap-2" style={{ marginBottom: 8 }}>
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: TERRA, opacity: 0.75 }} />
                    <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 15, color: CHARCOAL }}>
                      {r.name}
                    </span>
                    <span style={{ fontSize: 8, letterSpacing: "0.16em", textTransform: "uppercase", color: MUTED, fontWeight: 600 }}>
                      {r.role}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {rows.map((it, i) => {
                      const perHr = annualHrs > 0 ? it.amount / annualHrs : 0;
                      const pct = (it.amount / max) * 100;
                      return (
                        <div key={i} className="grid items-center gap-3" style={{ gridTemplateColumns: "1.4fr 1.4fr auto auto" }}>
                          <div style={{ fontSize: 12, color: CHARCOAL }}>{it.label}</div>
                          <div style={{ height: 6, borderRadius: 3, background: "rgba(44,44,44,0.06)", position: "relative" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: TERRA, opacity: 0.55, borderRadius: 3 }} />
                          </div>
                          <div className="text-right tabular-nums" style={{ fontSize: 11, color: MUTED, minWidth: 80 }}>
                            {fmtUsd(it.amount, { decimals: 0 })}
                          </div>
                          <div className="text-right tabular-nums" style={{ fontSize: 11, color: TERRA, minWidth: 70 }}>
                            {fmtUsd(perHr, { decimals: 2 })}/hr
                          </div>
                        </div>
                      );
                    })}
                    <div
                      className="grid items-center gap-3"
                      style={{ gridTemplateColumns: "1.4fr 1.4fr auto auto", paddingTop: 6, borderTop: `1px solid ${BORDER}`, marginTop: 4 }}
                    >
                      <div style={{ fontSize: 12, color: CHARCOAL, fontWeight: 500 }}>{first} total</div>
                      <div />
                      <div className="text-right tabular-nums" style={{ fontSize: 12, color: CHARCOAL, fontWeight: 500, minWidth: 80 }}>
                        {fmtUsd(r.total, { decimals: 0 })}
                      </div>
                      <div className="text-right tabular-nums" style={{ fontSize: 11, color: TERRA, minWidth: 70 }}>
                        {fmtUsd(annualHrs > 0 ? r.total / annualHrs : 0, { decimals: 2 })}/hr
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function RateBuildPanel({ c, targetMarginPct }: { c: Calc; targetMarginPct: number }) {
  const hrs = c.annualBillableHrs || 1;
  const compHr = c.compTotal / hrs;
  const opexHr = (c.opexRecurring + c.opexOneTime) / hrs;
  const teamHr = c.teamCostTotal / hrs;
  const beHr = c.breakEvenRate;
  const marginHr = Math.max(0, c.alignedRate - c.breakEvenRate);
  const aligned = c.alignedRate;
  const billed = c.billedRate || 0;
  const gap = Math.max(0, aligned - billed);
  const surplus = Math.max(0, billed - aligned);
  const denom = Math.max(aligned, 1);

  const rows = [
    { label: "Your compensation", value: compHr, fill: "rgba(184,134,11,0.60)" },
    { label: "Operating expenses", value: opexHr, fill: "rgba(92,138,110,0.50)" },
    { label: "Team cost", value: teamHr, fill: "rgba(196,113,74,0.60)" },
  ];

  const billedColor =
    billed < c.breakEvenRate ? "#E08060" : billed < aligned ? "#D4A017" : "#7AB890";
  const pillLabel =
    billed < c.breakEvenRate ? "Below break-even" : billed < aligned ? "Below floor" : "Above floor";

  return (
    <div
      style={{
        background: CHARCOAL,
        borderRadius: 10,
        padding: "18px 20px",
        marginTop: 12,
        color: "white",
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.30)",
        }}
      >
        How your aligned rate builds
      </div>

      <div className="space-y-2" style={{ marginTop: 14 }}>
        {rows.map((r) => (
          <BuildRow key={r.label} label={r.label} value={r.value} fill={r.fill} denom={denom} />
        ))}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", margin: "6px 0" }} />
        <BuildRow label="Break-even" value={beHr} fill="rgba(255,255,255,0.25)" denom={denom} bold />
        <BuildRow
          label={`Margin (${targetMarginPct.toFixed(0)}%)`}
          value={marginHr}
          fill="rgba(212,160,23,0.40)"
          denom={denom}
          sign="+"
        />
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", margin: "6px 0" }} />
        <div className="flex items-center justify-between">
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)" }}>Aligned rate (total)</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: GOLD }}>
            {fmtUsd(aligned, { decimals: 0 })}/hr
          </div>
        </div>
      </div>

      <div
        style={{
          background: "rgba(255,255,255,0.04)",
          borderRadius: 6,
          padding: "12px 14px",
          marginTop: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.50)" }}>Your current billed rate</div>
          <div style={{ fontSize: 10, fontWeight: 500, color: billed < aligned ? TERRA : SAGE, marginTop: 2 }}>
            {billed <= 0
              ? "No rate set yet"
              : billed < aligned
                ? `${fmtUsd(gap, { decimals: 0 })}/hr below your aligned rate`
                : `+${fmtUsd(surplus, { decimals: 0 })}/hr above your aligned rate`}
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: billedColor }}>
            {fmtUsd(billed, { decimals: 0 })}/hr
          </span>
          <span
            style={{
              fontSize: 9,
              fontWeight: 500,
              padding: "3px 8px",
              borderRadius: 3,
              background: "rgba(255,255,255,0.08)",
              color: billedColor,
            }}
          >
            {pillLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

function BuildRow({
  label,
  value,
  fill,
  denom,
  bold,
  sign,
}: {
  label: string;
  value: number;
  fill: string;
  denom: number;
  bold?: boolean;
  sign?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / denom) * 100));
  return (
    <div className="grid items-center gap-3" style={{ gridTemplateColumns: "1.4fr 1.6fr auto" }}>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: bold ? 500 : 400 }}>{label}</div>
      <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.08)" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: fill, borderRadius: 4 }} />
      </div>
      <div
        className="text-right tabular-nums"
        style={{ fontSize: 12, color: "white", minWidth: 80, fontWeight: bold ? 500 : 400 }}
      >
        {sign ?? ""}
        {fmtUsd(value, { decimals: 2 })}/hr
      </div>
    </div>
  );
}

/* ─────────────────────────── Tab 2: Model ─────────────────────────── */

function ModelTab({
  baseC,
  cfg,
  expenses,
  ownerComp,
  teamBurdens,
  scenario,
  setScenario,
  onBack,
  onCommit,
}: {
  baseC: Calc;
  cfg: FirmConfig | null;
  expenses: Expense[];
  ownerComp: any[];
  teamBurdens: any[];
  scenario: Scenario;
  setScenario: (s: Scenario) => void;
  onBack: () => void;
  onCommit: () => void;
}) {
  const baseBilled = Number(cfg?.rate_billed) || 0;
  const baseHrs = baseC.targetBillableHrsWeek || 0;
  const baseAligned = baseC.alignedRate;

  // Compute scenario using calc overrides
  const totalOpex = expenses.reduce((s, e) => s + annualize(e), 0);
  const scenarioC = useMemo(() => {
    return calc(cfg, expenses, {
      ownerComp: ownerComp as any,
      teamProfiles: teamBurdens as any,
      hrsOverride: scenario.hrsPerWeek,
      rateOverride: baseBilled + scenario.rateIncrease,
      extraRecurringAnnual: -scenario.costReduction,
    });
  }, [cfg, expenses, ownerComp, teamBurdens, scenario, baseBilled]);

  const scAligned = scenarioC.alignedRate;
  const scBilled = scenarioC.billedRate || 0;
  const gap = Math.max(0, scAligned - scBilled);

  const anyMoved =
    scenario.rateIncrease > 0 ||
    scenario.hrsPerWeek !== baseHrs ||
    scenario.costReduction > 0;

  const billedColor =
    scBilled < scenarioC.breakEvenRate ? "#E08060" : scBilled < scAligned ? "#D4A017" : "#7AB890";
  const pillLabel =
    scBilled < scenarioC.breakEvenRate
      ? "Below break-even"
      : scBilled < scAligned
        ? "Below floor"
        : "Above floor";

  const alignedDelta = scAligned - baseAligned;
  const gapClosed = gap === 0 && baseBilled < baseAligned;

  // Reality bar state
  let realityBg = "rgba(196,113,74,0.07)";
  let realityBorder = TERRA;
  let realityText =
    "This is a model. Nothing here changes your actual rate or your actual behavior. Use it to find a target that feels honest — then commit to it.";
  if (anyMoved && !gapClosed) {
    realityBg = "rgba(184,134,11,0.06)";
    realityBorder = GOLD;
    realityText = `This scenario reduces your gap to ${fmtUsd(gap, { decimals: 0 })}/hr. A partial close is real progress — commit to what feels achievable, then revisit in 90 days.`;
  }
  if (anyMoved && gapClosed) {
    realityBg = "rgba(92,138,110,0.06)";
    realityBorder = SAGE;
    realityText =
      "This scenario closes the gap. That's the model. Now commit to it — the rate doesn't change until you send a proposal at the new number.";
  }

  return (
    <div className="space-y-4">
      {/* Live preview */}
      <div
        style={{
          background: CHARCOAL,
          borderRadius: 10,
          padding: "16px 20px",
          color: "white",
        }}
      >
        <div
          style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.30)",
          }}
        >
          Live scenario
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ marginTop: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.50)" }}>Scenario aligned rate</div>
            <div className="flex items-baseline gap-2" style={{ marginTop: 4 }}>
              <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, color: GOLD }}>
                {fmtUsd(scAligned, { decimals: 0 })}/hr
              </span>
              {anyMoved && Math.abs(alignedDelta) > 0.01 && (
                <span
                  style={{
                    fontSize: 11,
                    color: alignedDelta < 0 ? SAGE : TERRA,
                  }}
                >
                  {alignedDelta < 0 ? "" : "+"}
                  {fmtUsd(alignedDelta, { decimals: 0 })}/hr vs actual
                </span>
              )}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.50)" }}>Scenario billed rate</div>
            <div className="flex items-baseline gap-2" style={{ marginTop: 4 }}>
              <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, color: billedColor }}>
                {fmtUsd(scBilled, { decimals: 0 })}/hr
              </span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 500,
                  padding: "3px 8px",
                  borderRadius: 3,
                  background: "rgba(255,255,255,0.08)",
                  color: billedColor,
                }}
              >
                {pillLabel}
              </span>
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginTop: 3 }}>
              {gap > 0
                ? `${fmtUsd(gap, { decimals: 0 })}/hr still to close`
                : "Gap closed"}
            </div>
          </div>
        </div>
      </div>

      {/* Levers */}
      <LeverCard
        n={1}
        title="Raise what you charge"
        effect={`+${fmtUsd(scenario.rateIncrease, { decimals: 0 })}/hr`}
        body="The most direct lever. Every dollar you raise your rate closes the gap by a dollar. A phased increase on new clients only is often the lowest-friction path."
        slider={{
          label: "Rate increase",
          min: 0,
          max: Math.max(50, Math.round(Math.max(0, baseAligned - baseBilled) * 1.2)),
          step: 5,
          value: scenario.rateIncrease,
          onChange: (v) => setScenario({ ...scenario, rateIncrease: v }),
          display: `+${fmtUsd(scenario.rateIncrease, { decimals: 0 })}/hr`,
        }}
        effectLine={`New billed rate: ${fmtUsd(baseBilled + scenario.rateIncrease, { decimals: 0 })}/hr`}
        note={
          scenario.rateIncrease === 0
            ? null
            : `Raising by ${fmtUsd(scenario.rateIncrease, { decimals: 0 })}/hr brings you to ${fmtUsd(baseBilled + scenario.rateIncrease, { decimals: 0 })}/hr. ${
                baseBilled + scenario.rateIncrease >= baseAligned
                  ? "Gap closed."
                  : `${fmtUsd(Math.max(0, baseAligned - (baseBilled + scenario.rateIncrease)), { decimals: 0 })}/hr still to go.`
              }`
        }
      />

      <LeverCard
        n={2}
        title="Bill more of the hours you already work"
        effect={
          Math.abs(scenarioC.alignedRate - baseAligned) < 0.01
            ? "±$0/hr aligned"
            : `${scenarioC.alignedRate < baseAligned ? "-" : "+"}${fmtUsd(Math.abs(scenarioC.alignedRate - baseAligned), { decimals: 0 })}/hr aligned`
        }
        body={`You already work 40 hours a week. Right now only ${Math.round((baseHrs / 40) * 100)}% of those are billed. Every unbilled hour you recover lowers the aligned rate — because the same cost floor gets spread across more revenue. No rate change needed.`}
        slider={{
          label: "Billable hours per week",
          min: 5,
          max: 38,
          step: 1,
          value: scenario.hrsPerWeek,
          onChange: (v) => setScenario({ ...scenario, hrsPerWeek: v }),
          display: `${scenario.hrsPerWeek} hrs/wk`,
        }}
        effectLine={`New aligned rate: ${fmtUsd(scenarioC.alignedRate, { decimals: 0 })}/hr`}
        note={(() => {
          const delta = scenario.hrsPerWeek - baseHrs;
          if (delta === 0) return null;
          const alignedDeltaAbs = Math.abs(scenarioC.alignedRate - baseAligned);
          return delta > 0
            ? `+${delta} hrs/wk drops your aligned rate by ${fmtUsd(alignedDeltaAbs, { decimals: 0 })}/hr.`
            : `${delta} hrs/wk raises your aligned rate by ${fmtUsd(alignedDeltaAbs, { decimals: 0 })}/hr.`;
        })()}
      />

      <LeverCard
        n={3}
        title="Reduce what it costs to deliver"
        effect={
          scenario.costReduction === 0
            ? "±$0/hr aligned"
            : `-${fmtUsd((scenario.costReduction / (baseC.annualBillableHrs || 1)) || 0, { decimals: 2 })}/hr aligned`
        }
        body="Every dollar you remove from your cost floor lowers your aligned rate. Software you don't use, subscriptions that lapsed, expenses that don't serve the work — eliminating them gives every billed hour a little more room."
        slider={{
          label: "Annual cost reduction",
          min: 0,
          max: Math.max(5000, Math.round(totalOpex)),
          step: 500,
          value: scenario.costReduction,
          onChange: (v) => setScenario({ ...scenario, costReduction: v }),
          display: `${fmtUsd(scenario.costReduction, { decimals: 0 })}/yr`,
        }}
        effectLine={`New aligned rate: ${fmtUsd(scenarioC.alignedRate, { decimals: 0 })}/hr`}
        note={
          scenario.costReduction === 0
            ? null
            : `Cutting ${fmtUsd(scenario.costReduction, { decimals: 0 })}/yr lowers your aligned rate by ${fmtUsd(Math.max(0, baseAligned - scenarioC.alignedRate), { decimals: 0 })}/hr.`
        }
      />

      {/* Reality bar */}
      <div
        role="note"
        style={{
          background: realityBg,
          borderLeft: `2px solid ${realityBorder}`,
          borderRadius: "0 4px 4px 0",
          padding: "12px 16px",
          fontSize: 12,
          color: CHARCOAL,
          lineHeight: 1.6,
        }}
      >
        {realityText}
      </div>

      <div className="text-center" style={{ marginTop: 4 }}>
        <button
          type="button"
          onClick={() =>
            setScenario({ rateIncrease: 0, hrsPerWeek: baseHrs, costReduction: 0 })
          }
          style={{ fontSize: 11, color: MUTED, textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}
        >
          Reset all levers
        </button>
      </div>

      <div className="flex justify-between gap-3">
        <SecondaryBtn onClick={onBack}>← Back</SecondaryBtn>
        <PrimaryBtn onClick={onCommit} disabled={!anyMoved}>
          Commit to this scenario →
        </PrimaryBtn>
      </div>
    </div>
  );
}

function LeverCard({
  n,
  title,
  effect,
  body,
  slider,
  effectLine,
  note,
}: {
  n: number;
  title: string;
  effect: string;
  body: string;
  slider: {
    label: string;
    min: number;
    max: number;
    step: number;
    value: number;
    onChange: (v: number) => void;
    display: string;
  };
  effectLine: string;
  note: string | null;
}) {
  return (
    <div
      style={{
        background: "white",
        border: `0.5px solid ${BORDER}`,
        borderRadius: 8,
        padding: "14px 16px",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              background: "rgba(184,134,11,0.10)",
              color: GOLD,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {n}
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, color: CHARCOAL }}>{title}</div>
        </div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 500,
            padding: "3px 8px",
            borderRadius: 3,
            background: "rgba(44,44,44,0.04)",
            color: CHARCOAL,
          }}
        >
          {effect}
        </div>
      </div>
      <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.6, marginTop: 10 }}>{body}</p>

      <div style={{ marginTop: 12 }}>
        <label className="flex items-center justify-between" style={{ fontSize: 11, color: MUTED }}>
          <span>{slider.label}</span>
          <span style={{ color: CHARCOAL, fontWeight: 500 }}>{slider.display}</span>
        </label>
        <input
          type="range"
          min={slider.min}
          max={slider.max}
          step={slider.step}
          value={slider.value}
          onChange={(e) => slider.onChange(Number(e.target.value))}
          style={{ width: "100%", marginTop: 6, accentColor: GOLD }}
          aria-label={slider.label}
        />
        <div style={{ fontSize: 11, color: CHARCOAL, marginTop: 4 }}>{effectLine}</div>
        {note && (
          <div style={{ fontSize: 11, color: MUTED, marginTop: 4, fontStyle: "italic" }}>{note}</div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Tab 3: Commit ─────────────────────────── */

type Commitment = {
  key: string;
  action_type: "rate_increase" | "utilization" | "cost_reduction" | "settings_update";
  target_value: number | null;
  heading: string;
  detail: string;
  linkTo: string;
  linkLabel: string;
};

function buildCommitments(baseBilled: number, baseHrs: number, scenario: Scenario): Commitment[] {
  const out: Commitment[] = [];
  if (scenario.rateIncrease > 0) {
    const newRate = baseBilled + scenario.rateIncrease;
    out.push({
      key: "rate",
      action_type: "rate_increase",
      target_value: newRate,
      heading: `Raise your rate to ${fmtUsd(newRate, { decimals: 0 })}/hr on your next new client proposal`,
      detail:
        "Not existing clients. Not retroactively. The next proposal you send goes out at the new rate. One proposal is enough to start.",
      linkTo: "/projects",
      linkLabel: "Draft a proposal at this rate →",
    });
  }
  if (scenario.hrsPerWeek > baseHrs) {
    out.push({
      key: "util",
      action_type: "utilization",
      target_value: scenario.hrsPerWeek,
      heading: `Protect ${scenario.hrsPerWeek} billable hours on your calendar this week`,
      detail:
        "Block them before anything else goes in. Non-billable work fills time that's left — not the other way around.",
      linkTo: "/time-calendar",
      linkLabel: "Set up my week →",
    });
  }
  if (scenario.costReduction > 0) {
    out.push({
      key: "cost",
      action_type: "cost_reduction",
      target_value: scenario.costReduction,
      heading: "Review every recurring subscription and cancel one unused service today",
      detail:
        "Open your bank statement. Find one subscription or service you haven't used in 60 days. Cancel it today. Not someday. Today.",
      linkTo: "/settings",
      linkLabel: "Review my expenses →",
    });
  }
  // If nothing moved, default to rate increase to close gap
  if (out.length === 0) {
    out.push({
      key: "rate-default",
      action_type: "rate_increase",
      target_value: null,
      heading: "Send your next proposal at your aligned rate",
      detail:
        "You didn't move any levers, but the gap is still there. The next proposal is where it starts to close — one client at a time.",
      linkTo: "/projects",
      linkLabel: "Draft a proposal →",
    });
  }
  // Always include settings update
  out.push({
    key: "settings",
    action_type: "settings_update",
    target_value: null,
    heading: "Log this commitment in Sightline",
    detail:
      "When you update your actual rate in settings, Sightline records the change and adjusts your dashboard accordingly. The model becomes real when the settings change.",
    linkTo: "/settings",
    linkLabel: "Update my rate in settings →",
  });
  return out;
}

function CommitTab({
  baseC,
  cfg,
  expenses: _expenses,
  ownerComp: _ownerComp,
  teamBurdens: _teamBurdens,
  scenario,
  onBack,
}: {
  baseC: Calc;
  cfg: FirmConfig | null;
  expenses: Expense[];
  ownerComp: any[];
  teamBurdens: any[];
  scenario: Scenario;
  onBack: () => void;
}) {
  const baseBilled = Number(cfg?.rate_billed) || 0;
  const baseHrs = baseC.targetBillableHrsWeek || 0;
  const commitments = useMemo(
    () => buildCommitments(baseBilled, baseHrs, scenario),
    [baseBilled, baseHrs, scenario],
  );
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const createSet = useServerFn(createCommitmentSet);

  // Persist commitments on first mount (Tab 3 accessed)
  useEffect(() => {
    createSet({
      data: {
        items: commitments.map((c) => ({
          action_type: c.action_type,
          target_value: c.target_value,
        })),
      },
    }).catch(() => {
      // fail silently — the UI still works
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = commitments.length;
  const doneCount = commitments.reduce((s, c) => s + (checked[c.key] ? 1 : 0), 0);
  const ratio = total > 0 ? doneCount / total : 0;

  let subline = "Check each one when it's done — not when you plan to do it.";
  if (doneCount === 1) subline = "One done. Real progress. The gap closes one action at a time.";
  else if (doneCount === 2) subline = "Two done. Keep going — the last one matters most.";
  else if (doneCount >= total && total > 0) subline = "All done. Go update your actual rate in settings now.";

  let realityBg = "rgba(184,134,11,0.06)";
  let realityBorder = GOLD;
  let realityText =
    "The budgeting trap: adjusting numbers until they look right and calling it done. The gap doesn't close because you modeled it closing. It closes because you send a proposal at the new rate. Start there.";
  if (doneCount >= 2 && doneCount < total) {
    realityText =
      "Good. The budgeting trap is planning to do things. You're doing them. Keep going.";
  }
  if (doneCount >= total && total > 0) {
    realityBg = "rgba(92,138,110,0.06)";
    realityBorder = SAGE;
    realityText =
      "All three done. Go update your actual billed rate in settings now. The model is done. The real work just started.";
  }

  return (
    <div className="space-y-4">
      {/* Progress ring */}
      <div
        style={{
          background: "white",
          border: `0.5px solid ${BORDER}`,
          borderRadius: 10,
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: 20,
        }}
      >
        <ProgressRing ratio={ratio} />
        <div>
          <div style={{ fontSize: 8, letterSpacing: "0.2em", textTransform: "uppercase", color: MUTED, fontWeight: 600 }}>
            Commitments kept
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: CHARCOAL, marginTop: 2 }}>
            {doneCount} of {total} actions
          </div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{subline}</div>
        </div>
      </div>

      {/* Commitment items */}
      <div className="space-y-3">
        {commitments.map((c) => (
          <CommitmentItem
            key={c.key}
            checked={!!checked[c.key]}
            onToggle={() =>
              setChecked((prev) => ({ ...prev, [c.key]: !prev[c.key] }))
            }
            heading={c.heading}
            detail={c.detail}
            linkTo={c.linkTo}
            linkLabel={c.linkLabel}
          />
        ))}
      </div>

      {/* Reality bar */}
      <div
        role="note"
        style={{
          background: realityBg,
          borderLeft: `2px solid ${realityBorder}`,
          borderRadius: "0 4px 4px 0",
          padding: "12px 16px",
          fontSize: 12,
          color: CHARCOAL,
          lineHeight: 1.6,
        }}
      >
        {realityText}
      </div>

      <div className="flex justify-between gap-3">
        <SecondaryBtn onClick={onBack}>← Back to model</SecondaryBtn>
        <PrimaryBtn
          onClick={() => {
            if (doneCount >= total) {
              toast.success("Commitments logged. Now update your rate in settings.");
            } else {
              toast("Come back when you've done these — not before.");
            }
          }}
        >
          I've done this. What's next? →
        </PrimaryBtn>
      </div>

      <p
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 13,
          fontStyle: "italic",
          color: MUTED,
          textAlign: "center",
          marginTop: 8,
        }}
      >
        The gap doesn't close in a spreadsheet. It closes in a proposal.
      </p>
    </div>
  );
}

function CommitmentItem({
  checked,
  onToggle,
  heading,
  detail,
  linkTo,
  linkLabel,
}: {
  checked: boolean;
  onToggle: () => void;
  heading: string;
  detail: string;
  linkTo: string;
  linkLabel: string;
}) {
  return (
    <div
      style={{
        background: "white",
        border: `0.5px solid ${BORDER}`,
        borderRadius: 8,
        padding: "14px 16px",
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
        opacity: checked ? 0.75 : 1,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={checked}
        aria-label={heading}
        style={{
          flexShrink: 0,
          width: 20,
          height: 20,
          borderRadius: 3,
          border: `1px solid ${checked ? CHARCOAL : "rgba(44,44,44,0.25)"}`,
          background: checked ? CHARCOAL : "white",
          color: "white",
          fontSize: 12,
          lineHeight: "18px",
          cursor: "pointer",
          marginTop: 2,
        }}
      >
        {checked ? "✓" : ""}
      </button>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 13,
            color: CHARCOAL,
            fontWeight: 500,
            textDecoration: checked ? "line-through" : "none",
          }}
        >
          {heading}
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 1.6 }}>{detail}</div>
        <Link
          to={linkTo as any}
          style={{ fontSize: 11, color: GOLD, marginTop: 8, display: "inline-block" }}
          className="hover:underline"
        >
          {linkLabel}
        </Link>
      </div>
    </div>
  );
}

function ProgressRing({ ratio }: { ratio: number }) {
  const size = 56;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(1, ratio)));
  const done = ratio >= 1;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`Progress ${Math.round(ratio * 100)}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(44,44,44,0.08)" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={done ? "#7AB890" : SAGE}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 300ms ease" }}
      />
    </svg>
  );
}

/* ─────────────────────────── Buttons ─────────────────────────── */

function PrimaryBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: CHARCOAL,
        color: "white",
        padding: "10px 18px",
        borderRadius: 4,
        fontSize: 12,
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        letterSpacing: "0.02em",
      }}
    >
      {children}
    </button>
  );
}

function SecondaryBtn({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "white",
        color: CHARCOAL,
        padding: "10px 18px",
        borderRadius: 4,
        fontSize: 12,
        border: `0.5px solid ${BORDER}`,
        cursor: "pointer",
        letterSpacing: "0.02em",
      }}
    >
      {children}
    </button>
  );
}