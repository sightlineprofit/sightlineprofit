import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { getDashboardData } from "@/lib/dashboard.functions";
import { calc } from "@/lib/finance";
import { HealthFull } from "./dashboard";

export const Route = createFileRoute("/_authenticated/dashboard/health")({
  head: () => ({ meta: [{ title: "Cost Architecture Health — Sightline" }] }),
  component: Page,
});

function Page() {
  const fn = useServerFn(getDashboardData);
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => fn() });
  const c = useMemo(
    () =>
      calc(data?.config ?? null, data?.expenses ?? [], {
        ownerComp: (data as any)?.ownerComp ?? [],
        teamProfiles: (data as any)?.teamBurdens ?? [],
      }),
    [data],
  );
  if (isLoading) return <div className="mx-auto max-w-7xl px-8 py-10 text-ch/50">Loading…</div>;
  return (
    <div className="mx-auto max-w-7xl px-8 py-10">
      <h1 className="font-display text-4xl tracking-tight text-ch mb-8">Cost Architecture Health</h1>
      <HealthFull c={c} />
    </div>
  );
}