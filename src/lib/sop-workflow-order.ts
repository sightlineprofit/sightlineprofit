export type AttachableWorkflowMeta = {
  id: string;
  workflowType?: string | null;
};

/** Project workflows first (selection order), then firm operations appended at the end. */
export function orderWorkflowIdsForAttach(
  ids: string[],
  workflows: AttachableWorkflowMeta[],
): string[] {
  const byId = new Map(workflows.map((w) => [w.id, w]));
  const project: string[] = [];
  const firm: string[] = [];
  for (const id of ids) {
    const w = byId.get(id);
    if (!w) continue;
    if (w.workflowType === "firm_operation") firm.push(id);
    else project.push(id);
  }
  return [...project, ...firm];
}
