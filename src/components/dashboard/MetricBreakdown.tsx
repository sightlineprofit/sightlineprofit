import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import type { calc, Expense } from "@/lib/finance";
import { annualizeExpense, fmtUsd } from "@/lib/finance";
import { buildTeamCostBreakdown, type TeamMemberInput } from "@/lib/team-cost";

type Calc = ReturnType<typeof calc>;

export type MetricKind =
  | "billed"
  | "health"
  | "margin"
  | "breakeven"
  | "cost_floor"
  | "budget_revenue";

type Member = TeamMemberInput;

export type RevenueContributor = {
  label: string;   // e.g. "Caprice Gossett"
  role: string;    // e.g. "PRINCIPAL" or "TEAM — JR DESIGNER"
  rate: number;    // $/hr
  hrs: number;     // hrs/week
  weeks: number;   // weeks/year
  revenue: number; // computed annual $
};

const CHARCOAL = "#2C2C2C";
const GOLD = "#D4A017";
const GOLD_DIM = "#B8860B";
const GREEN = "#7AB890";
const TERRA = "#C4714A";
const TEAL = "#5FA69B";
const CREAM_MUTED = "rgba(233,220,196,0.9)";

const LABELS: Record<MetricKind, string> = {
  billed: "Billed rate",
  health: "Rate health",
  margin: "Margin",
  breakeven: "Break-even",
  cost_floor: "Cost floor",
  budget_revenue: "Budget revenue",
};

function ClosingLine() {
  return (
    <div
      style={{
        marginTop: 12,
        textAlign: "right",
        fontFamily: "'Cormorant Garamond', serif",
        fontStyle: "italic",
        fontSize: 13,
        color: "rgba(255,255,255,0.25)",
        lineHeight: 1.35,
      }}
    >
      These numbers have always been true.<br />Now they're visible.
    </div>
  );
}

function Callout({
  tone,
  children,
}: {
  tone: "critical" | "warn" | "good" | "muted";
  children: React.ReactNode;
}) {
  const map = {
    critical: { bg: "rgba(196,113,74,0.15)", border: TERRA, color: "rgba(255,255,255,0.85)" },
    warn: { bg: "rgba(184,134,11,0.10)", border: GOLD_DIM, color: "rgba(255,255,255,0.85)" },
    good: { bg: "rgba(92,138,110,0.10)", border: "#5C8A6E", color: "rgba(255,255,255,0.85)" },
    muted: { bg: "rgba(255,255,255,0.04)", border: "transparent", color: "rgba(255,255,255,0.45)" },
  }[tone];
  return (
    <div
      style={{
        marginTop: 10,
        background: map.bg,
        borderLeft: map.border === "transparent" ? "0" : `2px solid ${map.border}`,
        borderRadius: 3,
        padding: "10px 12px",
        color: map.color,
        fontSize: 11,
        fontFamily: "Jost, sans-serif",
        fontWeight: 400,
        lineHeight: 1.7,
      }}
    >
      {children}
    </div>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.35)",
        marginTop: 12,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function RowLine({
  label,
  bar,
  value,
  valueColor = "white",
  hint,
  border = true,
  barColor = "rgba(184,134,11,0.5)",
}: {
  label: string;
  bar?: number;
  value: string;
  valueColor?: string;
  hint?: string;
  border?: boolean;
  barColor?: string;
}) {
  return (
    <div
      className={border ? "border-b border-white/[0.06]" : ""}
      style={{ padding: "5px 0", fontSize: 11 }}
    >
      <div className="flex items-center gap-2">
        <span style={{ flex: 1, color: "rgba(255,255,255,0.65)", fontWeight: 400 }}>{label}</span>
        {typeof bar === "number" && (
          <span
            style={{
              height: 3,
              borderRadius: 2,
              background: barColor,
              width: bar,
              flex: "none",
            }}
          />
        )}
        <span style={{ minWidth: 72, textAlign: "right", color: valueColor, fontWeight: 500 }}>
          {value}
        </span>
      </div>
      {hint && (
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{hint}</div>
      )}
    </div>
  );
}

function Divider() {
  return <div style={{ borderTop: "1px solid rgba(255,255,255,0.15)", margin: "10px 0" }} />;
}

function Header({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "'Cormorant Garamond', serif",
        fontSize: 18,
        fontWeight: 400,
        color: "white",
        marginBottom: 4,
        lineHeight: 1.25,
      }}
    >
      {children}
    </div>
  );
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: "rgba(255,255,255,0.65)",
        fontFamily: "Jost, sans-serif",
        fontWeight: 400,
        lineHeight: 1.7,
        marginTop: 6,
      }}
    >
      {children}
    </div>
  );
}

