import { useState } from "react";
import { Link } from "@tanstack/react-router";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { orderWorkflowIdsForAttach } from "@/lib/sop-workflow-order";
import { Input } from "@/components/ui/input";
import type { WorkflowPeriodInput } from "@/lib/sop-workflow-period";

export type AttachableWorkflowTemplate = {
  id: string;
  name: string;
  category?: string | null;
  workflowType?: string | null;
};

export function WorkflowAttachDialog({
  open,
  onOpenChange,
  templates,
  pickedIds,
  onPickedIdsChange,
  onAttach,
  attaching,
  appendMode,
  period,
  onPeriodChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templates: AttachableWorkflowTemplate[];
  pickedIds: string[];
  onPickedIdsChange: (ids: string[]) => void;
  onAttach: () => void;
  attaching?: boolean;
  /** When true, new workflows stack on existing scope (repeat monthly, etc.). */
  appendMode?: boolean;
  period?: WorkflowPeriodInput;
  onPeriodChange?: (period: WorkflowPeriodInput) => void;
}) {
  const orderedCount = orderWorkflowIdsForAttach(pickedIds, templates).length;
  const projectTemplates = templates.filter((t) => t.workflowType !== "firm_operation");
  const firmTemplates = templates.filter((t) => t.workflowType === "firm_operation");
  const periodState = period ?? {};
  const setPeriod = onPeriodChange ?? (() => {});

  function toggle(id: string, checked: boolean) {
    if (checked) onPickedIdsChange([...pickedIds, id]);
    else onPickedIdsChange(pickedIds.filter((x) => x !== id));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(640px,90vh)] max-w-lg flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{appendMode ? "Add workflow period" : "Attach workflows"}</DialogTitle>
          <DialogDescription>
            {appendMode
              ? "Add another copy of a workflow for a new period (e.g. monthly retainer cycle). Existing scope stays in place."
              : "Select one or more workflows to add phases and tasks. Firm operations append at the end of your project scope."}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain py-1">
          <div className="space-y-2 rounded-lg border border-[rgba(44,44,44,0.10)] bg-cream/40 p-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.10em] text-muted-lt">Period (optional)</p>
            <p className="text-[11px] leading-snug text-muted-lt">
              Label this run so your team knows which cycle they are working in — e.g. &quot;March 2026&quot; or &quot;Phase 2&quot;.
            </p>
            <Input
              placeholder="Period label — e.g. April 2026"
              value={periodState.period_label ?? ""}
              onChange={(e) => setPeriod({ ...periodState, period_label: e.target.value })}
              className="h-9 text-[13px]"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[10px] text-muted-lt">Start date</label>
                <Input
                  type="date"
                  value={periodState.period_start ?? ""}
                  onChange={(e) => setPeriod({ ...periodState, period_start: e.target.value })}
                  className="h-9 text-[13px]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-muted-lt">End date</label>
                <Input
                  type="date"
                  value={periodState.period_end ?? ""}
                  onChange={(e) => setPeriod({ ...periodState, period_end: e.target.value })}
                  className="h-9 text-[13px]"
                />
              </div>
            </div>
          </div>
          <WorkflowAttachSection
            title="Project workflows"
            templates={projectTemplates}
            pickedIds={pickedIds}
            onToggle={toggle}
          />
          <WorkflowAttachSection
            title="Firm operations"
            hint="Close-out, invoicing, handoff, and other steps that run after project delivery."
            templates={firmTemplates}
            pickedIds={pickedIds}
            onToggle={toggle}
          />
          {!templates.length ? (
            <p className="text-[13px] text-muted-lt">No active workflows in your library.</p>
          ) : null}
        </div>
        <DialogFooter className="shrink-0 border-t border-border pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-ch text-cream hover:bg-ch/90"
            disabled={orderedCount === 0 || attaching}
            onClick={onAttach}
          >
            {attaching ? "Attaching…" : appendMode ? `Add ${orderedCount || ""} workflow${orderedCount === 1 ? "" : "s"} →` : `Attach ${orderedCount || ""} workflow${orderedCount === 1 ? "" : "s"} →`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WorkflowAttachSection({
  title,
  hint,
  templates,
  pickedIds,
  onToggle,
}: {
  title: string;
  hint?: string;
  templates: AttachableWorkflowTemplate[];
  pickedIds: string[];
  onToggle: (id: string, checked: boolean) => void;
}) {
  if (!templates.length) return null;
  return (
    <div className="space-y-2">
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.10em] text-muted-lt">{title}</p>
        {hint ? <p className="mt-0.5 text-[11px] leading-snug text-muted-lt">{hint}</p> : null}
      </div>
      <div className="space-y-1.5">
        {templates.map((t) => {
          const checked = pickedIds.includes(t.id);
          return (
            <label
              key={t.id}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5",
                checked ? "border-sage bg-[rgba(92,138,110,0.06)]" : "border-border bg-white",
              )}
            >
              <Checkbox checked={checked} onCheckedChange={(v) => onToggle(t.id, !!v)} className="mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-charcoal">{t.name}</span>
                {t.category ? (
                  <span className="block text-[11px] text-muted-lt">{t.category}</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function WorkflowChangeDialog({
  open,
  onOpenChange,
  onConfirm,
  confirming,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
  confirming?: boolean;
}) {
  const [checked, setChecked] = useState(false);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setChecked(false);
        onOpenChange(v);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Change workflow?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-[13px] leading-relaxed text-muted-lt">
              <p>
                Changing the workflow will replace all template-based tasks on this project. Manually created tasks are
                kept.
              </p>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-[rgba(44,44,44,0.12)] p-3">
                <Checkbox checked={checked} onCheckedChange={(v) => setChecked(!!v)} className="mt-0.5" />
                <span>I understand template-based tasks will be replaced</span>
              </label>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button className="bg-ch text-cream hover:bg-ch/90" disabled={!checked || confirming} onClick={onConfirm}>
            Confirm change →
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function WorkflowRemoveDialog({
  open,
  onOpenChange,
  onConfirm,
  confirming,
  title,
  description,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
  confirming?: boolean;
  title?: string;
  description?: string;
}) {
  const [checked, setChecked] = useState(false);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setChecked(false);
        onOpenChange(v);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title ?? "Remove workflow?"}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-[13px] leading-relaxed text-muted-lt">
              <p>
                {description ??
                  "This will remove all template tasks from this project. Manually created tasks are preserved."}
              </p>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-[rgba(44,44,44,0.12)] p-3">
                <Checkbox checked={checked} onCheckedChange={(v) => setChecked(!!v)} className="mt-0.5" />
                <span>I understand template-based tasks will be removed</span>
              </label>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={!checked || confirming} onClick={onConfirm}>
            Remove →
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function WorkflowPickerEmpty({ className }: { className?: string }) {
  return (
    <p className={className ?? "text-[12px] text-muted-lt"}>
      No workflow templates yet.{" "}
      <Link to="/sop-library" className="text-gold underline">
        Create one in the SOP Library →
      </Link>
    </p>
  );
}
