import {
  calculateProjectBreakEven,
  type ProjectBreakEvenResult,
  type ProjectCostSnapshot,
  type TaskAssigneeRow,
} from "@/lib/finance";

export type DbStepAssignee = {
  id: string;
  assignee_kind: string;
  firm_member_id: string | null;
  estimated_hrs: number;
  is_billable: boolean;
  notes?: string | null;
  project_step_id?: string;
  sop_step_id?: string;
};

export type DbFirmMember = {
  id: string;
  name: string;
  burdened_hourly_rate: number | null;
  role_type?: string | null;
};

export function buildTaskAssigneeRows(args: {
  assignees: DbStepAssignee[];
  membersById: Map<string, DbFirmMember>;
  principalName: string;
  principalBurdenedRate: number;
}): TaskAssigneeRow[] {
  const { assignees, membersById, principalName, principalBurdenedRate } = args;
  return assignees.map((a) => {
    const isPrincipal = a.assignee_kind === "principal";
    const member = a.firm_member_id ? membersById.get(a.firm_member_id) : null;
    return {
      firmMemberId: isPrincipal ? null : a.firm_member_id,
      memberName: isPrincipal ? principalName : member?.name ?? "Team member",
      isPrincipal,
      burdenedRatePerHour: isPrincipal
        ? principalBurdenedRate
        : Number(member?.burdened_hourly_rate) || 0,
      estimatedHrs: Number(a.estimated_hrs) || 0,
      isBillable: !!a.is_billable,
    };
  });
}

export function computeProjectBreakEvenFromAssignees(
  snapshot: ProjectCostSnapshot,
  rows: TaskAssigneeRow[],
): ProjectBreakEvenResult {
  return calculateProjectBreakEven(snapshot, rows);
}

/** Palette for per-person allocation bar segments. */
export const ASSIGNEE_SEGMENT_COLORS = [
  "#3d3c3a",
  "#5a7a8a",
  "#7a6a5a",
  "#6a7a5a",
  "#8a6a7a",
  "#5a6a8a",
] as const;

export function assigneeSegmentColor(index: number, isPrincipal?: boolean) {
  if (isPrincipal) return ASSIGNEE_SEGMENT_COLORS[0];
  return ASSIGNEE_SEGMENT_COLORS[(index % (ASSIGNEE_SEGMENT_COLORS.length - 1)) + 1];
}

export const OPEX_SEGMENT_COLOR = "#d4d2d0";
export const PROFIT_SEGMENT_COLOR = "#1f6e3a";
