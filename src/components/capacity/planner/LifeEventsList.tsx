import { Calendar, Heart, Leaf, Pencil, Sun, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  eventDurationLabel,
  eventHoursImpact,
  formatEventDateRange,
} from "@/lib/capacity-calendar";
import { deleteLifeEvent } from "@/lib/capacity.functions";
import type { CapacityPlannerData } from "@/lib/capacity.functions";
import type { FirmLifeEvent } from "@/lib/finance";
import { formatHours } from "@/lib/finance";
import { cn } from "@/lib/utils";

const EVENT_TYPE_LABELS: Record<string, string> = {
  maternity_paternity_leave: "Maternity / paternity leave",
  medical_leave: "Medical leave",
  vacation: "Vacation",
  sabbatical: "Sabbatical",
  seasonal_slowdown: "Seasonal slowdown",
  personal: "Personal",
  other: "Other",
};

export function LifeEventsList({
  data,
  firmId,
  onAdd,
  onEdit,
}: {
  data: CapacityPlannerData;
  firmId: string;
  onAdd: () => void;
  onEdit: (event: FirmLifeEvent) => void;
}) {
  const events = data.effective.lifeEvents;
  const isMember = data.scope === "member";

  return (
    <section className="mb-5">
      <p className="mb-3 font-sans text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
        {isMember ? "Your time blocks" : "Time blocks"}
      </p>

      {events.length === 0 ? (
        <EmptyState onAdd={onAdd} />
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <LifeEventCard
              key={event.id}
              event={event}
              billableHrsPerWeek={data.billableHrsPerWeek}
              year={data.year}
              firmId={firmId}
              memberLabel={
                !isMember && event.firm_member_id
                  ? data.memberNamesById[event.firm_member_id] ?? "Team member"
                  : undefined
              }
              onEdit={() => onEdit(event)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-lg bg-ch/[0.02] px-5 py-5 text-center">
      <Calendar className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
      <p className="font-display text-[15px] italic text-muted-foreground">No time blocks planned yet.</p>
      <p className="mt-1 font-sans text-xs text-muted-foreground">
        Add vacations, outside commitments, or weekly obligations to see how they affect your capacity.
      </p>
      <button
        type="button"
        onClick={() => onAdd()}
        className="mt-3 cursor-pointer font-sans text-xs text-gold underline"
      >
        + Add your first event →
      </button>
    </div>
  );
}

function LifeEventCard({
  event,
  billableHrsPerWeek,
  year,
  firmId,
  memberLabel,
  onEdit,
}: {
  event: FirmLifeEvent;
  billableHrsPerWeek: number;
  year: number;
  firmId: string;
  memberLabel?: string;
  onEdit: () => void;
}) {
  const qc = useQueryClient();
  const deleteFn = useServerFn(deleteLifeEvent);

  const deleteMutation = useMutation({
    mutationFn: () => deleteFn({ data: { firmId, id: event.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["capacity-planner", firmId] });
      toast.success("Life event removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pct = Number(event.capacity_pct);
  const hoursLost = Math.round(eventHoursImpact(event, billableHrsPerWeek, year));
  const icon = eventIcon(event);
  const badge = eventBadge(event, pct);

  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-border bg-white px-4 py-3.5">
      <div className={cn("flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg", icon.bg)}>
        <icon.Icon className={cn("h-4 w-4", icon.color)} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-sans text-[13px] font-medium text-ch">{event.name}</p>
        <p className="font-sans text-[11px] text-muted-foreground">
          {memberLabel && (
            <>
              <span className="text-gold">{memberLabel}</span>
              {" · "}
            </>
          )}
          {formatEventDateRange(event.start_date, event.end_date)}
          {" · "}
          {eventDurationLabel(event.start_date, event.end_date)}
          {" · "}
          {pct}% capacity
          {pct === 0 && <span className="text-gold"> · Full leave</span>}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <span className={cn("inline-block rounded-[10px] px-2 py-0.5 font-sans text-[10px] font-medium", badge.className)}>
          {badge.label}
        </span>
        <p className="mt-1 font-sans text-[11px] text-muted-foreground">
          {hoursLost < 10 ? "< 10 hrs impact" : `−${formatHours(hoursLost)} this year`}
        </p>
        <div className="mt-1 flex items-center justify-end gap-1">
          <button type="button" onClick={onEdit} className="cursor-pointer text-muted-foreground hover:text-ch" aria-label="Edit">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Remove this event? Capacity calculations will update.")) {
                deleteMutation.mutate();
              }
            }}
            className="cursor-pointer text-muted-foreground hover:text-terra"
            aria-label="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function eventIcon(event: FirmLifeEvent) {
  const pct = Number(event.capacity_pct);
  const type = event.event_type;

  if (pct === 0 || type === "maternity_paternity_leave" || type === "medical_leave" || type === "personal") {
    return { Icon: Heart, bg: "bg-gold/10", color: "text-gold" };
  }
  if (type === "vacation") {
    return { Icon: Sun, bg: "bg-ch/[0.06]", color: "text-muted-foreground" };
  }
  if (type === "seasonal_slowdown") {
    return { Icon: Leaf, bg: "bg-success/10", color: "text-success" };
  }
  return { Icon: Calendar, bg: "bg-ch/[0.06]", color: "text-muted-foreground" };
}

function eventBadge(event: FirmLifeEvent, pct: number) {
  const bt = event.block_type ?? "life_event";
  if (bt === "recurring_season") return { label: "Season", className: "bg-ch/[0.06] text-muted-foreground" };
  if (bt === "recurring_weekly") return { label: "Weekly", className: "bg-ch/[0.06] text-muted-foreground" };
  if (event.scheduling_only) return { label: "Scheduling", className: "bg-gold/10 text-gold" };
  if (event.event_type === "other") return { label: "One-time", className: "bg-ch/[0.06] text-muted-foreground" };
  if (pct === 0) return { label: "Full leave", className: "bg-gold/10 text-gold" };
  if (pct < 100) return { label: "Reduced", className: "bg-ch/[0.06] text-muted-foreground" };
  return { label: "Vacation", className: "bg-ch/[0.06] text-muted-foreground" };
}

export { EVENT_TYPE_LABELS };
