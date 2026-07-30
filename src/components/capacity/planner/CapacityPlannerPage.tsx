import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCapacityPlannerData } from "@/lib/capacity.functions";
import type { FirmLifeEvent } from "@/lib/finance";
import { getPlanningYearOptions } from "@/lib/capacity-planning-years";
import {
  CapacityHorizonToggle,
  AddTimeBlockButton,
  type CapacityHorizon,
} from "@/components/capacity/planner/CapacityHorizonToggle";
import { CapacityYearSelector } from "@/components/capacity/planner/CapacityYearSelector";
import { CapacityStatCards } from "@/components/capacity/planner/CapacityStatCards";
import { CapacityYearCalendar } from "@/components/capacity/planner/CapacityYearCalendar";
import { SayNoThresholdBanner } from "@/components/capacity/planner/SayNoThresholdBanner";
import { LifeEventsList } from "@/components/capacity/planner/LifeEventsList";
import { TimeBlockModal } from "@/components/capacity/planner/TimeBlockModal";
import { CapacityCommitmentPrompt } from "@/components/capacity/planner/CapacityCommitmentPrompt";
import { LeaveScenarioTool } from "@/components/capacity/LeaveScenarioTool";
import { NewProjectWhatIf } from "@/components/capacity/NewProjectWhatIf";
import { AcceptingClientsStatus } from "@/components/capacity/AcceptingClientsStatus";
import { CapacitySixteenWeekView } from "@/components/capacity/planner/CapacitySixteenWeekView";
import { MemberProjectsPanel } from "@/components/capacity/planner/MemberProjectsPanel";
import { TeamCapacityOverview } from "@/components/capacity/planner/TeamCapacityOverview";

