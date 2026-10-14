"use client";

import { Bell, ChartNoAxesCombined, FolderKanban, LayoutDashboard, ListTodo, MessageCircle, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const mobileItems = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "My tasks", href: "/my-tasks", icon: ListTodo },
  { label: "Chat", href: "/chat", icon: MessageCircle },
  { label: "Inbox", href: "/inbox", icon: Bell },
  { label: "Reports", href: "/reports", icon: ChartNoAxesCombined },
  { label: "Team", href: "/team", icon: Users },
];

export function MobileNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-7 border-t border-border bg-card/95 px-1 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur lg:hidden"
    >
      {mobileItems.map(({ label, href, icon: Icon }) => (
        <Link
          aria-current={pathname === href || (href === "/projects" && pathname.startsWith("/projects/")) ? "page" : undefined}
          className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-md text-[10px] font-medium transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            pathname === href || (href === "/projects" && pathname.startsWith("/projects/"))
              ? "text-primary"
              : "text-muted-foreground"
          }`}
          href={href}
          key={href}
        >
          <Icon aria-hidden="true" className="size-[18px]" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
