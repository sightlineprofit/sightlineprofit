import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { formatWorkflowPeriod } from "@/lib/sop-workflow-period";
import { cn } from "@/lib/utils";

export type TimeLogPhase = {
  id: string;
  project_id: string;
  name: string;
  expected_hrs: number;
  actual_hrs: number;
  sort_order?: number;
  project_workflow_attachment_id?: string | null;
};

export type TimeLogWorkflowAttachment = {
  id: string;
  project_id: string;
  sop_template_id: string;
  period_label: string | null;
  period_start: string | null;
  period_end: string | null;
  sort_order: number;
  template_name: string | null;
};

export type TimeLogProjectStep = {
  id: string;
  project_id: string;
  project_phase_id: string;
  name: string | null;
  description: string;
  estimated_hrs: number;
  actual_hrs: number;
  sort_order?: number;
};

type Group = {
  key: string;
  title: string;
  subtitle: string | null;
  phases: TimeLogPhase[];
};

function buildGroups(
  phases: TimeLogPhase[],
  attachments: TimeLogWorkflowAttachment[],
): Group[] {
  const attById = new Map(attachments.map((a) => [a.id, a]));
  const buckets = new Map<string, TimeLogPhase[]>();

  for (const p of phases) {
    const key = p.project_workflow_attachment_id ?? "__ungrouped__";
    const list = buckets.get(key) ?? [];
    list.push(p);
    buckets.set(key, list);
  }

  const groups: Group[] = [];

  const sortedAtts = [...attachments].sort((a, b) => a.sort_order - b.sort_order);
  for (const att of sortedAtts) {
    const list = buckets.get(att.id);
    if (!list?.length) continue;
    list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    groups.push({
      key: att.id,
      title: att.template_name?.trim() || "Workflow",
      subtitle: formatWorkflowPeriod(att),
      phases: list,
    });
    buckets.delete(att.id);
  }

  const ungrouped = buckets.get("__ungrouped__");
  if (ungrouped?.length) {
    ungrouped.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    groups.push({
      key: "__ungrouped__",
      title: "Other project tasks",
      subtitle: null,
      phases: ungrouped,
    });
  }

  for (const [key, list] of buckets) {
    if (key === "__ungrouped__" || !list.length) continue;
    const att = attById.get(key);
    list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    groups.push({
      key,
      title: att?.template_name?.trim() || "Workflow",
      subtitle: att ? formatWorkflowPeriod(att) : null,
      phases: list,
    });
  }

  return groups;
}

function stepLabel(step: TimeLogProjectStep): string {
  const n = step.name?.trim();
  if (n) return n;
  const d = step.description?.trim();
  if (d && d.length <= 80) return d;
  if (d) return `${d.slice(0, 77)}…`;
  return "Step";
}

export type TimeLogTaskPickerProps = {
  phases: TimeLogPhase[];
  workflowAttachments: TimeLogWorkflowAttachment[];
  projectSteps: TimeLogProjectStep[];
  phaseId: string;
  stepId: string;
  onChange: (next: { phaseId: string; stepId: string }) => void;
};

