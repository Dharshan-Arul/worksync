"use client";

import { ChevronRight, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GlobalSearch } from "@/components/global-search";
import { ThemeToggle } from "@/components/theme-toggle";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/server/actions/auth";
import { RealtimeChatBadge, RealtimeNotificationBadge } from "@/components/notifications/realtime-notification-badge";

const titles: Record<string, string> = {
  dashboard: "Dashboard",
  projects: "Projects",
  "my-tasks": "My tasks",
  chat: "Chat",
  inbox: "Inbox",
  reports: "Reports & insights",
  team: "Team",
  settings: "Settings",
};

export function AppTopbar({
  workspaces,
  activeWorkspaceId,
  userId,
  notificationUnreadCount,
  chatUnreadCount,
}: {
  workspaces: { id: string; name: string; slug: string }[];
  activeWorkspaceId: string;
  userId: string;
  notificationUnreadCount: number;
  chatUnreadCount: number;
}) {
  const pathname = usePathname();
  const segment = pathname.split("/")[1] ?? "dashboard";
  const section = titles[segment] ?? "Project";

  return (
    <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between gap-3 border-b border-border bg-background/90 px-4 backdrop-blur sm:px-7">
      <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        <div className="w-[min(48vw,220px)] lg:hidden">
          <WorkspaceSwitcher
            activeWorkspaceId={activeWorkspaceId}
            workspaces={workspaces}
          />
        </div>
        <div className="hidden items-center gap-2 lg:flex">
          <Link className="hover:text-foreground" href="/dashboard">
            Workspace
          </Link>
          <ChevronRight aria-hidden="true" className="size-3.5" />
          <span className="truncate font-medium text-foreground">{section}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <GlobalSearch />
        <RealtimeChatBadge unreadCount={chatUnreadCount} userId={userId} />
        <RealtimeNotificationBadge unreadCount={notificationUnreadCount} userId={userId} />
        <ThemeToggle />
        <form action={signOutAction}>
          <Button aria-label="Sign out" className="lg:hidden" title="Sign out" type="submit" variant="ghost" size="icon">
            <LogOut aria-hidden="true" />
          </Button>
        </form>
      </div>
    </header>
  );
}
