import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { getDashboardData } from "@/lib/dashboard.functions";
import { calc } from "@/lib/finance";
import { BvAFull } from "./dashboard";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { effectiveTier } from "@/lib/role";

export const Route = createFileRoute("/_authenticated/dashboard/bva")({
  head: () => ({ meta: [{ title: "Budget vs Actual — Sightline" }] }),
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
  const firmId = data?.firm?.id as string | undefined;
  useRealtimeInvalidate(
    `dashboard-bva-${firmId ?? "none"}`,
    [
      { table: "time_entries", filter: firmId ? `firm_id=eq.${firmId}` : undefined },
      { table: "firm_config", filter: firmId ? `firm_id=eq.${firmId}` : undefined },
    ],
    [["dashboard"]],
    !!firmId,
  );
  if (isLoading) return <div className="mx-auto max-w-7xl px-8 py-10 text-ch/50">Loading…</div>;
  return (
    <div className="mx-auto max-w-7xl px-8 py-10">
      <h1 className="font-display text-4xl tracking-tight text-ch mb-8">Budget vs Actual</h1>
      <BvAFull
        c={c}
        weekHours={data?.weekHours ?? 0}
        prefs={data?.prefs.hidden_metrics ?? []}
        tier={effectiveTier(data?.profile, data?.firm)}
        firmId={firmId}
      />
    </div>
  );
}