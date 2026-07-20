import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtUsd } from "@/lib/finance";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type StepAssigneeRecord = {
  id: string;
  assignee_kind: "member" | "principal";
  firm_member_id: string | null;
  estimated_hrs: number;
  is_billable: boolean;
};

export type AssigneePickerMember = {
  id: string;
  name: string;
  burdened_hourly_rate?: number | null;
  role_type?: string | null;
};

type Props = {
  stepId: string;
  assignees: StepAssigneeRecord[];
  members: AssigneePickerMember[];
  principalName: string;
  principalBurdenedRate: number;
  isAdmin?: boolean;
  /** When true, show the assignee picker immediately (e.g. phase with no tasks yet). */
  defaultExpanded?: boolean;
  onUpsert: (payload: {
    assignee_kind: "member" | "principal";
    firm_member_id?: string | null;
    estimated_hrs?: number;
    is_billable?: boolean;
  }) => Promise<void>;
  onDelete: (assigneeId: string) => Promise<void>;
};

function memberRate(
  a: StepAssigneeRecord,
  members: AssigneePickerMember[],
  principalRate: number,
) {
  if (a.assignee_kind === "principal") return principalRate;
  const m = members.find((x) => x.id === a.firm_member_id);
  return Number(m?.burdened_hourly_rate) || 0;
}

