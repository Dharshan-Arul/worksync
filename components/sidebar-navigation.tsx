"use client";

import {
  Bell,
  ChartNoAxesCombined,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  MessageCircle,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "My tasks", href: "/my-tasks", icon: ListTodo },
  { label: "Chat", href: "/chat", icon: MessageCircle },
  { label: "Inbox", href: "/inbox", icon: Bell },
];

const teamNavigation = [
  { label: "Reports & insights", href: "/reports", icon: ChartNoAxesCombined },
  { label: "Team", href: "/team", icon: Users },
];

export function SidebarNavigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main navigation" className="mt-7 flex-1 space-y-1">
      <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
        Workspace
      </p>
      {navigation.map(({ label, href, icon: Icon }) => (
        <NavigationLink
          active={pathname === href || (href === "/projects" && pathname.startsWith("/projects/"))}
          href={href}
          icon={<Icon aria-hidden="true" className="size-4" />}
          key={href}
          label={label}
        />
      ))}
      <p className="px-2 pb-2 pt-7 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
        Manage
      </p>
      {teamNavigation.map(({ label, href, icon: Icon }) => (
        <NavigationLink
          active={pathname === href}
          href={href}
          icon={<Icon aria-hidden="true" className="size-4" />}
          key={href}
          label={label}
        />
      ))}
    </nav>
  );
}

function NavigationLink({
  active,
  href,
  icon,
  label,
}: {
  active: boolean;
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`nav-link ${active ? "bg-accent text-accent-foreground" : ""}`}
      href={href}
    >
      {icon}
      {label}
    </Link>
  );
}