export function CapacityPlannerPage({
  firmId,
  initialYear,
  onPlanningYearChange,
}: {
  firmId: string;
  initialYear?: number;
  onPlanningYearChange?: (year: number) => void;
}) {
  const defaultYear = new Date().getFullYear();
  const [planningYear, setPlanningYear] = useState(initialYear ?? defaultYear);
  const [horizon, setHorizon] = useState<CapacityHorizon>("12_months");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FirmLifeEvent | null>(null);
  const [initialBlockKind, setInitialBlockKind] = useState<
    "time_off" | "extended_leave" | "commitment" | null
  >(null);
  const [commitmentPromptDismissed, setCommitmentPromptDismissed] = useState(false);

  const fetchPlanner = useServerFn(getCapacityPlannerData);
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["capacity-planner", firmId, planningYear],
    queryFn: () => fetchPlanner({ data: { firmId, year: planningYear } }),
  });

  const openAdd = (kind?: typeof initialBlockKind) => {
    setEditing(null);
    const valid: Array<typeof initialBlockKind> = ["time_off", "extended_leave", "commitment", null];
    setInitialBlockKind(valid.includes(kind ?? null) ? (kind ?? null) : null);
    setModalOpen(true);
  };

  const openEdit = (event: FirmLifeEvent) => {
    setEditing(event);
    setModalOpen(true);
  };

  const yearOptions = getPlanningYearOptions();

  useEffect(() => {
    if (initialYear != null) setPlanningYear(initialYear);
  }, [initialYear]);

  const handleYearChange = (year: number) => {
    setPlanningYear(year);
    onPlanningYearChange?.(year);
  };

  const isFutureYear = planningYear > defaultYear;

  if (isLoading && !data) {
    return <p className="font-sans text-sm text-muted-foreground">Loading capacity planner…</p>;
  }

  if (error || !data) {
    return (
      <p className="font-sans text-sm text-terra">
        {(error as Error)?.message ?? "Could not load capacity planner."}
      </p>
    );
  }

  const isMember = data.scope === "member";

  return (
    <div className="w-full">
      <header
        className="mb-5 flex flex-col gap-4 border-b border-border pb-[18px] sm:flex-row sm:items-start sm:justify-between"
      >
        <div>
          <p className="mb-1 font-sans text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            {isMember ? "My capacity" : "Capacity planner"}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[22px] font-normal text-ch">
              {isMember ? (data.memberName ?? "Your capacity") : data.year}
            </h1>
            <CapacityYearSelector value={planningYear} onChange={handleYearChange} />
            {isFetching && (
              <span className="font-sans text-[11px] text-muted-foreground">Updating…</span>
            )}
          </div>
          <p className="mt-0.5 font-sans text-[13px] text-muted-foreground">
            {isMember
              ? "Plan your time off and outside commitments — your principal sees this when making firm decisions."
              : isFutureYear
                ? "Forward planning — add time blocks and map projects for this year"
                : "Your working year with life events"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isMember && !isFutureYear && (
            <AcceptingClientsStatus
              firmId={firmId}
              accepting={data.acceptingNewClients}
              until={data.acceptingNewClientsUntil}
              variant="header"
            />
          )}
          {!isMember && <CapacityHorizonToggle value={horizon} onChange={setHorizon} />}
          <AddTimeBlockButton onClick={() => openAdd()} />
        </div>
      </header>

      {isFutureYear && !isMember && (
        <div className="mb-5 rounded-lg border border-gold/25 bg-gold/5 px-4 py-3">
          <p className="font-sans text-xs text-ch">
            Planning {data.year} — life events and project timelines are saved with real dates.
            Rate architecture uses your current setup; revenue targets are estimates.
          </p>
        </div>
      )}

      {horizon === "12_months" || isMember ? (
        <>
          {!isMember && !data.capacityBlocksOnboarded && !isFutureYear && !commitmentPromptDismissed && (
            <CapacityCommitmentPrompt
              firmId={firmId}
              onAddCommitment={() => {
                setCommitmentPromptDismissed(true);
                openAdd("commitment");
              }}
              onDismiss={() => setCommitmentPromptDismissed(true)}
            />
          )}
          <CapacityStatCards data={data} />
          {isMember && <MemberProjectsPanel projects={data.projects} />}
          {!isMember && data.teamMemberSummaries.length > 0 && (
            <TeamCapacityOverview summaries={data.teamMemberSummaries} />
          )}
          <CapacityYearCalendar data={data} />
          {!isMember && !isFutureYear && <SayNoThresholdBanner data={data} firmId={firmId} />}
          {!isMember && isFutureYear && (
            <div className="mb-5 rounded-xl border border-border bg-cream px-5 py-4">
              <p className="font-sans text-xs text-muted-foreground">
                Say-no threshold and inquiry settings apply to the current year (
                {defaultYear}). Switch to {defaultYear} to manage those controls.
              </p>
            </div>
          )}
          <LifeEventsList data={data} firmId={firmId} onAdd={() => openAdd()} onEdit={openEdit} />
          {!isMember && (
            <>
              <LeaveScenarioTool
                calcResult={data.calcResult}
                existingLeaveEvents={data.effective.lifeEvents.filter(
                  (e) => Number(e.capacity_pct) === 0 && !e.firm_member_id,
                )}
                firmId={firmId}
                savedSavingsPerMonth={data.maternityLeaveSavingsPerMonth}
              />
              <NewProjectWhatIf
                calcResult={data.calcResult}
                effectiveCapacity={data.effective}
                committedHrs={data.committedHrs}
                committedRevenue={data.sayNo.committedRevenue}
                sayNoThreshold={data.sayNo}
                firmId={firmId}
                planningYear={planningYear}
              />
            </>
          )}
        </>
      ) : (
        <CapacitySixteenWeekView />
      )}

      <TimeBlockModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) {
            setEditing(null);
            setInitialBlockKind(null);
          }
        }}
        firmId={firmId}
        editing={editing}
        initialKind={initialBlockKind}
        planningYear={planningYear}
      />

      <p className="mt-6 font-sans text-[10px] text-muted-foreground">
        Planning horizon: {yearOptions.map((y) => y.label).join(", ")}
      </p>
    </div>
  );
}
