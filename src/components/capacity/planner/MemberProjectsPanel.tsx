import { formatHours } from "@/lib/finance";
import type { CapacityPlannerProject } from "@/lib/capacity.functions";

export function MemberProjectsPanel({
  projects,
}: {
  projects: CapacityPlannerProject[];
}) {
  const active = projects.filter((p) =>
    ["active", "pipeline", "pursuit"].includes((p.status ?? "").toLowerCase()),
  );

  return (
    <section className="mb-5">
      <p className="mb-3 font-sans text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
        Your assigned projects
      </p>

      {active.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-cream/40 px-4 py-4">
          <p className="font-sans text-xs text-muted-foreground">
            No active project assignments yet. When your principal assigns you to project steps,
            they will appear here with your estimated hours.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {active.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-[10px] border border-border bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-sans text-[13px] font-medium text-ch">{p.name}</p>
                {p.client_name && (
                  <p className="truncate font-sans text-[11px] text-muted-foreground">
                    {p.client_name}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="font-sans text-[13px] font-medium text-ch">
                  {formatHours(Math.round(p.memberEstimatedHrs ?? 0))}
                </p>
                <p className="font-sans text-[10px] text-muted-foreground">your est. hrs</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
