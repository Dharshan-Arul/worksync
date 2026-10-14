import type { Metadata } from "next";
import { MyTasksWorkspace } from "@/components/tasks/my-tasks-workspace";
import { getAuthenticatedUser } from "@/server/auth/user";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My tasks" };

export default async function MyTasksPage() {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  const context = await getWorkspaceContext(user.id);
  if (!context) return null;

  const tasks = await prisma.task.findMany({
    where: {
      assigneeId: user.id,
      project: {
        workspaceId: context.workspace.id,
        archived: false,
        ...(context.membership.role === "MEMBER" || context.membership.role === "VIEWER"
          ? { members: { some: { userId: user.id } } }
          : {}),
      },
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { updatedAt: "desc" }],
    take: 500,
    include: {
      project: { select: { id: true, name: true, key: true } },
    },
  });

  return (
    <MyTasksWorkspace
      tasks={tasks.map((task) => ({
        id: task.id,
        number: task.number,
        title: task.title,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate?.toISOString() ?? null,
        estimatePoints: task.estimatePoints,
        project: task.project,
      }))}
      total={tasks.length}
      userName={user.name}
      workspaceName={context.workspace.name}
    />
  );
}
