import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { useMe, effectiveRole, RoleGuard } from "@/lib/role";
import { getBillableToggleLabel } from "@/lib/time-framing";
import { getMyWorkProjectDetail, toggleMyWorkStepComplete, toggleMyWorkStepItemComplete } from "@/lib/my-work.functions";
import { LogTimeModal } from "@/components/my-work/LogTimeModal";
import type { SopStepItem } from "@/components/sop/TaskRow";
import { cn } from "@/lib/utils";
import { Check, ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/my-work/$projectId")({
  validateSearch: (s: Record<string, unknown>): { preview_member?: string } => ({
    preview_member: typeof s.preview_member === "string" ? s.preview_member : undefined,
  }),
  head: () => ({ meta: [{ title: "My project — Sightline" }] }),
  component: MyWorkProjectRoute,
});

function parseSopDescription(desc: string | null | undefined) {
  if (!desc) return { trigger: null as string | null, doneWhen: null as string | null };
  const trigger = desc.match(/Triggered by:\s*(.+)/i)?.[1]?.split("\n")[0]?.trim() ?? null;
  const doneWhen = desc.match(/Complete when:\s*(.+)/i)?.[1]?.split("\n")[0]?.trim() ?? null;
  return { trigger, doneWhen };
}

function daysAway(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function MyWorkProjectRoute() {
  const { projectId } = Route.useParams();
  const { preview_member: previewMemberId } = Route.useSearch();
  const { data: me, realIsSuper } = useMe();
  const role = effectiveRole(me?.profile);
  const canAssignTeamMember =
    realIsSuper || me?.profile?.role === "principal" || me?.profile?.role === "admin";
  const billableToggleLabel = getBillableToggleLabel(
    (me?.config as { pricing_structure?: string } | null)?.pricing_structure ?? null,
  );
  const nav = useNavigate();
  const qc = useQueryClient();
  const getDetail = useServerFn(getMyWorkProjectDetail);
  const toggleStep = useServerFn(toggleMyWorkStepComplete);
  const toggleStepItem = useServerFn(toggleMyWorkStepItemComplete);
  const [logCtx, setLogCtx] = useState<{
    projectPhaseId?: string | null;
    defaultBillable?: boolean;
  } | null>(null);

  if (role === "principal" || role === "admin") {
    nav({ to: "/sightline", replace: true });
    return null;
  }

  const q = useQuery({
    queryKey: ["my-work-project", projectId, previewMemberId ?? "self"],
    queryFn: () =>
      getDetail({
        data: { projectId, previewMemberId: previewMemberId ?? null },
      }),
    retry: false,
  });

  if (q.isError && (q.error as Error)?.message === "NOT_ASSIGNED") {
    toast.message("You're not assigned to that project.");
    nav({ to: "/my-work", replace: true });
    return null;
  }

  const data = q.data;
  const project = data?.project as { name?: string; client_name?: string | null; status?: string } | undefined;
  const readOnly = data?.previewMode || role === "view_only";

  return (
    <RoleGuard allow={["team", "view_only"]}>
      <div className="mx-auto max-w-3xl px-4 py-8 pb-24">
        {data?.previewMode && (
          <div className="mb-4 rounded-lg border border-[#B8860B]/30 bg-[#F5EDD6] px-4 py-3 text-[12px] text-[#6B6259]" style={{ fontFamily: "Jost, sans-serif" }}>
            <span className="font-medium text-[#B8860B]">{data.previewName}&apos;s workspace · Preview mode</span>
          </div>
        )}

        <button
          type="button"
          onClick={() =>
            nav({
              to: "/my-work",
              search: previewMemberId ? { preview_member: previewMemberId } : undefined,
            })
          }
          className="flex items-center gap-1 text-[13px] text-[#8A7F75]"
          style={{ fontFamily: "Jost, sans-serif" }}
        >
          <ChevronLeft className="h-4 w-4" /> My work
        </button>

        {q.isLoading || !project ? (
          <div className="py-12 text-center text-sm text-[#8A7F75]">Loading…</div>
        ) : (
          <>
            <h1
              className="mt-2 text-[#2C2C2C]"
              style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: 22, fontWeight: 400 }}
            >
              {project.name}
            </h1>
            {project.client_name && (
              <p className="mt-1 text-[13px] text-[#6B6259]" style={{ fontFamily: "Jost, sans-serif" }}>
                {project.client_name}
              </p>
            )}

            <p className="mb-3 mt-8 text-[11px] uppercase tracking-[0.10em] text-[#8A7F75]" style={{ fontFamily: "Jost, sans-serif" }}>
              MY TASKS
            </p>

            {!data?.phases?.length ? (
              <p className="italic text-[13px] text-[#8A7F75]" style={{ fontFamily: "Jost, sans-serif" }}>
                No tasks assigned to you on this project yet.
              </p>
            ) : (
              (data.phases as Array<{
                id: string;
                name: string;
                myLoggedHrs: number;
                myAssignedHrs: number;
                sop_phase_id?: string | null;
                tasks: Array<{
                  id: string;
                  description: string;
                  completed_at?: string | null;
                  project_phase_id: string;
                  myEstimatedHrs: number;
                  myLoggedHrs: number;
                  isBillable: boolean;
                  steps?: SopStepItem[] | null;
                }>;
              }>).map((phase) => {
                const sopMeta = (data.sopPhases as Array<{ id: string; description: string | null }> | undefined)?.find(
                  (sp) => sp.id === phase.sop_phase_id,
                );
                const { trigger: phaseTrigger, doneWhen: phaseDone } = parseSopDescription(sopMeta?.description);
                return (
                  <div key={phase.id} className="mb-6">
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <span className="text-[13px] font-medium text-[#2C2C2C]" style={{ fontFamily: "Jost, sans-serif" }}>
                        {phase.name}
                      </span>
                      <span className="text-[11px] text-[#8A7F75]" style={{ fontFamily: "Jost, sans-serif" }}>
                        {phase.myLoggedHrs.toFixed(1)} of {phase.myAssignedHrs.toFixed(1)} hrs
                      </span>
                    </div>
                    {phase.tasks.map((task) => {
                      const done = !!task.completed_at;
                      const subSteps = Array.isArray(task.steps)
                        ? task.steps.slice().sort((a, b) => a.order - b.order)
                        : [];
                      const subDone = subSteps.filter((s) => !!s.completed_at).length;
                      return (
                        <div
                          key={task.id}
                          className="border-b border-[rgba(44,44,44,0.07)] py-2"
                        >
                          <div className="flex items-start gap-2.5">
                          <button
                            type="button"
                            disabled={readOnly}
                            onClick={async () => {
                              if (readOnly) return;
                              await toggleStep({ data: { stepId: task.id, completed: !done } });
                              qc.invalidateQueries({ queryKey: ["my-work-project", projectId] });
                            }}
                            className={cn(
                              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                              done ? "border-[#5C8A6E] bg-[#5C8A6E] text-white" : "border-[rgba(44,44,44,0.25)]",
                              readOnly && "opacity-50",
                            )}
                          >
                            {done && <Check className="h-3 w-3" />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div
                                className={cn(
                                  "text-[13px] font-medium text-[#2C2C2C]",
                                  done && "text-[#8A7F75] line-through",
                                )}
                                style={{ fontFamily: "Jost, sans-serif" }}
                              >
                                {task.description}
                              </div>
                              {subSteps.length > 0 ? (
                                <span className="rounded-[8px] bg-[rgba(92,138,110,0.12)] px-1.5 py-0.5 text-[10px] font-medium text-[#5C8A6E]">
                                  {subDone}/{subSteps.length}
                                </span>
                              ) : null}
                            </div>
                            {phaseTrigger && (
                              <div className="text-[11px] italic text-[#8A7F75]" style={{ fontFamily: "Jost, sans-serif" }}>
                                Triggered by: {phaseTrigger}
                              </div>
                            )}
                            {phaseDone && (
                              <div className="text-[11px] text-[#8A7F75]" style={{ fontFamily: "Jost, sans-serif" }}>
                                Complete when: {phaseDone}
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-[11px] text-[#8A7F75]" style={{ fontFamily: "Jost, sans-serif" }}>
                              {task.myLoggedHrs.toFixed(1)} of {task.myEstimatedHrs.toFixed(1)} hrs
                            </div>
                            {!readOnly && (
                              <button
                                type="button"
                                className="text-[11px] text-[#B8860B] underline"
                                style={{ fontFamily: "Jost, sans-serif" }}
                                onClick={() =>
                                  setLogCtx({
                                    projectPhaseId: task.project_phase_id,
                                    defaultBillable: task.isBillable,
                                  })
                                }
                              >
                                Log →
                              </button>
                            )}
                          </div>
                          </div>
                          {subSteps.length > 0 ? (
                            <div className="mt-2 ml-7 rounded-md bg-[rgba(44,44,44,0.03)] px-3 py-2">
                              {subSteps.map((s) => {
                                const itemDone = !!s.completed_at;
                                return (
                                  <div key={s.order} className="flex items-start gap-2 py-0.5">
                                    <button
                                      type="button"
                                      disabled={readOnly}
                                      onClick={async () => {
                                        if (readOnly) return;
                                        await toggleStepItem({
                                          data: { stepId: task.id, order: s.order, completed: !itemDone },
                                        });
                                        qc.invalidateQueries({ queryKey: ["my-work-project", projectId] });
                                      }}
                                      className={cn(
                                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                                        itemDone
                                          ? "border-[#5C8A6E] bg-[#5C8A6E] text-white"
                                          : "border-[rgba(44,44,44,0.25)]",
                                        readOnly && "opacity-50",
                                      )}
                                    >
                                      {itemDone ? <Check className="h-2.5 w-2.5" /> : null}
                                    </button>
                                    <span
                                      className={cn(
                                        "text-[12px] text-[#8A7F75]",
                                        itemDone && "line-through opacity-70",
                                      )}
                                      style={{ fontFamily: "Jost, sans-serif" }}
                                    >
                                      {s.text}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}

            <p className="mb-3 mt-8 text-[11px] uppercase tracking-[0.10em] text-[#8A7F75]" style={{ fontFamily: "Jost, sans-serif" }}>
              MILESTONES
            </p>
            {(data?.milestones as Array<{ id: string; label: string; milestone_date: string }> | undefined)?.map((m) => {
              const d = daysAway(m.milestone_date);
              const color = d <= 7 ? "#C4714A" : d <= 14 ? "#B8860B" : d <= 60 ? "#8A7F75" : "#8A7F75";
              return (
                <div key={m.id} className="flex items-center gap-2.5 border-b border-[rgba(44,44,44,0.07)] py-2">
                  <span className="text-[10px] text-[#8A7F75]">◆</span>
                  <span className="flex-1 text-[13px] text-[#2C2C2C]" style={{ fontFamily: "Jost, sans-serif" }}>
                    {m.label}
                  </span>
                  <span className="text-[12px] font-medium text-[#2C2C2C]" style={{ fontFamily: "Jost, sans-serif" }}>
                    {new Date(m.milestone_date + "T00:00:00").toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  {d >= 0 && d <= 60 && (
                    <span className="text-[11px]" style={{ fontFamily: "Jost, sans-serif", color }}>
                      {d}d
                    </span>
                  )}
                </div>
              );
            })}

            {!readOnly && (
              <button
                type="button"
                onClick={() => setLogCtx({})}
                className="fixed bottom-6 left-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-lg bg-[#2C2C2C] py-3 text-[13px] font-medium text-white"
                style={{ fontFamily: "Jost, sans-serif" }}
              >
                Log time on this project
              </button>
            )}
          </>
        )}

        {logCtx && project && (
          <LogTimeModal
            open
            onClose={() => setLogCtx(null)}
            projectId={projectId}
            projectName={project.name ?? "Project"}
            projectPhaseId={logCtx.projectPhaseId}
            defaultBillable={logCtx.defaultBillable ?? true}
            billableToggleLabel={billableToggleLabel}
            canAssignTeamMember={canAssignTeamMember}
            onSaved={() => {
              q.refetch();
              qc.invalidateQueries({ queryKey: ["my-work"] });
            }}
          />
        )}
      </div>
    </RoleGuard>
  );
}
