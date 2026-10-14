"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CalendarDays,
  Check,
  CheckSquare,
  Clock3,
  Eye,
  EyeOff,
  GripVertical,
  MessageSquare,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useMemo,
  useOptimistic,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { AttachmentPanel, type AttachmentRecord } from "@/components/attachments/attachment-panel";
import {
  createTaskSchema,
  type taskPrioritySchema,
  type taskStatusSchema,
} from "@/lib/validation";
import {
  addChecklistItemAction,
  addCommentAction,
  createTaskAction,
  deleteChecklistItemAction,
  getTaskDetailsAction,
  moveTaskAction,
  toggleChecklistItemAction,
  updateTaskAction,
  watchTaskAction,
} from "@/server/actions/tasks";
import { createTaskChannelAction } from "@/server/actions/chat";
import type { z } from "zod";

type TaskStatus = z.infer<typeof taskStatusSchema>;
type TaskPriority = z.infer<typeof taskPrioritySchema>;

export type TaskRecord = {
  id: string;
  number: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  estimatePoints: number | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  checklistCount: number;
  commentCount: number;
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
  reporter: { id: string; name: string };
  checklistItems: { id: string; text: string; done: boolean }[];
  comments: {
    id: string;
    body: string;
    createdAt: string;
    author: { id: string; name: string; avatarUrl: string | null };
  }[];
  activityLogs: {
    id: string;
    action: string;
    meta: unknown;
    createdAt: string;
    actor: { id: string; name: string };
  }[];
  attachments: AttachmentRecord[];
  watcherCount: number;
  isWatching: boolean;
  watchers: { id: string; name: string; avatarUrl: string | null }[];
};

type ProjectMemberOption = { id: string; name: string; avatarUrl: string | null };

const columns: { status: TaskStatus; label: string; accent: string }[] = [
  { status: "TODO", label: "To do", accent: "bg-slate-400" },
  { status: "IN_PROGRESS", label: "In progress", accent: "bg-blue-500" },
  { status: "IN_REVIEW", label: "In review", accent: "bg-violet-500" },
  { status: "DONE", label: "Done", accent: "bg-emerald-500" },
];

