import {
  CircleHelp,
  LogOut,
  Settings2,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { signOutAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { SidebarNavigation } from "@/components/sidebar-navigation";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";

export function AppSidebar({
  userName,
  email,
  workspaces,
  activeWorkspaceId,
}: {
  userName: string;
  email: string;
  workspaces: { id: string; name: string; slug: string }[];
  activeWorkspaceId: string;
}) {
  const initials =
    userName
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "W";

  return (
    <aside className="hidden h-screen w-[248px] shrink-0 flex-col border-r border-border bg-card px-3 py-5 lg:flex">
      <Link
        aria-label="Workflow dashboard"
        className="mb-7 flex items-center gap-2.5 px-2 text-lg font-semibold tracking-tight"
        href="/dashboard"
      >
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Workflow aria-hidden="true" className="size-4" />
        </span>
        Workflow
      </Link>
      <WorkspaceSwitcher
        activeWorkspaceId={activeWorkspaceId}
        workspaces={workspaces}
      />
      <SidebarNavigation />
      <div className="space-y-1 border-t border-border pt-3">
        <Link className="nav-link" href="/settings">
          <Settings2 aria-hidden="true" className="size-4" />
          Settings
        </Link>
        <a className="nav-link" href="mailto:support@workflow.app">
          <CircleHelp aria-hidden="true" className="size-4" />
          Help & support
        </a>
        <div className="mt-3 flex items-center gap-2.5 border-t border-border px-2 pt-4">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{userName}</span>
            <span className="block truncate text-xs text-muted-foreground">{email}</span>
          </span>
          <form action={signOutAction}>
            <Button aria-label="Sign out" title="Sign out" type="submit" variant="ghost" size="icon">
              <LogOut aria-hidden="true" />
            </Button>
          </form>
        </div>
      </div>
    </aside>
  );
}