export function TimeLogTaskPicker({
  phases,
  workflowAttachments,
  projectSteps,
  phaseId,
  stepId,
  onChange,
}: TimeLogTaskPickerProps) {
  const [open, setOpen] = useState(!!phaseId);
  const [q, setQ] = useState("");

  const groups = useMemo(
    () => buildGroups(phases, workflowAttachments),
    [phases, workflowAttachments],
  );

  const stepsByPhase = useMemo(() => {
    const map = new Map<string, TimeLogProjectStep[]>();
    for (const s of projectSteps) {
      const list = map.get(s.project_phase_id) ?? [];
      list.push(s);
      map.set(s.project_phase_id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }
    return map;
  }, [projectSteps]);

  const selectedPhase = phases.find((p) => p.id === phaseId);
  const selectedStep = stepId ? projectSteps.find((s) => s.id === stepId) : null;

  const qLower = q.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!qLower) return groups;
    return groups
      .map((g) => ({
        ...g,
        phases: g.phases.filter((p) => {
          if (p.name.toLowerCase().includes(qLower)) return true;
          const steps = stepsByPhase.get(p.id) ?? [];
          return steps.some((s) => stepLabel(s).toLowerCase().includes(qLower));
        }),
      }))
      .filter((g) => g.phases.length > 0);
  }, [groups, qLower, stepsByPhase]);

  const selectionSummary = selectedStep
    ? `${selectedPhase?.name ?? "Task"} → ${stepLabel(selectedStep)}`
    : selectedPhase?.name ?? null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md border border-border bg-white px-3 py-2 text-left text-xs text-ch/70 hover:bg-creamd"
        >
          <span className="flex min-w-0 items-center gap-2">
            <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", !open && "-rotate-90")} />
            <span className="truncate">Workflow task or step (optional)</span>
          </span>
          {selectionSummary ? (
            <span className="ml-2 max-w-[55%] truncate rounded bg-goldp/40 px-2 py-0.5 text-[11px] text-ch">
              {selectionSummary}
            </span>
          ) : null}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 rounded-md border border-border bg-cream/40 p-2">
        {phases.length > 6 && (
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by task or step…"
            className="mb-2 h-8 text-xs"
          />
        )}
        <button
          type="button"
          onClick={() => onChange({ phaseId: "", stepId: "" })}
          className={cn(
            "mb-2 block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-white",
            !phaseId && "bg-white font-medium",
          )}
        >
          — None —
        </button>
        <div className="max-h-64 space-y-3 overflow-y-auto">
          {filteredGroups.map((group) => (
            <div key={group.key}>
              <div className="sticky top-0 z-[1] bg-cream/95 px-2 py-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ch/55">{group.title}</p>
                {group.subtitle ? <p className="text-[11px] text-gold">{group.subtitle}</p> : null}
              </div>
              <div className="space-y-1 pl-1">
                {group.phases.map((p) => {
                  const steps = stepsByPhase.get(p.id) ?? [];
                  const over = p.actual_hrs > p.expected_hrs && p.expected_hrs > 0;
                  const phaseActive = phaseId === p.id && !stepId;

                  if (steps.length === 0) {
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onChange({ phaseId: p.id, stepId: "" })}
                        className={cn(
                          "block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-white",
                          phaseActive && "bg-white font-medium text-gold",
                        )}
                      >
                        {p.name}{" "}
                        <span className="text-ch/50">
                          ({p.actual_hrs.toFixed(1)}/{p.expected_hrs.toFixed(0)}h){over ? " ⚠" : ""}
                        </span>
                      </button>
                    );
                  }

                  return (
                    <div key={p.id} className="rounded border border-border/60 bg-white/50 px-1 py-1">
                      <p className="px-1 py-0.5 text-[11px] font-medium text-ch/75">
                        {p.name}{" "}
                        <span className="font-normal text-ch/45">
                          ({p.actual_hrs.toFixed(1)}/{p.expected_hrs.toFixed(0)}h)
                        </span>
                      </p>
                      <div className="space-y-0.5 pl-2">
                        {steps.map((s) => {
                          const active = stepId === s.id;
                          const sOver = s.actual_hrs > s.estimated_hrs && s.estimated_hrs > 0;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => onChange({ phaseId: p.id, stepId: s.id })}
                              className={cn(
                                "block w-full rounded px-2 py-1 text-left text-[11px] hover:bg-creamd",
                                active && "bg-goldp/35 font-medium text-ch",
                              )}
                            >
                              {stepLabel(s)}{" "}
                              <span className="text-ch/45">
                                ({Number(s.actual_hrs).toFixed(1)}/{Number(s.estimated_hrs).toFixed(0)}h)
                                {sOver ? " ⚠" : ""}
                              </span>
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => onChange({ phaseId: p.id, stepId: "" })}
                          className={cn(
                            "block w-full rounded px-2 py-0.5 text-left text-[10px] italic text-ch/50 hover:bg-creamd",
                            phaseId === p.id && !stepId && "font-medium not-italic text-gold",
                          )}
                        >
                          Whole task (no specific step)
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