function barPx(part: number, base: number, max = 80, min = 8) {
  if (!(base > 0)) return min;
  const pct = Math.min(100, Math.max(0, (part / base) * 100));
  return Math.max(min, Math.round((pct / 100) * max));
}

function cents(part: number, base: number) {
  if (!(base > 0)) return 0;
  return Math.round((part / base) * 100);
}

/* ────────── content builders ────────── */

function BilledContent({ c, targetMarginPct }: { c: Calc; targetMarginPct: number }) {
  const billed = c.billedRate || 0;
  const aligned = c.alignedRate || 0;
  const be = c.breakEvenRate || 0;
  const hrs = c.annualBillableHrs || 0;
  const ownerPerHr = hrs > 0 ? (c.compTotal || 0) / hrs : 0;
  const teamPerHr = hrs > 0 ? (c.teamCostTotal || 0) / hrs : 0;
  const opexPerHr = hrs > 0 ? ((c.opexRecurring || 0) + (c.opexOneTime || 0)) / hrs : 0;
  const remainder = billed - be;
  const marginAbove = billed - aligned;

  return (
    <>
      <Header>What ${Math.round(billed)}/hr actually means</Header>
      <SectionHead>Compared to your floors</SectionHead>
      <RowLine
        label="Your billed rate"
        bar={80}
        value={`${fmtUsd(billed)}/hr`}
        valueColor="white"
      />
      <RowLine
        label="Aligned rate (your target)"
        bar={barPx(aligned, Math.max(billed, aligned))}
        value={`${fmtUsd(aligned)}/hr`}
        valueColor={GOLD}
        hint={billed < aligned ? `↓ ${fmtUsd(aligned - billed)}/hr below target` : undefined}
        barColor="rgba(212,160,23,0.65)"
      />
      <RowLine
        label="Break-even (your floor)"
        bar={barPx(be, Math.max(billed, aligned, be))}
        value={`${fmtUsd(be)}/hr`}
        valueColor="rgba(255,255,255,0.6)"
        border={false}
        barColor="rgba(255,255,255,0.35)"
      />

      <Divider />
      <SectionHead>What this rate pays for</SectionHead>
      <RowLine
        label="Your compensation"
        bar={barPx(ownerPerHr, Math.max(billed, be))}
        value={`${fmtUsd(ownerPerHr)}/hr`}
        hint={billed > 0 ? `${cents(ownerPerHr, billed)}¢ of every dollar billed` : undefined}
      />
      {teamPerHr > 0 && (
        <RowLine
          label="Team cost"
          bar={barPx(teamPerHr, Math.max(billed, be))}
          value={`${fmtUsd(teamPerHr)}/hr`}
          hint={billed > 0 ? `${cents(teamPerHr, billed)}¢ of every dollar billed` : undefined}
          barColor="rgba(95,166,155,0.6)"
        />
      )}
      <RowLine
        label="Operating expenses"
        bar={barPx(opexPerHr, Math.max(billed, be))}
        value={`${fmtUsd(opexPerHr)}/hr`}
        hint={billed > 0 ? `${cents(opexPerHr, billed)}¢ of every dollar billed` : undefined}
        barColor="rgba(233,220,196,0.55)"
        border={remainder !== 0}
      />
      {remainder > 0 && (
        <RowLine
          label="Left over after costs"
          bar={barPx(remainder, billed)}
          value={`${fmtUsd(remainder)}/hr`}
          valueColor={GREEN}
          hint={`${cents(remainder, billed)}¢ of every dollar billed`}
          border={false}
          barColor="rgba(122,184,144,0.6)"
        />
      )}
      {remainder < 0 && (
        <RowLine
          label="Shortfall (costs not covered)"
          value={`-${fmtUsd(Math.abs(remainder))}/hr`}
          valueColor={TERRA}
          hint={`Every hour billed at this rate costs the firm ${fmtUsd(Math.abs(remainder))} more than it earns.`}
          border={false}
        />
      )}

      {billed < be ? (
        <Callout tone="critical">
          This rate doesn't cover what it costs to deliver your work. This was always true —
          Sightline is the first place it's been visible.
        </Callout>
      ) : billed < aligned ? (
        <Callout tone="warn">
          This rate covers your costs but doesn't build the margin your business needs to grow.
          The gap between here and {fmtUsd(aligned)} is profit that hasn't existed.
        </Callout>
      ) : (
        <Callout tone="good">
          You're billing above your aligned rate. Every hour billed earns {fmtUsd(Math.max(0, marginAbove))}/hr
          toward your {Math.round(targetMarginPct || 0)}% margin target.
        </Callout>
      )}
    </>
  );
}

