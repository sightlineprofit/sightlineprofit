export type WorkflowPeriodInput = {
  period_label?: string | null;
  period_start?: string | null;
  period_end?: string | null;
};

export type ProjectWorkflowAttachmentRow = {
  id: string;
  sop_template_id: string;
  period_label: string | null;
  period_start: string | null;
  period_end: string | null;
  sort_order: number;
  template_name?: string | null;
};

export type ProjectWorkflowAttachmentDisplay = ProjectWorkflowAttachmentRow;

function formatPeriodDate(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Human-readable period: label and/or formatted date range (both can appear). */
export function describeWorkflowPeriod(att: {
  period_label?: string | null;
  period_start?: string | null;
  period_end?: string | null;
}): { label: string | null; dateRange: string | null } {
  const label = att.period_label?.trim() || null;
  const start = att.period_start?.trim();
  const end = att.period_end?.trim();
  let dateRange: string | null = null;
  if (start && end) dateRange = `${formatPeriodDate(start)} – ${formatPeriodDate(end)}`;
  else if (start) dateRange = `Starts ${formatPeriodDate(start)}`;
  else if (end) dateRange = `Ends ${formatPeriodDate(end)}`;
  return { label, dateRange };
}

export function formatWorkflowPeriod(att: {
  period_label?: string | null;
  period_start?: string | null;
  period_end?: string | null;
}): string | null {
  const { label, dateRange } = describeWorkflowPeriod(att);
  if (label && dateRange) return `${label} (${dateRange})`;
  return label ?? dateRange;
}

export function normalizeWorkflowPeriodInput(input?: WorkflowPeriodInput | null): WorkflowPeriodInput {
  const period_label = input?.period_label?.trim() || null;
  const period_start = input?.period_start?.trim() || null;
  const period_end = input?.period_end?.trim() || null;
  return { period_label, period_start, period_end };
}
