import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ReportsDashboard } from "@/components/reports/reports-dashboard";
import { getAuthenticatedUser } from "@/server/auth/user";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reports & insights" };

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export default async function WorkspaceSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (section !== "reports") notFound();

  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  const context = await getWorkspaceContext(user.id);
  if (!context) redirect("/onboarding/workspace");
  if (context.membership.role !== "OWNER" && context.membership.role !== "MANAGER") {
    redirect("/dashboard");
  }

  const now = new Date();
  const today = startOfDay(now);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const projectWhere = { workspaceId: context.workspace.id, archived: false };

  const [statusCounts, completed, createdCount, workloadGroups, members, overdueTasks, activeSprint] =
    await Promise.all([
      prisma.task.groupBy({
        by: ["status"],
        where: { project: projectWhere },
        _count: { _all: true },
      }),
      prisma.task.findMany({
        where: {
          project: projectWhere,
          status: "DONE",
          completedAt: { gte: sevenDaysAgo },
        },
        select: { dueDate: true, completedAt: true },
      }),
      prisma.task.count({
        where: { project: projectWhere, createdAt: { gte: sevenDaysAgo } },
      }),
      prisma.task.groupBy({
        by: ["assigneeId"],
        where: {
          assigneeId: { not: null },
          status: { not: "DONE" },
          project: projectWhere,
        },
        _count: { _all: true },
        _sum: { estimatePoints: true },
      }),
      prisma.workspaceMember.findMany({
        where: { workspaceId: context.workspace.id },
        orderBy: { user: { name: "asc" } },
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      }),
      prisma.task.findMany({
        where: {
          project: projectWhere,
          status: { not: "DONE" },
          dueDate: { lt: today },
        },
        orderBy: { dueDate: "asc" },
        take: 20,
        include: {
          project: { select: { id: true, key: true, name: true } },
          assignee: { select: { name: true } },
        },
      }),
      prisma.sprint.findFirst({
        where: { status: "ACTIVE", project: projectWhere },
        orderBy: { endDate: "asc" },
        include: {
          project: { select: { id: true, key: true, name: true } },
          tasks: {
            select: {
              id: true,
              status: true,
              estimatePoints: true,
            },
          },
        },
      }),
    ]);

  const tasksCompleted = completed.length;
  const tasksOnTime = completed.filter(
    (task) =>
      task.dueDate &&
      task.completedAt &&
      task.completedAt <= new Date(
        task.dueDate.getFullYear(),
        task.dueDate.getMonth(),
        task.dueDate.getDate(),
        23,
        59,
        59,
        999,
      ),
  ).length;
  const onTimePercent = completed.filter((task) => task.dueDate).length
    ? Math.round(
        (tasksOnTime / completed.filter((task) => task.dueDate).length) * 100,
      )
    : null;
  const workloadByUser = new Map(
    workloadGroups.flatMap((group) =>
      group.assigneeId
        ? [[group.assigneeId, { openTasks: group._count._all, points: group._sum.estimatePoints ?? 0 }] as const]
        : [],
    ),
  );
  const workload = members.map(({ user: member }) => ({
    name: member.name,
    openTasks: workloadByUser.get(member.id)?.openTasks ?? 0,
    points: workloadByUser.get(member.id)?.points ?? 0,
  }));

  let burndown: { date: string; ideal: number; remaining: number }[] = [];
  if (activeSprint) {
    const taskIds = activeSprint.tasks.map(({ id }) => id);
    const logs = taskIds.length
      ? await prisma.activityLog.findMany({
          where: {
            taskId: { in: taskIds },
            action: { in: ["TASK_STATUS_CHANGED", "TASK_UPDATED"] },
          },
          orderBy: { createdAt: "desc" },
          select: { taskId: true, createdAt: true, meta: true },
        })
      : [];
    const changesByTask = new Map<string, { createdAt: Date; from: string }[]>();
    for (const log of logs) {
      if (!log.taskId) continue;
      const meta = record(log.meta);
      const from = meta?.from ?? record(meta?.status)?.from;
      if (typeof from !== "string") continue;
      const changes = changesByTask.get(log.taskId) ?? [];
      changes.push({ createdAt: log.createdAt, from });
      changesByTask.set(log.taskId, changes);
    }

    const committedPoints = activeSprint.tasks.reduce(
      (total, task) => total + (task.estimatePoints ?? 0),
      0,
    );
    const firstDay = startOfDay(activeSprint.startDate);
    const lastDay = startOfDay(activeSprint.endDate < now ? activeSprint.endDate : now);
    const dayCount = Math.max(
      1,
      Math.floor((startOfDay(activeSprint.endDate).getTime() - firstDay.getTime()) / 86_400_000),
    );
    const days: Date[] = [];
    for (const day = new Date(firstDay); day <= lastDay; day.setDate(day.getDate() + 1)) {
      days.push(new Date(day));
    }
    if (!days.length) days.push(firstDay);
    burndown = days.map((day) => {
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);
      const elapsedDays = Math.max(0, (day.getTime() - firstDay.getTime()) / 86_400_000);
      const remaining = activeSprint.tasks.reduce((total, task) => {
        let status = task.status;
        for (const change of changesByTask.get(task.id) ?? []) {
          if (change.createdAt > dayEnd) status = change.from as typeof task.status;
        }
        return total + (status === "DONE" ? 0 : task.estimatePoints ?? 0);
      }, 0);
      return {
        date: new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(day),
        ideal: Math.max(0, Math.round(committedPoints * (1 - elapsedDays / dayCount))),
        remaining,
      };
    });
  }

  return (
    <ReportsDashboard
      burndown={burndown}
      completedInSevenDays={tasksCompleted}
      createdInSevenDays={createdCount}
      onTimePercent={onTimePercent}
      overdue={overdueTasks.map((task) => ({
        id: task.id,
        number: task.number,
        title: task.title,
        dueDate: task.dueDate?.toISOString() ?? null,
        project: task.project,
        assignee: task.assignee?.name ?? null,
      }))}
      sprint={activeSprint ? {
        name: activeSprint.name,
        projectId: activeSprint.project.id,
        projectName: activeSprint.project.name,
        projectKey: activeSprint.project.key,
      } : null}
      statusCounts={statusCounts.map((item) => ({ status: item.status, count: item._count._all }))}
      workload={workload}
      workspaceName={context.workspace.name}
    />
  );
}
