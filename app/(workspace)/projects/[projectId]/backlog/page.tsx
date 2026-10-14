import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ProjectWorkLayout } from "@/components/projects/project-work-layout";
import { SprintBacklog, type BacklogTask, type SprintRecord } from "@/components/sprints/sprint-backlog";
import { getAuthenticatedUser } from "@/server/auth/user";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { prisma } from "@/lib/prisma";
import { getProjectWorkspaceData } from "@/server/projects/data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Project backlog" };

export default async function ProjectBacklogPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  if (!z.string().uuid().safeParse(projectId).success) notFound();
  const user = await getAuthenticatedUser();
  if (!user) return null;
  const context = await getWorkspaceContext(user.id);
  if (!context) return null;

  const { project, tasks, members } = await getProjectWorkspaceData(
    projectId,
    user.id,
    context.membership.role,
    context.workspace.id,
  );
  const canManage =
    context.membership.role === "OWNER" || context.membership.role === "MANAGER";
  const sprints = await prisma.sprint.findMany({
    where: { projectId: project.id },
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
    include: {
      capacities: {
        include: { user: { select: { id: true, name: true } } },
      },
      _count: { select: { tasks: true } },
    },
  });
  const backlogTasks = tasks.map((task): BacklogTask => ({
    id: task.id,
    number: task.number,
    title: task.title,
    status: task.status,
    priority: task.priority,
    estimatePoints: task.estimatePoints,
    sprintId: task.sprintId,
    assignee: task.assignee ? { id: task.assignee.id, name: task.assignee.name } : null,
  }));
  const sprintRecords: SprintRecord[] = sprints.map((sprint) => ({
      id: sprint.id,
      name: sprint.name,
      goal: sprint.goal,
      startDate: sprint.startDate.toISOString(),
      endDate: sprint.endDate.toISOString(),
      status: sprint.status,
      taskCount: sprint._count.tasks,
      tasks: tasks.filter((task) => task.sprintId === sprint.id).map(({ id, status, estimatePoints, assigneeId }) => ({
        id,
        status,
        estimatePoints,
        assigneeId,
      })),
      capacities: sprint.capacities.map((capacity) => ({
        userId: capacity.userId,
        name: capacity.user.name,
        capacityPoints: capacity.capacityPoints,
      })),
    }));

  return (
    <ProjectWorkLayout canDelete={context.membership.role === "OWNER"} canManage={canManage && !project.archived} project={project} view="backlog">
      <SprintBacklog
        canManage={canManage && !project.archived}
        members={members.map(({ user: member }) => ({ id: member.id, name: member.name }))}
        projectId={project.id}
        projectKey={project.key}
        sprints={sprintRecords}
        tasks={backlogTasks}
        totalTasks={project._count.tasks}
      />
    </ProjectWorkLayout>
  );
}
