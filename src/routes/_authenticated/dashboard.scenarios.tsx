import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardData } from "@/lib/dashboard.functions";
import { ScenarioFull } from "./dashboard";

export const Route = createFileRoute("/_authenticated/dashboard/scenarios")({
  head: () => ({ meta: [{ title: "Scenarios — Sightline" }] }),
  component: Page,
});

function Page() {
  const fn = useServerFn(getDashboardData);
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => fn() });
  if (isLoading) return <div className="mx-auto max-w-7xl px-8 py-10 text-ch/50">Loading…</div>;
  return (
    <div className="mx-auto max-w-7xl px-8 py-10">
      <h1 className="font-display text-4xl tracking-tight text-ch mb-8">Scenario Planning</h1>
      <ScenarioFull baseConfig={data?.config ?? null} expenses={data?.expenses ?? []} />
    </div>
  );
}