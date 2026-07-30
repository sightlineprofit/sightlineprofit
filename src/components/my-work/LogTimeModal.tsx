import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { saveQuickTimeEntry } from "@/lib/my-work.functions";
import { listTimeAssignees } from "@/lib/time.functions";
import { cn } from "@/lib/utils";

const QUICK_HRS = [0.5, 1, 1.5, 2, 2.5, 3, 4];

export type LogTimeModalProps = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  projectPhaseId?: string | null;
  defaultBillable?: boolean;
  billableToggleLabel?: string;
  /** When true, fetches firm users and shows a team member picker (super admin / principal / admin). */
  canAssignTeamMember?: boolean;
  defaultUserId?: string;
  onSaved?: () => void;
};

export function LogTimeModal({
  open,
  onClose,
  projectId,
  projectName,
  projectPhaseId,
  defaultBillable = true,
  billableToggleLabel = "Billable",
  canAssignTeamMember = false,
  defaultUserId,
  onSaved,
}: LogTimeModalProps) {
  const saveFn = useServerFn(saveQuickTimeEntry);
  const listAssigneesFn = useServerFn(listTimeAssignees);
  const today = new Date().toISOString().slice(0, 10);
  const [hrs, setHrs] = useState<number>(1);
  const [customHrs, setCustomHrs] = useState("");
  const [billable, setBillable] = useState(defaultBillable);
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(today);
  const [assigneeId, setAssigneeId] = useState(defaultUserId ?? "");

  const { data: assigneeData } = useQuery({
    queryKey: ["time-assignees"],
    queryFn: () => listAssigneesFn(),
    enabled: open && canAssignTeamMember,
  });
  const assignees = (assigneeData?.assignees ?? []).filter(
    (a) => typeof a.id === "string" && a.id.length > 0,
  );

  useEffect(() => {
    if (!open) return;
    setBillable(defaultBillable);
    setDate(today);
    if (defaultUserId) setAssigneeId(defaultUserId);
    else if (assignees.length === 1) setAssigneeId(assignees[0].id);
  }, [open, defaultBillable, defaultUserId, today, assignees]);

  const effectiveHrs = customHrs ? Number(customHrs) : hrs;
  const showAssigneePicker = canAssignTeamMember && assignees.length > 0;

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!effectiveHrs || effectiveHrs <= 0) throw new Error("Enter hours");
      return saveFn({
        data: {
          date,
          hrs: effectiveHrs,
          billable,
          notes: notes.trim() || null,
          project_id: projectId,
          project_phase_id: projectPhaseId ?? null,
          user_id: showAssigneePicker && assigneeId ? assigneeId : undefined,
        },
      });
    },
    onSuccess: () => {
      const who =
        showAssigneePicker && assigneeId
          ? assignees.find((a) => a.id === assigneeId)?.name ||
            assignees.find((a) => a.id === assigneeId)?.email ||
            "team member"
          : null;
      toast.success(
        who
          ? `${effectiveHrs} hrs logged to ${projectName} for ${who}.`
          : `${effectiveHrs} hrs logged to ${projectName}.`,
      );
      onSaved?.();
      onClose();
      setNotes("");
      setCustomHrs("");
      setHrs(1);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[400px] rounded-xl px-7 py-6">
        <DialogHeader>
          <p className="text-[12px] text-[#8A7F75]" style={{ fontFamily: "Jost, sans-serif" }}>
            {projectName}
          </p>
          <DialogTitle
            className="text-[#2C2C2C]"
            style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: 20, fontWeight: 400 }}
          >
            Log time
          </DialogTitle>
        </DialogHeader>

        {showAssigneePicker ? (
          <div className="mt-2">
            <label className="mb-1 block text-[11px] font-medium text-[#6B6259]" style={{ fontFamily: "Jost, sans-serif" }}>
              Team member
            </label>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger className="h-9 text-[12px]">
                <SelectValue placeholder="Who spent this time?" />
              </SelectTrigger>
              <SelectContent position="popper" className="z-[200]">
                {assignees.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name || m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {QUICK_HRS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => {
                setHrs(h);
                setCustomHrs("");
              }}
              className={cn(
                "rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors",
                !customHrs && hrs === h
                  ? "border-[#2C2C2C] bg-[#2C2C2C] text-white"
                  : "border-[rgba(44,44,44,0.15)] text-[#2C2C2C]",
              )}
              style={{ fontFamily: "Jost, sans-serif" }}
            >
              {h}
            </button>
          ))}
          <label className="flex items-center gap-1.5 text-[12px] text-[#6B6259]" style={{ fontFamily: "Jost, sans-serif" }}>
            Other:
            <Input
              type="number"
              min={0.25}
              max={24}
              step={0.25}
              value={customHrs}
              onChange={(e) => setCustomHrs(e.target.value)}
              className="h-8 w-[60px] text-center text-[12px]"
            />
          </label>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Switch checked={billable} onCheckedChange={setBillable} />
          <span className="text-[12px] text-[#6B6259]" style={{ fontFamily: "Jost, sans-serif" }}>
            {billableToggleLabel}
          </span>
        </div>

        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What did you work on?"
          rows={2}
          className="mt-3 text-[13px]"
        />

        <div className="mt-3">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="text-[12px]" />
        </div>

        <button
          type="button"
          disabled={saveMut.isPending || (showAssigneePicker && !assigneeId)}
          onClick={() => saveMut.mutate()}
          className="mt-4 w-full rounded-lg bg-[#2C2C2C] py-2.5 text-[13px] font-medium text-white disabled:opacity-60"
          style={{ fontFamily: "Jost, sans-serif" }}
        >
          {saveMut.isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full text-center text-[12px] text-[#8A7F75] underline"
          style={{ fontFamily: "Jost, sans-serif" }}
        >
          Cancel
        </button>
      </DialogContent>
    </Dialog>
  );
}