function memberName(
  a: StepAssigneeRecord,
  members: AssigneePickerMember[],
  principalName: string,
) {
  if (a.assignee_kind === "principal") return principalName;
  return members.find((x) => x.id === a.firm_member_id)?.name ?? "Team member";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = ["#e8f4ec", "#e8eef8", "#f0e8f4", "#f4ebe8"];

export function StepAssigneeSection({
  stepId,
  assignees,
  members,
  principalName,
  principalBurdenedRate,
  isAdmin,
  defaultExpanded,
  onUpsert,
  onDelete,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded || assignees.length > 0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const debounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (assignees.length > 0) setExpanded(true);
  }, [assignees.length]);

  const totalHrs = assignees.reduce((s, a) => s + Number(a.estimated_hrs || 0), 0);

  const assignedMemberIds = useMemo(
    () =>
      new Set(
        assignees.filter((a) => a.assignee_kind === "member").map((a) => a.firm_member_id),
      ),
    [assignees],
  );
  const hasPrincipal = assignees.some((a) => a.assignee_kind === "principal");

  const pickerOptions = useMemo(() => {
    const opts: { kind: "member" | "principal"; id?: string; name: string }[] = [];
    if (!hasPrincipal) opts.push({ kind: "principal", name: principalName });
    for (const m of members) {
      if (!assignedMemberIds.has(m.id)) opts.push({ kind: "member", id: m.id, name: m.name });
    }
    return opts;
  }, [assignedMemberIds, hasPrincipal, members, principalName]);

  const scheduleSave = useCallback(
    (assignee: StepAssigneeRecord, estimated_hrs: number) => {
      const key = assignee.id;
      const prev = debounceRef.current.get(key);
      if (prev) clearTimeout(prev);
      debounceRef.current.set(
        key,
        setTimeout(() => {
          void onUpsert({
            assignee_kind: assignee.assignee_kind,
            firm_member_id: assignee.firm_member_id,
            estimated_hrs,
            is_billable: assignee.is_billable,
          });
        }, 800),
      );
    },
    [onUpsert],
  );

  if (!isAdmin && assignees.length === 0) return null;

  return (
    <div className="mt-1 border-t border-[rgba(44,44,44,0.06)] pt-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-[11px] text-ch/50 hover:text-ch/70"
          onClick={() => setExpanded((v) => !v)}
        >
          <Users className="h-3.5 w-3.5" />
          {assignees.length === 0
            ? "Unassigned"
            : `${assignees.length} ${assignees.length === 1 ? "person" : "people"}`}
          {totalHrs > 0 && <span className="tabular-nums">· {totalHrs} hrs</span>}
        </button>
        {isAdmin && (
          <button
            type="button"
            className="text-[11px] text-gold hover:text-gold/80"
            onClick={() => setExpanded(true)}
          >
            {expanded ? "Hide" : "Assign"}
          </button>
        )}
      </div>

      {expanded && isAdmin && (
        <div className="mt-2 space-y-2 pl-1">
          {assignees.length === 0 && (
            <AssigneePicker
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              options={pickerOptions}
              onPick={async (opt) => {
                await onUpsert({
                  assignee_kind: opt.kind,
                  firm_member_id: opt.id ?? null,
                  estimated_hrs: 0,
                  is_billable: true,
                });
                setPickerOpen(false);
              }}
              trigger={
                <button type="button" className="text-[12px] text-gold hover:underline">
                  + Assign someone →
                </button>
              }
            />
          )}

          {assignees.map((a, idx) => {
            const name = memberName(a, members, principalName);
            const rate = memberRate(a, members, principalBurdenedRate);
            const hrs = Number(a.estimated_hrs) || 0;
            return (
              <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-md bg-creamd/30 px-2 py-1.5">
                <span
                  className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[9px] font-medium"
                  style={{
                    background: AVATAR_COLORS[idx % AVATAR_COLORS.length],
                    color: "#3d3c3a",
                  }}
                >
                  {initials(name)}
                </span>
                <span className="min-w-[72px] text-[12px] text-ch">{name}</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  className="w-[60px] rounded border border-border bg-white px-1.5 py-0.5 text-[12px] tabular-nums"
                  value={hrs || ""}
                  placeholder="0"
                  onChange={(e) => {
                    const v = parseFloat(e.target.value) || 0;
                    scheduleSave(a, v);
                  }}
                />
                <span className="text-[11px] text-ch/50">hrs</span>
                <button
                  type="button"
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                    a.is_billable
                      ? "bg-[rgba(31,110,58,0.12)] text-[#1f6e3a]"
                      : "bg-[rgba(200,164,90,0.15)] text-[#7a5c1e]",
                  )}
                  onClick={() =>
                    void onUpsert({
                      assignee_kind: a.assignee_kind,
                      firm_member_id: a.firm_member_id,
                      estimated_hrs: hrs,
                      is_billable: !a.is_billable,
                    })
                  }
                >
                  {a.is_billable ? "Billable" : "Non-billable"}
                </button>
                <span className="text-[10px] text-ch/45">
                  ≈ {fmtUsd(hrs * rate, { decimals: 0 })}
                </span>
                <button
                  type="button"
                  className="ml-auto text-ch/40 hover:text-ch/70"
                  aria-label={`Remove ${name}`}
                  onClick={() => void onDelete(a.id)}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}

          {assignees.length > 0 && (
            <AssigneePicker
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              options={pickerOptions}
              onPick={async (opt) => {
                await onUpsert({
                  assignee_kind: opt.kind,
                  firm_member_id: opt.id ?? null,
                  estimated_hrs: 0,
                  is_billable: true,
                });
                setPickerOpen(false);
              }}
              trigger={
                <button type="button" className="text-[12px] text-gold hover:underline">
                  + Add person →
                </button>
              }
            />
          )}

          <p className="text-[11px] italic text-ch/45">
            Their burdened rate is used to calculate this task&apos;s cost.
          </p>
        </div>
      )}
    </div>
  );
}

function AssigneePicker({
  trigger,
  options,
  open,
  onOpenChange,
  onPick,
}: {
  trigger: React.ReactNode;
  options: { kind: "member" | "principal"; id?: string; name: string }[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (opt: { kind: "member" | "principal"; id?: string; name: string }) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        {options.length === 0 ? (
          <p className="px-2 py-1 text-[12px] text-ch/50">Everyone is already assigned.</p>
        ) : (
          <ul className="max-h-48 overflow-y-auto">
            {options.map((opt) => (
              <li key={opt.kind === "principal" ? "principal" : opt.id}>
                <button
                  type="button"
                  className="w-full rounded px-2 py-1.5 text-left text-[13px] text-ch hover:bg-ch/5"
                  onClick={() => onPick(opt)}
                >
                  {opt.name}
                  {opt.kind === "principal" && (
                    <span className="ml-1 text-[11px] text-ch/45">Principal</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 border-t border-border px-1 pt-2 text-[11px] italic text-ch/45">
          Their burdened rate is used to calculate this task&apos;s cost.
        </p>
      </PopoverContent>
    </Popover>
  );
}

/** Sum phase cost from assignees on steps. */
export function sumPhaseAssigneeCost(args: {
  stepIds: string[];
  assigneesByStep: Map<string, StepAssigneeRecord[]>;
  members: AssigneePickerMember[];
  principalBurdenedRate: number;
}) {
  const { stepIds, assigneesByStep, members, principalBurdenedRate } = args;
  let billable = 0;
  let nonBillable = 0;
  let cost = 0;
  let taskCount = 0;
  for (const sid of stepIds) {
    const list = assigneesByStep.get(sid) ?? [];
    if (list.length) taskCount += 1;
    for (const a of list) {
      const hrs = Number(a.estimated_hrs) || 0;
      if (a.is_billable) billable += hrs;
      else nonBillable += hrs;
      const rate =
        a.assignee_kind === "principal"
          ? principalBurdenedRate
          : Number(members.find((m) => m.id === a.firm_member_id)?.burdened_hourly_rate) || 0;
      cost += hrs * rate;
    }
  }
  return { billable, nonBillable, cost, taskCount };
}
