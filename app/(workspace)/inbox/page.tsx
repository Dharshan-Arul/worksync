import type { Metadata } from "next";
import { NotificationsInbox } from "@/components/notifications/notifications-inbox";
import { getAuthenticatedUser } from "@/server/auth/user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage() {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  return (
    <NotificationsInbox
      key={`${user.id}-${unreadCount}-${notifications.map((notification) => `${notification.id}:${notification.readAt?.toISOString() ?? ""}`).join(",")}`}
      initialUnreadCount={unreadCount}
      notifications={notifications.map((notification) => ({
        id: notification.id,
        type: notification.type,
        payload: notification.payload,
        createdAt: notification.createdAt.toISOString(),
        readAt: notification.readAt?.toISOString() ?? null,
      }))}
      userId={user.id}
    />
  );
}
