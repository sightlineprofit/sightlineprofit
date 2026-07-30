import type { ReactNode } from "react";
import { fmtUsd } from "@/lib/finance";
import type { calc } from "@/lib/finance";
import { DistributionTaxInsightTip } from "@/components/compensation/DistributionTaxExpansion";

const CHARCOAL = "#2C2C2C";
const GOLD = "#B8860B";
const CREAM = "#FAF7F2";
const SAGE = "#5C8A6E";
const TERRA = "#C4714A";
const MUTED = "#6B6259";
const MUTED_LT = "#8A7F75";
const BORDER = "rgba(44,44,44,0.10)";

export type UnderstandYourNumbersProps = {
  breakEvenRate: number;
  alignedRate: number;
  compPerHour: number;
  opexPerHour: number;
  teamPerHour: number;
  targetMarginPct: number;
  annualBillableHrs: number;
  includesTeamCapacity?: boolean;
  salary: number;
  distributions: number;
  seTax: number;
  healthInsurance: number;
  retirement: number;
  distributionTaxReserve?: number;
  distributionTaxRate?: number | null;
  totalOwnerComp: number;
  totalOpex: number;
  totalTeamCost: number;
  teamMembers: { name: string; burdenedCost: number }[];
};

type Calc = ReturnType<typeof calc>;

export function understandPropsFromCalc(
  c: Calc,
  members: any[],
  targetMarginPct: number,
): UnderstandYourNumbersProps {
  const hrs = c.annualBillableHrs || 1;
  const totalOpex = (c.opexRecurring || 0) + (c.opexOneTime || 0);
  const includesTeamCapacity = (members ?? []).some(
    (m: any) => m?.role_type !== "principal" && m?.is_active !== false,
  );
  const teamMembers = (members ?? [])
    .filter((m: any) => m?.role_type !== "principal" && Number(m?.burdened_weekly_cost) > 0)
    .map((m: any) => ({
      name: (m.name as string) || "Team member",
      burdenedCost: (Number(m.burdened_weekly_cost) || 0) * (Number(m.weeks_per_year) || c.weeksPerYear || 48),
    }));

  return {
    breakEvenRate: c.breakEvenRate || 0,
    alignedRate: c.alignedRate || 0,
    compPerHour: c.perHour.comp || 0,
    opexPerHour: totalOpex / hrs,
    teamPerHour: (c.teamCostTotal || 0) / hrs,
    targetMarginPct,
    annualBillableHrs: c.annualBillableHrs || 0,
    includesTeamCapacity,
    salary: c.draw || 0,
    distributions: c.distribution || 0,
    seTax: c.ptax || 0,
    healthInsurance: c.health || 0,
    retirement: c.retire || 0,
    distributionTaxReserve: c.distributionTaxReserve || 0,
    distributionTaxRate: c.distributionTaxRate ?? null,
    totalOwnerComp: c.compTotal || 0,
    totalOpex,
    totalTeamCost: c.teamCostTotal || 0,
    teamMembers,
  };
}

function PerHourRow({
  label,
  value,
  barPct,
  barColor,
  sub,
  labelExtra,
}: {
  label: string;
  value: string;
  barPct: number;
  barColor: string;
  sub?: string;
  labelExtra?: ReactNode;
}) {
  return (
    <div className="py-1.5" style={{ borderBottom: `0.5px solid ${BORDER}` }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1" style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: MUTED }}>
            {label}
            {labelExtra}
          </span>
          {sub ? (
            <div style={{ fontFamily: "Jost, sans-serif", fontSize: 10, color: MUTED_LT, marginTop: 2 }}>{sub}</div>
          ) : null}
        </div>
        <span style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: CHARCOAL, whiteSpace: "nowrap" }}>{value}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(44,44,44,0.06)" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, barPct)}%`, background: barColor }} />
      </div>
    </div>
  );
}

