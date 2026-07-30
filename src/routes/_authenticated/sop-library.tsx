import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useCallback } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FolderOpen, LayoutList, Plus } from "lucide-react";
import { toast } from "sonner";
import { ModulePage } from "@/components/shell/ModulePage";
import { TierLocked } from "@/components/shell/TierLocked";
import { getMyContext } from "@/lib/firm.functions";
import { effectiveTier } from "@/lib/role";
import { formatHours } from "@/lib/finance";
import {
  getSopLibrary,
  createSopWorkflow,
  renameSopWorkflow,
  moveSopWorkflow,
  reorderSopWorkflows,
  deleteSopTemplate,
  addSopPhase,
  saveSopStep,
  saveFirmResource,
  deleteFirmResource,
  reorderFirmResources,
  reorderSopPhases,
  bulkUpdateSopStepRoles,
  getSopRoleInsights,
  getFirmResourceDownloadUrl,
} from "@/lib/sop.functions";
import { NewWorkflowModal } from "@/components/sop/NewWorkflowModal";
import { AddPhaseModal } from "@/components/sop/AddPhaseModal";
import { TaskEditModal } from "@/components/sop/TaskEditModal";
import { BulkReassignTasksModal } from "@/components/sop/BulkReassignTasksModal";
import { ResourceDrawer, RoleInsightsPanel } from "@/components/sop/ResourceDrawer";
import {
  WorkflowCard,
  SopStatTile,
  SopEmptyState,
  type WorkflowCardData,
} from "@/components/sop/WorkflowCard";
import { ResourcePreviewModal, type TaskRowData, type TaskRowResource } from "@/components/sop/TaskRow";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import type { SopAssignedRole } from "@/lib/sop";

type Tab = "project" | "firm" | "insights";

export const Route = createFileRoute("/_authenticated/sop-library")({
  head: () => ({ meta: [{ title: "SOP Library — Sightline" }] }),
  component: SopLibraryPage,
});

function SopLibraryPage() {
  const ctxFn = useServerFn(getMyContext);
  const { data: ctx } = useQuery({ queryKey: ["me"], queryFn: () => ctxFn() });
  const tier = effectiveTier(ctx?.profile, ctx?.firm);

  if (tier !== "practice") {
    return (
      <ModulePage eyebrow="Practice" title="SOP Library" description="Workflows, tasks, and resources for your firm.">
        <TierLocked
          tier="practice"
          title="The library that codifies how your studio works"
          blurb="Every project starts from a template. Phases, hours, scope language — all reusable."
          unlocks={[
            "Build reusable project workflows with role-based tasks",
            "Link email templates and process docs to tasks",
            "See delegation insights by role",
            "Attach workflows to projects in Sightline",
          ]}
        />
      </ModulePage>
    );
  }
  return <SopLibraryContent />;
}

