import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";
import { MobileNavigation } from "@/components/mobile-navigation";
import { getAuthenticatedUser } from "@/server/auth/user";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const context = await getWorkspaceContext(user.id);
  if (!context) redirect("/onboarding/workspace");
  const [notificationUnreadCount, chatUnreadCount] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    prisma.notification.count({
      where: {
        userId: user.id,
        readAt: null,
        type: { in: ["CHAT_MESSAGE", "MENTION"] },
      },
    }),
  ]);

  return (
    <div className="min-h-screen bg-background lg:flex">
      <AppSidebar
        activeWorkspaceId={context.workspace.id}
        email={user.email}
        userName={user.name}
        workspaces={context.workspaces}
      />
      <div className="min-w-0 flex-1">
        <AppTopbar
          activeWorkspaceId={context.workspace.id}
          chatUnreadCount={chatUnreadCount}
          notificationUnreadCount={notificationUnreadCount}
          userId={user.id}
          workspaces={context.workspaces}
        />
        <div className="mx-auto w-full max-w-[1480px] px-4 py-7 pb-24 sm:px-7 lg:px-10 lg:pb-10">
          {children}
        </div>
      </div>
      <MobileNavigation />
    </div>
  );
}
