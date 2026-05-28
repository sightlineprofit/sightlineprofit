import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { getDashboardData } from "@/lib/dashboard.functions";
import { calc } from "@/lib/finance";
import { GrowthFull } from "./dashboard";

export const Route = createFileRoute("/_authenticated/dashboard/growth")({
  head: () => ({ meta: [{ title: "Growth — Sightline" }] }),
  component: Page,
});

function Page() {
  const fn = useServerFn(getDashboardData);
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => fn() });
  const c = useMemo(() => calc(data?.config ?? null, data?.expenses ?? []), [data]);
  if (isLoading) return <div className="mx-auto max-w-7xl px-8 py-10 text-ch/50">Loading…</div>;
  return (
    <div className="mx-auto max-w-7xl px-8 py-10">
      <h1 className="font-display text-4xl tracking-tight text-ch mb-8">Growth Projection</h1>
      <GrowthFull c={c} />
    </div>
  );
}