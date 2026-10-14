import "server-only";

import { prisma } from "@/lib/prisma";
import { hasWorkspacePermission } from "@/server/permission-policy";
import type { WorkspacePermission } from "@/server/permission-policy";

export { hasWorkspacePermission } from "@/server/permission-policy";
export type { WorkspacePermission, WorkspaceRole } from "@/server/permission-policy";

export async function requireWorkspacePermission(
  userId: string,
  workspaceId: string,
  permission: WorkspacePermission,
) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });

  if (!membership || !hasWorkspacePermission(membership.role, permission)) {
    throw new Error("You do not have permission to perform this action.");
  }

  return membership;
}

export async function requireProjectPermission(
  userId: string,
  projectId: string,
  permission: WorkspacePermission,
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      workspaceId: true,
      archived: true,
      members: { where: { userId }, select: { userId: true } },
    },
  });

  if (!project) throw new Error("Project not found.");

  const membership = await requireWorkspacePermission(
    userId,
    project.workspaceId,
    permission,
  );

  if (
    (membership.role === "MEMBER" || membership.role === "VIEWER") &&
    project.members.length === 0
  ) {
    throw new Error("You are not a member of this project.");
  }

  if (project.archived && permission !== "project:view") {
    throw new Error("Archived projects cannot be changed.");
  }

  return { project, membership };
}

export async function requireTaskPermission(
  userId: string,
  taskId: string,
  permission: WorkspacePermission,
) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      projectId: true,
      assigneeId: true,
    },
  });

  if (!task) throw new Error("Task not found.");

  const { project, membership } = await requireProjectPermission(
    userId,
    task.projectId,
    permission,
  );

  if (
    permission === "task:edit:assigned" &&
    membership.role === "MEMBER" &&
    task.assigneeId !== userId
  ) {
    throw new Error("You can only edit tasks assigned to you.");
  }

  return { task, project, membership };
}
