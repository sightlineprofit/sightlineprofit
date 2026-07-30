import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { X, Plus } from "lucide-react";
import { listFirmMembers } from "@/lib/firm.functions";
import {
  addProjectAssignment,
  listProjectAssignments,
  removeProjectAssignment,
} from "@/lib/project-assignments.functions";
import { avatarColor, memberInitials } from "@/components/my-work/MyWorkPageContent";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type AssignmentRow = {
  id: string;
  assignee_id: string;
  role_on_project: string | null;
  firm_members: { id: string; name: string; email: string | null } | null;
};

export function ProjectAssignedTeamSection({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listProjectAssignments);
  const addFn = useServerFn(addProjectAssignment);
  const removeFn = useServerFn(removeProjectAssignment);
  const membersFn = useServerFn(listFirmMembers);
  const [pickerOpen, setPickerOpen] = useState(false);

  const assignQ = useQuery({
    queryKey: ["project-assignments", projectId],
    queryFn: () => listFn({ data: { projectId } }),
  });
  const membersQ = useQuery({
    queryKey: ["firm-members-assign"],
    queryFn: () => membersFn(),
  });

  const assignments = (assignQ.data?.assignments ?? []) as AssignmentRow[];
  const members = (membersQ.data?.members ?? []) as Array<{ id: string; name: string; email: string | null; role_type: string }>;
  const assignedIds = new Set(assignments.map((a) => a.assignee_id));
  const available = members.filter((m) => m.role_type !== "principal" && !assignedIds.has(m.id));

  const addMut = useMutation({
    mutationFn: (firmMemberId: string) => addFn({ data: { projectId, firmMemberId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-assignments", projectId] });
      toast.success("Member assigned");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const removeMut = useMutation({
    mutationFn: (assignmentId: string) => removeFn({ data: { assignmentId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-assignments", projectId] }),
  });

  return (
    <div className="mt-6">
      <p
        className="mb-3 text-[11px] uppercase tracking-[0.10em] text-[#8A7F75]"
        style={{ fontFamily: "Jost, sans-serif" }}
      >
        ASSIGNED TEAM
      </p>
      {assignments.map((a) => {
        const m = a.firm_members;
        const name = m?.name ?? "Member";
        return (
          <div key={a.id} className="mb-2 flex items-center gap-2.5">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white"
              style={{ background: avatarColor(a.assignee_id) }}
            >
              {memberInitials(name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-[#2C2C2C]" style={{ fontFamily: "Jost, sans-serif" }}>
                {name}
              </div>
              {a.role_on_project && (
                <div className="text-[11px] text-[#8A7F75]" style={{ fontFamily: "Jost, sans-serif" }}>
                  {a.role_on_project}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => removeMut.mutate(a.id)}
              className="text-[#8A7F75] hover:text-[#C4714A]"
              aria-label="Remove"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="mt-2 flex items-center gap-1 text-[12px] text-[#B8860B]"
            style={{ fontFamily: "Jost, sans-serif" }}
          >
            <Plus className="h-3.5 w-3.5" /> Assign member
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          {!available.length ? (
            <p className="px-2 py-1 text-[12px] text-[#8A7F75]">All team members are assigned.</p>
          ) : (
            available.map((m) => (
              <button
                key={m.id}
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-[#FAF7F2]"
                style={{ fontFamily: "Jost, sans-serif" }}
                onClick={() => {
                  addMut.mutate(m.id);
                  setPickerOpen(false);
                }}
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] text-white"
                  style={{ background: avatarColor(m.id) }}
                >
                  {memberInitials(m.name)}
                </span>
                {m.name}
              </button>
            ))
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
