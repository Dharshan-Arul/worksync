"use client";

import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CheckCircle2, CircleAlert, ListTodo, TrendingUp } from "lucide-react";
import type { TaskStatus } from "@prisma/client";

const statusLabels: Record<TaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  DONE: "Done",
};

const statusColors: Record<TaskStatus, string> = {
  TODO: "var(--chart-5)",
  IN_PROGRESS: "var(--chart-1)",
  IN_REVIEW: "var(--chart-3)",
  DONE: "var(--chart-2)",
};

type ReportStatus = { status: TaskStatus; count: number };

export function ReportsDashboard({
  workspaceName,
  statusCounts,
  workload,
  overdue,
  sprint,
  burndown,
  completedInSevenDays,
  onTimePercent,
  createdInSevenDays,
}: {
  workspaceName: string;
  statusCounts: ReportStatus[];
  workload: { name: string; openTasks: number; points: number }[];
  overdue: {
    id: string;
    number: number;
    title: string;
    dueDate: string | null;
    project: { id: string; key: string; name: string };
    assignee: string | null;
  }[];
  sprint: { name: string; projectId: string; projectName: string; projectKey: string } | null;
  burndown: { date: string; ideal: number; remaining: number }[];
  completedInSevenDays: number;
  onTimePercent: number | null;
  createdInSevenDays: number;
}) {
  const chartStatus = (["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const).map((status) => ({
    status,
    label: statusLabels[status],
    tasks: statusCounts.find((item) => item.status === status)?.count ?? 0,
  }));

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">{workspaceName}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[28px]">Reports &amp; insights</h1>
        <p className="mt-1 text-sm text-muted-foreground">A live view of delivery, workload, and sprint progress.</p>
      </header>

      <section aria-label="Seven-day summary" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={<CheckCircle2 />} label="Tasks completed · 7 days" value={String(completedInSevenDays)} />
        <StatCard icon={<TrendingUp />} label="On-time completion · 7 days" value={onTimePercent === null ? "—" : `${onTimePercent}%`} detail={onTimePercent === null ? "No completed tasks with due dates" : "Of completed tasks with due dates"} />
        <StatCard icon={<ListTodo />} label="Tasks created · 7 days" value={String(createdInSevenDays)} />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Tasks by status" description="Current tasks in active workspace projects">
          {statusCounts.reduce((sum, item) => sum + item.count, 0) ? (
            <ResponsiveContainer height="100%" minHeight={260} width="100%">
              <BarChart accessibilityLayer data={chartStatus} margin={{ top: 18, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis axisLine={false} dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickLine={false} />
                <YAxis allowDecimals={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickLine={false} width={36} />
                <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--popover-foreground)" }} />
                <Bar dataKey="tasks" name="Tasks" radius={[6, 6, 0, 0]}>
                  {chartStatus.map((item) => <Cell fill={statusColors[item.status]} key={item.status} />)}
                  <LabelList dataKey="tasks" position="top" fill="var(--muted-foreground)" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart>No tasks in active projects yet.</EmptyChart>}
        </ChartCard>

        <ChartCard title="Workload per member" description="Open assigned tasks and estimated points">
          {workload.some((item) => item.openTasks || item.points) ? (
            <ResponsiveContainer height="100%" minHeight={260} width="100%">
              <BarChart accessibilityLayer data={workload} layout="vertical" margin={{ top: 4, right: 22, left: 12, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                <XAxis allowDecimals={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} type="number" />
                <YAxis axisLine={false} dataKey="name" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} type="category" width={95} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--popover-foreground)" }} />
                <Legend />
                <Bar dataKey="openTasks" fill="var(--chart-1)" name="Open tasks" radius={[0, 4, 4, 0]} />
                <Bar dataKey="points" fill="var(--chart-2)" name="Open points" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart>No open assigned work yet.</EmptyChart>}
        </ChartCard>

        <ChartCard
          description={sprint ? `${sprint.projectKey} · ${sprint.projectName}` : "An active sprint is required"}
          title="Active sprint burndown"
          action={sprint ? <Link className="text-xs font-medium text-primary hover:underline" href={`/projects/${sprint.projectId}/backlog`}>View sprint</Link> : undefined}
        >
          {sprint && burndown.length ? (
            <ResponsiveContainer height="100%" minHeight={260} width="100%">
              <LineChart accessibilityLayer data={burndown} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis axisLine={false} dataKey="date" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} />
                <YAxis allowDecimals={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} width={38} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--popover-foreground)" }} />
                <Legend />
                <Line dataKey="ideal" dot={false} name="Ideal" stroke="var(--muted-foreground)" strokeDasharray="5 5" strokeWidth={2} />
                <Line dataKey="remaining" name="Remaining" stroke="var(--chart-1)" strokeWidth={2.5} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart>{sprint ? "No sprint days to chart yet." : "Start a sprint to see its burndown."}</EmptyChart>}
        </ChartCard>

        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <span className="flex size-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive"><CircleAlert aria-hidden="true" className="size-4" /></span>
            <div>
              <h2 className="text-sm font-semibold">Overdue tasks</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{overdue.length} shown · active projects</p>
            </div>
          </div>
          {overdue.length ? (
            <ul className="max-h-[310px] divide-y divide-border overflow-y-auto">
              {overdue.map((task) => (
                <li className="flex items-center gap-3 px-5 py-3" key={task.id}>
                  <span className="min-w-0 flex-1">
                    <Link className="block truncate text-sm font-medium hover:text-primary" href={`/projects/${task.project.id}/board?taskId=${encodeURIComponent(task.id)}`}>{task.title}</Link>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{task.project.key}-{task.number} · {task.assignee ?? "Unassigned"}</span>
                  </span>
                  {task.dueDate && <time className="shrink-0 text-xs font-medium text-destructive" dateTime={task.dueDate}>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(task.dueDate))}</time>}
                </li>
              ))}
            </ul>
          ) : <EmptyChart>No overdue tasks. Your team is on track.</EmptyChart>}
        </section>
      </section>
    </div>
  );
}

function StatCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail?: string }) {
  return (
    <article className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
        <span className="text-xs font-medium text-muted-foreground sm:text-sm">{label}</span>
      </div>
      <p className="mt-4 text-[28px] font-semibold leading-none tracking-tight">{value}</p>
      {detail && <p className="mt-2 text-xs text-muted-foreground">{detail}</p>}
    </article>
  );
}

function ChartCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
      <div className="min-h-[270px] p-4">{children}</div>
    </section>
  );
}

function EmptyChart({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[230px] items-center justify-center px-5 text-center text-sm text-muted-foreground">{children}</div>;
}
