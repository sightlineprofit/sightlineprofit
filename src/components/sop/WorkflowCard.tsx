import { useMemo, useState, useEffect, useRef } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Bath,
  Building2,
  ChevronDown,
  FileText,
  GripVertical,
  Home,
  LayoutList,
  Mail,
  MoreVertical,
  Pencil,
  Star,
  Trash2,
  UserPlus,
  Users,
  ArrowDown,
  ArrowUp,
  ArrowRightLeft,
  UserRoundCog,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatHours } from "@/lib/finance";
import { assignedRoleDisplayLabel, roleStyle } from "@/lib/sop-roles";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TaskRow, type TaskRowData, type TaskRowResource } from "@/components/sop/TaskRow";

export type WorkflowPhase = {
  id: string;
  name: string;
  billable: boolean;
  estimated_hrs?: number | null;
  expected_hrs: number;
  sort_order: number;
  steps: TaskRowData[];
};

export type WorkflowCardData = {
  id: string;
  name: string;
  icon?: string | null;
  workflow_type?: string | null;
  estimated_total_hrs?: number | null;
  phases: WorkflowPhase[];
};

const ICON_MAP: Record<string, typeof Home> = {
  home: Home,
  bath: Bath,
  building: Building2,
  users: Users,
  "user-plus": UserPlus,
  mail: Mail,
  "file-text": FileText,
  star: Star,
};

function WorkflowIcon({ icon, workflowType }: { icon?: string | null; workflowType?: string | null }) {
  const key = (icon ?? "").replace(/^ti-/, "");
  const Icon = ICON_MAP[key] ?? LayoutList;
  const isFirm = workflowType === "firm_operation";
  return (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
        isFirm ? "bg-[rgba(184,134,11,0.12)] text-gold" : "bg-[rgba(92,138,110,0.12)] text-sage",
      )}
    >
      <Icon className="h-4 w-4" />
    </div>
  );
}

function SortablePhase({
  phase,
  canManage,
  onEditTask,
  onAddTask,
  onOpenResource,
  getResourceDownloadUrl,
}: {
  phase: WorkflowPhase;
  canManage: boolean;
  onEditTask: (phaseId: string, task?: TaskRowData) => void;
  onAddTask: (phaseId: string) => void;
  onOpenResource: (r: TaskRowResource) => void;
  getResourceDownloadUrl?: (path: string) => Promise<string>;
}) {
  const hrs = Number(phase.estimated_hrs ?? phase.expected_hrs) || 0;
  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium text-charcoal">{phase.name}</span>
          <span
            className={cn(
              "rounded-[10px] px-2 py-0.5 text-[10px]",
              phase.billable ? "bg-[rgba(92,138,110,0.10)] text-sage" : "bg-[rgba(184,134,11,0.10)] text-gold",
            )}
          >
            {phase.billable ? "Billable" : "Non-billable"}
          </span>
        </div>
        <span className="text-[11px] text-muted-lt">{formatHours(hrs)}</span>
      </div>
      <div>
        {phase.steps.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            canManage={canManage}
            onEdit={() => onEditTask(phase.id, task)}
            onAddResource={() => onEditTask(phase.id, task)}
            onOpenResource={onOpenResource}
            getResourceDownloadUrl={getResourceDownloadUrl}
          />
        ))}
      </div>
      {canManage ? (
        <button
          type="button"
          className="mt-1.5 text-[11px] text-gold underline"
          onClick={() => onAddTask(phase.id)}
        >
          + Add task
        </button>
      ) : null}
    </div>
  );
}

