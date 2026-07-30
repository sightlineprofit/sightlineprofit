import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FirmLifeEvent } from "@/lib/finance";
import { EVENT_TYPE_LABELS } from "@/components/capacity/planner/LifeEventsList";
import { cn } from "@/lib/utils";

const CAPACITY_PRESETS = [
  { pct: 0, label: "Not at all", sub: "Full leave — no work", tone: "amber" as const },
  { pct: 25, label: "25% capacity", sub: "Mostly off, occasional check-ins", tone: "muted" as const },
  { pct: 50, label: "50% capacity", sub: "Half time", tone: "gold" as const },
  { pct: 75, label: "75% capacity", sub: "Lighter workload", tone: "muted" as const },
];

export type LifeEventFormPayload = {
  id?: string;
  name: string;
  event_type: string;
  start_date: string;
  end_date: string;
  capacity_pct: number;
  notes: string | null;
  is_recurring: boolean;
  block_type?: string;
};

export function LifeEventFormFields({
  editing,
  defaultCapacityPct,
  defaultEventType,
  planningYear = new Date().getFullYear(),
  onSave,
  onDelete,
  saving,
  onBack,
}: {
  editing: FirmLifeEvent | null;
  defaultCapacityPct?: number;
  defaultEventType?: string;
  planningYear?: number;
  onSave: (payload: LifeEventFormPayload) => void;
  onDelete?: () => void;
  saving: boolean;
  onBack?: () => void;
}) {
  const [name, setName] = useState("");
  const [eventType, setEventType] = useState(defaultEventType ?? "vacation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [capacityPct, setCapacityPct] = useState(defaultCapacityPct ?? 0);
  const [customPct, setCustomPct] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [notes, setNotes] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setEventType(editing.event_type);
      setStartDate(editing.start_date.slice(0, 10));
      setEndDate(editing.end_date.slice(0, 10));
      setCapacityPct(Number(editing.capacity_pct));
      setUseCustom(!CAPACITY_PRESETS.some((p) => p.pct === Number(editing.capacity_pct)));
      setCustomPct(useCustom ? String(editing.capacity_pct) : "");
      setNotes(editing.notes ?? "");
      setIsRecurring(editing.is_recurring);
    } else {
      setName("");
      setEventType(defaultEventType ?? "vacation");
      const currentYear = new Date().getFullYear();
      if (planningYear > currentYear) {
        setStartDate(`${planningYear}-06-01`);
        setEndDate(`${planningYear}-06-07`);
      } else {
        setStartDate("");
        setEndDate("");
      }
      setCapacityPct(defaultCapacityPct ?? 0);
      setUseCustom(false);
      setCustomPct("");
      setNotes("");
      setIsRecurring(false);
    }
    setConfirmDelete(false);
  }, [editing, defaultCapacityPct, defaultEventType, planningYear]);

  const submit = () => {
    const pct = useCustom ? Number(customPct) : capacityPct;
    if (Number.isNaN(pct) || pct < 0 || pct > 100) return;
    onSave({
      id: editing?.id,
      name: name.trim(),
      event_type: eventType,
      start_date: startDate,
      end_date: endDate,
      capacity_pct: pct,
      notes: notes.trim() || null,
      is_recurring: isRecurring,
      block_type: "life_event",
    });
  };

  return (
    <div className="space-y-4">
      {onBack && (
        <button type="button" onClick={onBack} className="font-sans text-xs text-gold underline">
          ← Back
        </button>
      )}

      <Field label="Name">
        <Input
          placeholder="e.g. Maternity leave, Summer vacation"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      <Field label="Type">
        <Select value={eventType} onValueChange={setEventType}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Dates">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[11px] text-muted-foreground">From</Label>
            <Input
              type="date"
              value={startDate}
              min={`${planningYear}-01-01`}
              max={`${planningYear}-12-31`}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">To</Label>
            <Input
              type="date"
              value={endDate}
              min={startDate || `${planningYear}-01-01`}
              max={`${planningYear + 2}-12-31`}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        {planningYear > new Date().getFullYear() && !editing && (
          <p className="mt-1 font-sans text-[10px] italic text-muted-foreground">
            Planning for {planningYear} — dates default to this planning year.
          </p>
        )}
      </Field>

      <Field label="How much will you work?">
        <div className="space-y-2">
          {CAPACITY_PRESETS.map((opt) => {
            const selected = !useCustom && capacityPct === opt.pct;
            return (
              <button
                key={opt.pct}
                type="button"
                onClick={() => { setUseCustom(false); setCapacityPct(opt.pct); }}
                className={cn(
                  "w-full cursor-pointer rounded-lg border px-3 py-2.5 text-left",
                  selected
                    ? opt.tone === "amber" ? "border-gold bg-gold/10" : opt.tone === "gold" ? "border-gold/60 bg-gold/5" : "border-border bg-ch/[0.03]"
                    : "border-border bg-white hover:border-gold/30",
                )}
              >
                <span className="block font-sans text-xs font-medium text-ch">{opt.label}</span>
                <span className="block font-sans text-[11px] text-muted-foreground">{opt.sub}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setUseCustom(true)}
            className={cn("flex w-full items-center gap-2 rounded-lg border px-3 py-2.5", useCustom ? "border-gold/60 bg-gold/5" : "border-border")}
          >
            <span className="font-sans text-xs text-ch">Other:</span>
            <Input type="number" min={0} max={100} value={customPct} onChange={(e) => { setUseCustom(true); setCustomPct(e.target.value); }} className="h-8 w-20" onClick={(e) => e.stopPropagation()} />
            <span className="font-sans text-xs text-muted-foreground">%</span>
          </button>
        </div>
      </Field>

      <div className="flex items-center justify-between">
        <Label className="font-sans text-sm text-ch">This repeats annually</Label>
        <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
      </div>

      <Field label="Notes (optional)">
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <button
        type="button"
        disabled={saving || !name.trim() || !startDate || !endDate}
        onClick={submit}
        className="w-full cursor-pointer rounded-lg bg-ch py-3 font-sans text-sm font-medium text-white disabled:opacity-50"
      >
        Save block →
      </button>

      {onDelete && (
        <div className="border-t border-border pt-4">
          {confirmDelete ? (
            <div className="space-y-2">
              <p className="font-sans text-xs text-ch">Remove this block? Capacity calculations will update.</p>
              <div className="flex gap-2">
                <button type="button" className="font-sans text-xs text-terra underline" onClick={onDelete}>Remove</button>
                <button type="button" className="font-sans text-xs text-muted-foreground underline" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="font-sans text-xs text-terra underline">
              Delete block
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block font-sans text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
