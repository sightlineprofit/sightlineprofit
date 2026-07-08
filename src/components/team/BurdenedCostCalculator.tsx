import { useEffect, useMemo } from "react";
import {
  estimateBurdenedCost,
  type BurdenBasis,
  type BurdenEstimate,
  BURDEN_EMPLOYER_TAX_PCT,
  BURDEN_BENEFITS_PCT,
} from "@/lib/team-cost";

export type BurdenedCostValue = {
  basis: BurdenBasis;
  hourlyRate: string;
  annualSalary: string;
  hoursPerWeek: string;
  hasBenefits: boolean;
  hasRetirement: boolean;
};

export const emptyBurdenedCostValue = (): BurdenedCostValue => ({
  basis: "hourly",
  hourlyRate: "",
  annualSalary: "",
  hoursPerWeek: "40",
  hasBenefits: false,
  hasRetirement: false,
});

type Props = {
  value: BurdenedCostValue;
  onChange: (next: BurdenedCostValue) => void;
  /** Called whenever the computed estimate changes. Locked to formula output. */
  onEstimate?: (est: BurdenEstimate) => void;
  /** Optional heading override — hide the built-in header if false. */
  showHeader?: boolean;
};

/**
 * Simplified burdened-cost calculator. Locked to formula output — the
 * estimate is derived, never manually editable. Users adjust inputs to
 * change the result. Advanced overrides live in Settings → Team Cost.
 */
export function BurdenedCostCalculator({
  value,
  onChange,
  onEstimate,
  showHeader = true,
}: Props) {
  const est = useMemo(
    () =>
      estimateBurdenedCost({
        basis: value.basis,
        hourlyRate: Number(value.hourlyRate) || 0,
        annualSalary: Number(value.annualSalary) || 0,
        hoursPerWeek: Number(value.hoursPerWeek) || 0,
        hasBenefits: value.hasBenefits,
        hasRetirement: value.hasRetirement,
      }),
    [value],
  );

  useEffect(() => {
    onEstimate?.(est);
    // onEstimate is a caller callback — depend only on the estimate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [est.total, est.base, est.taxAmount, est.benefitsAmount, est.perHour]);

  const set = (patch: Partial<BurdenedCostValue>) => onChange({ ...value, ...patch });

  const labelCls =
    "block text-[10px] font-medium uppercase tracking-[0.14em] text-ch/60 mb-1";
  const inputCls =
    "w-full rounded border border-border bg-white px-3 py-2 text-sm text-ch focus:outline-none focus:ring-1 focus:ring-gold/40";

  return (
    <div className="rounded-md border border-border bg-creamd/40 p-4">
      {showHeader && (
        <div className="mb-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-ch/60">
            Burdened cost estimate
          </div>
          <p className="mt-1 text-[11px] text-ch/60" style={{ fontFamily: "Jost, sans-serif" }}>
            We'll estimate this team member's fully burdened cost from a few basic
            inputs — employer payroll tax and typical benefits load are added
            automatically.
          </p>
        </div>
      )}

      {/* Basis toggle */}
      <div className="mb-3 inline-flex rounded border border-border bg-white p-0.5">
        {(["hourly", "salary"] as BurdenBasis[]).map((b) => {
          const active = value.basis === b;
          return (
            <button
              key={b}
              type="button"
              onClick={() => set({ basis: b })}
              className={`px-3 py-1 text-[11px] uppercase tracking-[0.14em] rounded ${
                active ? "bg-gold/15 text-ch" : "text-ch/55 hover:text-ch"
              }`}
              style={{ fontFamily: "Jost, sans-serif" }}
            >
              {b === "hourly" ? "Hourly" : "Salary"}
            </button>
          );
        })}
      </div>

      {value.basis === "hourly" ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Hourly rate</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ch/40">
                $
              </span>
              <input
                className={`${inputCls} pl-7`}
                inputMode="decimal"
                value={value.hourlyRate}
                onChange={(e) => set({ hourlyRate: e.target.value })}
                placeholder="25"
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Hours / week</label>
            <input
              className={inputCls}
              inputMode="decimal"
              value={value.hoursPerWeek}
              onChange={(e) => set({ hoursPerWeek: e.target.value })}
              placeholder="40"
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Annual salary</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ch/40">
                $
              </span>
              <input
                className={`${inputCls} pl-7`}
                inputMode="decimal"
                value={value.annualSalary}
                onChange={(e) => set({ annualSalary: e.target.value })}
                placeholder="65000"
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Hours / week</label>
            <input
              className={inputCls}
              inputMode="decimal"
              value={value.hoursPerWeek}
              onChange={(e) => set({ hoursPerWeek: e.target.value })}
              placeholder="40"
            />
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        <label className="inline-flex items-center gap-2 text-[12px] text-ch">
          <input
            type="checkbox"
            checked={value.hasBenefits}
            onChange={(e) => set({ hasBenefits: e.target.checked })}
          />
          Offers health / dental / vision
        </label>
        <label className="inline-flex items-center gap-2 text-[12px] text-ch">
          <input
            type="checkbox"
            checked={value.hasRetirement}
            onChange={(e) => set({ hasRetirement: e.target.checked })}
          />
          Contributes to retirement
        </label>
      </div>

      {/* Locked estimate output */}
      <div
        className="mt-4"
        style={{ background: "rgba(184,134,11,0.05)", borderRadius: 6, padding: "12px 14px" }}
      >
        <div
          style={{
            fontFamily: "Jost, sans-serif",
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "rgba(44,44,44,0.55)",
          }}
        >
          Estimated fully burdened cost
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <span
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 26,
              color: "#2C2C2C",
            }}
            className="tabular-nums"
          >
            ${Math.round(est.total).toLocaleString()}/yr
          </span>
          {est.perHour > 0 && (
            <span
              className="tabular-nums"
              style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: "#B8860B" }}
            >
              ${est.perHour.toFixed(2)}/hr burdened
            </span>
          )}
        </div>
        <ul
          className="mt-2 space-y-[3px]"
          style={{ fontFamily: "Jost, sans-serif", fontSize: 10, color: "#2C2C2C" }}
        >
          <Row label="Annual base" value={est.base} />
          <Row
            label={`Employer payroll tax (${BURDEN_EMPLOYER_TAX_PCT}%)`}
            value={est.taxAmount}
          />
          {est.benefitsAmount > 0 && (
            <Row
              label={`Benefits + retirement (${BURDEN_BENEFITS_PCT}%)`}
              value={est.benefitsAmount}
            />
          )}
        </ul>
        <p
          className="mt-2 italic"
          style={{
            fontFamily: "Jost, sans-serif",
            fontSize: 10,
            color: "#8A7F75",
            lineHeight: 1.5,
          }}
        >
          Calculated from your inputs. To change the estimate, adjust the wage,
          hours, or benefits above.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex justify-between">
      <span className="text-ch/60">{label}</span>
      <span className="text-ch tabular-nums">${Math.round(value).toLocaleString()}/yr</span>
    </li>
  );
}