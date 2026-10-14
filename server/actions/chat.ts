"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  channelIdSchema,
  createDirectChannelSchema,
  createTaskChannelSchema,
  messagePageSchema,
  sendMessageSchema,
} from "@/lib/validation";
import { getAuthenticatedUser } from "@/server/auth/user";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { requireProjectPermission, requireTaskPermission } from "@/server/permissions";

const MESSAGE_PAGE_SIZE = 50;
const MENTION_PATTERN = /@([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
const TASK_LINK_PATTERN = /\b([A-Z][A-Z0-9]{1,9})-(\d+)\b/g;

type MessageRecord = {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  sender: { id: string; name: string; avatarUrl: string | null };
  taskLinks: { token: string; taskId: string; projectId: string }[];
};

function validationError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Please check the message and try again.";
}

function cleanMessage(value: string) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

async function authorizedChannel(userId: string, channelId: string) {
  const context = await getWorkspaceContext(userId);
  if (!context) return { error: "Join or create a workspace to use chat." } as const;
  const channel = await prisma.channel.findFirst({
    where: {
      id: channelId,
      workspaceId: context.workspace.id,
      members: { some: { userId } },
    },
    include: {
      project: { select: { id: true, workspaceId: true, key: true } },
      task: { select: { id: true, number: true, projectId: true } },
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
  if (!channel) return { error: "Conversation not found or you do not have access." } as const;
  if (channel.projectId) {
    try {
      await requireProjectPermission(userId, channel.projectId, "project:view");
    } catch (error) {
      if (error instanceof Error && error.message.includes("not a member")) {
        return { error: "You are not a member of this project." } as const;
      }
      if (error instanceof Error && error.message.includes("permission")) {
        return { error: "You do not have access to this project conversation." } as const;
      }
      throw error;
    }
    if (context.membership.role === "MEMBER" || context.membership.role === "VIEWER") {
      const projectMember = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: channel.projectId, userId } },
        select: { userId: true },
      });
      if (!projectMember) return { error: "You are not a member of this project." } as const;
    }
  }
  return { channel, context } as const;
}

async function serializeMessages(
  messages: {
    id: string;
    body: string;
    createdAt: Date;
    editedAt: Date | null;
    sender: { id: string; name: string; avatarUrl: string | null };
  }[],
  workspaceId: string,
  userId: string,
): Promise<MessageRecord[]> {
  const references = messages.flatMap((message) =>
    Array.from(message.body.matchAll(TASK_LINK_PATTERN), (match) => ({
      token: match[0],
      key: match[1],
      number: Number(match[2]),
    })),
  );
  const keys = [...new Set(references.map((reference) => reference.key))];
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  const projects = keys.length && membership
    ? await prisma.project.findMany({
        where: {
          workspaceId,
          key: { in: keys },
          ...(membership.role === "MEMBER" || membership.role === "VIEWER"
            ? { members: { some: { userId } } }
            : {}),
        },
        select: { id: true, key: true },
      })
    : [];
  const projectByKey = new Map(projects.map((project) => [project.key, project.id]));
  const tasks = references.length
    ? await prisma.task.findMany({
        where: {
          OR: references.flatMap(({ key, number }) => {
            const projectId = projectByKey.get(key);
            return projectId ? [{ projectId, number }] : [];
          }),
        },
        select: { id: true, projectId: true, number: true },
      })
    : [];
  const taskByReference = new Map(
    tasks.map((task) => [`${task.projectId}:${task.number}`, task]),
  );
  return messages.map((message) => ({
    id: message.id,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
    sender: message.sender,
    taskLinks: references.flatMap(({ token, key, number }) => {
      const projectId = projectByKey.get(key);
      const task = projectId ? taskByReference.get(`${projectId}:${number}`) : undefined;
      return task && message.body.includes(token)
        ? [{ token, taskId: task.id, projectId: task.projectId }]
        : [];
    }),
  }));
}

export async function createDirectChannelAction(input: unknown) {
  const parsed = createDirectChannelSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };
  const context = await getWorkspaceContext(user.id);
  if (!context || context.workspace.id !== parsed.data.workspaceId) {
    return { error: "Choose a member from your active workspace." };
  }
  if (context.membership.role === "VIEWER") {
    return { error: "Viewers cannot create conversations." };
  }
  if (parsed.data.userId === user.id) return { error: "You cannot start a direct message with yourself." };
  const target = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: context.workspace.id, userId: parsed.data.userId } },
    select: { userId: true },
  });
  if (!target) return { error: "That person is not a member of this workspace." };

  const directKey = [user.id, target.userId].sort().join(":");
  const channel = await prisma.channel.upsert({
    where: { directKey },
    create: {
      workspaceId: context.workspace.id,
      type: "DIRECT",
      name: "Direct message",
      directKey,
      members: { create: [{ userId: user.id }, { userId: target.userId }] },
    },
    update: {},
    select: { id: true },
  });
  revalidatePath("/chat");
  return { channelId: channel.id };
}

