import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  WEEKS_DEFAULT,
  effectivePrincipalBillableHrsWeek,
  memberProductiveHrsWeek,
  type FirmConfig,
} from "@/lib/finance";
import { listFirmMembers, saveFirmMember } from "@/lib/firm.functions";
import { showCostReviewNotifications } from "@/lib/cost-review-notifications";
import type { CostReviewNotifications } from "@/lib/cost-review.utils";
import { applyTeamCapacityFromResult } from "@/lib/team-capacity-notifications";

function applyCostReviewFromResult(result: unknown) {
  if (!result || typeof result !== "object" || !("costReview" in result)) return;
  showCostReviewNotifications(
    (result as { costReview?: CostReviewNotifications | null }).costReview,
  );
}

const CHARCOAL = "#2C2C2C";
const MUTED = "#6B6259";
const MUTED_LT = "#8A7F75";

function activeTeamMembers(members: unknown): any[] {
  return ((members ?? []) as any[]).filter(
    (m) => m.role_type !== "principal" && m.is_active !== false,
  );
}

export function TeamProductiveHoursSection({
  liveConfig,
}: {
  liveConfig: FirmConfig | null;
}) {
  const qc = useQueryClient();
  const listFM = useServerFn(listFirmMembers);
  const saveMember = useServerFn(saveFirmMember);
  const { data: members } = useQuery({ queryKey: ["firmMembers"], queryFn: () => listFM() });

  const team = useMemo(() => activeTeamMembers(members), [members]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const m of team) {
      const val = m.productive_hrs_per_week ?? m.expected_hrs_per_week ?? 40;
      next[m.id] = String(val);
    }
    setDrafts(next);
  }, [team.map((m: any) => `${m.id}:${m.productive_hrs_per_week ?? ""}:${m.expected_hrs_per_week ?? ""}`).join("|")]);

  if (team.length === 0) return null;

  const ownerWeekly = effectivePrincipalBillableHrsWeek(liveConfig);
  const weeksPerYear = WEEKS_DEFAULT;
  const ownerAnnual = ownerWeekly * weeksPerYear;
  const teamAnnual = team.reduce((sum, m: any) => {
    const d = drafts[m.id];
    const hrs =
      d === "" || d == null
        ? memberProductiveHrsWeek({
            productive_hrs_per_week: m.productive_hrs_per_week,
            expected_hrs_per_week: m.expected_hrs_per_week,
          })
        : Number(d) || 0;
    const wks = Number(m.weeks_per_year) || weeksPerYear;
    return sum + hrs * wks;
  }, 0);
  const totalAnnual = ownerAnnual + teamAnnual;

  function scheduleMemberSave(m: any, hrsStr: string) {
    setDrafts((prev) => ({ ...prev, [m.id]: hrsStr }));
    if (timers.current[m.id]) clearTimeout(timers.current[m.id]);
    timers.current[m.id] = setTimeout(async () => {
      const hrsNum = hrsStr === "" ? null : Number(hrsStr);
      try {
        const result = await saveMember({
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
            expected_hrs_per_week: m.expected_hrs_per_week ?? null,
            productive_hrs_per_week: hrsNum,
            weeks_per_year: m.weeks_per_year ?? null,
            billed_rate: m.billed_rate ?? null,
          },
        });
        applyCostReviewFromResult(result);
        applyTeamCapacityFromResult(result);
        qc.invalidateQueries({ queryKey: ["firmMembers"] });
        qc.invalidateQueries({ queryKey: ["dashboard"] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Save failed");
      }
    }, 500);
  }

  return (
    <div className="mt-5 border-t border-border pt-4">
      <p
        className="mb-1"
        style={{
          fontFamily: "'Jost', sans-serif",
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          color: MUTED_LT,
        }}
      >
        Your team&apos;s productive hours
      </p>
      <p
        className="mb-3 text-[11px] leading-relaxed"
        style={{ fontFamily: "'Jost', sans-serif", color: MUTED }}
      >
        Your aligned rate includes your hours plus your team&apos;s client-project time — automatically.
      </p>
      <div className="space-y-2">
        {team.map((m: any) => (
          <div
            key={m.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-white px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <div
                className="truncate text-[12px] font-medium"
                style={{ fontFamily: "'Jost', sans-serif", color: CHARCOAL }}
              >
                {m.name}
              </div>
              <div
                className="text-[11px]"
                style={{ fontFamily: "'Jost', sans-serif", color: MUTED }}
              >
                hrs/week available for client work
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={168}
                className="w-[72px] rounded border border-border px-2 py-1 text-[12px]"
                value={drafts[m.id] ?? "40"}
                onChange={(e) => scheduleMemberSave(m, e.target.value)}
                onBlur={(e) => scheduleMemberSave(m, e.target.value)}
              />
              <span
                className="max-w-[140px] text-[10px] italic leading-snug"
                style={{ fontFamily: "'Jost', sans-serif", color: MUTED_LT }}
              >
                This is how many hours per week {m.name.split(" ")[0]} works on client projects — not total hours
                employed.
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-[12px]" style={{ fontFamily: "'Jost', sans-serif", color: MUTED }}>
        Total firm capacity:{" "}
        <span className="font-medium text-ch">{Math.round(totalAnnual).toLocaleString()} hrs/year</span>
      </p>
    </div>
  );
}
