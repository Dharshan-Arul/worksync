"use client";

import { Bell, CheckCheck, Inbox, MessageCircle, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  getNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/server/actions/notifications";

type Filter = "ALL" | "UNREAD" | "MENTIONS" | "ASSIGNED";
type Notification = {
  id: string;
  type: string;
  payload: unknown;
  createdAt: string;
  readAt: string | null;
};

export function NotificationsInbox({
  userId,
  notifications: initialNotifications,
  initialUnreadCount,
}: {
  userId: string;
  notifications: Notification[];
  initialUnreadCount: number;
}) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const filterRequest = useRef(0);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`inbox:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "Notification", filter: `userId=eq.${userId}` },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router, userId]);

  function changeFilter(nextFilter: Filter) {
    const requestId = ++filterRequest.current;
    setFilter(nextFilter);
    setError("");
    startTransition(async () => {
      const result = await getNotificationsAction(nextFilter);
      if (requestId !== filterRequest.current) return;
      if (result.error) setError(result.error);
      else if (result.notifications) {
        setNotifications(result.notifications);
        setUnreadCount(result.unreadCount ?? 0);
      }
    });
  }

  function markRead(notificationId: string) {
    startTransition(async () => {
      const result = await markNotificationReadAction({ notificationId });
      if (result.error) setError(result.error);
      else {
        setNotifications((current) => current.map((notification) =>
          notification.id === notificationId
            ? { ...notification, readAt: new Date().toISOString() }
            : notification,
        ));
        setUnreadCount((count) => Math.max(0, count - 1));
        router.refresh();
      }
    });
  }

  function markAllRead() {
    startTransition(async () => {
      const result = await markAllNotificationsReadAction();
      if (result.error) setError(result.error);
      else {
        setNotifications((current) => current.map((notification) => ({
          ...notification,
          readAt: notification.readAt ?? new Date().toISOString(),
        })));
        setUnreadCount(0);
        router.refresh();
      }
    });
  }

  const filters: { value: Filter; label: string }[] = [
    { value: "ALL", label: "All" },
    { value: "UNREAD", label: `Unread${unreadCount ? ` (${unreadCount})` : ""}` },
    { value: "MENTIONS", label: "Mentions" },
    { value: "ASSIGNED", label: "Assigned" },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Inbox</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {unreadCount ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}` : "You’re all caught up."}
          </p>
        </div>
        <Button disabled={pending || unreadCount === 0} onClick={markAllRead} type="button" variant="outline">
          <CheckCheck aria-hidden="true" /> Mark all read
        </Button>
      </header>
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <nav aria-label="Notification filters" className="flex gap-1 overflow-x-auto border-b border-border px-4 pt-2">
          {filters.map((item) => (
            <button
              aria-pressed={filter === item.value}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium ${filter === item.value ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              key={item.value}
              onClick={() => changeFilter(item.value)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
        {error && <p className="border-b border-border px-5 py-3 text-sm text-destructive" role="alert">{error}</p>}
        {notifications.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center">
            <Inbox aria-hidden="true" className="size-8 text-muted-foreground" />
            <h2 className="mt-3 font-medium">{filter === "ALL" ? "No notifications yet" : `No ${filter.toLowerCase()} notifications`}</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Assignments, mentions, and team chat updates will appear here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {notifications.map((notification) => {
              const payload = isRecord(notification.payload) ? notification.payload : {};
              const channelId = typeof payload.channelId === "string" ? payload.channelId : null;
              const href = channelId
                ? `/chat?channel=${encodeURIComponent(channelId)}`
                : taskHref(payload);
              const title = notificationTitle(notification.type, payload);
              return (
                <li className={`flex items-start gap-3 px-5 py-4 ${notification.readAt ? "" : "bg-primary/[0.035]"}`} key={notification.id}>
                  <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${notification.readAt ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
                    {notification.type === "CHAT_MESSAGE" || notification.type === "MENTION"
                      ? <MessageCircle aria-hidden="true" className="size-4" />
                      : notification.type === "TASK_ASSIGNED"
                        ? <UserRound aria-hidden="true" className="size-4" />
                        : <Bell aria-hidden="true" className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link className="text-sm font-medium hover:text-primary" href={href ?? "/inbox"} onClick={() => !notification.readAt && markRead(notification.id)}>
                      {title}
                    </Link>
                    {typeof payload.body === "string" && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{payload.body}</p>}
                    <time className="mt-1.5 block text-xs text-muted-foreground" dateTime={notification.createdAt}>
                      {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(notification.createdAt))}
                    </time>
                  </div>
                  {!notification.readAt && (
                    <Button aria-label="Mark notification as read" disabled={pending} onClick={() => markRead(notification.id)} type="button" variant="ghost" size="icon-sm">
                      <CheckCheck aria-hidden="true" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function taskHref(payload: Record<string, unknown>) {
  if (typeof payload.projectId === "string" && typeof payload.taskId === "string") {
    return `/projects/${payload.projectId}/board?taskId=${encodeURIComponent(payload.taskId)}`;
  }
  if (typeof payload.projectId === "string") return `/projects/${payload.projectId}/board`;
  return null;
}

function notificationTitle(type: string, payload: Record<string, unknown>) {
  const sender = typeof payload.senderName === "string" ? payload.senderName : "A teammate";
  switch (type) {
    case "TASK_ASSIGNED": return "A task was assigned to you";
    case "MENTION": return `${sender} mentioned you in chat`;
    case "CHAT_MESSAGE": return `${sender} sent a message`;
    case "WATCHED_TASK_COMMENT": return "New comment on a task you watch";
    case "WATCHED_TASK_UPDATED": return "A task you watch was updated";
    case "TASK_COMMENT": return "New comment on a task assigned to you";
    case "DUE_SOON": return "A task is due soon";
    case "PROJECT_ADDED": return "You were added to a project";
    default: return "Workspace update";
  }
}
