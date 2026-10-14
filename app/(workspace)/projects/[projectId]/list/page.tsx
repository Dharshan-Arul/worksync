import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ProjectWorkLayout } from "@/components/projects/project-work-layout";
import { TaskWorkspace, type TaskRecord } from "@/components/tasks/task-workspace";
import { getAuthenticatedUser } from "@/server/auth/user";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getProjectWorkspaceData } from "@/server/projects/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Project task list" };

export default async function ProjectListPage({
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
  const canCreate =
    !project.archived &&
    (canManage ||
      (context.membership.role === "MEMBER" &&
        members.some((member) => member.userId === user.id)));
  const taskRecords: TaskRecord[] = tasks.map((task) => ({
    ...task,
    dueDate: task.dueDate?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    completedAt: task.completedAt?.toISOString() ?? null,
    checklistCount: task._count.checklistItems,
    commentCount: task._count.comments,
    checklistItems: [],
    comments: [],
    activityLogs: [],
    attachments: [],
    watcherCount: 0,
    isWatching: false,
    watchers: [],
  }));

  return (
    <ProjectWorkLayout canDelete={context.membership.role === "OWNER"} canManage={canManage && !project.archived} project={project} view="list">
      <TaskWorkspace
        canCreate={canCreate}
        canManage={canManage && !project.archived}
        members={members.map(({ user: member }) => member)}
        projectId={project.id}
        projectKey={project.key}
        totalTasks={project._count.tasks}
        tasks={taskRecords}
        userId={user.id}
        view="list"
      />
    </ProjectWorkLayout>
  );
}
