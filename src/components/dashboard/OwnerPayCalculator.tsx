import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DollarSign } from "lucide-react";
import { getOwnerPayCalc, fmtUsd, type OwnerPayCalcResult } from "@/lib/finance";
import { logOwnerDraw } from "@/lib/firm.functions";
import { getTimeLogFraming, showOwnerPayTimeNote } from "@/lib/time-framing";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const CHARCOAL = "var(--charcoal, #2C2C2C)";
const GOLD = "var(--gold, #B8860B)";
const CREAM = "var(--cream, #FAF7F2)";
const SAGE = "var(--sage, #5C8A6E)";
const TERRA = "var(--terra, #C4714A)";
const MUTED = "var(--muted, #6B6259)";
const MUTED_LT = "var(--muted-lt, #8A7F75)";
const BORDER = "var(--border, rgba(44,44,44,0.10))";

function monthLabel(month: number, year: number) {
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function monthShort(month: number) {
  return new Date(2000, month - 1, 1).toLocaleDateString("en-US", { month: "long" });
}

function totalColor(total: number, target: number) {
  if (total >= target) return SAGE;
  if (total >= target * 0.75) return GOLD;
  return TERRA;
}

function CalcRow({
  label,
  value,
  sub,
  valueColor = CHARCOAL,
  heavy,
}: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
  heavy?: boolean;
}) {
  return (
    <div
      className="flex items-start justify-between gap-3 py-1.5"
      style={{ borderBottom: heavy ? "0.5px solid rgba(44,44,44,0.15)" : `0.5px solid ${BORDER}` }}
    >
      <div>
        <div style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: MUTED }}>{label}</div>
        {sub ? (
          <div style={{ fontFamily: "Jost, sans-serif", fontSize: 10, color: MUTED_LT, marginTop: 2 }}>{sub}</div>
        ) : null}
      </div>
      <div
        style={{
          fontFamily: "Jost, sans-serif",
          fontSize: heavy ? 13 : 12,
          fontWeight: heavy ? 500 : 400,
          color: valueColor,
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function LogDrawModal({
  open,
  onOpenChange,
  defaultType,
  defaultAmount,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultType: "salary" | "distribution";
  defaultAmount: number;
  onSaved: () => void;
}) {
  const [drawType, setDrawType] = useState<"salary" | "distribution">(defaultType);
  const [amount, setAmount] = useState("");
  const [drawDate, setDrawDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const logFn = useServerFn(logOwnerDraw);

  const reset = () => {
    setDrawType(defaultType);
    setAmount(defaultAmount > 0 ? String(Math.round(defaultAmount)) : "");
    setDrawDate(new Date().toISOString().slice(0, 10));
    setNotes("");
  };

  const save = async () => {
    const n = Number(amount);
    if (!n || n <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      await logFn({
        data: {
          draw_date: drawDate,
          amount: n,
          draw_type: drawType,
          notes: notes.trim() || null,
        },
      });
      toast.success(`${fmtUsd(n)} ${drawType} logged.`, { duration: 4000 });
      onOpenChange(false);
      onSaved();
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save draw");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v) reset();
      }}
    >
      <DialogContent className="max-w-[440px] rounded-xl border bg-white p-7 sm:p-8">
        <h3
          style={{
            fontFamily: "var(--font-voice, 'Cormorant Garamond', Georgia, serif)",
            fontSize: 20,
            color: CHARCOAL,
            marginBottom: 20,
          }}
        >
          Log a draw
        </h3>

        <div className="mb-4 flex gap-2">
          {(["salary", "distribution"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setDrawType(t)}
              className="flex-1 rounded-md px-3 py-2 capitalize"
              style={{
                fontFamily: "Jost, sans-serif",
                fontSize: 12,
                fontWeight: 500,
                background: drawType === t ? CHARCOAL : CREAM,
                color: drawType === t ? "white" : MUTED_LT,
                border: `0.5px solid ${BORDER}`,
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <label className="mb-3 block">
          <span style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: MUTED }}>Amount</span>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1" />
        </label>

        <label className="mb-3 block">
          <span style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: MUTED }}>Date</span>
          <Input type="date" value={drawDate} onChange={(e) => setDrawDate(e.target.value)} className="mt-1" />
        </label>

        <label className="mb-5 block">
          <span style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: MUTED }}>Notes (optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
          />
        </label>

        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="w-full rounded-lg py-3"
          style={{ background: CHARCOAL, color: "white", fontFamily: "Jost, sans-serif", fontSize: 13, fontWeight: 500 }}
        >
          {saving ? "Saving…" : "Save draw →"}
        </button>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="mt-3 w-full text-center underline"
          style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: MUTED_LT }}
        >
          Cancel
        </button>
      </DialogContent>
    </Dialog>
  );
}

