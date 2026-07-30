import { lazy, Suspense } from "react";
import { GrowthRoadmapPanel } from "./GrowthRoadmapPanel";
import type { FutureProjectionInputs } from "@/lib/goals.functions";

const FutureProjections = lazy(() =>
  import("./FutureProjections").then((m) => ({ default: m.FutureProjections })),
);

export type RoadmapSubTab = "hiring" | "revenue" | "planning";

export function FutureRoadmap({
  planningInputs,
  initialSubTab,
}: {
  planningInputs: FutureProjectionInputs | null;
  initialSubTab?: RoadmapSubTab;
}) {
  return (
    <div className="pt-2">
      <GrowthRoadmapPanel
        embedded
        initialSubTab={initialSubTab}
        planningSlot={
          planningInputs ? (
            <Suspense
              fallback={<p className="font-sans text-sm text-ch/60">Loading planners…</p>}
            >
              <FutureProjections data={planningInputs} />
            </Suspense>
          ) : (
            <p className="font-sans text-sm text-ch/60">Planning data unavailable.</p>
          )
        }
      />
    </div>
  );
}
