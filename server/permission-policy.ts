export type WorkspaceRole = "OWNER" | "MANAGER" | "MEMBER" | "VIEWER";

export type WorkspacePermission =
  | "workspace:manage"
  | "workspace:delete"
  | "project:create"
  | "project:manage"
  | "project:delete"
  | "member:manage"
  | "sprint:manage"
  | "task:edit:any"
  | "report:view"
  | "project:view"
  | "search:view"
  | "task:create"
  | "task:edit:assigned"
  | "task:comment";

const OWNER_PERMISSIONS = new Set<WorkspacePermission>([
  "workspace:manage",
  "workspace:delete",
  "project:create",
  "project:manage",
  "project:delete",
  "member:manage",
  "sprint:manage",
  "task:edit:any",
  "report:view",
  "project:view",
  "search:view",
  "task:create",
  "task:edit:assigned",
  "task:comment",
]);

const MANAGER_PERMISSIONS = new Set<WorkspacePermission>([
  "project:create",
  "project:manage",
  "member:manage",
  "sprint:manage",
  "task:edit:any",
  "report:view",
  "project:view",
  "search:view",
  "task:create",
  "task:edit:assigned",
  "task:comment",
]);

const MEMBER_PERMISSIONS = new Set<WorkspacePermission>([
  "project:view",
  "search:view",
  "task:create",
  "task:edit:assigned",
  "task:comment",
]);

const ROLE_PERMISSIONS: Record<WorkspaceRole, Set<WorkspacePermission>> = {
  OWNER: OWNER_PERMISSIONS,
  MANAGER: MANAGER_PERMISSIONS,
  MEMBER: MEMBER_PERMISSIONS,
  VIEWER: new Set(["project:view", "search:view"]),
};

export function hasWorkspacePermission(
  role: WorkspaceRole,
  permission: WorkspacePermission,
) {
  return ROLE_PERMISSIONS[role].has(permission);
}
