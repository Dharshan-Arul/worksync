"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CalendarDays, CheckCircle2, CircleDot, GripVertical, Plus, Rocket, Target, TimerReset } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  completeSprintAction,
  createSprintAction,
  moveTaskToSprintAction,
  setSprintCapacityAction,
  startSprintAction,
} from "@/server/actions/sprints";

export type BacklogTask = {
  id: string;
  number: number;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH";
  estimatePoints: number | null;
  sprintId: string | null;
  assignee: { id: string; name: string } | null;
};

export type SprintRecord = {
  id: string;
  name: string;
  goal: string;
  startDate: string;
  endDate: string;
  status: "PLANNED" | "ACTIVE" | "COMPLETED";
  taskCount: number;
  tasks: { id: string; status: BacklogTask["status"]; estimatePoints: number | null; assigneeId: string | null }[];
  capacities: { userId: string; name: string; capacityPoints: number }[];
};

type Member = { id: string; name: string };

export function SprintBacklog({
  projectId,
  projectKey,
  tasks,
  totalTasks,
  sprints,
  members,
  canManage,
}: {
  projectId: string;
  projectKey: string;
  tasks: BacklogTask[];
  totalTasks: number;
  sprints: SprintRecord[];
  members: Member[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [optimisticTasks, moveOptimistic] = useOptimistic(
    tasks,
    (current, movement: { taskId: string; sprintId: string | null }) =>
      current.map((task) => task.id === movement.taskId ? { ...task, sprintId: movement.sprintId } : task),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const backlogTasks = optimisticTasks.filter(({ sprintId }) => sprintId === null);

  function onDragEnd(event: DragEndEvent) {
    const taskId = String(event.active.id);
    if (!event.over) return;
    const destinationId = String(event.over.id);
    const nextSprintId = destinationId === "lane:backlog" ? null : destinationId.replace(/^lane:/, "");
    if (nextSprintId && !sprints.some((sprint) => sprint.id === nextSprintId && sprint.status !== "COMPLETED")) return;
    const task = optimisticTasks.find((item) => item.id === taskId);
    if (!task || task.sprintId === nextSprintId || !canManage) return;

    setError("");
    startTransition(async () => {
      moveOptimistic({ taskId, sprintId: nextSprintId });
      const result = await moveTaskToSprintAction({ projectId, taskId, sprintId: nextSprintId });
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  function sprintAction(action: (input: { projectId: string; sprintId: string }) => Promise<{ error?: string }>, sprint: SprintRecord, confirmation?: string) {
    if (confirmation && !window.confirm(confirmation)) return;
    setError("");
    startTransition(async () => {
      const result = await action({ projectId, sprintId: sprint.id });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  const activeSprint = sprints.find(({ status }) => status === "ACTIVE");

  return (
    <div className="space-y-5">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Backlog</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {totalTasks === tasks.length ? `${totalTasks} tasks` : `Showing ${tasks.length} of ${totalTasks} tasks`}
            {activeSprint ? ` · Active: ${activeSprint.name}` : " · No active sprint"}
          </p>
        </div>
        {canManage && <CreateSprintForm projectId={projectId} pending={pending} onError={setError} onPending={startTransition} onCreated={() => router.refresh()} />}
      </header>

      {error && <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{error}</p>}

      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        sensors={sensors}
      >
        <div className="space-y-4">
          <TaskLane
            canManage={canManage}
            id="backlog"
            projectKey={projectKey}
            tasks={backlogTasks}
            title="Backlog"
          />
          {sprints.map((sprint) => {
            const sprintTasks = optimisticTasks.filter((task) => task.sprintId === sprint.id);
            return (
              <SprintLane
                canManage={canManage}
                key={sprint.id}
                members={members}
                onCapacityChange={(member, points) => {
                  setError("");
                  startTransition(async () => {
                    const result = await setSprintCapacityAction({
                      projectId,
                      sprintId: sprint.id,
                      userId: member.id,
                      capacityPoints: points,
                    });
                    if (result.error) setError(result.error);
                    else router.refresh();
                  });
                }}
                onComplete={() => sprintAction(
                  completeSprintAction,
                  sprint,
                  `Complete "${sprint.name}"? Any unfinished tasks will move back to the backlog.`,
                )}
                onStart={() => sprintAction(startSprintAction, sprint)}
                pending={pending}
                projectKey={projectKey}
                sprint={sprint}
                tasks={sprintTasks}
              />
            );
          })}
        </div>
      </DndContext>
      {!sprints.length && !backlogTasks.length && (
        <section className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <h3 className="font-medium">Nothing planned yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Create tasks on your board, then create a sprint to plan the work.</p>
        </section>
      )}
    </div>
  );
}

function CreateSprintForm({
  projectId,
  pending,
  onError,
  onPending,
  onCreated,
}: {
  projectId: string;
  pending: boolean;
  onError: (value: string) => void;
  onPending: (callback: () => Promise<void>) => void;
  onCreated: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const end = new Date();
  end.setDate(end.getDate() + 13);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(end.toISOString().slice(0, 10));

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError("");
    onPending(async () => {
      const result = await createSprintAction({ projectId, name, goal, startDate, endDate });
      if (result.error) onError(result.error);
      else {
        setOpen(false);
        setName("");
        setGoal("");
        onCreated();
      }
    });
  }

  return (
    <div className="relative">
      <Button onClick={() => setOpen((value) => !value)} type="button" variant="outline">
        <Plus aria-hidden="true" /> Create sprint
      </Button>
      {open && (
        <form className="absolute right-0 z-20 mt-2 w-[min(92vw,360px)] space-y-3 rounded-xl border border-border bg-card p-4 shadow-lg" onSubmit={submit}>
          <h3 className="font-semibold">New sprint</h3>
          <div>
            <label className="form-label" htmlFor="sprint-name">Sprint name</label>
            <input autoFocus className="form-control" id="sprint-name" maxLength={100} onChange={(event) => setName(event.target.value)} required value={name} />
          </div>
          <div>
            <label className="form-label" htmlFor="sprint-goal">Goal</label>
            <textarea className="form-control min-h-16" id="sprint-goal" maxLength={1000} onChange={(event) => setGoal(event.target.value)} value={goal} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="form-label" htmlFor="sprint-start">Starts</label>
              <input className="form-control" id="sprint-start" onChange={(event) => setStartDate(event.target.value)} required type="date" value={startDate} />
            </div>
            <div>
              <label className="form-label" htmlFor="sprint-end">Ends</label>
              <input className="form-control" id="sprint-end" onChange={(event) => setEndDate(event.target.value)} required type="date" value={endDate} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setOpen(false)} type="button" variant="ghost">Cancel</Button>
            <Button disabled={pending} type="submit">{pending ? "Creating..." : "Create sprint"}</Button>
          </div>
        </form>
      )}
    </div>
  );
}

function TaskLane({
  id,
  title,
  tasks,
  projectKey,
  canManage,
}: {
  id: string;
  title: string;
  tasks: BacklogTask[];
  projectKey: string;
  canManage: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `lane:${id}`, disabled: !canManage });
  return (
    <section
      aria-label={title}
      className={`overflow-hidden rounded-xl border bg-card ${isOver ? "border-primary ring-2 ring-primary/20" : "border-border"}`}
      ref={setNodeRef}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">{tasks.length} tasks · {sumPoints(tasks)} pts</span>
      </div>
      {tasks.length ? (
        <div className="divide-y divide-border">
          {tasks.map((task) => <TaskCard draggable={canManage} key={task.id} projectKey={projectKey} task={task} />)}
        </div>
      ) : (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          {canManage ? "Drop tasks here to put them in the backlog." : "No tasks here."}
        </p>
      )}
    </section>
  );
}

function SprintLane({
  sprint,
  tasks,
  projectKey,
  members,
  canManage,
  pending,
  onStart,
  onComplete,
  onCapacityChange,
}: {
  sprint: SprintRecord;
  tasks: BacklogTask[];
  projectKey: string;
  members: Member[];
  canManage: boolean;
  pending: boolean;
  onStart: () => void;
  onComplete: () => void;
  onCapacityChange: (member: Member, points: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `lane:${sprint.id}`,
    disabled: !canManage || sprint.status === "COMPLETED",
  });
  const committedPoints = sumPoints(tasks);
  const completedPoints = tasks.reduce((sum, task) => sum + (task.status === "DONE" ? task.estimatePoints ?? 0 : 0), 0);
  const unassignedPoints = tasks.reduce((sum, task) => sum + (!task.assignee ? task.estimatePoints ?? 0 : 0), 0);
  const progress = committedPoints ? Math.round((completedPoints / committedPoints) * 100) : 0;
  const capacityByUser = new Map(sprint.capacities.map((capacity) => [capacity.userId, capacity]));

  return (
    <section
      aria-label={`${sprint.name} sprint`}
      className={`overflow-hidden rounded-xl border bg-card ${isOver ? "border-primary ring-2 ring-primary/20" : "border-border"}`}
      ref={setNodeRef}
    >
      <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{sprint.name}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${sprint.status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : sprint.status === "COMPLETED" ? "bg-muted text-muted-foreground" : "bg-sky-500/10 text-sky-700 dark:text-sky-300"}`}>
              {sprint.status.toLowerCase()}
            </span>
          </div>
          {sprint.goal && <p className="mt-1 text-sm text-muted-foreground">{sprint.goal}</p>}
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays aria-hidden="true" className="size-3.5" />
            {formatDate(sprint.startDate)} – {formatDate(sprint.endDate)}
          </p>
        </div>
        {canManage && (
          <div className="flex shrink-0 gap-2">
            {sprint.status === "PLANNED" && (
              <Button disabled={pending} onClick={onStart} type="button" size="sm">
                <Rocket aria-hidden="true" /> Start
              </Button>
            )}
            {sprint.status === "ACTIVE" && (
              <Button disabled={pending} onClick={onComplete} type="button" variant="outline" size="sm">
                <CheckCircle2 aria-hidden="true" /> Complete
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 border-b border-border px-4 py-4 sm:grid-cols-3">
        <HealthMetric label="Committed" value={`${committedPoints} pts`} detail={`${tasks.length} tasks`} icon={<Target aria-hidden="true" className="size-4" />} />
        <HealthMetric label="Completed" value={`${completedPoints} pts`} detail={`${progress}% of committed points`} icon={<CheckCircle2 aria-hidden="true" className="size-4" />} />
        <HealthMetric label="Remaining" value={`${Math.max(0, committedPoints - completedPoints)} pts`} detail={`${tasks.filter((task) => task.status !== "DONE").length} open tasks`} icon={<TimerReset aria-hidden="true" className="size-4" />} />
        <div className="sm:col-span-3">
          <div aria-label={`Sprint ${progress}% complete`} className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 border-b border-border bg-muted/20 px-4 py-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h4 className="text-sm font-semibold">Team capacity</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Committed points compared with each person’s planned capacity.
            {unassignedPoints > 0 ? ` ${unassignedPoints} pts remain unassigned.` : ""}
          </p>
        </div>
        {members.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {members.map((member) => {
              const workload = tasks.reduce((sum, task) => sum + (task.assignee?.id === member.id ? task.estimatePoints ?? 0 : 0), 0);
              const capacity = capacityByUser.get(member.id);
              const capacityPoints = capacity?.capacityPoints ?? 0;
              const overCapacity = capacityPoints > 0 && workload > capacityPoints;
              return (
                <div className="rounded-lg border border-border bg-card px-3 py-2.5" key={member.id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium">{member.name}</span>
                    {canManage && sprint.status !== "COMPLETED" ? (
                      <CapacityEditor
                        disabled={pending}
                        initialValue={capacity?.capacityPoints ?? ""}
                        member={member}
                        onSave={onCapacityChange}
                        sprintId={sprint.id}
                        key={`${member.id}-${capacity?.capacityPoints ?? "unset"}`}
                      />
                    ) : (
                      <span className={`text-xs font-medium ${overCapacity ? "text-destructive" : "text-muted-foreground"}`}>
                        {workload}/{capacityPoints} pts
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{workload} committed</span>
                    <span className={overCapacity ? "text-destructive" : ""}>
                      {capacityPoints ? `${capacityPoints} capacity` : "capacity not set"}
                    </span>
                  </div>
                  <div aria-label={`${member.name}: ${workload} of ${capacityPoints} capacity points`} className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${overCapacity ? "bg-destructive" : "bg-primary"}`} style={{ width: `${capacityPoints ? Math.min(100, workload / capacityPoints * 100) : workload ? 100 : 0}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Add project members to plan capacity by person.</p>
        )}
      </div>

      <div className="divide-y divide-border">
        {tasks.length ? tasks.map((task) => <TaskCard draggable={canManage && sprint.status !== "COMPLETED"} key={task.id} projectKey={projectKey} task={task} />) : (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">{sprint.status === "COMPLETED" ? "No completed sprint tasks." : "Drop tasks here to commit them to this sprint."}</p>
        )}
      </div>
    </section>
  );
}

function CapacityEditor({
  member,
  initialValue,
  disabled,
  onSave,
  sprintId,
}: {
  member: Member;
  initialValue: number | "";
  disabled: boolean;
  onSave: (member: Member, points: number) => void;
  sprintId: string;
}) {
  const [value, setValue] = useState(String(initialValue));
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        const points = Number(value);
        if (Number.isInteger(points) && points >= 0 && points <= 500) onSave(member, points);
      }}
    >
      <label className="sr-only" htmlFor={`capacity-${sprintId}-${member.id}`}>Capacity points for {member.name}</label>
      <input
        className="form-control h-7 w-14 px-1 text-center text-xs"
        disabled={disabled}
        id={`capacity-${sprintId}-${member.id}`}
        max={500}
        min={0}
        onChange={(event) => setValue(event.target.value)}
        type="number"
        value={value}
      />
      <span className="text-[10px] text-muted-foreground">pts</span>
      <Button aria-label={`Save capacity for ${member.name}`} disabled={disabled} type="submit" size="xs" variant="ghost">Save</Button>
    </form>
  );
}

function TaskCard({ task, projectKey, draggable }: { task: BacklogTask; projectKey: string; draggable: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, disabled: !draggable });
  return (
    <article
      className={`flex items-center gap-3 px-4 py-3 ${isDragging ? "opacity-40" : ""}`}
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
    >
      {draggable ? (
        <button
          aria-label={`Drag ${projectKey}-${task.number}`}
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          {...attributes}
          {...listeners}
          type="button"
        >
          <GripVertical aria-hidden="true" className="size-4" />
        </button>
      ) : <CircleDot aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
      <span className={`size-2 shrink-0 rounded-full ${task.priority === "HIGH" ? "bg-rose-500" : task.priority === "MEDIUM" ? "bg-amber-500" : "bg-slate-400"}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{task.title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {projectKey}-{task.number} · {task.status.replaceAll("_", " ").toLowerCase()}
        </span>
      </span>
      <span className="hidden text-xs text-muted-foreground sm:block">{task.assignee?.name ?? "Unassigned"}</span>
      <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
        {task.estimatePoints === null ? "— pts" : `${task.estimatePoints} pts`}
      </span>
    </article>
  );
}

function HealthMetric({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
      <span>
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="block text-sm font-semibold">{value}</span>
        <span className="block text-[10px] text-muted-foreground">{detail}</span>
      </span>
    </div>
  );
}

function sumPoints(tasks: BacklogTask[]) {
  return tasks.reduce((sum, task) => sum + (task.estimatePoints ?? 0), 0);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
