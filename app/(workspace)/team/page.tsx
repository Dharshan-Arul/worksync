import type { Metadata } from "next";
import { TeamManagement } from "@/components/team/team-management";
import { getAuthenticatedUser } from "@/server/auth/user";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Team" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  const context = await getWorkspaceContext(user.id);
  if (!context) return null;

  const canManage = context.membership.role === "OWNER" || context.membership.role === "MANAGER";
  const [members, invitations, projects] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId: context.workspace.id },
      orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            _count: {
              select: {
                assignedTasks: {
                  where: {
                    status: { not: "DONE" },
                    project: { workspaceId: context.workspace.id },
                  },
                },
              },
            },
          },
        },
      },
    }),
    canManage
      ? prisma.invitation.findMany({
          where: {
            workspaceId: context.workspace.id,
            email: { not: null },
            acceptedAt: null,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: "desc" },
          include: { invitedBy: { select: { name: true } } },
        })
      : Promise.resolve([]),
    canManage
      ? prisma.project.findMany({
          where: { workspaceId: context.workspace.id, archived: false },
          orderBy: { name: "asc" },
          select: { id: true, name: true, key: true },
        })
      : Promise.resolve([]),
  ]);
  const projectMemberships = members.length
    ? await prisma.projectMember.findMany({
        where: {
          userId: { in: members.map(({ userId }) => userId) },
          project: { workspaceId: context.workspace.id },
        },
        select: { projectId: true, userId: true },
      })
    : [];
  const projectIdsByUser = new Map<string, string[]>();
  for (const membership of projectMemberships) {
    const projectIds = projectIdsByUser.get(membership.userId) ?? [];
    projectIds.push(membership.projectId);
    projectIdsByUser.set(membership.userId, projectIds);
  }

  return (
    <TeamManagement
      canManage={canManage}
      currentUserId={user.id}
      invitations={invitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email ?? "",
        role: invitation.role,
        createdAt: invitation.createdAt.toISOString(),
        expiresAt: invitation.expiresAt.toISOString(),
        invitedBy: invitation.invitedBy?.name ?? "Workspace manager",
      }))}
      members={members.map((member) => ({
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        avatarUrl: member.user.avatarUrl,
        role: member.role,
        joinedAt: member.joinedAt.toISOString(),
        openTasks: member.user._count.assignedTasks,
        projectIds: projectIdsByUser.get(member.userId) ?? [],
      }))}
      projects={projects}
      role={context.membership.role}
      workspace={{ id: context.workspace.id, name: context.workspace.name }}
    />
  );
}
