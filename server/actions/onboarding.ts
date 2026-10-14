"use server";

import { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createProjectSchema, createWorkspaceSchema } from "@/lib/validation";
import { getAuthenticatedUser } from "@/server/auth/user";
import { requireWorkspacePermission } from "@/server/permissions";

export type OnboardingActionResult = { error?: string };

function validationError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Please check your details and try again.";
}

export async function createWorkspaceAction(
  input: unknown,
): Promise<OnboardingActionResult> {
  const parsed = createWorkspaceSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };

  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };

  try {
    const workspace = await prisma.workspace.create({
      data: {
        name: parsed.data.name,
        slug: parsed.data.slug,
        createdById: user.id,
        members: { create: { userId: user.id, role: "OWNER" } },
      },
    });

    const cookieStore = await cookies();
    cookieStore.set("workflow-workspace", workspace.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    redirect("/onboarding/project");
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "That workspace URL is already in use. Try another one." };
    }
    throw error;
  }
}

export async function createFirstProjectAction(
  input: unknown,
): Promise<OnboardingActionResult> {
  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };

  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };

  const membership = await requireWorkspacePermission(
    user.id,
    parsed.data.workspaceId,
    "project:create",
  );

  try {
    const project = await prisma.$transaction(async (tx) => {
      const createdProject = await tx.project.create({
        data: {
          workspaceId: parsed.data.workspaceId,
          name: parsed.data.name,
          key: parsed.data.key,
          description: parsed.data.description,
          leadId: user.id,
          members:
            membership.role === "OWNER" || membership.role === "MANAGER"
              ? { create: { userId: user.id } }
              : undefined,
        },
      });
      const channel = await tx.channel.create({
        data: {
          workspaceId: parsed.data.workspaceId,
          projectId: createdProject.id,
          type: "PROJECT",
          name: `${createdProject.key.toLowerCase()}-team`,
          members: { create: { userId: user.id } },
        },
      });
      await tx.activityLog.create({
        data: {
          workspaceId: parsed.data.workspaceId,
          projectId: createdProject.id,
          actorId: user.id,
          action: "PROJECT_CREATED",
          meta: { name: createdProject.name, channelId: channel.id },
        },
      });
      return createdProject;
    });

    redirect(`/projects/${project.id}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("permission")) {
      return { error: "You need workspace manager access to create a project." };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "That project key is already in use in this workspace." };
    }
    throw error;
  }
}