function HealthContent({ c, targetMarginPct }: { c: Calc; targetMarginPct: number }) {
  const billed = c.billedRate || 0;
  const aligned = c.alignedRate || 0;
  const be = c.breakEvenRate || 0;
  const hrs = c.annualBillableHrs || 0;
  const revenue = billed * hrs;
  const floor = c.totalCost || 0;

  if (c.rateHealth === "critical") {
    const deficit = Math.max(0, be - billed);
    const annualDeficit = Math.max(0, floor - revenue);
    return (
      <>
        <Header>Why this is critical</Header>
        <div style={{ fontSize: 11, color: TERRA, fontWeight: 500, marginTop: 4 }}>
          Rate health: Below break-even
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2, fontStyle: "italic" }}>
          The most urgent financial signal in your firm.
        </div>
        <Paragraph>
          Break-even is the rate at which every dollar you earn exactly covers every dollar it
          costs to run your firm and pay yourself.
          <br /><br />
          At {fmtUsd(billed)}/hr you are earning {fmtUsd(deficit)}/hr less than it costs to
          deliver your work.
          <br /><br />
          This isn't a rounding error. It is a structural loss that has been happening every
          billable hour.
        </Paragraph>
        <SectionHead>At your current pace ({Math.round(hrs)} hrs/yr billed)</SectionHead>
        <RowLine label="Revenue at billed rate" value={`${fmtUsd(revenue)}/yr`} />
        <RowLine label="Cost floor" value={`${fmtUsd(floor)}/yr`} valueColor={TERRA} border={false} />
        <Divider />
        <div className="flex justify-between items-baseline">
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.85)" }}>Annual deficit</span>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: TERRA }}>
            -{fmtUsd(annualDeficit)}/yr
          </span>
        </div>
        <Callout tone="muted">
          <span style={{ fontStyle: "italic" }}>
            This gap has likely existed for years without being visible. Sightline didn't create
            it — it revealed it.
          </span>
        </Callout>
      </>
    );
  }

  if (c.rateHealth === "below_floor") {
    const gap = Math.max(0, aligned - billed);
    return (
      <>
        <Header>What this gap costs you</Header>
        <div style={{ fontSize: 11, color: GOLD, fontWeight: 500, marginTop: 4 }}>
          Rate health: Below your margin target
        </div>
        <Paragraph>
          You're covering your costs, which means the business is surviving. But at {fmtUsd(billed)}/hr
          you're earning {fmtUsd(gap)}/hr less than the rate your cost structure requires to hit
          your {Math.round(targetMarginPct || 0)}% margin target.
          <br /><br />
          The difference is profit that isn't being captured.
        </Paragraph>
        <SectionHead>At {Math.round(hrs)} hrs/yr</SectionHead>
        <RowLine label="Uncaptured margin this year" value={`${fmtUsd(gap * hrs)}/yr`} valueColor={GOLD} />
        <RowLine label="What your rate should generate" value={`${fmtUsd(aligned * hrs)}/yr`} />
        <RowLine
          label="What it's actually generating"
          value={`${fmtUsd(revenue)}/yr`}
          valueColor="rgba(255,255,255,0.55)"
          border={false}
        />
      </>
    );
  }

  const surplus = Math.max(0, (billed - aligned) * hrs);
  const marginPerHr = Math.max(0, billed - aligned);
  return (
    <>
      <Header>What this means long term</Header>
      <div style={{ fontSize: 11, color: GREEN, fontWeight: 500, marginTop: 4 }}>
        Rate health: Billing above floor
      </div>
      <Paragraph>
        Your billed rate exceeds your aligned rate by {fmtUsd(marginPerHr)}/hr. Every billable
        hour earns beyond your cost floor and margin target.
      </Paragraph>
      <SectionHead>At {Math.round(hrs)} hrs/yr</SectionHead>
      <RowLine label="Margin above target this year" value={`+${fmtUsd(surplus)}/yr`} valueColor={GREEN} border={false} />
    </>
  );
}