export function OwnerPayCalculator({
  firmId,
  firstActiveProjectId,
  firstActiveProjectName,
  pricingStructure = null,
  className,
  variant = "panel",
}: {
  firmId: string;
  firstActiveProjectId?: string;
  firstActiveProjectName?: string;
  pricingStructure?: string | null;
  className?: string;
  variant?: "panel" | "tile";
}) {
  const ownerFraming = getTimeLogFraming(pricingStructure);
  const now = new Date();
  const periodMonth = now.getMonth() + 1;
  const periodYear = now.getFullYear();
  const fetchFn = useServerFn(getOwnerPayCalc);
  const qc = useQueryClient();
  const [detailOpen, setDetailOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logType, setLogType] = useState<"salary" | "distribution">("salary");

  const { data, isLoading } = useQuery({
    queryKey: ["owner-pay-calc", firmId, periodMonth, periodYear],
    queryFn: () => fetchFn({ data: { firmId, periodMonth, periodYear } }),
  });

  const r = data as OwnerPayCalcResult | undefined;
  const invalidate = () => qc.invalidateQueries({ queryKey: ["owner-pay-calc", firmId] });
  const openLog = (type: "salary" | "distribution") => {
    setLogType(type);
    setLogOpen(true);
  };
  const isTile = variant === "tile";

  if (isLoading || !r) {
    return (
      <div
        className={`border bg-white p-5 ${isTile ? "" : "rounded-xl"} ${className ?? (isTile ? "" : "mt-4")}`}
        style={{ borderColor: BORDER, borderRadius: isTile ? 6 : undefined }}
      >
        <p style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: MUTED_LT }}>Loading pay guidance…</p>
      </div>
    );
  }

  if (isTile) {
    return (
      <section className={className}>
        <div className="border bg-white" style={{ borderColor: BORDER, borderRadius: 6, padding: "12px 16px" }}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p
              style={{
                fontFamily: "Jost, sans-serif",
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                color: MUTED_LT,
              }}
            >
              What to pay yourself
            </p>
            <p style={{ fontFamily: "Jost, sans-serif", fontSize: 10, color: MUTED_LT }}>
              {monthLabel(periodMonth, periodYear)}
            </p>
          </div>

          {!r.hasCollectionData && !r.hasDrawHistory ? (
            <p
              style={{
                fontFamily: "var(--font-voice, 'Cormorant Garamond', Georgia, serif)",
                fontSize: 13,
                fontStyle: "italic",
                color: MUTED_LT,
                lineHeight: 1.55,
              }}
            >
              Record project payments in Sightline to see monthly pay guidance.{" "}
              {firstActiveProjectId ? (
                <Link to="/sightline" search={{ openProject: firstActiveProjectId }} style={{ color: GOLD }}>
                  Record payment →
                </Link>
              ) : (
                <Link to="/sightline" style={{ color: GOLD }}>
                  Open Sightline →
                </Link>
              )}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-1.5">
                <div style={{ background: CREAM, borderRadius: 4, padding: "6px 8px" }}>
                  <p style={{ fontSize: 9, color: MUTED_LT, marginBottom: 2 }}>Salary</p>
                  <p style={{ fontFamily: "Jost, sans-serif", fontSize: 12, fontWeight: 500, color: CHARCOAL }}>
                    {fmtUsd(r.monthlySalaryTarget)}
                  </p>
                  <p style={{ fontSize: 9, color: MUTED_LT, marginTop: 2 }}>fixed this month</p>
                </div>
                <div style={{ background: CREAM, borderRadius: 4, padding: "6px 8px" }}>
                  <p style={{ fontSize: 9, color: MUTED_LT, marginBottom: 2 }}>Distribution</p>
                  <p
                    style={{
                      fontFamily: "Jost, sans-serif",
                      fontSize: 12,
                      fontWeight: 500,
                      color: r.safeToDrawDist > 0 ? SAGE : MUTED_LT,
                    }}
                  >
                    {r.safeToDrawDist > 0 ? fmtUsd(r.safeToDrawDist) : "—"}
                  </p>
                  <p style={{ fontSize: 9, color: MUTED_LT, marginTop: 2 }}>
                    {r.safeToDrawDist > 0 ? "safe to draw" : "not yet available"}
                  </p>
                  {r.distributionTaxReserveAnnual > 0 && (
                    <p style={{ fontFamily: "Jost, sans-serif", fontSize: 11, fontStyle: "italic", color: MUTED_LT, marginTop: 6, lineHeight: 1.5 }}>
                      ~{fmtUsd(r.distributionTaxReserveAnnual / 12)}/mo tax reserve
                    </p>
                  )}
                </div>
                <div style={{ background: CREAM, borderRadius: 4, padding: "6px 8px" }}>
                  <p style={{ fontSize: 9, color: MUTED_LT, marginBottom: 2 }}>Total</p>
                  <p
                    style={{
                      fontFamily: "Jost, sans-serif",
                      fontSize: 12,
                      fontWeight: 500,
                      color: totalColor(r.safeToDrawTotal, r.monthlyCompTarget),
                    }}
                  >
                    {fmtUsd(r.safeToDrawTotal)}
                  </p>
                  <p style={{ fontSize: 9, color: MUTED_LT, marginTop: 2 }}>
                    {r.monthlyGap >= 0 ? "at target" : `${fmtUsd(Math.abs(r.monthlyGap))} below`}
                  </p>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => openLog("salary")}
                  style={{ fontFamily: "Jost, sans-serif", fontSize: 10, color: GOLD, background: "none", border: "none", padding: 0, cursor: "pointer" }}
                  className="hover:underline"
                >
                  Log salary →
                </button>
                {r.safeToDrawDist > 0 && (
                  <button
                    type="button"
                    onClick={() => openLog("distribution")}
                    style={{ fontFamily: "Jost, sans-serif", fontSize: 10, color: GOLD, background: "none", border: "none", padding: 0, cursor: "pointer" }}
                    className="hover:underline"
                  >
                    Log distribution →
                  </button>
                )}
              </div>

              {showOwnerPayTimeNote(pricingStructure) && ownerFraming.ownerNote ? (
                <div
                  className="mt-2.5 rounded-md px-3.5 py-2.5"
                  style={{ background: "rgba(184,134,11,0.06)" }}
                >
                  <p
                    style={{
                      fontFamily: "Jost, sans-serif",
                      fontSize: 12,
                      fontStyle: "italic",
                      color: "#7a5c1e",
                      lineHeight: 1.6,
                    }}
                  >
                    {ownerFraming.ownerNote}
                  </p>
                </div>
              ) : null}
            </>
          )}
        </div>

        <LogDrawModal
          open={logOpen}
          onOpenChange={setLogOpen}
          defaultType={logType}
          defaultAmount={logType === "salary" ? r.monthlySalaryTarget : r.safeToDrawDist}
          onSaved={invalidate}
        />
      </section>
    );
  }

  return (
    <section className={className ?? "mt-4"}>
      <div className="mb-3 flex items-center justify-between">
        <p style={{ fontFamily: "Jost, sans-serif", fontSize: 11, fontWeight: 500, letterSpacing: "0.10em", textTransform: "uppercase", color: MUTED_LT }}>
          What to pay yourself
        </p>
        <p style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: MUTED_LT }}>{monthLabel(periodMonth, periodYear)}</p>
      </div>

      <div className="rounded-xl border bg-white px-5 py-5 sm:px-[22px]" style={{ borderColor: BORDER }}>
        {!r.hasCollectionData && !r.hasDrawHistory ? (
          <div className="rounded-lg px-5 py-5 text-center" style={{ background: "rgba(44,44,44,0.02)" }}>
            <DollarSign className="mx-auto mb-2 h-6 w-6" style={{ color: MUTED_LT }} />
            <p style={{ fontFamily: "var(--font-voice, 'Cormorant Garamond', Georgia, serif)", fontSize: 15, fontStyle: "italic", color: MUTED_LT, lineHeight: 1.7 }}>
              Start recording payments to see what you can responsibly pay yourself each month.
            </p>
            {firstActiveProjectId ? (
              <Link
                to="/sightline"
                search={{ openProject: firstActiveProjectId }}
                className="mt-3 inline-block underline"
                style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: GOLD }}
              >
                Record payment{firstActiveProjectName ? ` on ${firstActiveProjectName}` : ""} →
              </Link>
            ) : (
              <Link
                to="/sightline"
                className="mt-3 inline-block underline"
                style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: GOLD }}
              >
                Open Sightline and select a project →
              </Link>
            )}
            <p style={{ fontFamily: "Jost, sans-serif", fontSize: 10, color: MUTED_LT, marginTop: 8 }}>
              Payment status appears at the top of each project in Sightline.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="rounded-[10px] p-4" style={{ background: CREAM }}>
                <p style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED_LT, marginBottom: 6 }}>Salary</p>
                <p style={{ fontFamily: "var(--font-voice, 'Cormorant Garamond', Georgia, serif)", fontSize: 26, color: CHARCOAL }}>{fmtUsd(r.monthlySalaryTarget)}</p>
                <p style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: MUTED_LT, marginTop: 3 }}>this month · fixed</p>
                <p style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: MUTED_LT, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>
                  Pay on your regular schedule regardless of revenue.
                </p>
              </div>
              <div className="rounded-[10px] p-4" style={{ background: CREAM }}>
                <p style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED_LT, marginBottom: 6 }}>Distribution</p>
                {r.safeToDrawDist > 0 ? (
                  <>
                    <p style={{ fontFamily: "var(--font-voice, 'Cormorant Garamond', Georgia, serif)", fontSize: 26, color: SAGE }}>{fmtUsd(r.safeToDrawDist)}</p>
                    <p style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: MUTED_LT, marginTop: 3 }}>available to draw this month</p>
                    <button type="button" onClick={() => setDetailOpen((v) => !v)} className="mt-2 underline" style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: GOLD, cursor: "pointer" }}>
                      See how this is calculated ↓
                    </button>
                  </>
                ) : (
                  <>
                    <p style={{ fontFamily: "var(--font-voice, 'Cormorant Garamond', Georgia, serif)", fontSize: 18, color: MUTED_LT }}>Not yet available</p>
                    <p style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: MUTED_LT, fontStyle: "italic", marginTop: 3 }}>
                      firm hasn&apos;t generated sufficient profit this month
                    </p>
                  </>
                )}
                {r.distributionTaxReserveAnnual > 0 && (
                  <p style={{ fontFamily: "Jost, sans-serif", fontSize: 11, fontStyle: "italic", color: MUTED_LT, marginTop: 6, lineHeight: 1.5 }}>
                    Your firm is setting aside ~{fmtUsd(r.distributionTaxReserveAnnual / 12)}/month toward income tax on distributions.
                  </p>
                )}
              </div>
            </div>

            {detailOpen && (
              <div className="mb-2.5 rounded-lg px-4 py-3.5" style={{ background: "rgba(44,44,44,0.02)" }}>
                <p style={{ fontFamily: "Jost, sans-serif", fontSize: 12, fontWeight: 500, color: CHARCOAL, marginBottom: 10 }}>How this is calculated</p>
                <CalcRow label="Collected this month" value={fmtUsd(r.collectedThisMonth)} />
                <CalcRow label="Less: salary obligation" value={`−${fmtUsd(r.monthlySalaryTarget)}`} valueColor={MUTED} />
                <CalcRow label="Less: operating expenses" value={`−${fmtUsd(r.monthlyOpex)}`} sub={`${fmtUsd(r.totalOpex)} ÷ 12`} valueColor={MUTED} />
                {r.monthlyTeamCost > 0 && (
                  <CalcRow label="Less: team cost" value={`−${fmtUsd(r.monthlyTeamCost)}`} sub={`${fmtUsd(r.totalTeamCost)} ÷ 12`} valueColor={MUTED} />
                )}
                <CalcRow label="Gross margin this month" value={fmtUsd(r.grossMarginThisMonth)} heavy />
                <CalcRow label="Less: tax reserve (~25%)" value={`−${fmtUsd(r.taxReserveThisMonth)}`} valueColor={MUTED_LT} />
                <CalcRow label="Available for distribution" value={fmtUsd(r.availableForDist)} heavy />
                <CalcRow label="Safe to draw (75% buffer)" value={fmtUsd(r.safeToDrawDist)} valueColor={SAGE} heavy />
                <p style={{ fontFamily: "Jost, sans-serif", fontSize: 11, fontStyle: "italic", color: MUTED_LT, marginTop: 8, lineHeight: 1.5 }}>
                  The 25% buffer keeps a reserve for months when revenue is slower. You can always draw less.
                </p>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3.5" style={{ background: "rgba(44,44,44,0.03)" }}>
              <div>
                <p style={{ fontFamily: "Jost, sans-serif", fontSize: 13, fontWeight: 500, color: CHARCOAL }}>Total this month</p>
                <p style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: MUTED_LT }}>salary + distribution</p>
              </div>
              <div className="text-right">
                <p style={{ fontFamily: "var(--font-voice, 'Cormorant Garamond', Georgia, serif)", fontSize: 28, color: totalColor(r.safeToDrawTotal, r.monthlyCompTarget) }}>
                  {fmtUsd(r.safeToDrawTotal)}
                </p>
                {r.monthlyGap >= 0 ? (
                  <p style={{ fontFamily: "Jost, sans-serif", fontSize: 10, color: SAGE }}>↑ At target</p>
                ) : (
                  <p style={{ fontFamily: "Jost, sans-serif", fontSize: 10, color: GOLD }}>
                    ↓ {fmtUsd(Math.abs(r.monthlyGap))} below {fmtUsd(r.monthlyCompTarget)} target
                  </p>
                )}
              </div>
            </div>

            <div className="mt-2.5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openLog("salary")}
                className="rounded-md border bg-white px-4 py-2"
                style={{ fontFamily: "Jost, sans-serif", fontSize: 12, fontWeight: 500, borderColor: "rgba(44,44,44,0.18)", color: CHARCOAL }}
              >
                Log salary drawn →
              </button>
              {r.safeToDrawDist > 0 && (
                <button
                  type="button"
                  onClick={() => openLog("distribution")}
                  className="rounded-md border bg-white px-4 py-2"
                  style={{ fontFamily: "Jost, sans-serif", fontSize: 12, fontWeight: 500, borderColor: "rgba(44,44,44,0.18)", color: CHARCOAL }}
                >
                  Log distribution →
                </button>
              )}
            </div>

            {showOwnerPayTimeNote(pricingStructure) && ownerFraming.ownerNote ? (
              <div
                className="mt-2.5 rounded-md px-3.5 py-2.5"
                style={{ background: "rgba(184,134,11,0.06)" }}
              >
                <p
                  style={{
                    fontFamily: "Jost, sans-serif",
                    fontSize: 12,
                    fontStyle: "italic",
                    color: "#7a5c1e",
                    lineHeight: 1.6,
                  }}
                >
                  {ownerFraming.ownerNote}
                </p>
              </div>
            ) : null}

            <div style={{ borderTop: `0.5px solid ${BORDER}`, margin: "16px 0" }} />

            <p style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED_LT, marginBottom: 12 }}>Year to date</p>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div className="rounded-[10px] p-3.5" style={{ background: CREAM }}>
                <p style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED_LT, marginBottom: 6 }}>Drawn so far</p>
                <p
                  style={{
                    fontFamily: "var(--font-voice, 'Cormorant Garamond', Georgia, serif)",
                    fontSize: 22,
                    color: r.onTrackForAnnualTarget ? SAGE : GOLD,
                  }}
                >
                  {fmtUsd(r.ytdTotalDrawn)}
                </p>
                <p style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: MUTED_LT, marginTop: 3 }}>salary + distributions</p>
              </div>
              <div className="rounded-[10px] p-3.5" style={{ background: CREAM }}>
                <p style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED_LT, marginBottom: 6 }}>YTD target</p>
                <p style={{ fontFamily: "var(--font-voice, 'Cormorant Garamond', Georgia, serif)", fontSize: 22, color: CHARCOAL }}>{fmtUsd(r.ytdCompTarget)}</p>
                <p style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: MUTED_LT, marginTop: 3 }}>through {monthShort(periodMonth)}</p>
              </div>
              <div className="rounded-[10px] p-3.5" style={{ background: CREAM }}>
                <p style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED_LT, marginBottom: 6 }}>YTD gap</p>
                <p
                  style={{
                    fontFamily: "var(--font-voice, 'Cormorant Garamond', Georgia, serif)",
                    fontSize: 22,
                    color: r.ytdGap >= 0 ? SAGE : GOLD,
                  }}
                >
                  {fmtUsd(Math.abs(r.ytdGap))}
                </p>
                <p style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: MUTED_LT, marginTop: 3 }}>
                  {r.ytdGap >= 0 ? "ahead of target" : "behind target"}
                </p>
              </div>
            </div>

            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between">
                <span style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: MUTED }}>Compensation drawn</span>
                <span style={{ fontFamily: "Jost, sans-serif", fontSize: 11, color: MUTED_LT }}>
                  {fmtUsd(r.ytdTotalDrawn)} of {fmtUsd(r.ytdCompTarget)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full" style={{ background: CREAM }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${r.ytdCompTarget > 0 ? Math.min(100, (r.ytdTotalDrawn / r.ytdCompTarget) * 100) : 0}%`,
                    background: r.onTrackForAnnualTarget ? SAGE : GOLD,
                  }}
                />
              </div>
            </div>

            <p
              style={{
                fontFamily: "var(--font-voice, 'Cormorant Garamond', Georgia, serif)",
                fontSize: 13,
                fontStyle: "italic",
                color: MUTED,
                lineHeight: 1.75,
                marginTop: 12,
              }}
            >
              {r.onTrackForAnnualTarget ? (
                <>
                  At your current pace you&apos;re projected to draw {fmtUsd(r.projectedAnnualDraw)} this year — on track to reach your{" "}
                  {fmtUsd(r.annualCompTarget)} target.
                </>
              ) : (
                <>
                  To hit your {fmtUsd(r.annualCompTarget)} target by December, you need to draw {fmtUsd(r.drawNeededPerMonth)}/month for the rest of
                  the year — which requires generating at least {fmtUsd(r.revenueNeededPerMonth)} in collected revenue each month.
                </>
              )}
            </p>
          </>
        )}
      </div>

      <LogDrawModal open={logOpen} onOpenChange={setLogOpen} defaultType={logType} defaultAmount={logType === "salary" ? r.monthlySalaryTarget : r.safeToDrawDist} onSaved={invalidate} />
    </section>
  );
}
