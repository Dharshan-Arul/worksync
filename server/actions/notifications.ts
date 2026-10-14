"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  markNotificationReadSchema,
  notificationFilterSchema,
} from "@/lib/validation";
import { getAuthenticatedUser } from "@/server/auth/user";

export async function markNotificationReadAction(input: unknown) {
  const parsed = markNotificationReadSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose a valid notification." };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };
  const updated = await prisma.notification.updateMany({
    where: { id: parsed.data.notificationId, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  if (!updated.count) return { error: "Notification not found or already read." };
  revalidatePath("/inbox");
  return {};
}

export async function markAllNotificationsReadAction() {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/inbox");
  return {};
}

export async function getNotificationsAction(input: unknown) {
  const parsed = notificationFilterSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose a valid inbox filter." };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };
  const where = {
    userId: user.id,
    ...(parsed.data === "UNREAD" ? { readAt: null } : {}),
    ...(parsed.data === "MENTIONS" ? { type: "MENTION" as const } : {}),
    ...(parsed.data === "ASSIGNED" ? { type: "TASK_ASSIGNED" as const } : {}),
  };
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return {
    notifications: notifications.map((notification) => ({
      id: notification.id,
      type: notification.type,
      payload: notification.payload,
      createdAt: notification.createdAt.toISOString(),
      readAt: notification.readAt?.toISOString() ?? null,
    })),
    unreadCount,
  };
}
