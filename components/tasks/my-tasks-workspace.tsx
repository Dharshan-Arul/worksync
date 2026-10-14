"use client";

import { CalendarDays, CheckCircle2, CircleDot, Filter, ListTodo } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { moveTaskAction } from "@/server/actions/tasks";

type TaskStatus = "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
type Task = {
  id: string;
  number: number;
  title: string;
  status: TaskStatus;
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: string | null;
  estimatePoints: number | null;
  project: { id: string; name: string; key: string };
};

const statusLabel: Record<TaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  DONE: "Done",
};

export function MyTasksWorkspace({
  tasks,
  total,
  userName,
  workspaceName,
}: {
  tasks: Task[];
  total: number;
  userName: string;
  workspaceName: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"OPEN" | TaskStatus>("OPEN");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const visible = useMemo(
    () => tasks.filter((task) => filter === "OPEN" ? task.status !== "DONE" : filter === "DONE" ? task.status === "DONE" : task.status === filter),
    [filter, tasks],
  );
  const openCount = tasks.filter(({ status }) => status !== "DONE").length;
  const overdueCount = tasks.filter(
    ({ dueDate, status }) => status !== "DONE" && dueDate && new Date(dueDate).getTime() < startOfToday(),
  ).length;
  const grouped = visible.reduce<Map<string, { project: Task["project"]; tasks: Task[] }>>((groups, task) => {
    const group = groups.get(task.project.id) ?? { project: task.project, tasks: [] };
    group.tasks.push(task);
    groups.set(task.project.id, group);
    return groups;
  }, new Map());

  function updateStatus(task: Task, status: TaskStatus) {
    setError("");
    startTransition(async () => {
      const result = await moveTaskAction({ taskId: task.id, status });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">{workspaceName}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[28px]">My tasks</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your assigned work across projects, {userName.split(/\s+/)[0]}.</p>
      </header>

      <section aria-label="Task summary" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SummaryCard label="Open tasks" value={openCount} icon={<CircleDot aria-hidden="true" className="size-4" />} />
        <SummaryCard label="Overdue" value={overdueCount} icon={<CalendarDays aria-hidden="true" className="size-4" />} />
        <SummaryCard label="Completed" value={tasks.length - openCount} icon={<CheckCircle2 aria-hidden="true" className="size-4" />} />
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col justify-between gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold">Assigned to me</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {total === 500 ? "Showing up to 500 tasks" : `${total} ${total === 1 ? "task" : "tasks"}`}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Filter aria-hidden="true" className="size-4 text-muted-foreground" />
            <span className="sr-only">Filter tasks by status</span>
            <select className="form-control h-9 w-auto min-w-36" onChange={(event) => setFilter(event.target.value as typeof filter)} value={filter}>
              <option value="OPEN">All open</option>
              <option value="TODO">To do</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="IN_REVIEW">In review</option>
              <option value="DONE">Done</option>
            </select>
          </label>
        </div>
        {error && <p className="border-b border-border px-5 py-3 text-sm text-destructive" role="alert">{error}</p>}
        {visible.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center">
            <ListTodo aria-hidden="true" className="size-8 text-muted-foreground" />
            <h3 className="mt-3 font-medium">{tasks.length ? "No tasks match this filter" : "Nothing assigned yet"}</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {tasks.length ? "Choose a different status to see your tasks." : "When a teammate assigns work to you, it will show up here."}
            </p>
            {!tasks.length && <Link className="mt-4 text-sm font-medium text-primary hover:underline" href="/projects">Browse projects</Link>}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {[...grouped.values()].map(({ project, tasks: groupTasks }) => (
              <section aria-label={project.name} key={project.id}>
                <div className="flex items-center gap-2 bg-muted/40 px-5 py-2.5">
                  <Link className="text-xs font-semibold text-primary hover:underline" href={`/projects/${project.id}`}>{project.key}</Link>
                  <span className="truncate text-xs text-muted-foreground">{project.name}</span>
                </div>
                {groupTasks.map((task) => (
                  <article className="flex flex-wrap items-center gap-3 px-5 py-3.5 sm:flex-nowrap" key={task.id}>
                    <span className={`size-2 shrink-0 rounded-full ${task.priority === "HIGH" ? "bg-rose-500" : task.priority === "MEDIUM" ? "bg-amber-500" : "bg-slate-400"}`} />
                    <span className="min-w-0 flex-1">
                      <Link className={`block truncate text-sm font-medium hover:text-primary ${task.status === "DONE" ? "text-muted-foreground line-through" : ""}`} href={`/projects/${project.id}/board`}>
                        {task.title}
                      </Link>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{project.key}-{task.number} · {task.priority.toLowerCase()}{task.estimatePoints !== null ? ` · ${task.estimatePoints} pts` : ""}</span>
                    </span>
                    {task.dueDate && (
                      <time className={`text-xs ${task.status !== "DONE" && new Date(task.dueDate).getTime() < startOfToday() ? "font-medium text-destructive" : "text-muted-foreground"}`} dateTime={task.dueDate}>
                        {new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(task.dueDate))}
                      </time>
                    )}
                    <label className="sr-only" htmlFor={`task-status-${task.id}`}>Status for {task.title}</label>
                    <select
                      className="form-control h-8 w-32 text-xs"
                      disabled={pending}
                      id={`task-status-${task.id}`}
                      onChange={(event) => updateStatus(task, event.target.value as TaskStatus)}
                      value={task.status}
                    >
                      {Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </article>
                ))}
              </section>
            ))}
          </div>
        )}
      </section>
      <p className="sr-only" aria-live="polite">{pending ? "Updating task" : ""}</p>
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">{icon}{label}</div>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
    </article>
  );
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}
