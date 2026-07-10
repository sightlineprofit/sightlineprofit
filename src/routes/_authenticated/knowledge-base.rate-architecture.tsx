import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getDashboardData } from "@/lib/dashboard.functions";
import { calc } from "@/lib/finance";
import { RateArchitectureBuilding } from "@/components/knowledge/RateArchitectureBuilding";

export const Route = createFileRoute("/_authenticated/knowledge-base/rate-architecture")({
  head: () => ({ meta: [{ title: "How your rate is built — Sightline" }] }),
  component: Page,
});

function Page() {
  const fetch = useServerFn(getDashboardData);
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => fetch() });
  const c = calc(data?.config ?? null, data?.expenses ?? [], {
    ownerComp: (data as any)?.ownerComp ?? [],
    teamProfiles: (data as any)?.teamBurdens ?? [],
  });

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-ch/50">
        <Link to="/knowledge-base" className="hover:underline">← Knowledge base</Link>
      </div>
      <h1 className="font-display text-4xl tracking-tight text-ch mb-2">Your rate, one layer at a time</h1>
      <p className="text-sm text-ch/60 max-w-2xl mb-10">
        The aligned rate isn't a number an app made up. It's the sum of every cost your firm carries, divided by the hours you actually bill. Here's what's underneath it.
      </p>
      {isLoading ? (
        <div className="text-sm text-ch/50">Loading…</div>
      ) : (
        <RateArchitectureBuilding c={c} />
      )}
    </div>
  );
}