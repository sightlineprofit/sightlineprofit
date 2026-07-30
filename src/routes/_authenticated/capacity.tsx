import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RoleGuard } from "@/lib/role";
import { getMyContext } from "@/lib/firm.functions";
import { getPlanningYearOptions } from "@/lib/capacity-planning-years";
import { CapacityPlannerPage } from "@/components/capacity/planner/CapacityPlannerPage";

function parsePlanningYear(raw: unknown): number | undefined {
  const currentYear = new Date().getFullYear();
  const allowed = new Set(getPlanningYearOptions(currentYear).map((o) => o.year));
  let year: number | undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) year = raw;
  else if (typeof raw === "string" && /^\d{4}$/.test(raw)) year = Number(raw);
  if (year != null && allowed.has(year)) return year;
  return undefined;
}

export const Route = createFileRoute("/_authenticated/capacity")({
  head: () => ({ meta: [{ title: "Capacity — Sightline" }] }),
  validateSearch: (s: Record<string, unknown>): { year?: number } => {
    const year = parsePlanningYear(s.year);
    return year != null ? { year } : {};
  },
  component: CapacityRoute,
});

function CapacityRoute() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { year: searchYear } = Route.useSearch();
  const getCtx = useServerFn(getMyContext);
  const { data: ctx, isLoading } = useQuery({ queryKey: ["me"], queryFn: () => getCtx() });

  const firmId = ctx?.profile?.impersonated_firm_id ?? ctx?.profile?.firm_id ?? null;
  const defaultYear = new Date().getFullYear();

  const handlePlanningYearChange = (year: number) => {
    void navigate({
      search: year === defaultYear ? {} : { year },
      replace: true,
    });
  };

  return (
    <RoleGuard allow={["principal", "admin", "team"]}>
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8">
        {isLoading ? (
          <p className="font-sans text-sm text-muted-foreground">Loading…</p>
        ) : !firmId ? (
          <p className="font-sans text-sm text-muted-foreground">No firm found.</p>
        ) : (
          <CapacityPlannerPage
            firmId={firmId}
            initialYear={searchYear}
            onPlanningYearChange={handlePlanningYearChange}
          />
        )}
      </div>
    </RoleGuard>
  );
}
