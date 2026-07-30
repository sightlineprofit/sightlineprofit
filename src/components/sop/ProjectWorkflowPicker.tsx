import { useMemo } from "react";
import { Home, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatHours } from "@/lib/finance";
import { Checkbox } from "@/components/ui/checkbox";
import { WorkflowPickerEmpty } from "@/components/sop/WorkflowConfirmDialogs";

export type WorkflowPickerOption = {
  id: string;
  name: string;
  icon?: string | null;
  workflowType?: string | null;
  phaseCount: number;
  taskCount: number;
  totalHrs: number;
};

export type WorkflowPhasePreview = {
  name: string;
  expected_hrs: number;
  billable: boolean;
};

function WorkflowRowIcon({ workflowType }: { workflowType?: string | null }) {
  const isFirm = workflowType === "firm_operation";
  return (
    <span
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
        isFirm ? "bg-[rgba(184,134,11,0.12)] text-gold" : "bg-[rgba(92,138,110,0.12)] text-sage",
      )}
    >
      {isFirm ? <LayoutList className="h-3.5 w-3.5" /> : <Home className="h-3.5 w-3.5" />}
    </span>
  );
}

function WorkflowSection({
  title,
  hint,
  workflows,
  selectedIds,
  onToggle,
}: {
  title: string;
  hint?: string;
  workflows: WorkflowPickerOption[];
  selectedIds: string[];
  onToggle: (id: string, checked: boolean) => void;
}) {
  if (!workflows.length) return null;
  return (
    <div className="space-y-1.5">
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.10em] text-muted-lt">{title}</p>
        {hint ? <p className="mt-0.5 text-[11px] leading-snug text-muted-lt">{hint}</p> : null}
      </div>
      {workflows.map((w) => {
        const checked = selectedIds.includes(w.id);
        return (
          <label
            key={w.id}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors",
              checked
                ? "border-sage bg-[rgba(92,138,110,0.06)]"
                : "border-[rgba(44,44,44,0.12)] bg-white hover:border-[rgba(44,44,44,0.20)]",
            )}
          >
            <Checkbox checked={checked} onCheckedChange={(v) => onToggle(w.id, !!v)} />
            <WorkflowRowIcon workflowType={w.workflowType} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-charcoal">{w.name}</span>
              <span className="block text-[11px] text-muted-lt">
                {w.taskCount} tasks · {formatHours(w.totalHrs)}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function ProjectWorkflowPicker({
  workflows,
  loading,
  selectedIds,
  onSelectionChange,
  previewPhases,
  previewTaskCount,
}: {
  workflows: WorkflowPickerOption[];
  loading?: boolean;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  previewPhases: WorkflowPhasePreview[];
  previewTaskCount: number;
}) {
  const projectWorkflows = workflows.filter((w) => w.workflowType !== "firm_operation");
  const firmWorkflows = workflows.filter((w) => w.workflowType === "firm_operation");
  const phasePreview = useMemo(() => previewPhases.filter((p) => p.name.trim()), [previewPhases]);

  function toggle(id: string, checked: boolean) {
    if (checked) onSelectionChange([...selectedIds, id]);
    else onSelectionChange(selectedIds.filter((x) => x !== id));
  }

  return (
    <div className="mb-5 space-y-3">
      <div>
        <p className="text-[13px] font-medium text-charcoal">Apply workflow templates</p>
        <p className="mt-0.5 text-[12px] text-muted-lt">
          Choose one or more workflows. Firm operations (like project close-out) are added after your project phases.
        </p>
      </div>

      {loading ? (
        <p className="text-[12px] text-muted-lt">Loading workflows…</p>
      ) : workflows.length === 0 ? (
        <WorkflowPickerEmpty className="rounded-lg border border-dashed border-[rgba(44,44,44,0.12)] bg-cream/40 p-4 text-[13px] text-muted-lt" />
      ) : (
        <div
          className="max-h-[min(320px,42vh)] space-y-4 overflow-y-auto overscroll-contain rounded-lg border border-[rgba(44,44,44,0.08)] bg-cream/30 p-2.5"
          aria-label="Workflow templates"
        >
          <WorkflowSection
            title="Project workflows"
            workflows={projectWorkflows}
            selectedIds={selectedIds}
            onToggle={toggle}
          />
          <WorkflowSection
            title="Firm operations"
            hint="These append at the end — useful for close-out, invoicing, or handoff steps."
            workflows={firmWorkflows}
            selectedIds={selectedIds}
            onToggle={toggle}
          />
        </div>
      )}

      {selectedIds.length === 0 && workflows.length > 0 ? (
        <p className="text-[12px] text-muted-lt">
          No templates selected — add phases manually below, or check one or more workflows above.
        </p>
      ) : null}

      {selectedIds.length > 0 && phasePreview.length > 0 ? (
        <div className="rounded-lg border border-[rgba(44,44,44,0.10)] bg-[rgba(44,44,44,0.02)] px-3.5 py-3">
          <p className="mb-2 text-[11px] uppercase tracking-[0.08em] text-muted-lt">Combined phase preview</p>
          <ul className="space-y-1">
            {phasePreview.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-2 pl-2 text-[12px] text-muted-lt">
                <span>{p.name}</span>
                <span className="text-muted-lt">{formatHours(p.expected_hrs)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[12px] text-muted-lt">
            {selectedIds.length} workflow{selectedIds.length === 1 ? "" : "s"} · {phasePreview.length} phase
            {phasePreview.length === 1 ? "" : "s"} · {previewTaskCount} task{previewTaskCount === 1 ? "" : "s"}
          </p>
        </div>
      ) : null}

      {!workflows.length && !loading ? (
        <div className="flex items-center gap-2 text-[12px] text-muted-lt">
          <LayoutList className="h-4 w-4" />
          You can add phases manually below.
        </div>
      ) : null}
    </div>
  );
}
