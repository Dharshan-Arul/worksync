import "server-only";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { WorkspaceRole } from "@/server/permissions";

export async function getProjectWorkspaceData(
  projectId: string,
  userId: string,
  role: WorkspaceRole,
  workspaceId: string,
) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      workspaceId,
      ...(role === "MEMBER" || role === "VIEWER"
        ? { members: { some: { userId } } }
        : {}),
    },
    include: {
      workspace: { select: { id: true, name: true } },
      lead: { select: { id: true, name: true, email: true } },
      _count: { select: { tasks: true, members: true, sprints: true } },
    },
  });
  if (!project) notFound();

  const [tasks, members] = await Promise.all([
    prisma.task.findMany({
      where: { projectId: project.id },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      take: 500,
      include: {
        assignee: { select: { id: true, name: true, avatarUrl: true } },
        reporter: { select: { id: true, name: true } },
        _count: { select: { checklistItems: true, comments: true } },
      },
    }),
    prisma.projectMember.findMany({
      where: { projectId: project.id },
      orderBy: { joinedAt: "asc" },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
    }),
  ]);

  return { project, tasks, members };
}