export async function createTaskChannelAction(input: unknown) {
  const parsed = createTaskChannelSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };
  const context = await getWorkspaceContext(user.id);
  if (context?.membership.role === "VIEWER") {
    return { error: "Viewers cannot start task discussions." };
  }
  let authorized;
  try {
    authorized = await requireTaskPermission(user.id, parsed.data.taskId, "project:view");
  } catch (error) {
    if (error instanceof Error && (error.message.includes("permission") || error.message.includes("member"))) {
      return { error: "You do not have access to this task discussion." };
    }
    throw error;
  }
  const task = await prisma.task.findUnique({
    where: { id: parsed.data.taskId },
    select: { id: true, number: true, projectId: true, project: { select: { workspaceId: true, key: true } } },
  });
  if (!task) return { error: "Task not found." };
  const projectMembers = await prisma.projectMember.findMany({
    where: { projectId: task.projectId },
    select: { userId: true },
  });
  const memberIds = new Set([...projectMembers.map(({ userId }) => userId), user.id]);
  const channel = await prisma.channel.upsert({
    where: { taskId: task.id },
    create: {
      workspaceId: task.project.workspaceId,
      projectId: task.projectId,
      taskId: task.id,
      type: "TASK",
      name: `${task.project.key}-${task.number} discussion`,
      members: { create: [...memberIds].map((userId) => ({ userId })) },
    },
    update: {},
    select: { id: true },
  });
  await prisma.channelMember.upsert({
    where: { channelId_userId: { channelId: channel.id, userId: user.id } },
    create: { channelId: channel.id, userId: user.id },
    update: {},
  });
  revalidatePath("/chat");
  revalidatePath(`/projects/${authorized.project.id}/board`);
  return { channelId: channel.id };
}

export async function getOlderMessagesAction(input: unknown): Promise<{ error?: string; messages?: MessageRecord[]; hasMore?: boolean }> {
  const parsed = messagePageSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };
  const access = await authorizedChannel(user.id, parsed.data.channelId);
  if ("error" in access) return { error: access.error };

  const messages = await prisma.message.findMany({
    where: {
      channelId: access.channel.id,
      ...(parsed.data.before ? { createdAt: { lt: new Date(parsed.data.before) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: MESSAGE_PAGE_SIZE + 1,
    include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
  });
  const hasMore = messages.length > MESSAGE_PAGE_SIZE;
  const page = messages.slice(0, MESSAGE_PAGE_SIZE).reverse();
  return {
    messages: await serializeMessages(page, access.channel.workspaceId, user.id),
    hasMore,
  };
}

export async function sendMessageAction(input: unknown) {
  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };
  const access = await authorizedChannel(user.id, parsed.data.channelId);
  if ("error" in access) return { error: access.error };
  if (access.context.membership.role === "VIEWER") {
    return { error: "Viewers cannot send messages." };
  }
  const body = cleanMessage(parsed.data.body);
  if (!body) return { error: "Message can't be empty." };
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: { channelId: access.channel.id, senderId: user.id, body },
      include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
    });
    const recipients = access.channel.members.filter((member) => member.userId !== user.id);
    const mentionedEmails = new Set(
      Array.from(body.matchAll(MENTION_PATTERN), (match) => match[1].toLowerCase()),
    );
    const mentionIds = new Set(
      recipients
        .filter((member) => mentionedEmails.has(member.user.email.toLowerCase()))
        .map((member) => member.userId),
    );
    await tx.notification.createMany({
      data: recipients.map((member) => ({
        userId: member.userId,
        type: mentionIds.has(member.userId) ? "MENTION" : "CHAT_MESSAGE",
        payload: {
          channelId: access.channel.id,
          messageId: created.id,
          senderName: user.name,
          body: body.slice(0, 240),
          ...(mentionIds.has(member.userId) ? { mention: true } : {}),
        } as Prisma.InputJsonValue,
      })),
    });
    return created;
  });
  revalidatePath("/chat");
  revalidatePath("/inbox");
  return {
    message: (await serializeMessages([message], access.channel.workspaceId, user.id))[0],
  };
}

export async function markChannelReadAction(input: unknown) {
  const parsed = channelIdSchema.safeParse(
    typeof input === "object" && input !== null && "channelId" in input
      ? input.channelId
      : input,
  );
  if (!parsed.success) return { error: "Choose a valid conversation." };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };
  const access = await authorizedChannel(user.id, parsed.data);
  if ("error" in access) return { error: access.error };
  const readAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.channelMember.upsert({
      where: { channelId_userId: { channelId: access.channel.id, userId: user.id } },
      create: { channelId: access.channel.id, userId: user.id, lastReadAt: readAt },
      update: { lastReadAt: readAt },
    });
    await tx.notification.updateMany({
      where: {
        userId: user.id,
        readAt: null,
        type: { in: ["CHAT_MESSAGE", "MENTION"] },
        payload: { path: ["channelId"], equals: access.channel.id },
      },
      data: { readAt },
    });
  });
  revalidatePath("/chat");
  revalidatePath("/inbox");
  return {};
}