function SopLibraryContent() {
  const qc = useQueryClient();
  const getLib = useServerFn(getSopLibrary);
  const createWfFn = useServerFn(createSopWorkflow);
  const renameWfFn = useServerFn(renameSopWorkflow);
  const moveWfFn = useServerFn(moveSopWorkflow);
  const reorderWfsFn = useServerFn(reorderSopWorkflows);
  const deleteWfFn = useServerFn(deleteSopTemplate);
  const addPhaseFn = useServerFn(addSopPhase);
  const saveStepFn = useServerFn(saveSopStep);
  const saveResourceFn = useServerFn(saveFirmResource);
  const deleteResourceFn = useServerFn(deleteFirmResource);
  const reorderResourcesFn = useServerFn(reorderFirmResources);
  const reorderPhasesFn = useServerFn(reorderSopPhases);
  const bulkRolesFn = useServerFn(bulkUpdateSopStepRoles);
  const insightsFn = useServerFn(getSopRoleInsights);
  const getDownloadUrlFn = useServerFn(getFirmResourceDownloadUrl);

  const getResourceDownloadUrl = useCallback(
    async (path: string) => {
      const { url } = await getDownloadUrlFn({ data: { path } });
      return url;
    },
    [getDownloadUrlFn],
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["sop-library"],
    queryFn: () => getLib(),
  });
  const { data: insights } = useQuery({ queryKey: ["sop-role-insights"], queryFn: () => insightsFn() });

  useRealtimeInvalidate(
    "sop-library-rt",
    [
      { table: "sop_templates" },
      { table: "sop_phases" },
      { table: "sop_steps" },
      { table: "firm_resources" },
      { table: "sop_step_resources" },
    ],
    [["sop-library"], ["sop-role-insights"]],
  );

  const [tab, setTab] = useState<Tab>("project");
  const [newWfOpen, setNewWfOpen] = useState(false);
  const [resourceDrawerOpen, setResourceDrawerOpen] = useState(false);
  const [openWorkflowId, setOpenWorkflowId] = useState<string | null>(null);
  const [addPhaseTemplateId, setAddPhaseTemplateId] = useState<string | null>(null);
  const [taskEdit, setTaskEdit] = useState<{ phaseId: string; task?: TaskRowData | null } | null>(null);
  const [bulkReassignWorkflow, setBulkReassignWorkflow] = useState<WorkflowCardData | null>(null);
  const [previewResource, setPreviewResource] = useState<TaskRowResource | null>(null);

  const role = (data?.role ?? "team") as string;
  const canManage = role === "principal" || role === "admin";

  const resourcesById = useMemo(() => {
    const map = new Map<string, TaskRowResource>();
    for (const r of data?.resources ?? []) {
      map.set(r.id, r as TaskRowResource);
    }
    return map;
  }, [data?.resources]);

  const stepResourceMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const link of data?.stepResources ?? []) {
      const cur = map.get(link.sop_step_id) ?? [];
      cur.push(link.resource_id);
      map.set(link.sop_step_id, cur);
    }
    return map;
  }, [data?.stepResources]);

  const workflows = useMemo((): WorkflowCardData[] => {
    const templates = (data?.templates ?? [])
      .filter((t) => {
        const wt = (t as { workflow_type?: string | null }).workflow_type ?? "project";
        const active = (t as { is_active?: boolean | null }).is_active;
        const isActive = active == null ? true : active;
        return isActive && (tab === "firm" ? wt === "firm_operation" : wt === "project");
      })
      .sort((a, b) => {
        const aOrder = (a as { sort_order?: number }).sort_order;
        const bOrder = (b as { sort_order?: number }).sort_order;
        if (aOrder != null && bOrder != null && aOrder !== bOrder) return aOrder - bOrder;
        return String(b.created_at).localeCompare(String(a.created_at));
      });
    return templates.map((tpl) => {
      const phases = (data?.phases ?? [])
        .filter((p) => p.template_id === tpl.id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((ph) => {
          const steps = (data?.steps ?? [])
            .filter((s) => s.phase_id === ph.id)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((s) => {
              const resIds = stepResourceMap.get(s.id) ?? [];
              return {
                id: s.id,
                name: (s as { name?: string }).name?.trim() || s.description,
                estimated_hrs: Number(s.estimated_hrs) || 0,
                assigned_role: (s as { assigned_role?: string }).assigned_role ?? "principal",
                assigned_role_label: (s as { assigned_role_label?: string | null }).assigned_role_label ?? null,
                trigger_description: (s as { trigger_description?: string }).trigger_description,
                completion_criteria: (s as { completion_criteria?: string }).completion_criteria,
                steps: (s as { steps?: TaskRowData["steps"] }).steps,
                notes: (s as { notes?: string }).notes,
                resources: resIds.map((id) => resourcesById.get(id)).filter(Boolean) as TaskRowResource[],
              } satisfies TaskRowData;
            });
          return {
            id: ph.id,
            name: ph.name,
            billable: ph.billable,
            estimated_hrs: (ph as { estimated_hrs?: number }).estimated_hrs,
            expected_hrs: Number(ph.expected_hrs) || 0,
            sort_order: ph.sort_order,
            steps,
          };
        });
      return {
        id: tpl.id,
        name: tpl.name,
        icon: (tpl as { icon?: string }).icon,
        workflow_type: (tpl as { workflow_type?: string }).workflow_type,
        estimated_total_hrs: (tpl as { estimated_total_hrs?: number }).estimated_total_hrs,
        phases,
      };
    });
  }, [data, tab, resourcesById, stepResourceMap]);

  const projectStats = useMemo(() => {
    const projectWfs = (data?.templates ?? []).filter(
      (t) => ((t as { workflow_type?: string }).workflow_type ?? "project") === "project" && ((t as { is_active?: boolean }).is_active ?? true),
    );
    const phaseIds = new Set((data?.phases ?? []).filter((p) => projectWfs.some((w) => w.id === p.template_id)).map((p) => p.id));
    const tasks = (data?.steps ?? []).filter((s) => phaseIds.has(s.phase_id));
    const hrsList = projectWfs
      .map((w) => Number((w as { estimated_total_hrs?: number }).estimated_total_hrs) || 0)
      .filter((h) => h > 0);
    const avgHrs = hrsList.length ? hrsList.reduce((a, b) => a + b, 0) / hrsList.length : 0;
    return { workflowCount: projectWfs.length, taskCount: tasks.length, avgHrs };
  }, [data]);

  const firmStats = useMemo(() => {
    const firmWfs = (data?.templates ?? []).filter(
      (t) => (t as { workflow_type?: string }).workflow_type === "firm_operation" && ((t as { is_active?: boolean }).is_active ?? true),
    );
    const phaseIds = new Set((data?.phases ?? []).filter((p) => firmWfs.some((w) => w.id === p.template_id)).map((p) => p.id));
    const stepIds = (data?.steps ?? []).filter((s) => phaseIds.has(s.phase_id)).map((s) => s.id);
    const withRes = stepIds.filter((id) => (stepResourceMap.get(id)?.length ?? 0) > 0).length;
    return { workflowCount: firmWfs.length, taskCount: stepIds.length, tasksWithResources: withRes };
  }, [data, stepResourceMap]);

  const createWfMut = useMutation({
    mutationFn: (payload: Parameters<typeof createWfFn>[0]["data"]) => createWfFn({ data: payload }),
    onSuccess: (wf) => {
      qc.invalidateQueries({ queryKey: ["sop-library"] });
      setNewWfOpen(false);
      setOpenWorkflowId(wf.id);
      toast.success("Workflow created");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Create failed"),
  });

  const renameWfMut = useMutation({
    mutationFn: (payload: Parameters<typeof renameWfFn>[0]["data"]) => renameWfFn({ data: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sop-library"] });
      toast.success("Workflow renamed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Rename failed"),
  });

  const moveWfMut = useMutation({
    mutationFn: (payload: Parameters<typeof moveWfFn>[0]["data"]) => moveWfFn({ data: payload }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["sop-library"] });
      qc.invalidateQueries({ queryKey: ["sop-role-insights"] });
      const label = variables.workflow_type === "firm_operation" ? "Firm operations" : "Project workflows";
      toast.success(`Moved to ${label}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Move failed"),
  });

  const reorderWfsMut = useMutation({
    mutationFn: (payload: Parameters<typeof reorderWfsFn>[0]["data"]) => reorderWfsFn({ data: payload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sop-library"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Reorder failed"),
  });

  const deleteWfMut = useMutation({
    mutationFn: (payload: Parameters<typeof deleteWfFn>[0]["data"]) => deleteWfFn({ data: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sop-library"] });
      qc.invalidateQueries({ queryKey: ["sop-role-insights"] });
      toast.success("Workflow deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const currentWorkflowType = tab === "firm" ? "firm_operation" : "project";

  const reorderWorkflow = useCallback(
    (workflowId: string, direction: "up" | "down") => {
      const ids = workflows.map((w) => w.id);
      const idx = ids.indexOf(workflowId);
      if (idx < 0) return;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= ids.length) return;
      reorderWfsMut.mutate({
        workflow_type: currentWorkflowType,
        ordered_ids: arrayMove(ids, idx, newIdx),
      });
    },
    [workflows, currentWorkflowType, reorderWfsMut],
  );

  const addPhaseMut = useMutation({
    mutationFn: (payload: { template_id: string; name: string; billable?: boolean }) =>
      addPhaseFn({ data: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sop-library"] });
      setAddPhaseTemplateId(null);
      toast.success("Phase added");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const saveStepMut = useMutation({
    mutationFn: async (payload: Parameters<typeof saveStepFn>[0]["data"] & {
      new_resources?: import("@/components/sop/TaskEditModal").TaskInlineResource[];
    }) => {
      const { new_resources, ...stepPayload } = payload;
      const createdIds: string[] = [];
      for (const nr of new_resources ?? []) {
        const saved = await saveResourceFn({
          data: {
            name: nr.name,
            resource_type: nr.resource_type as
              | "email_template"
              | "document_template"
              | "process_doc"
              | "video"
              | "external_link"
              | "contract"
              | "checklist"
              | "other",
            url: nr.url ?? null,
            file_path: nr.file_path ?? null,
            file_name: nr.file_name ?? null,
          },
        });
        createdIds.push((saved as { id: string }).id);
      }
      return saveStepFn({
        data: {
          ...stepPayload,
          resource_ids: [...(stepPayload.resource_ids ?? []), ...createdIds],
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sop-library", "sop-role-insights"] });
      setTaskEdit(null);
      toast.success("Task saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const saveResourceMut = useMutation({
    mutationFn: (payload: Parameters<typeof saveResourceFn>[0]["data"]) => saveResourceFn({ data: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sop-library"] });
      toast.success("Resource saved");
    },
  });

  const deleteResourceMut = useMutation({
    mutationFn: (id: string) => deleteResourceFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sop-library"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const reorderResourcesMut = useMutation({
    mutationFn: (ordered_ids: string[]) => reorderResourcesFn({ data: { ordered_ids } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sop-library"] }),
  });

  const reorderMut = useMutation({
    mutationFn: (payload: { template_id: string; ordered_ids: string[] }) => reorderPhasesFn({ data: payload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sop-library"] }),
  });

  const bulkRolesMut = useMutation({
    mutationFn: (payload: Parameters<typeof bulkRolesFn>[0]["data"]) => bulkRolesFn({ data: payload }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["sop-library"] });
      qc.invalidateQueries({ queryKey: ["sop-role-insights"] });
      const n = (result as { updated?: number })?.updated ?? 0;
      toast.success(`Updated ${n} task${n === 1 ? "" : "s"}`);
      setBulkReassignWorkflow(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Bulk update failed"),
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: "project", label: "Project workflows" },
    { id: "firm", label: "Firm operations" },
    { id: "insights", label: "Role insights" },
  ];

  return (
    <ModulePage
      eyebrow="SOP Library"
      title="Your firm's operating system"
      description="Workflows, tasks, and resources"
      actions={
        canManage ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setResourceDrawerOpen(true)}>
              <FolderOpen className="h-3.5 w-3.5" />
              Resources
            </Button>
            <Button size="sm" className="gap-1.5 bg-charcoal hover:bg-charcoal/90" onClick={() => setNewWfOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              New workflow
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="mb-5 flex gap-0 border-b border-[rgba(44,44,44,0.10)]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={cn(
              "border-b-2 px-4 py-2.5 text-[13px] font-medium transition-colors",
              tab === t.id
                ? "-mb-px border-charcoal text-charcoal"
                : "border-transparent text-muted-lt hover:text-muted",
            )}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-[13px] text-muted-lt">Loading…</p>
      ) : isError ? (
        <div className="rounded-[10px] border border-terra/20 bg-terra/5 px-5 py-4 text-[13px] text-charcoal">
          <p className="font-medium">Could not load workflows</p>
          <p className="mt-1 text-muted-lt">
            {error instanceof Error ? error.message : "Unknown error"}
          </p>
          <p className="mt-2 text-[12px] text-muted-lt">
            If this mentions missing tables or columns, run{" "}
            <code className="rounded bg-white px-1 py-0.5">npm run db:apply-sop-migration</code>.
          </p>
        </div>
      ) : tab === "insights" ? (
        <div>
          {insights ? <RoleInsightsPanel insights={insights} /> : null}
          <div className="mt-5 grid grid-cols-1 gap-2.5 md:grid-cols-3">
            <SopStatTile
              label="Principal hrs / project"
              value={formatHours(insights?.principalHrsPerProject ?? 0)}
              sub="currently handled by you"
            />
            <SopStatTile
              label="Delegatable hrs"
              value={
                (insights?.delegatablePct ?? 0) > 0 ? formatHours(insights?.delegatableHrs ?? 0) : "—"
              }
              sub={
                (insights?.delegatablePct ?? 0) > 0
                  ? `per project · ${Math.round(insights?.delegatablePct ?? 0)}% of total`
                  : "Add task role assignments to see"
              }
            />
            <SopStatTile
              label="Tasks with resources"
              value={`${insights?.tasksWithResources ?? 0} of ${insights?.totalTasks ?? 0}`}
              sub="team-ready tasks"
            />
          </div>
        </div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-1 gap-2.5 md:grid-cols-3">
            {tab === "project" ? (
              <>
                <SopStatTile label="Workflows" value={String(projectStats.workflowCount)} sub="project templates" />
                <SopStatTile label="Tasks defined" value={String(projectStats.taskCount)} sub="across all workflows" />
                <SopStatTile
                  label="Avg project hours"
                  value={projectStats.avgHrs > 0 ? formatHours(projectStats.avgHrs) : "—"}
                  sub="per project template"
                />
              </>
            ) : (
              <>
                <SopStatTile label="Operations" value={String(firmStats.workflowCount)} sub="firm procedures" />
                <SopStatTile label="Tasks defined" value={String(firmStats.taskCount)} sub="across all operations" />
                <SopStatTile
                  label="Tasks with resources"
                  value={String(firmStats.tasksWithResources)}
                  sub="linked to resources"
                />
              </>
            )}
          </div>

          <p className="mb-2.5 text-[10px] uppercase tracking-[0.10em] text-muted-lt">
            {tab === "project" ? "Project workflows" : "Firm operations"}
          </p>

          {workflows.length === 0 ? (
            canManage ? (
              <SopEmptyState onCreate={() => setNewWfOpen(true)} />
            ) : (
              <div className="rounded-[10px] bg-[rgba(44,44,44,0.02)] px-8 py-8 text-center text-[13px] text-muted-lt">
                <LayoutList className="mx-auto mb-2 h-7 w-7" />
                No workflows yet.
              </div>
            )
          ) : (
            workflows.map((wf, index) => (
              <WorkflowCard
                key={wf.id}
                workflow={wf}
                defaultOpen={openWorkflowId === wf.id}
                canManage={canManage}
                onAddPhase={
                  canManage
                    ? (templateId) => {
                        setAddPhaseTemplateId(templateId);
                        setOpenWorkflowId(templateId);
                      }
                    : undefined
                }
                onEditTask={(phaseId, task) => setTaskEdit({ phaseId, task })}
                onAddTask={(phaseId) => setTaskEdit({ phaseId, task: null })}
                onReorderPhases={
                  canManage
                    ? (templateId, orderedIds) => reorderMut.mutate({ template_id: templateId, ordered_ids: orderedIds })
                    : undefined
                }
                onRename={
                  canManage
                    ? async (workflowId, name) => renameWfMut.mutateAsync({ id: workflowId, name })
                    : undefined
                }
                onMove={
                  canManage
                    ? async (workflowId, workflowType) => moveWfMut.mutateAsync({ id: workflowId, workflow_type: workflowType })
                    : undefined
                }
                onDelete={
                  canManage
                    ? async (workflowId) => deleteWfMut.mutateAsync({ id: workflowId })
                    : undefined
                }
                canMoveUp={index > 0}
                canMoveDown={index < workflows.length - 1}
                onMoveUp={
                  canManage ? () => reorderWorkflow(wf.id, "up") : undefined
                }
                onMoveDown={
                  canManage ? () => reorderWorkflow(wf.id, "down") : undefined
                }
                onBulkReassign={canManage ? (workflow) => setBulkReassignWorkflow(workflow) : undefined}
                onOpenResource={setPreviewResource}
                getResourceDownloadUrl={getResourceDownloadUrl}
              />
            ))
          )}
        </>
      )}

      <NewWorkflowModal
        open={newWfOpen}
        onOpenChange={setNewWfOpen}
        saving={createWfMut.isPending}
        onCreate={(payload) => createWfMut.mutate(payload)}
      />

      <AddPhaseModal
        open={!!addPhaseTemplateId}
        onOpenChange={(v) => !v && setAddPhaseTemplateId(null)}
        saving={addPhaseMut.isPending}
        onAdd={({ name, billable }) => {
          if (!addPhaseTemplateId) return;
          addPhaseMut.mutate({ template_id: addPhaseTemplateId, name, billable });
        }}
      />

      <BulkReassignTasksModal
        open={!!bulkReassignWorkflow}
        onOpenChange={(v) => !v && setBulkReassignWorkflow(null)}
        workflow={bulkReassignWorkflow}
        saving={bulkRolesMut.isPending}
        onApply={async (payload) => {
          await bulkRolesMut.mutateAsync(payload);
        }}
      />

      <TaskEditModal
        open={!!taskEdit}
        onOpenChange={(v) => !v && setTaskEdit(null)}
        phaseId={taskEdit?.phaseId ?? null}
        task={taskEdit?.task}
        resources={(data?.resources ?? []) as import("@/components/sop/TaskEditModal").ResourceOption[]}
        linkedResourceIds={taskEdit?.task ? stepResourceMap.get(taskEdit.task.id) : []}
        saving={saveStepMut.isPending}
        onPreviewResource={setPreviewResource}
        onSaveResource={canManage ? async (payload) => saveResourceMut.mutateAsync(payload) : undefined}
        onSave={async (payload) => {
          await saveStepMut.mutateAsync({
            ...payload,
            assigned_role: payload.assigned_role as SopAssignedRole,
            assigned_role_label: payload.assigned_role_label ?? null,
          });
        }}
      />

      <ResourceDrawer
        open={resourceDrawerOpen}
        onClose={() => setResourceDrawerOpen(false)}
        resources={(data?.resources ?? []) as import("@/components/sop/ResourceDrawer").FirmResourceRow[]}
        canManage={canManage}
        saving={saveResourceMut.isPending}
        deleting={deleteResourceMut.isPending}
        onSaveResource={async (payload) => {
          await saveResourceMut.mutateAsync(payload);
        }}
        onDeleteResource={
          canManage ? async (id) => deleteResourceMut.mutateAsync(id) : undefined
        }
        onReorderResources={
          canManage ? async (ordered_ids) => reorderResourcesMut.mutateAsync(ordered_ids) : undefined
        }
        reordering={reorderResourcesMut.isPending}
        onOpenResource={setPreviewResource}
        getResourceDownloadUrl={getResourceDownloadUrl}
      />

      <ResourcePreviewModal resource={previewResource} onClose={() => setPreviewResource(null)} />
    </ModulePage>
  );
}