const priorityStyles: Record<TaskPriority, string> = {
  LOW: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  MEDIUM: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  HIGH: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

export function TaskWorkspace({
  projectId,
  projectKey,
  tasks,
  totalTasks,
  members,
  canCreate,
  canManage,
  userId,
  view,
  initialTaskId,
}: {
  projectId: string;
  projectKey: string;
  tasks: TaskRecord[];
  totalTasks: number;
  members: ProjectMemberOption[];
  canCreate: boolean;
  canManage: boolean;
  userId: string;
  view: "board" | "list";
  initialTaskId?: string;
}) {
  const router = useRouter();
  const [optimisticTasks, updateOptimisticTask] = useOptimistic(
    tasks,
    (current, update: { taskId: string; status: TaskStatus }) =>
      current.map((task) =>
        task.id === update.taskId ? { ...task, status: update.status } : task,
      ),
  );
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [taskDetails, setTaskDetails] = useState<TaskRecord | null>(null);
  const [loadingTask, setLoadingTask] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [activeDragTask, setActiveDragTask] = useState<TaskRecord | null>(null);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const openedInitialTaskId = useRef<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const activeSummary = tasks.find((task) => task.id === activeTaskId) ?? null;
  const activeTask = taskDetails?.id === activeTaskId ? taskDetails : activeSummary;
  const openCount = optimisticTasks.filter((task) => task.status !== "DONE").length;

  useEffect(() => {
    if (initialTaskId && openedInitialTaskId.current !== initialTaskId) {
      openedInitialTaskId.current = initialTaskId;
      void openTask(initialTaskId);
    }
  }, [initialTaskId]);

  async function openTask(taskId: string) {
    setActiveTaskId(taskId);
    setTaskDetails(null);
    setDetailsError("");
    setLoadingTask(true);
    const result = await getTaskDetailsAction({ taskId });
    setLoadingTask(false);
    if (result.error) {
      setDetailsError(result.error);
      setNotice(result.error);
      return;
    }
    if (result.task) setTaskDetails(result.task);
  }

  async function refreshTaskDetails() {
    if (!activeTaskId) return;
    const result = await getTaskDetailsAction({ taskId: activeTaskId });
    if (result.error) {
      setNotice(result.error);
      setDetailsError(result.error);
      setTaskDetails(null);
      return;
    }
    if (result.task) setTaskDetails(result.task);
    router.refresh();
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveDragTask(null);
    const taskId = String(event.active.id);
    const nextColumn = columns.find((column) => column.status === event.over?.id);
    if (!nextColumn) return;
    const nextStatus = nextColumn.status;
    const currentTask = tasks.find((task) => task.id === taskId);
    if (!currentTask || currentTask.status === nextStatus) return;
    if (
      !canManage &&
      currentTask.assignee?.id !== userId
    ) {
      setNotice("You can only move tasks assigned to you.");
      return;
    }

    const to = columns.find(({ status }) => status === nextStatus)?.label;
    setNotice("");
    startTransition(async () => {
      updateOptimisticTask({ taskId, status: nextStatus });
      const result = await moveTaskAction({ taskId, status: nextStatus });
      if (result.error) {
        setNotice(result.error);
        router.refresh();
        return;
      }
      setNotice(`Moved ${projectKey}-${currentTask.number} to ${to}.`);
      router.refresh();
      window.setTimeout(() => setNotice(""), 3000);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm text-muted-foreground">
            {tasks.length < totalTasks
              ? `Showing ${tasks.length} of ${totalTasks} tasks`
              : `${totalTasks} ${totalTasks === 1 ? "task" : "tasks"}`}{" "}
            · {openCount} open
          </p>
        </div>
        <div className="flex items-center gap-2">
          {notice && <p className="mr-2 text-xs text-muted-foreground" role="status">{notice}</p>}
          {canCreate && (
            <CreateTaskDialog
              canManage={canManage}
              members={members}
              projectId={projectId}
              userId={userId}
            />
          )}
        </div>
      </div>

      {view === "board" ? (
        <DndContext
          collisionDetection={closestCenter}
          onDragCancel={() => setActiveDragTask(null)}
          onDragEnd={onDragEnd}
          onDragStart={(event) => {
            setActiveDragTask(tasks.find((task) => task.id === String(event.active.id)) ?? null);
          }}
          sensors={sensors}
        >
          <div className="-mx-1 grid gap-4 overflow-x-auto px-1 pb-2 md:grid-cols-2 2xl:grid-cols-4">
            {columns.map((column) => (
              <BoardColumn
                column={column}
                key={column.status}
                onOpenTask={openTask}
                projectKey={projectKey}
                tasks={optimisticTasks.filter((task) => task.status === column.status)}
                canDragTask={(task) => canManage || task.assignee?.id === userId}
              />
            ))}
          </div>
          <DragOverlay>
            {activeDragTask ? (
              <TaskCardContent projectKey={projectKey} task={activeDragTask} />
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <TaskList
          onOpenTask={openTask}
          projectKey={projectKey}
          tasks={tasks}
        />
      )}

      {activeTaskId && activeTask && (
        <TaskDetailDrawer
          canComment={canCreate}
          canEdit={canManage || activeTask.assignee?.id === userId}
          canManage={canManage}
          currentUserId={userId}
          detailsError={detailsError}
          loading={loadingTask}
          members={members}
          onClose={() => {
            setActiveTaskId(null);
            setTaskDetails(null);
            setDetailsError("");
          }}
          onStartDiscussion={async () => {
            const result = await createTaskChannelAction({ taskId: activeTask.id });
            if (result.error) setNotice(result.error);
            else if (result.channelId) router.push(`/chat?channel=${encodeURIComponent(result.channelId)}`);
          }}
          onRefresh={refreshTaskDetails}
          projectId={projectId}
          projectKey={projectKey}
          task={activeTask}
        />
      )}
      {pending && <span className="sr-only" role="status">Saving task...</span>}
    </div>
  );
}

function BoardColumn({
  column,
  tasks,
  projectKey,
  onOpenTask,
  canDragTask,
}: {
  column: (typeof columns)[number];
  tasks: TaskRecord[];
  projectKey: string;
  onOpenTask: (taskId: string) => void;
  canDragTask: (task: TaskRecord) => boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: column.status,
    data: { status: column.status },
  });

  return (
    <section
      aria-label={`${column.label}, ${tasks.length} tasks`}
      className={`min-h-[350px] rounded-xl border border-border bg-muted/35 p-3 transition-colors ${
        isOver ? "border-primary/50 bg-primary/5" : ""
      }`}
      ref={setNodeRef}
    >
      <div className="mb-3 flex items-center justify-between px-1 py-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span className={`size-2 rounded-full ${column.accent}`} />
          {column.label}
        </h2>
        <span className="flex size-6 items-center justify-center rounded-md bg-background text-xs text-muted-foreground">
          {tasks.length}
        </span>
      </div>
      <div className="space-y-2.5">
        {tasks.map((task) => (
          <DraggableTaskCard
            key={task.id}
            onOpen={() => onOpenTask(task.id)}
            projectKey={projectKey}
            task={task}
            draggable={canDragTask(task)}
          />
        ))}
        {!tasks.length && (
          <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-border/70 text-xs text-muted-foreground">
            Drop tasks here
          </div>
        )}
      </div>
    </section>
  );
}

function DraggableTaskCard({
  task,
  projectKey,
  onOpen,
  draggable,
}: {
  task: TaskRecord;
  projectKey: string;
  onOpen: () => void;
  draggable: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { status: task.status },
    disabled: !draggable,
  });

  return (
    <article
      className={`rounded-lg border border-border bg-card p-3.5 shadow-sm ${
        isDragging ? "opacity-40" : ""
      }`}
      ref={setNodeRef}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground">
          {projectKey}-{task.number}
        </span>
        {draggable && (
          <button
            aria-label={`Drag ${task.title}`}
            className="rounded p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            {...attributes}
            {...listeners}
          >
            <GripVertical aria-hidden="true" className="size-3.5" />
          </button>
        )}
      </div>
      <button
        className="block w-full text-left text-sm font-medium leading-5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onOpen}
        type="button"
      >
        {task.title}
      </button>
      {task.description && (
        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{task.description}</p>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityStyles[task.priority]}`}>
          {task.priority.toLowerCase()}
        </span>
        <TaskCardMeta task={task} />
      </div>
    </article>
  );
}

function TaskCardContent({ task, projectKey }: { task: TaskRecord; projectKey: string }) {
  return (
    <article className="w-[270px] rotate-1 rounded-lg border border-primary/30 bg-card p-3.5 shadow-xl">
      <span className="text-[11px] font-medium text-muted-foreground">{projectKey}-{task.number}</span>
      <p className="mt-2 text-sm font-medium">{task.title}</p>
      <div className="mt-3 flex items-center justify-between">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityStyles[task.priority]}`}>{task.priority.toLowerCase()}</span>
        <TaskCardMeta task={task} />
      </div>
    </article>
  );
}

function TaskCardMeta({ task }: { task: TaskRecord }) {
  return (
    <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
      {task.checklistCount > 0 && (
        <span className="flex items-center gap-1" aria-label={`${task.checklistCount} checklist items`}>
          <CheckSquare aria-hidden="true" className="size-3" />
          {task.checklistCount}
        </span>
      )}
      {task.commentCount > 0 && (
        <span className="flex items-center gap-1">
          <MessageSquare aria-hidden="true" className="size-3" />
          {task.commentCount}
        </span>
      )}
      {task.dueDate && (
        <time className="flex items-center gap-1" dateTime={task.dueDate}>
          <CalendarDays aria-hidden="true" className="size-3" />
          {new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(task.dueDate))}
        </time>
      )}
      {task.assignee && (
        <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary" title={task.assignee.name}>
          {initials(task.assignee.name)}
        </span>
      )}
    </span>
  );
}

function TaskList({
  tasks,
  projectKey,
  onOpenTask,
}: {
  tasks: TaskRecord[];
  projectKey: string;
  onOpenTask: (taskId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [sort, setSort] = useState("createdAt");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const results = useMemo(() => {
    const filtered = tasks.filter((task) => {
      const matchesText = `${projectKey}-${task.number} ${task.title} ${task.description}`
        .toLowerCase()
        .includes(query.trim().toLowerCase());
      return (
        matchesText &&
        (statusFilter === "ALL" || task.status === statusFilter) &&
        (priorityFilter === "ALL" || task.priority === priorityFilter)
      );
    });

    return filtered.sort((left, right) => {
      let comparison = 0;
      if (sort === "title") comparison = left.title.localeCompare(right.title);
      else if (sort === "status") comparison = left.status.localeCompare(right.status);
      else if (sort === "priority") {
        const weight = { LOW: 1, MEDIUM: 2, HIGH: 3 };
        comparison = weight[left.priority] - weight[right.priority];
      } else if (sort === "dueDate") {
        comparison =
          (left.dueDate ? new Date(left.dueDate).getTime() : Infinity) -
          (right.dueDate ? new Date(right.dueDate).getTime() : Infinity);
      } else comparison = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      return direction === "asc" ? comparison : -comparison;
    });
  }, [tasks, projectKey, query, statusFilter, priorityFilter, sort, direction]);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search tasks</span>
          <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input className="form-control pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks..." type="search" value={query} />
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <label>
            <span className="sr-only">Filter tasks by status</span>
            <select className="form-control" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
              <option value="ALL">All statuses</option>
              {columns.map((column) => <option key={column.status} value={column.status}>{column.label}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">Filter tasks by priority</span>
            <select className="form-control" onChange={(event) => setPriorityFilter(event.target.value)} value={priorityFilter}>
              <option value="ALL">All priorities</option>
              <option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option>
            </select>
          </label>
          <label className="col-span-2 sm:col-span-1">
            <span className="sr-only">Sort tasks</span>
            <select className="form-control" onChange={(event) => setSort(event.target.value)} value={sort}>
              <option value="createdAt">Created date</option>
              <option value="dueDate">Due date</option>
              <option value="title">Title</option>
              <option value="status">Status</option>
              <option value="priority">Priority</option>
            </select>
          </label>
        </div>
        <Button
          aria-label={`Sort ${direction === "asc" ? "descending" : "ascending"}`}
          onClick={() => setDirection((current) => current === "asc" ? "desc" : "asc")}
          title={`Sort ${direction === "asc" ? "descending" : "ascending"}`}
          variant="outline"
          size="icon"
        >
          {direction === "asc" ? "↑" : "↓"}
        </Button>
      </div>
      {results.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Task</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Assignee</th>
                <th className="px-4 py-3">Due date</th>
                <th className="px-4 py-3">Estimate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {results.map((task) => (
                <tr className="cursor-pointer hover:bg-muted/30" key={task.id} onClick={() => onOpenTask(task.id)}>
                  <td className="px-4 py-3.5">
                    <button className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onOpenTask(task.id)} type="button">
                      <span className="block font-medium">{task.title}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{projectKey}-{task.number}</span>
                    </button>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs">{columns.find(({ status }) => status === task.status)?.label}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${priorityStyles[task.priority]}`}>{task.priority.toLowerCase()}</span>
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground">{task.assignee?.name ?? "Unassigned"}</td>
                  <td className="px-4 py-3.5 text-muted-foreground">
                    {task.dueDate ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(task.dueDate)) : "—"}
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground">{task.estimatePoints ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex min-h-56 flex-col items-center justify-center px-5 text-center">
          <Search aria-hidden="true" className="size-7 text-muted-foreground" />
          <h2 className="mt-3 font-medium">{tasks.length ? "No matching tasks" : "No tasks yet"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {tasks.length ? "Adjust your search or filters." : "Create a task to start planning this project."}
          </p>
        </div>
      )}
      <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
        Showing {results.length} of {tasks.length} tasks
      </p>
    </section>
  );
}

function CreateTaskDialog({
  projectId,
  members,
  canManage,
  userId,
}: {
  projectId: string;
  members: ProjectMemberOption[];
  canManage: boolean;
  userId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  type Input = z.input<typeof createTaskSchema>;
  type Output = z.output<typeof createTaskSchema>;
  const form = useForm<Input, undefined, Output>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: {
      projectId,
      title: "",
      description: "",
      status: "TODO",
      priority: "MEDIUM",
      assigneeId: canManage ? "" : userId,
      dueDate: "",
    },
  });

  function submit(values: Output) {
    setError("");
    startTransition(async () => {
      const result = await createTaskAction(values);
      if (result.error) {
        setError(result.error);
        return;
      }
      form.reset({
        projectId,
        title: "",
        description: "",
        status: "TODO",
        priority: "MEDIUM",
        assigneeId: canManage ? "" : userId,
        dueDate: "",
      });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        New task
      </Button>
      {open && (
        <DialogFrame label="Create task" onClose={() => !pending && setOpen(false)}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Create a task</h2>
              <p className="mt-1 text-sm text-muted-foreground">Add a task to the project board.</p>
            </div>
            <Button aria-label="Close dialog" disabled={pending} onClick={() => setOpen(false)} size="icon" variant="ghost"><X /></Button>
          </div>
          <form className="mt-6 space-y-4" onSubmit={form.handleSubmit(submit)} noValidate>
            <input type="hidden" {...form.register("projectId")} />
            <div>
              <label className="form-label" htmlFor="task-title">Task title</label>
              <input autoFocus className="form-control" id="task-title" maxLength={200} placeholder="What needs to get done?" {...form.register("title")} />
              {form.formState.errors.title && <FieldError>{form.formState.errors.title.message}</FieldError>}
            </div>
            <div>
              <label className="form-label" htmlFor="task-description">Description <span className="font-normal text-muted-foreground">(optional)</span></label>
              <textarea className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/20" id="task-description" maxLength={10000} {...form.register("description")} />
              {form.formState.errors.description && <FieldError>{form.formState.errors.description.message}</FieldError>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="form-label" htmlFor="task-status">Status</label>
                <select className="form-control" id="task-status" {...form.register("status")}>
                  {columns.map((column) => <option key={column.status} value={column.status}>{column.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="task-priority">Priority</label>
                <select className="form-control" id="task-priority" {...form.register("priority")}>
                  <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option>
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="task-assignee">Assignee</label>
                <select className="form-control" id="task-assignee" {...form.register("assigneeId")}>
                  {canManage && <option value="">Unassigned</option>}
                  {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="task-due-date">Due date</label>
                <input className="form-control" id="task-due-date" type="date" {...form.register("dueDate")} />
              </div>
              <div>
                <label className="form-label" htmlFor="task-estimate">Estimate points</label>
                <input className="form-control" id="task-estimate" inputMode="numeric" min={0} max={100} type="number" {...form.register("estimatePoints", { setValueAs: (value: string) => value === "" ? undefined : Number(value) })} />
              </div>
            </div>
            {error && <FieldError>{error}</FieldError>}
            <div className="flex justify-end gap-2 pt-2">
              <Button disabled={pending} onClick={() => setOpen(false)} type="button" variant="outline">Cancel</Button>
              <Button disabled={pending} type="submit">{pending ? "Creating..." : "Create task"}</Button>
            </div>
          </form>
        </DialogFrame>
      )}
    </>
  );
}

function TaskDetailDrawer({
  task,
  projectKey,
  members,
  canEdit,
  canComment,
  canManage,
  currentUserId,
  detailsError,
  loading,
  onRefresh,
  onStartDiscussion,
  onClose,
  projectId,
}: {
  task: TaskRecord;
  projectKey: string;
  members: ProjectMemberOption[];
  canEdit: boolean;
  canComment: boolean;
  canManage: boolean;
  currentUserId: string;
  detailsError: string;
  loading: boolean;
  onRefresh: () => Promise<void>;
  onStartDiscussion: () => Promise<void>;
  onClose: () => void;
  projectId: string;
}) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [checklistText, setChecklistText] = useState("");
  const [commentText, setCommentText] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    dialogRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]',
      );
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  function update(values: Record<string, unknown>) {
    setError("");
    startTransition(async () => {
      const result = await updateTaskAction({ taskId: task.id, ...values });
      if (result.error) setError(result.error);
      else await onRefresh();
    });
  }

  function addChecklist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = checklistText.trim();
    if (!text) return;
    setError("");
    startTransition(async () => {
      const result = await addChecklistItemAction({ taskId: task.id, text });
      if (result.error) setError(result.error);
      else {
        setChecklistText("");
        await onRefresh();
      }
    });
  }

  function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = commentText.trim();
    if (!body) return;
    setError("");
    startTransition(async () => {
      const result = await addCommentAction({ taskId: task.id, body });
      if (result.error) setError(result.error);
      else {
        setCommentText("");
        await onRefresh();
      }
    });
  }

  const activity = [...task.activityLogs].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-foreground/35 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <section
        aria-label={`Task ${projectKey}-${task.number}`}
        aria-modal="true"
        className="flex h-full w-full max-w-[680px] flex-col border-l border-border bg-background shadow-2xl"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-7">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground">{projectKey}-{task.number}</p>
            <p className="mt-1 text-xs text-muted-foreground">Created by {task.reporter.name} · {formatDate(task.createdAt)}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              aria-pressed={task.isWatching}
              disabled={pending || loading}
              onClick={() => startTransition(async () => {
                const result = await watchTaskAction({
                  taskId: task.id,
                  watching: !task.isWatching,
                });
                if (result.error) setError(result.error);
                else await onRefresh();
              })}
              type="button"
              variant="outline"
              size="sm"
            >
              {task.isWatching ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              <span className="hidden sm:inline">{task.isWatching ? "Watching" : "Watch"}</span>
              <span>{task.watcherCount}</span>
            </Button>
            {canComment && (
              <Button onClick={() => void onStartDiscussion()} type="button" variant="outline" size="sm">
                <MessageSquare aria-hidden="true" /> Discuss
              </Button>
            )}
            <Button aria-label="Close task details" onClick={onClose} size="icon" variant="ghost"><X aria-hidden="true" /></Button>
          </div>
        </header>
        {loading ? (
          <div aria-label="Loading task details" className="flex-1 space-y-5 overflow-hidden px-5 py-6 sm:px-7" role="status">
            <span className="sr-only">Loading task details...</span>
            <div className="h-7 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-24 animate-pulse rounded-lg bg-muted" />
            <div className="h-36 animate-pulse rounded-xl bg-muted" />
            <div className="h-28 animate-pulse rounded-xl bg-muted" />
          </div>
        ) : detailsError ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <p className="text-sm font-medium text-destructive" role="alert">{detailsError}</p>
            <Button className="mt-4" onClick={onClose} variant="outline">Close</Button>
          </div>
        ) : (
        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-7">
          <input
            aria-label="Task title"
            className="w-full rounded-md border border-transparent bg-transparent px-1 py-1 text-xl font-semibold leading-7 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            defaultValue={task.title}
            disabled={!canEdit || pending}
            key={`${task.id}:title:${task.updatedAt}`}
            onBlur={(event) => {
              if (event.target.value.trim() !== task.title) update({ title: event.target.value });
            }}
          />
          <textarea
            aria-label="Task description"
            className="mt-4 min-h-24 w-full resize-y rounded-lg border border-border bg-card px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
            defaultValue={task.description}
            disabled={!canEdit || pending}
            key={`${task.id}:${task.updatedAt}`}
            onBlur={(event) => {
              if (event.target.value !== task.description) update({ description: event.target.value });
            }}
            placeholder="Add a description..."
          />
          <div className="mt-6 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
            <Property label="Status">
              <select className="form-control h-9" disabled={!canEdit || pending} onChange={(event) => update({ status: event.target.value })} value={task.status}>
                {columns.map((column) => <option key={column.status} value={column.status}>{column.label}</option>)}
              </select>
            </Property>
            <Property label="Priority">
              <select className="form-control h-9" disabled={!canEdit || pending} onChange={(event) => update({ priority: event.target.value })} value={task.priority}>
                <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option>
              </select>
            </Property>
            <Property label="Assignee">
              <select className="form-control h-9" disabled={!canManage || pending} onChange={(event) => update({ assigneeId: event.target.value || null })} value={task.assignee?.id ?? ""}>
                <option value="">Unassigned</option>
                {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select>
            </Property>
            <Property label="Due date">
              <input className="form-control h-9" disabled={!canEdit || pending} onChange={(event) => update({ dueDate: event.target.value || null })} type="date" value={task.dueDate?.slice(0, 10) ?? ""} />
            </Property>
            <Property label="Estimate points">
              <input className="form-control h-9" disabled={!canEdit || pending} max={100} min={0} onChange={(event) => update({ estimatePoints: event.target.value === "" ? null : Number(event.target.value) })} type="number" value={task.estimatePoints ?? ""} />
            </Property>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            <Eye aria-hidden="true" className="mr-1 inline size-3.5" />
            {task.watchers.length
              ? `Watching: ${task.watchers.map((watcher) => watcher.name).join(", ")}`
              : "No one is watching this task yet."}
          </p>

          <section className="mt-7">
            <SectionHeading icon={<CheckSquare aria-hidden="true" className="size-4" />} title="Checklist" count={`${task.checklistItems.filter((item) => item.done).length}/${task.checklistItems.length}`} />
            {task.checklistItems.length ? (
              <ul className="mt-3 space-y-1">
                {task.checklistItems.map((item) => (
                  <li className="group flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-muted/60" key={item.id}>
                    <button
                      aria-checked={item.done}
                      aria-label={`${item.done ? "Mark incomplete" : "Complete"}: ${item.text}`}
                      className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                        item.done ? "border-primary bg-primary text-primary-foreground" : "border-input"
                      } ${!canEdit ? "cursor-not-allowed opacity-60" : ""}`}
                      disabled={!canEdit || pending}
                      onClick={() => startTransition(async () => {
                        const result = await toggleChecklistItemAction({ taskId: task.id, itemId: item.id, done: !item.done });
                        if (result.error) setError(result.error);
                        else await onRefresh();
                      })}
                      role="checkbox"
                      type="button"
                    >
                      {item.done && <Check aria-hidden="true" className="size-3" />}
                    </button>
                    <span className={`min-w-0 flex-1 text-sm ${item.done ? "text-muted-foreground line-through" : ""}`}>{item.text}</span>
                    {canEdit && (
                      <button
                        aria-label={`Remove checklist item: ${item.text}`}
                        className="rounded p-1 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                        disabled={pending}
                        onClick={() => startTransition(async () => {
                          const result = await deleteChecklistItemAction({ taskId: task.id, itemId: item.id });
                          if (result.error) setError(result.error);
                          else await onRefresh();
                        })}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" className="size-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No checklist items yet.</p>
            )}
            {canEdit && (
              <form className="mt-3 flex gap-2" onSubmit={addChecklist}>
                <input aria-label="New checklist item" className="form-control h-9 flex-1" maxLength={240} onChange={(event) => setChecklistText(event.target.value)} placeholder="Add an item..." value={checklistText} />
                <Button aria-label="Add checklist item" disabled={pending || !checklistText.trim()} size="icon" type="submit" variant="outline"><Plus aria-hidden="true" /></Button>
              </form>
            )}
          </section>

          <AttachmentPanel
            attachments={task.attachments}
            canManage={canManage}
            canUpload={canComment}
            currentUserId={currentUserId}
            onChanged={onRefresh}
            projectId={projectId}
            taskId={task.id}
          />

          <section className="mt-7">
            <SectionHeading icon={<MessageSquare aria-hidden="true" className="size-4" />} title="Comments" count={String(task.comments.length)} />
            {canComment ? (
              <form className="mt-3 space-y-2" onSubmit={addComment}>
                <label className="sr-only" htmlFor="task-comment">Write a comment</label>
                <textarea className="min-h-20 w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/20" id="task-comment" maxLength={5000} onChange={(event) => setCommentText(event.target.value)} placeholder="Share an update..." value={commentText} />
                <div className="flex justify-end">
                  <Button disabled={pending || !commentText.trim()} size="sm" type="submit">{pending ? "Posting..." : "Comment"}</Button>
                </div>
              </form>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Comments are read-only for your role.</p>
            )}
            <ul className="mt-4 space-y-4">
              {task.comments.map((comment) => (
                <li className="flex gap-3" key={comment.id}>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials(comment.author.name)}</span>
                  <div className="min-w-0 flex-1 rounded-lg bg-card px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{comment.author.name}</span>
                      <time className="text-[11px] text-muted-foreground" dateTime={comment.createdAt}>{formatDate(comment.createdAt)}</time>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5">{comment.body}</p>
                  </div>
                </li>
              ))}
            </ul>
            {!task.comments.length && <p className="mt-3 text-sm text-muted-foreground">No comments yet. Start the conversation.</p>}
          </section>

          <section className="mt-7">
            <SectionHeading icon={<Clock3 aria-hidden="true" className="size-4" />} title="Activity" count={String(activity.length)} />
            {activity.length ? (
              <ol className="mt-4 space-y-4 border-l border-border pl-4">
                {activity.map((item) => (
                  <li className="relative" key={item.id}>
                    <span className="absolute -left-[21px] top-1 size-2.5 rounded-full border-2 border-background bg-primary" />
                    <p className="text-sm"><span className="font-medium">{item.actor.name}</span>{" "}<span className="text-muted-foreground">{item.action.toLowerCase().replaceAll("_", " ")}</span></p>
                    <time className="mt-1 block text-xs text-muted-foreground" dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Task changes will appear here.</p>
            )}
          </section>
          {error && <p className="mt-6 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}
        </div>
        )}
      </section>
    </div>
  );
}

function Property({ label, children }: { label: string; children: ReactNode }) {
  return <label className="min-w-0"><span className="form-label text-xs">{label}</span>{children}</label>;
}

function SectionHeading({ icon, title, count }: { icon: ReactNode; title: string; count: string }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</h3>
      <span className="text-xs text-muted-foreground">{count}</span>
    </div>
  );
}

function DialogFrame({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section aria-label={label} aria-modal="true" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl sm:p-7" role="dialog">
        {children}
      </section>
    </div>
  );
}

function FieldError({ children }: { children?: string }) {
  return <p className="mt-1.5 text-xs font-medium text-destructive" role="alert">{children}</p>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}
