import type { Metadata } from "next";
import { ArrowRight, CalendarDays, CheckCircle2, CircleDot, Clock3, FolderKanban, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { getAuthenticatedUser } from "@/server/auth/user";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Dashboard" };

function utcDayStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function mondayStart(date: Date) {
  const monday = utcDayStart(date);
  const daysSinceMonday = (monday.getUTCDay() + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday);
  return monday;
}

export default async function DashboardPage() {
  const user = await getAuthenticatedUser();
  if (!user) return null;

  const context = await getWorkspaceContext(user.id);
  if (!context) return null;

  const now = new Date();
  const todayStart = utcDayStart(now);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
  const weekStart = mondayStart(now);
  const workspaceId = context.workspace.id;
  const visibleProjectFilter =
    context.membership.role === "MEMBER" || context.membership.role === "VIEWER"
      ? { members: { some: { userId: user.id } } }
      : {};
  const projectWhere = { workspaceId, archived: false, ...visibleProjectFilter };

  const [
    myOpenTasks,
    dueToday,
    activeProjects,
    completedThisWeek,
    focusTasks,
    projects,
    recentActivity,
    deadlines,
    activeSprints,
  ] = await Promise.all([
    prisma.task.count({
      where: { assigneeId: user.id, status: { not: "DONE" }, project: projectWhere },
    }),
    prisma.task.count({
      where: {
        assigneeId: user.id,
        status: { not: "DONE" },
        dueDate: { gte: todayStart, lt: tomorrowStart },
        project: projectWhere,
      },
    }),
    prisma.project.count({
      where: { ...projectWhere, status: { not: "COMPLETED" } },
    }),
    prisma.task.count({
      where: {
        assigneeId: user.id,
        status: "DONE",
        completedAt: { gte: weekStart },
        project: projectWhere,
      },
    }),
    prisma.task.findMany({
      where: { assigneeId: user.id, status: { not: "DONE" }, project: projectWhere },
      orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
      take: 5,
      include: { project: { select: { id: true, key: true, name: true } } },
    }),
    prisma.project.findMany({
      where: projectWhere,
      orderBy: { updatedAt: "desc" },
      take: 4,
      include: { _count: { select: { tasks: true } } },
    }),
    prisma.activityLog.findMany({
      where: { workspaceId, project: projectWhere },
      orderBy: { createdAt: "desc" },
      take: 4,
      include: {
        actor: { select: { name: true } },
        project: { select: { id: true, name: true } },
      },
    }),
    prisma.task.findMany({
      where: {
        status: { not: "DONE" },
        dueDate: { gte: todayStart },
        project: projectWhere,
      },
      orderBy: { dueDate: "asc" },
      take: 4,
      include: {
        project: { select: { id: true, key: true } },
        assignee: { select: { name: true } },
      },
    }),
    prisma.sprint.findMany({
      where: { status: "ACTIVE", project: projectWhere },
      take: 4,
      orderBy: { endDate: "asc" },
      include: {
        project: { select: { id: true, key: true, name: true } },
        tasks: { select: { status: true, estimatePoints: true, assigneeId: true } },
        capacities: {
          include: { user: { select: { name: true } } },
        },
      },
    }),
  ]);

  const projectIds = projects.map(({ id }) => id);
  const doneCounts = projectIds.length
    ? await prisma.task.groupBy({
        by: ["projectId"],
        where: { projectId: { in: projectIds }, status: "DONE" },
        _count: { _all: true },
      })
    : [];
  const doneByProject = new Map(doneCounts.map((item) => [item.projectId, item._count._all]));
  const firstName = user.name.split(/\s+/)[0] || user.name;

  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-muted-foreground">
            {new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(now)}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[28px]">Good morning, {firstName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Here’s what’s happening across your work.</p>
        </div>
        {context.membership.role === "OWNER" || context.membership.role === "MANAGER" ? (
          <Link className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90" href="/onboarding/project">
            <Sparkles aria-hidden="true" className="size-4" />
            New project
          </Link>
        ) : null}
      </div>

      <section aria-label="Weekly summary" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard icon={<CircleDot />} label="My open tasks" value={myOpenTasks} accent="indigo" />
        <MetricCard icon={<CalendarDays />} label="Due today" value={dueToday} accent="amber" />
        <MetricCard icon={<FolderKanban />} label="Active projects" value={activeProjects} accent="blue" />
        <MetricCard icon={<CheckCircle2 />} label="Completed this week" value={completedThisWeek} accent="green" />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.85fr)]">
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">Your focus this week</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Tasks assigned to you</p>
            </div>
            <Link className="text-xs font-medium text-primary hover:underline" href="/my-tasks">View all</Link>
          </div>
          {focusTasks.length ? (
            <ul className="divide-y divide-border">
              {focusTasks.map((task) => (
                <li className="flex items-center gap-3 px-5 py-3.5" key={task.id}>
                  <span className={`size-2 shrink-0 rounded-full ${task.status === "IN_REVIEW" ? "bg-violet-500" : task.priority === "HIGH" ? "bg-rose-500" : "bg-primary"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{task.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{task.project.key}-{task.number} · {task.project.name}</span>
                  </span>
                  <span className="hidden rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground sm:inline">
                    {task.status.replace("_", " ")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyPanel icon={<CheckCircle2 />} title="You’re all caught up" description="Tasks assigned to you will show up here." />
          )}
        </section>

        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">Project health</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Progress across active projects</p>
            </div>
            <Link aria-label="View projects" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" href="/projects">
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
          {projects.length ? (
            <ul className="space-y-4 px-5 py-4">
              {projects.map((project) => {
                const done = doneByProject.get(project.id) ?? 0;
                const progress = project._count.tasks ? Math.round((done / project._count.tasks) * 100) : 0;
                return (
                  <li key={project.id}>
                    <Link className="flex items-center justify-between gap-3 text-sm hover:text-primary" href={`/projects/${project.id}`}>
                      <span className="truncate font-medium">{project.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{progress}%</span>
                    </Link>
                    <div aria-label={`${project.name}: ${progress}% complete`} className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyPanel icon={<FolderKanban />} title="No projects yet" description="Create a project to start tracking team progress." />
          )}
        </section>
      </div>

      <section className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Active sprints</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Committed points and team capacity</p>
          </div>
          <CalendarDays aria-hidden="true" className="size-4 text-muted-foreground" />
        </div>
        {activeSprints.length ? (
          <ul className="divide-y divide-border">
            {activeSprints.map((sprint) => {
              const committed = sprint.tasks.reduce((sum, task) => sum + (task.estimatePoints ?? 0), 0);
              const completed = sprint.tasks.reduce(
                (sum, task) => sum + (task.status === "DONE" ? task.estimatePoints ?? 0 : 0),
                0,
              );
              const capacityPoints = sprint.capacities.reduce((sum, item) => sum + item.capacityPoints, 0);
              const progress = committed ? Math.round((completed / committed) * 100) : 0;
              return (
                <li className="px-5 py-4" key={sprint.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link className="text-sm font-medium hover:text-primary" href={`/projects/${sprint.project.id}/backlog`}>
                      {sprint.project.key} · {sprint.name}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {completed}/{committed} pts complete · {capacityPoints} capacity pts
                    </span>
                  </div>
                  <div aria-label={`${sprint.name}: ${progress}% complete`} className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {sprint.project.name} · {sprint.tasks.filter((task) => task.status !== "DONE").length} open tasks · ends{" "}
                    {new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(sprint.endDate)}
                  </p>
                  {sprint.capacities.length > 0 && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {sprint.capacities.map((item) => `${item.user.name}: ${sprint.tasks.filter((task) => task.assigneeId === item.userId).reduce((sum, task) => sum + (task.estimatePoints ?? 0), 0)}/${item.capacityPoints} pts`).join(" · ")}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyPanel icon={<CalendarDays />} title="No active sprints" description="When a team starts a sprint, its progress and capacity will show up here." />
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">Recent activity</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">The latest updates from your workspace</p>
            </div>
          </div>
          {recentActivity.length ? (
            <ul className="divide-y divide-border">
              {recentActivity.map((activity) => (
                <li className="flex items-start gap-3 px-5 py-3.5" key={activity.id}>
                  <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Sparkles aria-hidden="true" className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">
                      <span className="font-medium">{activity.actor.name}</span>{" "}
                      <span className="text-muted-foreground">{activity.action.toLowerCase().replaceAll("_", " ")}</span>
                    </span>
                    {activity.project && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{activity.project.name}</span>}
                  </span>
                  <time className="shrink-0 text-xs text-muted-foreground" dateTime={activity.createdAt.toISOString()}>
                    {new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(activity.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyPanel icon={<Sparkles />} title="Your activity will appear here" description="Project updates and changes are collected in one place." />
          )}
        </section>

        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">Upcoming deadlines</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Work due soon across your projects</p>
            </div>
            <Clock3 aria-hidden="true" className="size-4 text-muted-foreground" />
          </div>
          {deadlines.length ? (
            <ul className="divide-y divide-border">
              {deadlines.map((task) => (
                <li className="flex items-center gap-3 px-5 py-3.5" key={task.id}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{task.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{task.project.key}-{task.number}{task.assignee ? ` · ${task.assignee.name}` : ""}</span>
                  </span>
                  {task.dueDate && (
                    <time className="shrink-0 text-xs font-medium text-muted-foreground" dateTime={task.dueDate.toISOString()}>
                      {new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(task.dueDate)}
                    </time>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyPanel icon={<CalendarDays />} title="No upcoming deadlines" description="Tasks with due dates will be listed here." />
          )}
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  accent: "indigo" | "amber" | "blue" | "green";
}) {
  const colors = {
    indigo: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    blue: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  };
  return (
    <article className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className={`flex size-8 items-center justify-center rounded-lg ${colors[accent]}`}>
          {icon}
        </span>
        <span className="text-xs font-medium text-muted-foreground sm:text-sm">{label}</span>
      </div>
      <p className="mt-4 text-[28px] font-semibold leading-none tracking-tight">{value}</p>
    </article>
  );
}

function EmptyPanel({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[150px] flex-col items-center justify-center px-5 py-8 text-center">
      <span className="mb-3 flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        {icon}
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-[240px] text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}
