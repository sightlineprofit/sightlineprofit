import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  assignedRoleDisplayLabel,
  roleStyle,
  SOP_ROLE_OPTIONS,
  type SopAssignedRole,
} from "@/lib/sop-roles";
import type { WorkflowCardData } from "@/components/sop/WorkflowCard";
import type { TaskRowData } from "@/components/sop/TaskRow";

export function BulkReassignTasksModal({
  open,
  onOpenChange,
  workflow,
  saving,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflow: WorkflowCardData | null;
  saving?: boolean;
  onApply: (payload: {
    step_ids: string[];
    assigned_role: SopAssignedRole;
    assigned_role_label: string | null;
  }) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [role, setRole] = useState<SopAssignedRole>("coordinator");
  const [roleLabel, setRoleLabel] = useState("");

  const tasksByPhase = useMemo(() => {
    if (!workflow) return [];
    return workflow.phases.map((ph) => ({
      phaseId: ph.id,
      phaseName: ph.name,
      tasks: ph.steps,
    }));
  }, [workflow]);

  const allTaskIds = useMemo(
    () => tasksByPhase.flatMap((p) => p.tasks.map((t) => t.id)),
    [tasksByPhase],
  );

  useEffect(() => {
    if (!open || !workflow) return;
    setSelected(new Set(allTaskIds));
    setRole("coordinator");
    setRoleLabel("");
  }, [open, workflow, allTaskIds]);

  function toggleTask(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePhase(tasks: TaskRowData[]) {
    const ids = tasks.map((t) => t.id);
    const allOn = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function handleApply() {
    const step_ids = [...selected];
    if (!step_ids.length) {
      toast.error("Select at least one task");
      return;
    }
    if (role === "other" && !roleLabel.trim()) {
      toast.error("Enter who handles these tasks");
      return;
    }
    try {
      await onApply({
        step_ids,
        assigned_role: role,
        assigned_role_label: role === "other" ? roleLabel.trim() : null,
      });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update tasks");
    }
  }

  if (!workflow) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-lg flex-col overflow-hidden rounded-xl p-0">
        <DialogHeader className="border-b border-[rgba(44,44,44,0.08)] px-6 py-4">
          <DialogTitle className="font-voice text-xl font-normal text-charcoal">Reassign tasks</DialogTitle>
          <p className="text-[12px] text-muted-lt">
            Update who handles selected tasks in <span className="font-medium text-charcoal">{workflow.name}</span>.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-6 py-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="text-[11px] text-gold underline"
              onClick={() => setSelected(new Set(allTaskIds))}
            >
              Select all ({allTaskIds.length})
            </button>
            <span className="text-[11px] text-muted-lt">·</span>
            <button type="button" className="text-[11px] text-gold underline" onClick={() => setSelected(new Set())}>
              Clear
            </button>
            <span className="ml-auto text-[11px] text-muted-lt">{selected.size} selected</span>
          </div>

          <div className="mb-5 space-y-4">
            {tasksByPhase.map(({ phaseId, phaseName, tasks }) => {
              if (!tasks.length) return null;
              const phaseAll = tasks.every((t) => selected.has(t.id));
              const phaseSome = tasks.some((t) => selected.has(t.id));
              return (
                <div key={phaseId}>
                  <label className="mb-2 flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-[rgba(44,44,44,0.25)]"
                      checked={phaseAll}
                      ref={(el) => {
                        if (el) el.indeterminate = !phaseAll && phaseSome;
                      }}
                      onChange={() => togglePhase(tasks)}
                    />
                    <span className="text-[12px] font-medium text-charcoal">{phaseName}</span>
                  </label>
                  <ul className="ml-5 space-y-1.5">
                    {tasks.map((task) => {
                      const rs = roleStyle(task.assigned_role);
                      const current = assignedRoleDisplayLabel(
                        task.assigned_role,
                        task.assigned_role_label,
                      );
                      return (
                        <li key={task.id}>
                          <label className="flex cursor-pointer items-start gap-2 rounded-md py-1 hover:bg-[rgba(44,44,44,0.03)]">
                            <input
                              type="checkbox"
                              className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-[rgba(44,44,44,0.25)]"
                              checked={selected.has(task.id)}
                              onChange={() => toggleTask(task.id)}
                            />
                            <span className="min-w-0 flex-1 text-[12px] text-charcoal">{task.name}</span>
                            <span
                              className="shrink-0 rounded-[8px] px-1.5 py-0.5 text-[10px] font-medium"
                              style={{ color: rs.text, background: rs.bg }}
                            >
                              {current}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>

          <label className="mb-2 block text-[12px] font-medium text-charcoal">Assign to</label>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SOP_ROLE_OPTIONS.map((opt) => {
              const active = role === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  className={cn(
                    "rounded-md border border-[rgba(44,44,44,0.12)] px-3 py-1.5 text-[12px] font-medium",
                    active ? "border-charcoal bg-[rgba(44,44,44,0.08)] text-charcoal" : "bg-cream text-muted-lt",
                  )}
                  onClick={() => {
                    setRole(opt.value);
                    if (opt.value !== "other") setRoleLabel("");
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {role === "other" ? (
            <Input
              value={roleLabel}
              onChange={(e) => setRoleLabel(e.target.value)}
              placeholder="Custom role name"
              maxLength={80}
              className="mb-2"
            />
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-[rgba(44,44,44,0.08)] px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-charcoal hover:bg-charcoal/90"
            disabled={saving || selected.size === 0}
            onClick={() => void handleApply()}
          >
            {saving ? "Updating…" : `Update ${selected.size} task${selected.size === 1 ? "" : "s"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