export function UnderstandYourNumbers(
  props: UnderstandYourNumbersProps & { className?: string; variant?: "panel" | "tile" | "embedded" },
) {
  const {
    breakEvenRate,
    alignedRate,
    compPerHour,
    opexPerHour,
    teamPerHour,
    targetMarginPct,
    salary,
    distributions,
    seTax,
    healthInsurance,
    retirement,
    distributionTaxReserve = 0,
    distributionTaxRate = null,
    totalOwnerComp,
    totalOpex,
    totalTeamCost,
    teamMembers,
    className,
    variant = "panel",
    includesTeamCapacity = false,
  } = props;

  const isFirmTotal = includesTeamCapacity;
  const isTile = variant === "tile";
  const isEmbedded = variant === "embedded";
  const hourLabel = "billable hour";

  const marginPerHr = Math.max(0, alignedRate - breakEvenRate);
  const denom = Math.max(alignedRate, breakEvenRate, 1);

  const stackSegs = [
    { label: "Compensation", val: compPerHour, color: GOLD },
    { label: "Operating expenses", val: opexPerHour, color: SAGE },
    { label: "Team cost", val: teamPerHour, color: TERRA },
    { label: "Margin", val: marginPerHr, color: "rgba(184,134,11,0.45)" },
  ].filter((s) => s.val > 0);
  const stackTotal = stackSegs.reduce((s, x) => s + x.val, 0) || alignedRate || 1;

  const ownerLines = [
    salary > 0 ? { label: "Salary / draw", annual: salary } : null,
    distributions > 0 ? { label: "Distributions", annual: distributions } : null,
    seTax > 0 ? { label: "Payroll / SE tax", annual: seTax } : null,
    healthInsurance > 0 ? { label: "Health insurance", annual: healthInsurance } : null,
    retirement > 0 ? { label: "Retirement", annual: retirement } : null,
  ].filter(Boolean) as Array<{ label: string; annual: number }>;

  const body = (
    <>
      {!isEmbedded && (
        <>
          <p
            style={{
              fontFamily: "Jost, sans-serif",
              fontSize: isTile ? 10 : 11,
              fontWeight: 500,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              color: MUTED_LT,
              marginBottom: isTile ? 2 : 4,
            }}
          >
            Understand your numbers
          </p>
          <p
            style={{
              fontFamily: "var(--font-voice, 'Cormorant Garamond', Georgia, serif)",
              fontSize: isTile ? 15 : 17,
              color: CHARCOAL,
              marginBottom: isTile ? 10 : 16,
            }}
          >
            Where each {hourLabel} goes
            {isFirmTotal ? (
              <span
                className="block text-[11px] font-normal not-italic"
                style={{ fontFamily: "Jost, sans-serif", color: MUTED_LT, marginTop: 4 }}
              >
                {Math.round(props.annualBillableHrs).toLocaleString()} hrs/yr across your firm
              </span>
            ) : null}
          </p>
        </>
      )}

      {isEmbedded && (
        <p
          style={{
            fontFamily: "var(--font-voice, 'Cormorant Garamond', Georgia, serif)",
            fontSize: 15,
            color: CHARCOAL,
            marginBottom: 10,
          }}
        >
          Where each {hourLabel} goes
          {isFirmTotal ? (
            <span
              className="block text-[11px] font-normal not-italic"
              style={{ fontFamily: "Jost, sans-serif", color: MUTED_LT, marginTop: 4 }}
            >
              {Math.round(props.annualBillableHrs).toLocaleString()} hrs/yr across your firm
            </span>
          ) : null}
        </p>
      )}

      <div className="mb-4 flex h-2.5 overflow-hidden rounded-full" style={{ background: CREAM }}>
        {stackSegs.map((s) => (
          <div
            key={s.label}
            title={`${s.label}: ${fmtUsd(s.val, { decimals: 2 })}/hr`}
            style={{
              width: `${(s.val / stackTotal) * 100}%`,
              background: s.color,
            }}
          />
        ))}
      </div>

      <div className="mb-3">
        <PerHourRow
          label="Your compensation (total)"
          value={`${fmtUsd(compPerHour, { decimals: 2 })}/hr`}
          barPct={(compPerHour / denom) * 100}
          barColor={GOLD}
          sub={totalOwnerComp > 0 ? `${fmtUsd(totalOwnerComp)} ÷ year` : undefined}
        />
        {ownerLines.map((line) => (
          <PerHourRow
            key={line.label}
            label={line.label}
            value={`${fmtUsd(line.annual / Math.max(props.annualBillableHrs, 1), { decimals: 2 })}/hr`}
            barPct={(line.annual / Math.max(props.annualBillableHrs, 1) / denom) * 100}
            barColor="rgba(184,134,11,0.35)"
            sub={fmtUsd(line.annual)}
          />
        ))}
        {distributionTaxReserve > 0 && (
          <PerHourRow
            label="Distribution tax reserve"
            labelExtra={
              <DistributionTaxInsightTip
                distributions={distributions}
                distributionTaxRate={distributionTaxRate}
              />
            }
            value={`${fmtUsd(distributionTaxReserve / Math.max(props.annualBillableHrs, 1), { decimals: 2 })}/hr`}
            barPct={(distributionTaxReserve / Math.max(props.annualBillableHrs, 1) / denom) * 100}
            barColor="rgba(184,134,11,0.35)"
            sub={fmtUsd(distributionTaxReserve)}
          />
        )}
        <PerHourRow
          label="Operating expenses"
          value={`${fmtUsd(opexPerHour, { decimals: 2 })}/hr`}
          barPct={(opexPerHour / denom) * 100}
          barColor={SAGE}
          sub={totalOpex > 0 ? `${fmtUsd(totalOpex)} ÷ year` : undefined}
        />
        {teamPerHour > 0 && (
          <PerHourRow
            label="Team cost"
            value={`${fmtUsd(teamPerHour, { decimals: 2 })}/hr`}
            barPct={(teamPerHour / denom) * 100}
            barColor={TERRA}
            sub={totalTeamCost > 0 ? `${fmtUsd(totalTeamCost)} ÷ year` : undefined}
          />
        )}
        {teamMembers.map((m) => (
          <PerHourRow
            key={m.name}
            label={m.name}
            value={`${fmtUsd(m.burdenedCost / Math.max(props.annualBillableHrs, 1), { decimals: 2 })}/hr`}
            barPct={(m.burdenedCost / Math.max(props.annualBillableHrs, 1) / denom) * 100}
            barColor="rgba(196,113,74,0.45)"
            sub={fmtUsd(m.burdenedCost)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between py-2" style={{ borderTop: `0.5px solid rgba(44,44,44,0.15)` }}>
        <span style={{ fontFamily: "Jost, sans-serif", fontSize: 12, fontWeight: 500, color: CHARCOAL }}>Break-even</span>
        <span style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: CHARCOAL }}>{fmtUsd(breakEvenRate, { decimals: 2 })}/hr</span>
      </div>
      <div className="flex items-center justify-between py-2">
        <span style={{ fontFamily: "Jost, sans-serif", fontSize: 12, fontWeight: 500, color: CHARCOAL }}>
          Margin ({Math.round(targetMarginPct)}% target)
        </span>
        <span style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: SAGE }}>+{fmtUsd(marginPerHr, { decimals: 2 })}/hr</span>
      </div>
      <div className="flex items-center justify-between pt-2" style={{ borderTop: `0.5px solid rgba(44,44,44,0.15)` }}>
        <span style={{ fontFamily: "Jost, sans-serif", fontSize: 13, fontWeight: 500, color: CHARCOAL }}>Aligned rate</span>
        <span
          style={{
            fontFamily: "var(--font-voice, 'Cormorant Garamond', Georgia, serif)",
            fontSize: 24,
            color: CHARCOAL,
          }}
        >
          {fmtUsd(alignedRate, { decimals: 0 })}/hr
        </span>
      </div>

      <p
        style={{
          fontFamily: "var(--font-voice, 'Cormorant Garamond', Georgia, serif)",
          fontSize: isTile ? 12 : 13,
          fontStyle: "italic",
          color: MUTED,
          lineHeight: 1.75,
          marginTop: isTile ? 10 : 14,
        }}
        className={isTile ? "line-clamp-3" : undefined}
      >
        Every {hourLabel} must cover compensation, firm overhead, and team delivery before margin accrues. Your aligned rate of{" "}
        {fmtUsd(alignedRate, { decimals: 0 })}/hr — what you need to earn per hour to hit your goals — is the minimum that funds all three at your{" "}
        {Math.round(targetMarginPct)}% target.
        {isFirmTotal ? (
          <>
            {" "}
            When your average realized rate falls below {fmtUsd(breakEvenRate, { decimals: 0 })}/hr — the minimum to cover your costs — across all the hours
            your firm works, you&apos;re borrowing from one column to cover another.
          </>
        ) : null}
      </p>
    </>
  );

  if (isEmbedded) {
    return <div className={className}>{body}</div>;
  }

  return (
    <div
      className={
        isTile
          ? `border bg-white ${className ?? ""}`
          : `rounded-xl border bg-white px-5 py-5 sm:px-[22px] ${className ?? "mt-4"}`
      }
      style={{
        borderColor: BORDER,
        borderRadius: isTile ? 6 : undefined,
        padding: isTile ? "12px 16px" : undefined,
      }}
    >
      {body}
    </div>
  );
}
