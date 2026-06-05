import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getAnnualSummary } from "@/lib/value-moments.functions";
import { fmtUsd, fmtPct } from "@/lib/finance";
import { RoleGuard } from "@/lib/role";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/annual-summary")({
  head: () => ({ meta: [{ title: "Your year in Sightline" }] }),
  component: () => (
    <RoleGuard allow={["principal", "admin"]}>
      <AnnualSummary />
    </RoleGuard>
  ),
});

function AnnualSummary() {
  const fn = useServerFn(getAnnualSummary);
  const { data, isLoading } = useQuery({ queryKey: ["annual-summary"], queryFn: () => fn() });

  if (isLoading || !data) {
    return <div className="flex h-[50vh] items-center justify-center text-ch/50">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-12">
      <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-ch/60 hover:text-ch mb-6">
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </Link>
      <p className="text-[11px] uppercase tracking-[0.25em] text-gold">Year in review</p>
      <h1 className="font-display text-5xl tracking-tight text-ch mt-2">
        {data.firmName} — <span className="italic">a year in Sightline</span>
      </h1>

      <Section title="Rate progress">
        <Stat label="Aligned rate when account created" value={fmtUsd(data.alignedAtSignup) + "/hr"} />
        <Stat label="Current aligned rate" value={fmtUsd(data.alignedNow) + "/hr"} />
        <Stat label="Current billed rate" value={fmtUsd(data.billedNow) + "/hr"} />
        {data.gapClosed > 0 && (
          <>
            <Stat label="Gap closed" value={fmtUsd(data.gapClosed) + "/hr"} tone="success" />
            <Stat label="Annualized revenue impact" value={fmtUsd(data.annualRevImpact)} tone="success" />
          </>
        )}
      </Section>

      <Section title="Project outcomes">
        <Stat label="Projects completed this year" value={String(data.completedCount)} />
        <Stat label="Total fees across completed projects" value={fmtUsd(data.totalFees)} />
        <Stat label="Average scope creep" value={fmtPct(data.avgCreepPct)} />
        <Stat label="Total unscoped hours identified" value={`${data.creepHrsTotal.toFixed(1)} hrs`} />
        <Stat label="Dollar value of scope identified" value={fmtUsd(data.creepValueTotal)} tone="terra" />
      </Section>

      <Section title="Capacity decisions">
        <Stat label="Capacity warnings surfaced" value={String(data.capacityWarnings)} />
        <Stat label="Weeks at or above 85% utilization" value={String(data.weeksOver85)} />
        <Stat label="Growth signals assessed" value={String(data.growthSignals)} />
      </Section>

      <Section title="Investment vs value">
        <Stat label="Your Sightline subscription this year" value={fmtUsd(data.subAnnual)} />
        <Stat label="Conservative value identified" value={fmtUsd(data.conservativeValue)} tone="success" />
        <Stat label="Ratio" value={`${data.ratio.toFixed(1)}×`} tone="success" />
        <p className="mt-4 text-xs text-ch/60 leading-relaxed max-w-2xl">
          This reflects only what Sightline measured directly — rate gap and scope creep identified.
          It does not include the value of decisions made with better information, projects managed
          more profitably, or hires timed correctly.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 rounded-lg border border-border bg-white p-6">
      <h2 className="font-display text-2xl tracking-tight text-ch mb-4">{title}</h2>
      <dl className="space-y-3">{children}</dl>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "terra" }) {
  const toneClass = tone === "success" ? "text-success" : tone === "terra" ? "text-terra" : "text-ch";
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/40 pb-2 last:border-0">
      <dt className="text-sm text-ch/70">{label}</dt>
      <dd className={`num font-display text-xl ${toneClass}`}>{value}</dd>
    </div>
  );
}