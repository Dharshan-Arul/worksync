"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  createProjectSchema,
  parseOptionalDate,
  projectMutationSchema,
  updateProjectSchema,
} from "@/lib/validation";
import { getAuthenticatedUser } from "@/server/auth/user";
import {
  requireProjectPermission,
  requireWorkspacePermission,
} from "@/server/permissions";

export type ProjectActionResult = { error?: string; projectId?: string };

function validationError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Please check the project details.";
}

function actionError(error: unknown) {
  if (error instanceof Error && error.message.includes("permission")) {
    return "You don't have permission to manage this project.";
  }
  if (error instanceof Error && error.message.includes("not a member")) {
    return "You are not a member of this project.";
  }
  if (error instanceof Error && error.message.includes("Archived projects")) {
    return error.message;
  }
  throw error;
}

export async function createProjectAction(input: unknown): Promise<ProjectActionResult> {
  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };

  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };

  try {
    await requireWorkspacePermission(user.id, parsed.data.workspaceId, "project:create");
  } catch (error) {
    return { error: actionError(error) };
  }

  try {
    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          workspaceId: parsed.data.workspaceId,
          name: parsed.data.name,
          key: parsed.data.key,
          description: parsed.data.description,
          leadId: user.id,
          members: { create: { userId: user.id } },
        },
      });
      const channel = await tx.channel.create({
        data: {
          workspaceId: parsed.data.workspaceId,
          projectId: created.id,
          type: "PROJECT",
          name: `${created.key.toLowerCase()}-team`,
          members: { create: { userId: user.id } },
        },
      });
      await tx.activityLog.create({
        data: {
          workspaceId: parsed.data.workspaceId,
          projectId: created.id,
          actorId: user.id,
          action: "PROJECT_CREATED",
          meta: { name: created.name, key: created.key, channelId: channel.id },
        },
      });
      return created;
    });

    revalidatePath("/projects");
    return { projectId: project.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "That project key is already in use in this workspace." };
    }
    throw error;
  }
}

export async function updateProjectAction(input: unknown): Promise<ProjectActionResult> {
  const parsed = updateProjectSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const dueDate = parseOptionalDate(parsed.data.dueDate);
  if (dueDate === undefined) return { error: "Enter a valid due date." };

  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };

  let project;
  try {
    const authorized = await requireProjectPermission(
      user.id,
      parsed.data.projectId,
      "project:manage",
    );
    project = authorized.project;
  } catch (error) {
    return { error: actionError(error) };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.project.findUniqueOrThrow({
        where: { id: project.id },
        select: { name: true, key: true, description: true, status: true, dueDate: true },
      });
      await tx.project.update({
        where: { id: project.id },
        data: {
          name: parsed.data.name,
          key: parsed.data.key,
          description: parsed.data.description,
          status: parsed.data.status,
          dueDate,
        },
      });
      await tx.activityLog.create({
        data: {
          workspaceId: project.workspaceId,
          projectId: project.id,
          actorId: user.id,
          action: "PROJECT_UPDATED",
          meta: {
            before: {
              name: before.name,
              key: before.key,
              status: before.status,
              dueDate: before.dueDate?.toISOString() ?? null,
            },
            after: {
              name: parsed.data.name,
              key: parsed.data.key,
              status: parsed.data.status,
              dueDate: dueDate?.toISOString() ?? null,
            },
          },
        },
      });
    });
    revalidatePath("/projects");
    revalidatePath(`/projects/${project.id}`);
    return { projectId: project.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "That project key is already in use in this workspace." };
    }
    throw error;
  }
}

export async function archiveProjectAction(input: unknown): Promise<ProjectActionResult> {
  const parsed = projectMutationSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };

  let project;
  try {
    const authorized = await requireProjectPermission(
      user.id,
      parsed.data.projectId,
      "project:manage",
    );
    project = authorized.project;
  } catch (error) {
    return { error: actionError(error) };
  }

  await prisma.$transaction([
    prisma.project.update({ where: { id: project.id }, data: { archived: true } }),
    prisma.activityLog.create({
      data: {
        workspaceId: project.workspaceId,
        projectId: project.id,
        actorId: user.id,
        action: "PROJECT_ARCHIVED",
      },
    }),
  ]);
  revalidatePath("/projects");
  revalidatePath(`/projects/${project.id}`);
  return { projectId: project.id };
}

export async function deleteProjectAction(input: unknown): Promise<ProjectActionResult> {
  const parsed = projectMutationSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };

  let project;
  try {
    const authorized = await requireProjectPermission(
      user.id,
      parsed.data.projectId,
      "project:delete",
    );
    project = authorized.project;
  } catch (error) {
    return { error: actionError(error) };
  }

  await prisma.project.delete({ where: { id: project.id } });
  revalidatePath("/projects");
  return { projectId: project.id };
}
