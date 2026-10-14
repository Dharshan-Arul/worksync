import type { Metadata } from "next";
import { ProjectDirectory } from "@/components/projects/project-directory";
import { ProjectDialog } from "@/components/projects/project-dialog";
import { getAuthenticatedUser } from "@/server/auth/user";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  const context = await getWorkspaceContext(user.id);
  if (!context) return null;

  const canManage =
    context.membership.role === "OWNER" || context.membership.role === "MANAGER";
  const projects = await prisma.project.findMany({
    where: {
      workspaceId: context.workspace.id,
      archived: false,
      ...(canManage ? {} : { members: { some: { userId: user.id } } }),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      lead: { select: { name: true } },
      _count: { select: { tasks: true, members: true } },
    },
  });
  const doneTasks = projects.length
    ? await prisma.task.groupBy({
        by: ["projectId"],
        where: { projectId: { in: projects.map(({ id }) => id) }, status: "DONE" },
        _count: { _all: true },
      })
    : [];
  const doneByProject = new Map(doneTasks.map((task) => [task.projectId, task._count._all]));
  const directoryProjects = projects.map((project) => ({
    id: project.id,
    name: project.name,
    key: project.key,
    description: project.description,
    status: project.status,
    dueDate: project.dueDate?.toISOString() ?? null,
    lead: project.lead,
    totalTasks: project._count.tasks,
    completedTasks: doneByProject.get(project.id) ?? 0,
    members: project._count.members,
  }));

  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-muted-foreground">{context.workspace.name}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[28px]">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All the work your team is moving forward.
          </p>
        </div>
        {canManage && <ProjectDialog workspaceId={context.workspace.id} />}
      </div>
      <ProjectDirectory
        canDelete={context.membership.role === "OWNER"}
        canManage={canManage}
        projects={directoryProjects}
        workspaceId={context.workspace.id}
      />
    </div>
  );
}
