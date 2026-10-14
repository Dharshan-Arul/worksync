import type { Metadata } from "next";
import { Prisma } from "@prisma/client";
import { ChatWorkspace, type ChatChannel, type ChatMessage } from "@/components/chat/chat-workspace";
import { getAuthenticatedUser } from "@/server/auth/user";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Team chat" };

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  const context = await getWorkspaceContext(user.id);
  if (!context) return null;
  const { channel: requestedChannelId } = await searchParams;
  const manager = context.membership.role === "OWNER" || context.membership.role === "MANAGER";

  const [channels, contacts, taskOptions] = await Promise.all([
    prisma.channel.findMany({
      where: {
        workspaceId: context.workspace.id,
        members: { some: { userId: user.id } },
      },
      orderBy: { createdAt: "desc" },
      take: 150,
      include: {
        project: { select: { id: true, key: true, name: true } },
        task: { select: { id: true, number: true, title: true } },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, body: true, createdAt: true, senderId: true },
        },
      },
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId: context.workspace.id, userId: { not: user.id } },
      orderBy: { user: { name: "asc" } },
      take: 200,
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    }),
    prisma.task.findMany({
      where: {
        project: {
          workspaceId: context.workspace.id,
          archived: false,
          ...(manager ? {} : { members: { some: { userId: user.id } } }),
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        number: true,
        title: true,
        project: { select: { id: true, key: true, name: true } },
      },
    }),
  ]);

  const unreadByChannel = channels.length
    ? await prisma.$queryRaw<{ channelId: string; unreadCount: bigint }[]>(Prisma.sql`
        SELECT cm."channelId", COUNT(m."id")::bigint AS "unreadCount"
        FROM public."ChannelMember" cm
        JOIN public."Channel" c ON c."id" = cm."channelId"
        LEFT JOIN public."Message" m
          ON m."channelId" = cm."channelId"
          AND m."senderId" <> ${user.id}::uuid
          AND m."createdAt" > COALESCE(cm."lastReadAt", c."createdAt")
        WHERE cm."userId" = ${user.id}::uuid
          AND cm."channelId" IN (${Prisma.join(channels.map(({ id }) => Prisma.sql`${id}::uuid`))})
        GROUP BY cm."channelId"
      `)
    : [];
  const unreadCountByChannel = new Map(
    unreadByChannel.map((row) => [row.channelId, Number(row.unreadCount)]),
  );

  const channelRecords: ChatChannel[] = channels.map((channel) => {
    const membership = channel.members.find(({ userId }) => userId === user.id);
    const otherMembers = channel.members
      .filter(({ userId }) => userId !== user.id)
      .map(({ user: member }) => member);
    const displayName =
      channel.type === "PROJECT"
        ? channel.project?.name ?? channel.name
        : channel.type === "TASK"
          ? `${channel.project?.key ?? ""}-${channel.task?.number ?? ""} ${channel.task?.title ?? "discussion"}`
          : otherMembers.map(({ name }) => name).join(", ") || "Direct message";
    const unreadCount = membership ? unreadCountByChannel.get(channel.id) ?? 0 : 0;
    const lastMessage = channel.messages[0];
    return {
      id: channel.id,
      type: channel.type,
      name: displayName,
      projectKey: channel.project?.key ?? null,
      projectId: channel.projectId,
      taskId: channel.taskId,
      members: otherMembers.map((member) => ({
        id: member.id,
        name: member.name,
        email: member.email,
        avatarUrl: member.avatarUrl,
      })),
      unreadCount,
      latestMessage: lastMessage ? {
        body: lastMessage.body,
        createdAt: lastMessage.createdAt.toISOString(),
        senderId: lastMessage.senderId,
      } : null,
    };
  });

  channelRecords.sort((a, b) =>
    new Date(b.latestMessage?.createdAt ?? 0).getTime() -
    new Date(a.latestMessage?.createdAt ?? 0).getTime(),
  );
  const selectedChannel =
    channelRecords.find(({ id }) => id === requestedChannelId) ?? channelRecords[0] ?? null;
  let messages: ChatMessage[] = [];
  let hasMore = false;
  if (selectedChannel) {
    const page = await prisma.message.findMany({
      where: { channelId: selectedChannel.id },
      orderBy: { createdAt: "desc" },
      take: 51,
      include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
    });
    hasMore = page.length > 50;
    const visiblePage = page.slice(0, 50).reverse();
    const taskReferences = visiblePage.flatMap((message) =>
      Array.from(message.body.matchAll(/\b([A-Z][A-Z0-9]{1,9})-(\d+)\b/g), (match) => ({
        token: match[0],
        key: match[1],
        number: Number(match[2]),
      })),
    );
    const referencedProjects = taskReferences.length
      ? await prisma.project.findMany({
          where: {
            workspaceId: context.workspace.id,
            key: { in: [...new Set(taskReferences.map(({ key }) => key))] },
            ...(context.membership.role === "MEMBER" || context.membership.role === "VIEWER"
              ? { members: { some: { userId: user.id } } }
              : {}),
          },
          select: { id: true, key: true },
        })
      : [];
    const projectByKey = new Map(referencedProjects.map((project) => [project.key, project.id]));
    const referencedTasks = await prisma.task.findMany({
      where: {
        OR: taskReferences.flatMap(({ key, number }) => {
          const referencedProjectId = projectByKey.get(key);
          return referencedProjectId ? [{ projectId: referencedProjectId, number }] : [];
        }),
      },
      select: { id: true, number: true, projectId: true },
    });
    messages = visiblePage.map((message) => ({
      id: message.id,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      editedAt: message.editedAt?.toISOString() ?? null,
      sender: message.sender,
      taskLinks: taskReferences.flatMap(({ token, key, number }) => {
        const referencedProjectId = projectByKey.get(key);
        const task = referencedProjectId
          ? referencedTasks.find((item) => item.projectId === referencedProjectId && item.number === number)
          : undefined;
        return task && message.body.includes(token)
          ? [{ token, taskId: task.id, projectId: task.projectId }]
          : [];
      }),
    }));
  }

  return (
    <ChatWorkspace
      key={`${selectedChannel?.id ?? "none"}-${messages.map(({ id }) => id).join(",")}`}
      channels={channelRecords}
      canSendMessages={context.membership.role !== "VIEWER"}
      contacts={contacts.map(({ user: member }) => ({
        id: member.id,
        name: member.name,
        email: member.email,
        avatarUrl: member.avatarUrl,
      }))}
      currentUser={{ id: user.id, name: user.name }}
      hasMore={hasMore}
      initialChannelId={selectedChannel?.id ?? null}
      initialMessages={messages}
      taskOptions={taskOptions}
      workspace={{ id: context.workspace.id, name: context.workspace.name }}
    />
  );
}
