import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { dismissRateInsight } from "@/lib/value-moments.functions";
import { fmtUsd } from "@/lib/finance";
import { cn } from "@/lib/utils";

export function RateInsightCard({
  alignedRate,
  billedRate,
  targetHrsPerWeek,
}: {
  alignedRate: number;
  billedRate: number;
  targetHrsPerWeek: number;
}) {
  const [hidden, setHidden] = useState(false);
  const dismiss = useServerFn(dismissRateInsight);
  const qc = useQueryClient();

  if (hidden || alignedRate <= 0 || billedRate <= 0 || targetHrsPerWeek <= 0) return null;

  const below = billedRate < alignedRate;
  const gap = Math.abs(billedRate - alignedRate);
  const annualImpact = gap * targetHrsPerWeek * 48;

  const onDismiss = async () => {
    setHidden(true);
    try {
      await dismiss();
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch {
      /* swallow — UI already hidden */
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-6 mb-4",
        below ? "border-gold/30 bg-goldp/40" : "border-success/30 bg-success/5",
      )}
    >
      <h3
        style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 400 }}
        className="text-ch mb-3"
      >
        What your rate gap costs you
      </h3>
      {below ? (
        <p className="text-sm text-ch/80 leading-relaxed max-w-2xl">
          You're billing <span className="font-medium text-ch">{fmtUsd(billedRate)}/hr</span>. Your aligned rate is{" "}
          <span className="font-medium text-ch">{fmtUsd(alignedRate)}/hr</span>. The{" "}
          <span className="font-medium text-gold">{fmtUsd(gap)}/hr</span> gap costs your firm approximately{" "}
          <span className="font-medium text-gold">{fmtUsd(annualImpact)}</span> a year in unreached revenue potential.
        </p>
      ) : (
        <p className="text-sm text-ch/80 leading-relaxed max-w-2xl">
          You're billing <span className="font-medium text-success">{fmtUsd(gap)}/hr</span> above your floor. At your hours that's{" "}
          <span className="font-medium text-success">{fmtUsd(annualImpact)}</span> in annual margin above your minimum requirement.
        </p>
      )}
      <div className="mt-4">
        <button
          onClick={onDismiss}
          className="text-xs uppercase tracking-[0.18em] text-ch/60 hover:text-ch border border-border bg-white rounded px-3 py-1.5"
        >
          Got it
        </button>
      </div>
    </div>
  );
}