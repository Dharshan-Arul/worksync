import type { Metadata } from "next";
import { ArrowLeft, CalendarDays, CircleDot, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectActions } from "@/components/projects/project-actions";
import { z } from "zod";
import { getAuthenticatedUser } from "@/server/auth/user";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Project overview" };

export default async function ProjectOverviewPage({
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

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      workspaceId: context.workspace.id,
      ...(context.membership.role === "MEMBER" || context.membership.role === "VIEWER"
        ? { members: { some: { userId: user.id } } }
        : {}),
    },
    include: {
      lead: { select: { name: true, email: true } },
      _count: { select: { tasks: true, members: true, sprints: true } },
      sprints: {
        where: { status: "ACTIVE" },
        select: { id: true, name: true, endDate: true, goal: true },
        take: 1,
      },
    },
  });
  if (!project) notFound();

  const canManage =
    context.membership.role === "OWNER" || context.membership.role === "MANAGER";
  const completeCount = await prisma.task.count({
    where: { projectId: project.id, status: "DONE" },
  });
  const progress = project._count.tasks
    ? Math.round((completeCount / project._count.tasks) * 100)
    : 0;
  const editableProject = {
    id: project.id,
    name: project.name,
    key: project.key,
    description: project.description,
    status: project.status,
    dueDate: project.dueDate?.toISOString() ?? null,
  };

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" href="/projects">
        <ArrowLeft aria-hidden="true" className="size-4" />
        All projects
      </Link>
      <section className="rounded-xl border border-border bg-card p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground">{project.key}</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{project.name}</h1>
            <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {project.description || "No project description has been added."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
              {project.status.replaceAll("_", " ").toLowerCase()}
            </span>
            {canManage && (
              <ProjectActions
                canDelete={context.membership.role === "OWNER"}
                project={editableProject}
                workspaceId={project.workspaceId}
              />
            )}
          </div>
        </div>
        <div className="mt-8 grid gap-4 border-t border-border pt-6 sm:grid-cols-3">
          <Info label="Project lead" value={project.lead.name} icon={<Users />} />
          <Info label="Tasks completed" value={`${completeCount} of ${project._count.tasks}`} icon={<CircleDot />} />
          <Info label="Active sprints" value={String(project._count.sprints)} icon={<CalendarDays />} />
        </div>
        <div className="mt-7">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Overall progress</span>
            <span className="font-semibold">{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </section>
      {project.sprints[0] ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs font-medium text-muted-foreground">ACTIVE SPRINT</p>
          <h2 className="mt-2 text-lg font-semibold">{project.sprints[0].name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{project.sprints[0].goal || "No sprint goal set."}</p>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <h2 className="font-semibold">Your project space is ready</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Start by creating tasks on your project board.
          </p>
          <Link className="mt-4 inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90" href={`/projects/${project.id}/board`}>
            Open board
          </Link>
        </section>
      )}
    </div>
  );
}

function Info({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">{icon}</span>
      <span>
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="mt-0.5 block text-sm font-medium">{value}</span>
      </span>
    </div>
  );
}
