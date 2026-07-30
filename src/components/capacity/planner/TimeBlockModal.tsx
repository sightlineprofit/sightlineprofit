import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { saveLifeEvent, deleteLifeEvent } from "@/lib/capacity.functions";
import type { FirmLifeEvent } from "@/lib/finance";
import { LifeEventFormFields } from "@/components/capacity/planner/LifeEventFormFields";
import {
  CommitmentForm,
  type CommitmentScheduleKind,
} from "@/components/capacity/planner/CommitmentForm";
import { Calendar, Heart, Briefcase } from "lucide-react";

type PickKind = "time_off" | "extended_leave" | "commitment";

const PICK_KINDS = new Set<PickKind>(["time_off", "extended_leave", "commitment"]);

function isPickKind(value: unknown): value is PickKind {
  return typeof value === "string" && PICK_KINDS.has(value as PickKind);
}

export function TimeBlockModal({
  open,
  onOpenChange,
  firmId,
  editing,
  initialKind,
  planningYear = new Date().getFullYear(),
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  firmId: string;
  editing: FirmLifeEvent | null;
  initialKind?: PickKind | null;
  planningYear?: number;
}) {
  const [step, setStep] = useState<"pick" | PickKind>("pick");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const bt = editing.block_type ?? "life_event";
      if (
        bt === "recurring_season" ||
        bt === "recurring_weekly" ||
        (bt === "life_event" && editing.event_type === "other")
      ) {
        setStep("commitment");
      } else if (Number(editing.capacity_pct) === 0) {
        setStep("extended_leave");
      } else {
        setStep("time_off");
      }
    } else if (initialKind && isPickKind(initialKind)) {
      setStep(initialKind);
    } else {
      setStep("pick");
    }
  }, [open, editing, initialKind]);

  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[520px] overflow-y-auto rounded-xl px-8 py-7">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-normal text-ch">
            {editing ? "Edit time block" : blockTitle(isPickKind(step) ? step : "pick")}
          </DialogTitle>
        </DialogHeader>

        {(step === "pick" || !isPickKind(step)) && !editing && (
          <BlockTypePicker onSelect={(k) => setStep(k)} />
        )}

        {isPickKind(step) && (step === "time_off" || step === "extended_leave") && (
          <LifeEventBlockForm
            firmId={firmId}
            editing={editing}
            extendedLeave={step === "extended_leave"}
            planningYear={planningYear}
            onSaved={close}
            onBack={editing ? undefined : () => setStep("pick")}
          />
        )}

        {isPickKind(step) && step === "commitment" && (
          <CommitmentForm
            firmId={firmId}
            editing={
              editing &&
              (editing.block_type === "recurring_season" ||
                editing.block_type === "recurring_weekly" ||
                (editing.block_type === "life_event" && editing.event_type === "other"))
                ? editing
                : null
            }
            planningYear={planningYear}
            onSaved={close}
            onBack={editing ? undefined : () => setStep("pick")}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function blockTitle(step: PickKind | "pick"): string {
  if (step === "pick") return "Add time block";
  if (step === "time_off") return "Time off";
  if (step === "extended_leave") return "Extended leave";
  return "Outside commitment";
}

function BlockTypePicker({ onSelect }: { onSelect: (k: PickKind) => void }) {
  const cards: Array<{ kind: PickKind; title: string; sub: string; icon: typeof Calendar }> = [
    { kind: "time_off", title: "Time off", sub: "Vacation, holiday, personal day", icon: Calendar },
    { kind: "extended_leave", title: "Extended leave", sub: "Maternity, medical, sabbatical", icon: Heart },
    {
      kind: "commitment",
      title: "Outside commitment",
      sub: "Seasonal period, weekly class, one-time event — anything that reduces capacity",
      icon: Briefcase,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-2">
      {cards.map((c) => (
        <button
          key={c.kind}
          type="button"
          onClick={() => onSelect(c.kind)}
          className="cursor-pointer rounded-lg border border-border bg-white p-4 text-left transition-colors hover:border-gold/40"
        >
          <c.icon className="mb-2 h-5 w-5 text-muted-foreground" />
          <p className="font-sans text-sm font-medium text-ch">{c.title}</p>
          <p className="mt-0.5 font-sans text-[11px] text-muted-foreground">{c.sub}</p>
        </button>
      ))}
    </div>
  );
}

function LifeEventBlockForm({
  firmId,
  editing,
  extendedLeave,
  planningYear,
  onSaved,
  onBack,
}: {
  firmId: string;
  editing: FirmLifeEvent | null;
  extendedLeave: boolean;
  planningYear: number;
  onSaved: () => void;
  onBack?: () => void;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveLifeEvent);
  const deleteFn = useServerFn(deleteLifeEvent);

  const saveMutation = useMutation({
    mutationFn: (payload: Parameters<typeof saveFn>[0]["data"]) => saveFn({ data: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["capacity-planner", firmId] });
      toast.success("Time block saved.");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteFn({ data: { firmId, id: editing!.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["capacity-planner", firmId] });
      toast.success("Time block removed");
      onSaved();
    },
  });

  return (
    <LifeEventFormFields
      editing={editing}
      defaultCapacityPct={extendedLeave ? 0 : undefined}
      defaultEventType={extendedLeave ? "maternity_paternity_leave" : "vacation"}
      planningYear={planningYear}
      onSave={(event) =>
        saveMutation.mutate({
          firmId,
          event: { ...event, block_type: "life_event" },
        })
      }
      onDelete={editing ? () => deleteMutation.mutate() : undefined}
      saving={saveMutation.isPending}
      onBack={onBack}
    />
  );
}

export type { CommitmentScheduleKind };
