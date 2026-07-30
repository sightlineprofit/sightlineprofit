import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { computeDistributionTaxReserve, fmtUsd } from "@/lib/finance";
import { InfoTip } from "@/components/dashboard/InfoTip";

const CHARCOAL = "#2C2C2C";
const GOLD = "#B8860B";
const MUTED = "#6B6259";
const MUTED_LT = "#8A7F75";
const GOLD_NOTE = "#7a5c1e";

const sans = { fontFamily: "Jost, sans-serif" } as const;

export function DistributionTaxExpansion({
  distributions,
  distributionTaxRate,
  onRateChange,
  variant = "settings",
}: {
  distributions: number;
  distributionTaxRate: number | null | undefined;
  onRateChange: (rate: number | null) => void;
  variant?: "settings" | "tour";
}) {
  const dist = Number(distributions) || 0;
  const hasSavedRate = distributionTaxRate != null && distributionTaxRate > 0;

  const [expanded, setExpanded] = useState(() => dist > 0 && !hasSavedRate);
  const [draftPct, setDraftPct] = useState<string>(() =>
    hasSavedRate ? String(Math.round(distributionTaxRate! * 100)) : "",
  );

  // When distributions are entered, surface the tax reserve prompt immediately.
  useEffect(() => {
    if (dist > 0 && !hasSavedRate) {
      setExpanded(true);
    }
  }, [dist, hasSavedRate]);

  const rate =
    hasSavedRate
      ? distributionTaxRate!
      : draftPct !== ""
        ? Math.min(60, Math.max(0, Number(draftPct) || 0)) / 100
        : null;
  const { distributionTaxReserve, grossedUpDistributions } = computeDistributionTaxReserve(
    dist,
    rate && rate > 0 ? rate : null,
  );
  const showPreview = dist > 0 && rate != null && rate > 0;
  const rateConfigured = hasSavedRate || (draftPct !== "" && Number(draftPct) > 0);

  const commitPct = (raw: string) => {
    setDraftPct(raw);
    if (raw === "") {
      onRateChange(null);
      return;
    }
    const pct = Math.min(60, Math.max(0, Number(raw) || 0));
    onRateChange(pct > 0 ? pct / 100 : null);
  };

  if (dist <= 0) return null;

  const panelStyle = {
    background: "rgba(184,134,11,0.05)",
    borderColor: rateConfigured ? "rgba(184,134,11,0.28)" : "rgba(184,134,11,0.38)",
  } as const;

  return (
    <div className="mt-2.5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full cursor-pointer rounded-lg border px-3.5 py-3 text-left"
        style={{
          ...panelStyle,
          background: expanded ? panelStyle.background : "rgba(184,134,11,0.08)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p style={{ ...sans, fontSize: 12, fontWeight: 500, color: CHARCOAL }}>
              Income tax on distributions
            </p>
            {!expanded && (
              <p style={{ ...sans, fontSize: 11, color: rateConfigured ? MUTED : GOLD_NOTE, marginTop: 4, lineHeight: 1.55 }}>
                {rateConfigured ? (
                  <>
                    {fmtUsd(distributionTaxReserve)} tax reserve included · firm must generate{" "}
                    {fmtUsd(grossedUpDistributions)} for your {fmtUsd(dist)} take-home
                  </>
                ) : variant === "tour" ? (
                  <>
                    Your {fmtUsd(dist)} distribution is what you keep after tax — the firm&apos;s true cost is
                    higher. Tap to add your effective rate.
                  </>
                ) : (
                  <>
                    Distributions are take-home income. Add your CPA&apos;s effective rate so your cost floor
                    reflects what the firm must actually generate.
                  </>
                )}
              </p>
            )}
          </div>
          {expanded ? (
            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" style={{ color: GOLD }} aria-hidden />
          ) : (
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" style={{ color: GOLD }} aria-hidden />
          )}
        </div>
      </button>

      {expanded && (
        <div
          className="mt-1.5 rounded-lg border px-4 py-3.5"
          style={panelStyle}
        >
          <p
            className="mb-3 leading-relaxed"
            style={{ ...sans, fontSize: 12, color: MUTED, lineHeight: 1.65 }}
          >
            {variant === "tour" ? (
              <>
                If you need {fmtUsd(dist)} per year after paying income tax, your firm actually needs to
                generate more. Enter your estimated tax rate to include the full cost in your compensation
                total.
              </>
            ) : (
              <>
                Distributions are taxed as personal income. If you need {fmtUsd(dist)} after tax, the firm
                must generate more. Enter the effective rate your CPA recommends — this reserve is added to
                your cost floor and aligned rate.
              </>
            )}
          </p>

          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="shrink-0" style={{ ...sans, fontSize: 12, fontWeight: 500, color: CHARCOAL }}>
                Effective income tax rate
              </span>
              <input
                type="number"
                min={0}
                max={60}
                step={1}
                value={draftPct}
                onChange={(e) => setDraftPct(e.target.value.replace(/[^0-9]/g, ""))}
                onBlur={() => commitPct(draftPct)}
                className="w-16 rounded border px-2 py-1 text-center"
                style={{
                  ...sans,
                  fontSize: 13,
                  color: CHARCOAL,
                  borderColor: "rgba(44,44,44,0.18)",
                  background: "#FFFFFF",
                }}
              />
              <span style={{ ...sans, fontSize: 13, color: MUTED }}>%</span>
            </div>
            <span
              className="mt-0.5 block"
              style={{ ...sans, fontSize: 10, fontStyle: "italic", color: MUTED_LT }}
            >
              Your CPA can give you this number
            </span>
          </div>

          {showPreview && (
            <div
              className="mt-3 border-t pt-3"
              style={{ borderColor: "rgba(184,134,11,0.15)" }}
            >
              <PreviewRow label="Your planned distributions (take-home)" value={fmtUsd(dist)} />
              <PreviewRow
                label={`Estimated income tax at ${Math.round((rate ?? 0) * 100)}%`}
                value={fmtUsd(distributionTaxReserve)}
                valueColor={GOLD}
              />
              <PreviewRow
                label="Firm must generate for distributions"
                value={fmtUsd(grossedUpDistributions)}
                bold
              />
              <p
                className="mt-2"
                style={{ ...sans, fontSize: 11, fontStyle: "italic", color: GOLD_NOTE, lineHeight: 1.55 }}
              >
                {fmtUsd(distributionTaxReserve)} is added to your total compensation and cost floor so your
                aligned rate reflects the true obligation.
              </p>
            </div>
          )}

          {!showPreview && (
            <p
              className="mt-3 rounded-md px-3 py-2"
              style={{
                ...sans,
                fontSize: 11,
                color: GOLD_NOTE,
                background: "rgba(184,134,11,0.08)",
                lineHeight: 1.55,
              }}
            >
              Without a tax rate, your total compensation understates what the firm must earn on your behalf.
            </p>
          )}

          {rateConfigured ? (
            <button
              type="button"
              onClick={() => {
                setDraftPct("");
                onRateChange(null);
              }}
              className="mt-2 block cursor-pointer border-0 bg-transparent p-0 underline"
              style={{ ...sans, fontSize: 10, color: MUTED_LT }}
            >
              Remove this estimate →
            </button>
          ) : null}

          <p
            className="mt-3 leading-relaxed"
            style={{ ...sans, fontSize: 10, fontStyle: "italic", color: MUTED_LT, lineHeight: 1.55 }}
          >
            {variant === "tour"
              ? "Estimate only. Ask your CPA for your effective rate."
              : "This is an estimate for planning only — not tax advice. Your actual tax obligation depends on your full income picture. Confirm with your CPA before making financial decisions."}
          </p>
        </div>
      )}
    </div>
  );
}

function PreviewRow({
  label,
  value,
  valueColor = CHARCOAL,
  bold,
}: {
  label: string;
  value: string;
  valueColor?: string;
  bold?: boolean;
}) {
  return (
    <div className="mb-1 flex items-center justify-between gap-3">
      <span style={{ fontFamily: "Jost, sans-serif", fontSize: 12, color: MUTED }}>{label}</span>
      <span
        style={{
          fontFamily: "Jost, sans-serif",
          fontWeight: 500,
          color: valueColor,
          fontSize: bold ? 13 : 12,
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function DistributionTaxInsightTip({
  distributions,
  distributionTaxRate,
}: {
  distributions: number;
  distributionTaxRate: number | null;
}) {
  const ratePct = distributionTaxRate != null ? Math.round(distributionTaxRate * 100) : 0;
  return (
    <InfoTip
      term="What this is"
      definition={`This is the additional amount the firm must generate so you can net your planned ${fmtUsd(distributions)} after paying income tax at your estimated ${ratePct}% effective rate. It is not paid to any tax authority directly — it is the gross-up that ensures your distributions actually cover your take-home need.`}
    />
  );
}