function MarginContent({ c, targetMarginPct }: { c: Calc; targetMarginPct: number }) {
  const billed = c.billedRate || 0;
  const aligned = c.alignedRate || 0;
  const be = c.breakEvenRate || 0;
  const hrs = c.annualBillableHrs || 0;
  const marginPerHr = billed - aligned; // signed
  const isNeg = billed < be;
  const isBelowTarget = !isNeg && billed < aligned;

  if (isNeg) {
    const gapPerHr = be - billed;
    const floor = c.totalCost || 0;
    const revenue = billed * hrs;
    const gapAnnual = Math.max(0, floor - revenue);
    const additionalHrs = billed > 0 ? Math.ceil(gapAnnual / billed) : 0;
    return (
      <>
        <Header>Your margin — what it means</Header>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: TERRA, marginTop: 6 }}>
          Margin: -{fmtUsd(Math.abs(marginPerHr))}/hr
        </div>
        <Paragraph>
          A negative margin means your billed rate doesn't cover your cost floor. You are
          effectively paying to deliver your work.
        </Paragraph>
        <SectionHead>At {Math.round(hrs)} hrs/yr billed at {fmtUsd(billed)}/hr</SectionHead>
        <RowLine label="Annual cost floor" value={`${fmtUsd(floor)}/yr`} />
        <RowLine label="Annual revenue" value={`${fmtUsd(revenue)}/yr`} />
        <Divider />
        <RowLine label="Annual shortfall" value={`-${fmtUsd(gapAnnual)}/yr`} valueColor={TERRA} border={false} />
        <SectionHead>To reach break-even</SectionHead>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 1.8 }}>
          • Raise rate by <span style={{ color: "white" }}>{fmtUsd(gapPerHr)}/hr</span><br />
          • Reduce cost floor by <span style={{ color: "white" }}>{fmtUsd(gapAnnual)}/yr</span><br />
          {additionalHrs > 0 && (
            <>• Bill <span style={{ color: "white" }}>{additionalHrs} more hours/yr</span></>
          )}
        </div>
      </>
    );
  }

  if (isBelowTarget) {
    const gap = aligned - billed;
    return (
      <>
        <Header>Your margin — what it means</Header>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: GOLD, marginTop: 6 }}>
          Margin: +{fmtUsd(marginPerHr)}/hr
        </div>
        <SectionHead>The picture</SectionHead>
        <RowLine label="Your margin per hour" value={`+${fmtUsd(marginPerHr)}/hr`} valueColor={GOLD} />
        <RowLine label="Your target margin" value={`${Math.round(targetMarginPct || 0)}%`} />
        <RowLine label="Margin at target rate" value={`+${fmtUsd(aligned - be)}/hr`} />
        <RowLine label="Gap to target" value={`-${fmtUsd(gap)}/hr`} valueColor={TERRA} border={false} />
        <SectionHead>To reach your {Math.round(targetMarginPct || 0)}% target</SectionHead>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 1.7 }}>
          Raise rate by <span style={{ color: "white" }}>{fmtUsd(gap)}/hr</span> to{" "}
          <span style={{ color: GOLD }}>{fmtUsd(aligned)}/hr</span>.
        </div>
      </>
    );
  }

  const annualSurplus = marginPerHr * hrs;
  return (
    <>
      <Header>Your margin — what it means</Header>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: GREEN, marginTop: 6 }}>
        Margin: +{fmtUsd(marginPerHr)}/hr
      </div>
      <Paragraph>
        You're billing {fmtUsd(marginPerHr)}/hr above your aligned rate. At {Math.round(hrs)}{" "}
        billable hours per year this generates{" "}
        <span style={{ color: GREEN }}>{fmtUsd(annualSurplus)}</span> in margin above your{" "}
        {Math.round(targetMarginPct || 0)}% target.
      </Paragraph>
    </>
  );
}

