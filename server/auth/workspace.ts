import "server-only";

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function getWorkspaceContext(userId: string) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    include: { workspace: { select: { id: true, name: true, slug: true } } },
    orderBy: { joinedAt: "asc" },
  });
  if (!memberships.length) return null;

  const cookieStore = await cookies();
  const workspaceId = cookieStore.get("workflow-workspace")?.value;
  const membership =
    memberships.find((item) => item.workspaceId === workspaceId) ?? memberships[0];

  return {
    membership,
    workspace: membership.workspace,
    workspaces: memberships.map(({ workspace }) => workspace),
  };
}
