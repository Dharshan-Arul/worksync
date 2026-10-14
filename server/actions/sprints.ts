"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  createSprintSchema,
  moveTaskToSprintSchema,
  parseOptionalDate,
  setSprintCapacitySchema,
  sprintMutationSchema,
} from "@/lib/validation";
import { getAuthenticatedUser } from "@/server/auth/user";
import { requireProjectPermission } from "@/server/permissions";

type SprintActionResult = { error?: string; sprintId?: string };

function validationError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Please check the sprint details.";
}

function permissionError(error: unknown) {
  if (error instanceof Error && error.message.includes("permission")) {
    return "Only workspace managers can manage sprints.";
  }
  if (error instanceof Error && error.message.includes("not a member")) {
    return "You are not a member of this project.";
  }
  if (error instanceof Error && error.message.includes("Archived projects")) {
    return error.message;
  }
  throw error;
}

async function authorizeSprintManager(userId: string, projectId: string) {
  try {
    return await requireProjectPermission(userId, projectId, "sprint:manage");
  } catch (error) {
    return { error: permissionError(error) };
  }
}

function revalidateSprintViews(projectId: string) {
  revalidatePath(`/projects/${projectId}/backlog`);
  revalidatePath(`/projects/${projectId}/board`);
  revalidatePath(`/projects/${projectId}/list`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
}

export async function createSprintAction(input: unknown): Promise<SprintActionResult> {
  const parsed = createSprintSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };

  const authorization = await authorizeSprintManager(user.id, parsed.data.projectId);
  if ("error" in authorization) return { error: authorization.error };
  const startDate = parseOptionalDate(parsed.data.startDate);
  const endDate = parseOptionalDate(parsed.data.endDate);
  if (!startDate || !endDate) return { error: "Enter valid sprint dates." };

  const sprint = await prisma.sprint.create({
    data: {
      projectId: authorization.project.id,
      name: parsed.data.name,
      goal: parsed.data.goal,
      startDate,
      endDate,
    },
    select: { id: true },
  });
  await prisma.activityLog.create({
    data: {
      workspaceId: authorization.project.workspaceId,
      projectId: authorization.project.id,
      actorId: user.id,
      action: "SPRINT_CREATED",
      meta: { sprintId: sprint.id, name: parsed.data.name },
    },
  });
  revalidateSprintViews(authorization.project.id);
  return { sprintId: sprint.id };
}

