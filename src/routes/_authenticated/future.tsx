import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lazy, Suspense, useRef, useState } from "react";
import { RoleGuard } from "@/lib/role";
import { getFuturePageData } from "@/lib/goals.functions";
import { FutureVision, FutureVisionHeaderActions } from "@/components/future/FutureVision";
import type { FirmGoalRow } from "@/lib/goals";
import { cn } from "@/lib/utils";

const FutureRoadmap = lazy(() =>
  import("@/components/future/FutureRoadmap").then((m) => ({ default: m.FutureRoadmap })),
);

const TABS = [
  { id: "vision", label: "Vision" },
  { id: "roadmap", label: "Roadmap" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function parseTab(raw: unknown): TabId {
  if (raw === "projections") return "roadmap";
  if (raw === "roadmap" || raw === "vision") return raw;
  return "vision";
}

export type RoadmapSubTab = "hiring" | "revenue" | "planning";

function parseRoadmapSubTab(raw: unknown): RoadmapSubTab | undefined {
  if (raw === "hiring" || raw === "revenue" || raw === "planning") return raw;
  return undefined;
}

export const Route = createFileRoute("/_authenticated/future")({
  head: () => ({ meta: [{ title: "Your Firm's Future — Sightline" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    tab: parseTab(s.tab),
    roadmapTab: parseRoadmapSubTab(s.roadmapTab),
    pinterest: typeof s.pinterest === "string" ? s.pinterest : undefined,
  }),
  component: FutureRoute,
});

function FutureRoute() {
  return (
    <RoleGuard allow={["principal", "admin"]}>
      <FuturePage />
    </RoleGuard>
  );
}

function FuturePage() {
  const { tab, roadmapTab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const reviewAnchorRef = useRef<HTMLDivElement>(null);
  const fetchFn = useServerFn(getFuturePageData);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["future"],
    queryFn: () => fetchFn(),
  });

  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<FirmGoalRow | null>(null);

  const year = new Date().getFullYear();
  const firmTitle = data?.firmName ? `${data.firmName} · ${year}` : `Your firm · ${year}`;

  const setTab = (next: TabId) => {
    void navigate({ search: { tab: next }, replace: true });
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-sans text-[11px] uppercase tracking-[0.1em] text-muted-lt">
            Your firm&apos;s future
          </p>
          <h1 className="font-display text-[22px] font-normal text-ch">{firmTitle}</h1>
        </div>
        {tab === "vision" && (
          <FutureVisionHeaderActions
            onReview={() => reviewAnchorRef.current?.scrollIntoView({ behavior: "smooth" })}
            onAddGoal={() => {
              setEditingGoal(null);
              setGoalModalOpen(true);
            }}
          />
        )}
      </header>

      <nav className="mb-8 flex gap-6 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "pb-2 font-sans text-sm",
              tab === t.id
                ? "border-b-2 border-ch text-ch"
                : "text-muted-lt hover:text-ch",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {isLoading ? (
        <p className="font-sans text-sm text-muted-lt">Loading…</p>
      ) : isError ? (
        <div className="rounded-xl border border-terra/30 bg-terra/5 px-4 py-3 font-sans text-sm text-ch">
          <p className="font-medium">Could not load this page.</p>
          <p className="mt-1 text-muted">
            {error instanceof Error ? error.message : "Unknown error"}
          </p>
          <p className="mt-2 text-[12px] text-muted-lt">
            If you just added the Future feature, apply migration{" "}
            <code className="text-ch">20260729120000_firm_future_vision_goals.sql</code> to your
            Supabase project, then try again.
          </p>
          <button
            type="button"
            className="mt-3 font-sans text-xs text-gold underline"
            onClick={() => void refetch()}
          >
            Try again
          </button>
        </div>
      ) : !data ? (
        <p className="font-sans text-sm text-muted-lt">No data.</p>
      ) : (
        <>
          {tab === "vision" && data.vision && (
            <div ref={reviewAnchorRef}>
              <FutureVision
                firmName={data.firmName ?? ""}
                vision={data.vision}
                goals={data.goals}
                milestones={data.milestones}
                insights={data.insights}
                goalModalOpen={goalModalOpen}
                setGoalModalOpen={setGoalModalOpen}
                editingGoal={editingGoal}
                setEditingGoal={setEditingGoal}
                onAddGoal={() => {}}
              />
            </div>
          )}
          {tab === "roadmap" && (
            <Suspense fallback={<p className="font-sans text-sm text-ch/60">Loading roadmap…</p>}>
              <FutureRoadmap
                planningInputs={data.projections}
                initialSubTab={roadmapTab}
              />
            </Suspense>
          )}
        </>
      )}
    </div>
  );
}