function SortablePhaseShell({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className="flex gap-2">
      <button type="button" className="mt-3 cursor-grab text-muted-lt" {...attributes} {...listeners}>
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function WorkflowCard({
  workflow,
  defaultOpen = false,
  canManage = false,
  onAddPhase,
  onEditTask,
  onAddTask,
  onReorderPhases,
  onRename,
  onMove,
  onDelete,
  canMoveUp = false,
  canMoveDown = false,
  onMoveUp,
  onMoveDown,
  onBulkReassign,
  onOpenResource,
  getResourceDownloadUrl,
}: {
  workflow: WorkflowCardData;
  defaultOpen?: boolean;
  canManage?: boolean;
  onAddPhase?: (workflowId: string) => void;
  onEditTask: (phaseId: string, task?: TaskRowData) => void;
  onAddTask: (phaseId: string) => void;
  onReorderPhases?: (workflowId: string, orderedIds: string[]) => void;
  onRename?: (workflowId: string, name: string) => Promise<void>;
  onMove?: (workflowId: string, workflowType: "project" | "firm_operation") => Promise<void>;
  onDelete?: (workflowId: string) => Promise<void>;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onBulkReassign?: (workflow: WorkflowCardData) => void;
  onOpenResource: (r: TaskRowResource) => void;
  getResourceDownloadUrl?: (path: string) => Promise<string>;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(workflow.name);
  const [savingName, setSavingName] = useState(false);
  const [moveConfirmOpen, setMoveConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const isFirmWorkflow = workflow.workflow_type === "firm_operation";
  const targetWorkflowType = isFirmWorkflow ? "project" : "firm_operation";
  const targetTabLabel = isFirmWorkflow ? "Project workflows" : "Firm operations";
  const showActionsMenu = canManage && (onMove || onDelete || onMoveUp || onMoveDown || onBulkReassign);
  const allTasks = workflow.phases.flatMap((p) => p.steps);
  const totalHrs =
    Number(workflow.estimated_total_hrs) ||
    allTasks.reduce((s, t) => s + (Number(t.estimated_hrs) || 0), 0);
  const uniqueRoleBadges = useMemo(() => {
    const seen = new Set<string>();
    const out: { roleKey: string; label: string }[] = [];
    for (const t of allTasks) {
      const roleKey = t.assigned_role ?? "principal";
      const label = assignedRoleDisplayLabel(
        t.assigned_role,
        (t as { assigned_role_label?: string | null }).assigned_role_label,
      );
      const dedupe = `${roleKey}\0${label}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({ roleKey, label });
    }
    return out;
  }, [allTasks]);
  const roleLabels = uniqueRoleBadges.slice(0, 3).map((r) => r.label);
  const extraRoles = Math.max(0, uniqueRoleBadges.length - 3);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const phaseIds = useMemo(() => workflow.phases.map((p) => p.id), [workflow.phases]);

  useEffect(() => {
    setNameDraft(workflow.name);
  }, [workflow.id, workflow.name]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  async function commitRename() {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameDraft(workflow.name);
      setEditingName(false);
      return;
    }
    if (trimmed === workflow.name) {
      setEditingName(false);
      return;
    }
    if (!onRename) {
      setEditingName(false);
      return;
    }
    try {
      setSavingName(true);
      await onRename(workflow.id, trimmed);
      setEditingName(false);
    } catch {
      setNameDraft(workflow.name);
      setEditingName(false);
    } finally {
      setSavingName(false);
    }
  }

  function startRename(e: React.MouseEvent) {
    e.stopPropagation();
    if (!canManage || !onRename || savingName) return;
    setNameDraft(workflow.name);
    setEditingName(true);
  }

  async function confirmMove() {
    if (!onMove) return;
    try {
      setMoving(true);
      await onMove(workflow.id, targetWorkflowType);
      setMoveConfirmOpen(false);
    } finally {
      setMoving(false);
    }
  }

  async function confirmDelete() {
    if (!onDelete) return;
    try {
      setDeleting(true);
      await onDelete(workflow.id);
      setDeleteConfirmOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorderPhases) return;
    const oldIndex = phaseIds.indexOf(String(active.id));
    const newIndex = phaseIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorderPhases(workflow.id, arrayMove(phaseIds, oldIndex, newIndex));
  };

  return (
    <div className="mb-2.5 overflow-hidden rounded-[10px] border border-[rgba(44,44,44,0.10)] bg-white">
      <div className="flex items-center justify-between gap-3 px-[18px] py-3.5">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          onClick={() => setOpen((v) => !v)}
        >
          <WorkflowIcon icon={workflow.icon} workflowType={workflow.workflow_type} />
          <div className="min-w-0">
            {editingName ? (
              <Input
                ref={nameInputRef}
                value={nameDraft}
                disabled={savingName}
                className="h-8 text-[14px] font-medium"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") void commitRename();
                  if (e.key === "Escape") {
                    setNameDraft(workflow.name);
                    setEditingName(false);
                  }
                }}
                onBlur={() => void commitRename()}
              />
            ) : (
              <div className="flex min-w-0 items-center gap-1.5">
                <div className="truncate text-[14px] font-medium text-charcoal">{workflow.name}</div>
                {canManage && onRename ? (
                  <button
                    type="button"
                    className="shrink-0 text-muted-lt hover:text-charcoal"
                    title="Rename workflow"
                    onClick={startRename}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
            )}
            <div className="text-[11px] text-muted-lt">
              {workflow.phases.length} phases · {allTasks.length} tasks · {formatHours(totalHrs)}
              {roleLabels.length ? ` · ${roleLabels.join(", ")}${extraRoles > 0 ? ` +${extraRoles} more` : ""}` : ""}
            </div>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {uniqueRoleBadges.slice(0, 3).map(({ roleKey, label }) => {
            const s = roleStyle(roleKey);
            return (
              <span
                key={`${roleKey}-${label}`}
                className="rounded-[10px] px-2 py-0.5 text-[10px] font-medium"
                style={{ color: s.text, background: s.bg }}
              >
                {label}
              </span>
            );
          })}
          {extraRoles > 0 ? (
            <span className="rounded-[10px] bg-[rgba(44,44,44,0.06)] px-2 py-0.5 text-[10px] text-muted-lt">
              +{extraRoles} more
            </span>
          ) : null}
          {showActionsMenu ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded-md p-1 text-muted-lt hover:bg-[rgba(44,44,44,0.06)] hover:text-charcoal"
                  aria-label="Workflow options"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {onMove ? (
                  <DropdownMenuItem
                    onClick={() => setMoveConfirmOpen(true)}
                    className="gap-2 text-[13px]"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    Move to {targetTabLabel}
                  </DropdownMenuItem>
                ) : null}
                {onMoveUp ? (
                  <DropdownMenuItem
                    disabled={!canMoveUp}
                    onClick={() => onMoveUp()}
                    className="gap-2 text-[13px]"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                    Move up
                  </DropdownMenuItem>
                ) : null}
                {onMoveDown ? (
                  <DropdownMenuItem
                    disabled={!canMoveDown}
                    onClick={() => onMoveDown()}
                    className="gap-2 text-[13px]"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                    Move down
                  </DropdownMenuItem>
                ) : null}
                {onBulkReassign && allTasks.length > 0 ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onBulkReassign(workflow)}
                      className="gap-2 text-[13px]"
                    >
                      <UserRoundCog className="h-3.5 w-3.5" />
                      Reassign tasks…
                    </DropdownMenuItem>
                  </>
                ) : null}
                {onDelete ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setDeleteConfirmOpen(true)}
                      className="gap-2 text-[13px] text-terra focus:text-terra"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete workflow
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <button
            type="button"
            className="rounded-md p-0.5 text-muted-lt hover:text-charcoal"
            aria-label={open ? "Collapse workflow" : "Expand workflow"}
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-[rgba(44,44,44,0.10)] px-[18px] pb-3.5">
          {canManage && onReorderPhases ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={phaseIds} strategy={verticalListSortingStrategy}>
                {workflow.phases.map((phase) => (
                  <SortablePhaseShell key={phase.id} id={phase.id}>
                    <SortablePhase
                      phase={phase}
                      canManage={canManage}
                      onEditTask={onEditTask}
                      onAddTask={onAddTask}
                      onOpenResource={onOpenResource}
                      getResourceDownloadUrl={getResourceDownloadUrl}
                    />
                  </SortablePhaseShell>
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            workflow.phases.map((phase) => (
              <SortablePhase
                key={phase.id}
                phase={phase}
                canManage={canManage}
                onEditTask={onEditTask}
                onAddTask={onAddTask}
                onOpenResource={onOpenResource}
                getResourceDownloadUrl={getResourceDownloadUrl}
              />
            ))
          )}
          {canManage && onAddPhase ? (
            <button
              type="button"
              className="mt-2.5 text-[12px] text-gold underline"
              onClick={() => onAddPhase(workflow.id)}
            >
              + Add phase
            </button>
          ) : null}
        </div>
      ) : null}

      <AlertDialog open={moveConfirmOpen} onOpenChange={setMoveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move workflow to {targetTabLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-charcoal">{workflow.name}</span> will appear under{" "}
              {targetTabLabel} instead. Existing projects already using this workflow keep their tasks; only where
              the template shows up in the library changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={moving}>Cancel</AlertDialogCancel>
            <Button className="bg-charcoal hover:bg-charcoal/90" disabled={moving} onClick={() => void confirmMove()}>
              {moving ? "Moving…" : `Move to ${targetTabLabel}`}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {workflow.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the workflow from your library. Projects already using it keep their existing tasks and
              phases. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {deleting ? "Deleting…" : "Delete workflow"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function SopStatTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[10px] border border-[rgba(44,44,44,0.10)] bg-white px-4 py-3.5">
      <div className="mb-1 text-[11px] text-muted-lt">{label}</div>
      <div className="font-voice text-[22px] text-charcoal">{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-lt">{sub}</div>
    </div>
  );
}

export function SopEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-[10px] bg-[rgba(44,44,44,0.02)] px-8 py-8 text-center">
      <LayoutList className="mx-auto mb-2.5 h-7 w-7 text-muted-lt" />
      <h3 className="font-voice text-xl text-charcoal">Build once. Run every time.</h3>
      <p className="mx-auto mt-2 max-w-[380px] text-[13px] leading-relaxed text-muted-lt">
        Create your first project workflow to define exactly how every project runs — who does what, when, and how.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {["↑ Consistent client experience", "→ Easy delegation", "◆ Sellable systems"].map((pill) => (
          <span
            key={pill}
            className="rounded-full border border-[rgba(44,44,44,0.12)] bg-white px-3 py-1 text-[11px] font-medium text-muted-lt"
          >
            {pill}
          </span>
        ))}
      </div>
      <button
        type="button"
        className="mt-4 rounded-lg bg-charcoal px-4 py-2 text-[13px] font-medium text-white hover:bg-charcoal/90"
        onClick={onCreate}
      >
        + Create first workflow
      </button>
    </div>
  );
}