function BreakevenContent({ c, cfg }: { c: Calc; cfg: any }) {
  const be = c.breakEvenRate || 0;
  const hrs = c.annualBillableHrs || 0;
  const perWeek = c.principalBillableHrsWeek || Number(cfg?.target_billable_hrs_per_week) || c.targetBillableHrsWeek || 0;
  const weeks = c.weeksPerYear || 48;
  const owner = c.compTotal || 0;
  const team = c.teamCostTotal || 0;
  const opex = (c.opexRecurring || 0) + (c.opexOneTime || 0);
  const total = c.totalCost || 0;
  const beLow = hrs > 200 ? total / (hrs + 200) : 0;
  const beHigh = hrs > 200 ? total / Math.max(1, hrs - 200) : 0;

  return (
    <>
      <Header>Your break-even rate — how it's built</Header>
      <Paragraph>
        Break-even is the hourly rate at which your firm earns exactly what it costs to run.
        No profit. No loss. Every dollar in, every dollar out.
      </Paragraph>
      <SectionHead>The math</SectionHead>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", display: "flex", padding: "0 0 4px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <span style={{ flex: 1 }}></span>
        <span style={{ width: 90, textAlign: "right" }}>Annual</span>
        <span style={{ width: 70, textAlign: "right" }}>Per hr</span>
      </div>
      <TwoCol label="Your compensation" annual={owner} hr={hrs > 0 ? owner / hrs : 0} />
      {team > 0 && <TwoCol label="Team cost" annual={team} hr={hrs > 0 ? team / hrs : 0} />}
      <TwoCol label="Operating expenses" annual={opex} hr={hrs > 0 ? opex / hrs : 0} />
      <Divider />
      <TwoCol label="Total cost floor" annual={total} hr={be} emphasize />

      <SectionHead>The billable hours assumption</SectionHead>
      <Paragraph>
        This calculation assumes you bill {Math.round(hrs)} hours per year ({perWeek} hrs/wk × {weeks} weeks).
        If you bill fewer hours, your break-even rate rises. If you bill more, it falls.
      </Paragraph>
      {hrs > 200 && (
        <div style={{ marginTop: 8 }}>
          <RowLine label={`If you bill ${Math.round(hrs) - 200} hrs`} value={`${fmtUsd(beHigh)}/hr`} />
          <RowLine label={`If you bill ${Math.round(hrs) + 200} hrs`} value={`${fmtUsd(beLow)}/hr`} border={false} />
        </div>
      )}
      <div style={{ marginTop: 10, fontSize: 11, fontStyle: "italic", color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
        Your break-even has always been {fmtUsd(be)}/hr. The number didn't change when you saw it here.
      </div>
    </>
  );
}

function TwoCol({
  label,
  annual,
  hr,
  emphasize,
}: {
  label: string;
  annual: number;
  hr: number;
  emphasize?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        padding: "5px 0",
        fontSize: emphasize ? 12 : 11,
        borderBottom: emphasize ? "none" : "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <span style={{ flex: 1, color: emphasize ? "white" : "rgba(255,255,255,0.65)", fontWeight: emphasize ? 500 : 400 }}>
        {label}
      </span>
      <span style={{ width: 90, textAlign: "right", color: emphasize ? "white" : "rgba(255,255,255,0.85)", fontWeight: 500 }}>
        {fmtUsd(annual)}
      </span>
      <span style={{ width: 70, textAlign: "right", color: emphasize ? "white" : "rgba(255,255,255,0.85)", fontWeight: 500 }}>
        {fmtUsd(hr)}/hr
      </span>
    </div>
  );
}

function CostFloorContent({
  c,
  members,
  expenses,
}: {
  c: Calc;
  members: Member[];
  expenses: Expense[];
}) {
  const owner = c.compTotal || 0;
  const team = c.teamCostTotal || 0;
  const opex = (c.opexRecurring || 0) + (c.opexOneTime || 0);
  const total = c.totalCost || 0;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  const teamRows = buildTeamCostBreakdown(members);

  const opexRows = expenses
    .map((e) => {
      const a = annualizeExpense(e);
      return { name: e.name, annual: a.recurring + a.oneTime };
    })
    .sort((a, b) => b.annual - a.annual);

  return (
    <>
      <Header>Your cost floor — what it takes to keep the doors open</Header>
      <Paragraph>
        Your cost floor is the total annual cost of running this firm at your current structure.
        It is not a target. It is the minimum the business must earn to sustain itself.
      </Paragraph>

      <SectionHead>What's in {fmtUsd(total)}/yr</SectionHead>
      {/* stacked bar */}
      <div style={{ display: "flex", height: 8, borderRadius: 3, overflow: "hidden", background: "rgba(255,255,255,0.05)" }}>
        {owner > 0 && <span style={{ width: `${pct(owner)}%`, background: GOLD }} />}
        {team > 0 && <span style={{ width: `${pct(team)}%`, background: TEAL }} />}
        {opex > 0 && <span style={{ width: `${pct(opex)}%`, background: CREAM_MUTED }} />}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
        <span><span style={{ display: "inline-block", width: 8, height: 8, background: GOLD, marginRight: 4, borderRadius: 1 }} />Owner {pct(owner)}%</span>
        {team > 0 && <span><span style={{ display: "inline-block", width: 8, height: 8, background: TEAL, marginRight: 4, borderRadius: 1 }} />Team {pct(team)}%</span>}
        <span><span style={{ display: "inline-block", width: 8, height: 8, background: CREAM_MUTED, marginRight: 4, borderRadius: 1 }} />Opex {pct(opex)}%</span>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 11, color: "white", fontWeight: 500 }}>Owner compensation</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{fmtUsd(owner)}/yr · {pct(owner)}% of your cost floor</div>
        <SubRows
          rows={[
            ["Draw / salary", c.draw],
            ["Payroll tax", c.ptax],
            ["Health insurance", c.health],
            ["Retirement", c.retire],
            ...(c.distribution > 0 ? [["Distributions", c.distribution] as [string, number]] : []),
            ...(c.structure === "s_corp" && c.reserveTarget > 0 ? [["Reserve target", c.reserveTarget] as [string, number]] : []),
          ]}
        />

        {team > 0 && (
          teamRows.length > 0 ? (
            <>
              {teamRows.map((r, i) => {
                const first = (r.name.split(" ")[0] || r.name).trim();
                const rows: Array<[string, number]> = [[r.baseLabel, r.base]];
                if (r.isW2 && r.tax > 0) rows.push(["Employer payroll tax", r.tax]);
                if (r.benefits > 0) rows.push(["Benefits contribution", r.benefits]);
                if (r.equipment > 0) rows.push(["Equipment & overhead", r.equipment]);
                return (
                  <div key={r.id} style={{ marginTop: i === 0 ? 10 : 12 }}>
                    <div style={{ fontSize: 11, color: "white", fontWeight: 500 }}>
                      {r.name}
                      <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}> · {r.role}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                      {fmtUsd(r.total)}/yr · {pct(r.total)}% of your cost floor
                    </div>
                    <SubRows rows={rows} />
                    <div style={{ display: "flex", padding: "4px 0 0", marginTop: 4, fontSize: 11, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                      <span style={{ flex: 1, color: "rgba(255,255,255,0.75)", fontWeight: 500 }}>{first} total</span>
                      <span style={{ color: GOLD, fontWeight: 500 }}>{fmtUsd(r.total)}/yr</span>
                    </div>
                  </div>
                );
              })}
              <div style={{ display: "flex", padding: "6px 0 0", marginTop: 8, fontSize: 11, borderTop: "1px solid rgba(255,255,255,0.15)" }}>
                <span style={{ flex: 1, color: "white", fontWeight: 500 }}>Team cost total</span>
                <span style={{ color: GOLD, fontWeight: 500 }}>{fmtUsd(team)}/yr · {pct(team)}%</span>
              </div>
            </>
          ) : (
            <>
              <div style={{ marginTop: 10, fontSize: 11, color: "white", fontWeight: 500 }}>Team cost</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{fmtUsd(team)}/yr · {pct(team)}%</div>
            </>
          )
        )}

        <div style={{ marginTop: 10, fontSize: 11, color: "white", fontWeight: 500 }}>Operating expenses</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{fmtUsd(opex)}/yr · {pct(opex)}%</div>
        <SubRows
          rows={opexRows.slice(0, 3).map((r) => [r.name, r.annual] as [string, number])}
          more={opexRows.length > 3 ? opexRows.length - 3 : 0}
          moreLabel="more expenses"
        />
      </div>

      <Callout tone="muted">
        This cost floor exists whether or not you can see it. Every firm has one. Most designers
        have never had a tool that showed them theirs. The question was never whether these
        costs exist. It was whether your rate was covering them.
      </Callout>
    </>
  );
}

function SubRows({
  rows,
  more,
  moreLabel,
}: {
  rows: Array<[string, number]>;
  more?: number;
  moreLabel?: string;
}) {
  return (
    <div style={{ marginTop: 4, paddingLeft: 10, borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
      {rows.filter(([, v]) => v > 0).map(([label, value]) => (
        <div key={label} style={{ display: "flex", padding: "2px 0", fontSize: 11 }}>
          <span style={{ flex: 1, color: "rgba(255,255,255,0.6)" }}>{label}</span>
          <span style={{ color: "rgba(255,255,255,0.85)" }}>{fmtUsd(value)}/yr</span>
        </div>
      ))}
      {more && more > 0 ? (
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
          + {more} {moreLabel}
        </div>
      ) : null}
    </div>
  );
}

function BudgetRevenueContent({
  c,
  contributors = [],
}: {
  c: Calc;
  contributors?: RevenueContributor[];
}) {
  const total = c.annualRevenue || 0;
  const floor = c.totalCost || 0;
  const alignedRevenue = (c.alignedRate || 0) * (c.annualBillableHrs || 0);
  const covers = total >= floor;
  const marginAnnual = total - floor;
  const marginPct = total > 0 ? Math.round((marginAnnual / total) * 100) : 0;

  return (
    <>
      <Header>Your budget revenue — full firm picture</Header>
      {contributors.length > 0 ? (
        <div style={{ marginTop: 10 }}>
          {contributors.map((cn, i) => (
            <div
              key={`${cn.role}-${cn.label}-${i}`}
              style={{
                paddingBottom: 10,
                marginBottom: 10,
                borderBottom:
                  i < contributors.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.65)",
                }}
              >
                {cn.role}
              </div>
              <div style={{ fontSize: 11, color: "white", fontWeight: 500, marginTop: 1 }}>
                {cn.label}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
                {fmtUsd(cn.rate)}/hr × {cn.hrs} hrs × {cn.weeks} wks
              </div>
              <div style={{ fontSize: 11, color: "white", fontWeight: 500, marginTop: 2 }}>
                = {fmtUsd(cn.revenue)}/yr
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Paragraph>
          Budget revenue is the potential annual revenue if every billable contributor hits
          their target billable hours at their current billed rates (principal billable hours
          are capped at available hours per week).
        </Paragraph>
      )}
      <div
        style={{
          marginTop: 4,
          paddingTop: 8,
          borderTop: "1px solid rgba(255,255,255,0.15)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <span
          style={{
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.35)",
          }}
        >
          Combined budget revenue
        </span>
        <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, color: GOLD }}>
          {fmtUsd(total)}/yr
        </span>
      </div>
      <Paragraph>
        Potential revenue if everyone hits their target billable hours at their billed rates.
      </Paragraph>

      <SectionHead>What this revenue does</SectionHead>
      <RowLine
        label="Covers cost floor"
        value={covers ? "✓ Covered" : "✗ Not covered"}
        valueColor={covers ? GREEN : TERRA}
        hint={covers ? `${fmtUsd(floor)}/yr` : `Shortfall: ${fmtUsd(floor - total)}/yr`}
      />
      <RowLine
        label="Potential margin if targets are hit"
        value={covers ? `${fmtUsd(marginAnnual)}/yr` : `-${fmtUsd(Math.abs(marginAnnual))}/yr`}
        valueColor={covers ? GOLD : TERRA}
        hint={
          covers
            ? `${marginPct}% of budget revenue at billed rates — not your target gross margin %`
            : "Negative margin at billed rates"
        }
      />
      <RowLine
        label="vs. Revenue at aligned rate"
        value={`${fmtUsd(alignedRevenue)}/yr`}
        valueColor="rgba(255,255,255,0.55)"
        hint={
          total < alignedRevenue
            ? `${fmtUsd(alignedRevenue - total)}/yr in uncaptured revenue at your target rate`
            : `+${fmtUsd(total - alignedRevenue)}/yr surplus over aligned target`
        }
        border={false}
      />

      {total < floor ? (
        <Callout tone="critical">
          At your current rate and hours, your firm cannot cover its own cost floor. This is
          the gap that has likely existed for years. Closing it requires raising your rate,
          billing more hours, or reducing your cost structure — or some combination of all three.
        </Callout>
      ) : total < alignedRevenue ? (
        <Callout tone="warn">
          Your firm covers its costs but leaves {fmtUsd(alignedRevenue - total)}/yr in margin
          on the table at your current rate. That gap is profit your firm is entitled to but
          not capturing.
        </Callout>
      ) : (
        <Callout tone="good">
          Your budget revenue exceeds your aligned rate target. Your current setup generates
          the margin your firm needs.
        </Callout>
      )}
    </>
  );
}

/* ────────── main component ────────── */

export function MetricBreakdown({
  metric,
  c,
  cfg,
  targetMarginPct = 0,
  members = [],
  expenses = [],
  contributors = [],
  side = "left",
  iconSize = 14,
}: {
  metric: MetricKind;
  c: Calc;
  cfg?: any;
  targetMarginPct?: number;
  members?: Member[];
  expenses?: Expense[];
  contributors?: RevenueContributor[];
  side?: "left" | "bottom";
  iconSize?: number;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // Broadcast open so other popovers close (one-at-a-time)
    const evt = new CustomEvent("metric-popover-open", { detail: { id: metric } });
    window.dispatchEvent(evt);
    const onOther = (e: Event) => {
      const ce = e as CustomEvent;
      if (ce.detail?.id !== metric) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("metric-popover-open", onOther);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("metric-popover-open", onOther);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open, metric]);

  const posClass = side === "left" ? "right-full mr-2 top-0" : "left-0 top-full mt-2";
  const caret =
    side === "left"
      ? { right: -5, top: 14, borderLeft: `5px solid ${CHARCOAL}`, borderTop: "5px solid transparent", borderBottom: "5px solid transparent" }
      : { top: -5, left: 14, borderBottom: `5px solid ${CHARCOAL}`, borderLeft: "5px solid transparent", borderRight: "5px solid transparent" };

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex items-center align-middle"
    >
      <button
        type="button"
        aria-label={`${LABELS[metric]} breakdown`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="ml-1.5 inline-flex cursor-pointer items-center hover:opacity-80"
        style={{ color: "#C59845" }}
      >
        <Info size={iconSize} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={`${LABELS[metric]} breakdown`}
          onClick={(e) => e.stopPropagation()}
          className={`absolute ${posClass} z-50`}
          style={{
            width: 340,
            maxHeight: "80vh",
            overflowY: "auto",
            background: CHARCOAL,
            border: "1px solid rgba(184,134,11,0.25)",
            borderRadius: 6,
            padding: "18px 20px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
            color: "white",
            fontFamily: "Jost, sans-serif",
            animation: "mb-fade 150ms ease both",
          }}
        >
          <span className="absolute w-0 h-0" style={caret} />
          <style>{`@keyframes mb-fade { from { opacity: 0; transform: translateY(4px);} to { opacity: 1; transform: translateY(0);} }`}</style>

          {metric === "billed" && <BilledContent c={c} targetMarginPct={targetMarginPct} />}
          {metric === "health" && <HealthContent c={c} targetMarginPct={targetMarginPct} />}
          {metric === "margin" && <MarginContent c={c} targetMarginPct={targetMarginPct} />}
          {metric === "breakeven" && <BreakevenContent c={c} cfg={cfg} />}
          {metric === "cost_floor" && <CostFloorContent c={c} members={members} expenses={expenses} />}
          {metric === "budget_revenue" && (
            <BudgetRevenueContent c={c} contributors={contributors} />
          )}

          <ClosingLine />
        </div>
      )}
    </span>
  );
}