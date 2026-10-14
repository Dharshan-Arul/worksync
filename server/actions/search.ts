"use server";

import { globalSearchSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/server/auth/user";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { requireWorkspacePermission } from "@/server/permissions";

export async function searchWorkspaceAction(input: unknown) {
  const parsed = globalSearchSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a search term." };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };
  const context = await getWorkspaceContext(user.id);
  if (!context) return { error: "Join or create a workspace to search." };
  try {
    await requireWorkspacePermission(user.id, context.workspace.id, "search:view");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "You do not have permission to perform this action."
    ) {
      return { error: "You do not have permission to search this workspace." };
    }
    throw error;
  }
  const role = context.membership.role;
  const manager = role === "OWNER" || role === "MANAGER";
  const projectScope = {
    workspaceId: context.workspace.id,
    archived: false,
    ...(manager ? {} : { members: { some: { userId: user.id } } }),
  };
  const query = parsed.data.query;
  const [projects, tasks] = await Promise.all([
    prisma.project.findMany({
      where: {
        ...projectScope,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { key: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: { name: "asc" },
      take: 5,
      select: { id: true, name: true, key: true },
    }),
    prisma.task.findMany({
      where: {
        project: projectScope,
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
          ...( /^[A-Z][A-Z0-9]{1,9}-\d+$/i.test(query)
            ? [{
                number: Number(query.split("-")[1]),
                project: { key: query.split("-")[0].toUpperCase() },
              }]
            : []),
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        number: true,
        title: true,
        project: { select: { id: true, key: true } },
      },
    }),
  ]);
  return {
    projects,
    tasks: tasks.map((task) => ({
      ...task,
      href: `/projects/${task.project.id}/board?taskId=${encodeURIComponent(task.id)}`,
    })),
  };
}
