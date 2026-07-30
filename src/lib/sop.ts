/** SOP library attach/detach + role insights (see sop-library.server.ts). */
export {
  attachWorkflowToProject,
  detachWorkflowFromProject,
  getRoleInsights,
  type RoleBreakdown,
  type RoleInsightResult,
} from "./sop-library.server";
export type { SopAssignedRole } from "./sop-roles";
export { SOP_ASSIGNED_ROLE_VALUES } from "./sop-roles";