export async function startSprintAction(input: unknown): Promise<SprintActionResult> {
  const parsed = sprintMutationSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };

  const authorization = await authorizeSprintManager(user.id, parsed.data.projectId);
  if ("error" in authorization) return { error: authorization.error };
  const sprint = await prisma.sprint.findFirst({
    where: { id: parsed.data.sprintId, projectId: authorization.project.id },
    select: { id: true, status: true, name: true },
  });
  if (!sprint) return { error: "Sprint not found in this project." };
  if (sprint.status !== "PLANNED") return { error: "Only a planned sprint can be started." };

  try {
    await prisma.$transaction(
      async (tx) => {
        const activeSprint = await tx.sprint.findFirst({
          where: { projectId: authorization.project.id, status: "ACTIVE" },
          select: { name: true },
        });
        if (activeSprint) throw new Error("Another sprint is already active in this project.");
        await tx.sprint.update({
          where: { id: sprint.id },
          data: { status: "ACTIVE" },
        });
        await tx.activityLog.create({
          data: {
            workspaceId: authorization.project.workspaceId,
            projectId: authorization.project.id,
            actorId: user.id,
            action: "SPRINT_STARTED",
            meta: { sprintId: sprint.id, name: sprint.name },
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Another sprint is already active in this project.") {
      return { error: error.message };
    }
    throw error;
  }

  revalidateSprintViews(authorization.project.id);
  return { sprintId: sprint.id };
}

export async function completeSprintAction(input: unknown): Promise<SprintActionResult> {
  const parsed = sprintMutationSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };

  const authorization = await authorizeSprintManager(user.id, parsed.data.projectId);
  if ("error" in authorization) return { error: authorization.error };
  const sprint = await prisma.sprint.findFirst({
    where: { id: parsed.data.sprintId, projectId: authorization.project.id },
    select: { id: true, status: true, name: true },
  });
  if (!sprint) return { error: "Sprint not found in this project." };
  if (sprint.status !== "ACTIVE") return { error: "Only an active sprint can be completed." };

  await prisma.$transaction(async (tx) => {
    const unfinished = await tx.task.findMany({
      where: { projectId: authorization.project.id, sprintId: sprint.id, status: { not: "DONE" } },
      select: { id: true },
    });
    await tx.task.updateMany({
      where: { id: { in: unfinished.map(({ id }) => id) } },
      data: { sprintId: null },
    });
    await tx.sprint.update({
      where: { id: sprint.id },
      data: { status: "COMPLETED" },
    });
    await tx.activityLog.create({
      data: {
        workspaceId: authorization.project.workspaceId,
        projectId: authorization.project.id,
        actorId: user.id,
        action: "SPRINT_COMPLETED",
        meta: {
          sprintId: sprint.id,
          name: sprint.name,
          unfinishedTasksMovedToBacklog: unfinished.length,
        },
      },
    });
  });
  revalidateSprintViews(authorization.project.id);
  return { sprintId: sprint.id };
}

export async function moveTaskToSprintAction(input: unknown): Promise<SprintActionResult> {
  const parsed = moveTaskToSprintSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };

  const authorization = await authorizeSprintManager(user.id, parsed.data.projectId);
  if ("error" in authorization) return { error: authorization.error };
  const task = await prisma.task.findFirst({
    where: { id: parsed.data.taskId, projectId: authorization.project.id },
    select: { id: true, sprintId: true, number: true, title: true },
  });
  if (!task) return { error: "Task not found in this project." };
  if (parsed.data.sprintId) {
    const sprint = await prisma.sprint.findFirst({
      where: {
        id: parsed.data.sprintId,
        projectId: authorization.project.id,
        status: { not: "COMPLETED" },
      },
      select: { id: true },
    });
    if (!sprint) return { error: "Choose a planned or active sprint in this project." };
  }
  if (task.sprintId === parsed.data.sprintId) return {};

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: task.id },
      data: { sprintId: parsed.data.sprintId },
    });
    await tx.activityLog.create({
      data: {
        workspaceId: authorization.project.workspaceId,
        projectId: authorization.project.id,
        taskId: task.id,
        actorId: user.id,
        action: "TASK_SPRINT_CHANGED",
        meta: { fromSprintId: task.sprintId, toSprintId: parsed.data.sprintId },
      },
    });
  });
  revalidateSprintViews(authorization.project.id);
  return {};
}

export async function setSprintCapacityAction(input: unknown): Promise<SprintActionResult> {
  const parsed = setSprintCapacitySchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };

  const authorization = await authorizeSprintManager(user.id, parsed.data.projectId);
  if ("error" in authorization) return { error: authorization.error };
  const [sprint, member] = await Promise.all([
    prisma.sprint.findFirst({
      where: { id: parsed.data.sprintId, projectId: authorization.project.id, status: { not: "COMPLETED" } },
      select: { id: true },
    }),
    prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: authorization.project.id, userId: parsed.data.userId } },
      select: { userId: true },
    }),
  ]);
  if (!sprint) return { error: "Choose a planned or active sprint in this project." };
  if (!member) return { error: "Capacity can only be set for project members." };

  await prisma.sprintCapacity.upsert({
    where: { sprintId_userId: { sprintId: sprint.id, userId: member.userId } },
    create: {
      sprintId: sprint.id,
      userId: member.userId,
      capacityPoints: parsed.data.capacityPoints,
    },
    update: { capacityPoints: parsed.data.capacityPoints },
  });
  revalidateSprintViews(authorization.project.id);
  return { sprintId: sprint.id };
}
