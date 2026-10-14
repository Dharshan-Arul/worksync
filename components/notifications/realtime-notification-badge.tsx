"use client";

import { Bell, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function RealtimeNotificationBadge({
  userId,
  unreadCount,
}: {
  userId: string;
  unreadCount: number;
}) {
  const router = useRouter();
  const count = unreadCount;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notification-badge:${userId}`)
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

  return (
    <Link
      aria-label={`Inbox${count ? `, ${count} unread` : ""}`}
      className="relative inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href="/inbox"
      title="Inbox"
    >
      <Bell aria-hidden="true" className="size-4" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-destructive px-1 text-center text-[9px] font-semibold leading-4 text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

export function RealtimeChatBadge({
  userId,
  unreadCount,
}: {
  userId: string;
  unreadCount: number;
}) {
  const router = useRouter();
  const count = unreadCount;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat-badge:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "Message" },
        (payload) => {
          const senderId = payload.new.senderId;
          if (senderId !== userId) router.refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router, userId]);

  return (
    <Link
      aria-label={`Chat${count ? `, ${count} unread` : ""}`}
      className="relative inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href="/chat"
      title="Chat"
    >
      <MessageCircle aria-hidden="true" className="size-4" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[9px] font-semibold leading-4 text-primary-foreground">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
