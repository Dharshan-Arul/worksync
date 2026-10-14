import { ArrowLeft, CalendarDays, CircleDot, List, LayoutGrid, Users, Rows3, Paperclip } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ProjectActions } from "@/components/projects/project-actions";

type ProjectSummary = {
  id: string;
  name: string;
  key: string;
  description: string;
  status: "ON_TRACK" | "AT_RISK" | "OFF_TRACK" | "COMPLETED";
  dueDate: Date | null;
  archived: boolean;
  workspaceId: string;
  lead: { name: string };
  _count: { tasks: number; members: number };
};

export function ProjectWorkLayout({
  project,
  canManage,
  canDelete,
  view,
  children,
}: {
  project: ProjectSummary;
  canManage: boolean;
  canDelete: boolean;
  view: "board" | "list" | "backlog" | "files";
  children: ReactNode;
}) {
  const tabs = [
    { label: "Overview", href: `/projects/${project.id}`, icon: CircleDot, selected: false },
    { label: "Board", href: `/projects/${project.id}/board`, icon: LayoutGrid, selected: view === "board" },
    { label: "List", href: `/projects/${project.id}/list`, icon: List, selected: view === "list" },
    { label: "Backlog", href: `/projects/${project.id}/backlog`, icon: Rows3, selected: view === "backlog" },
    { label: "Files", href: `/projects/${project.id}/files`, icon: Paperclip, selected: view === "files" },
  ];
  const editable = {
    id: project.id,
    name: project.name,
    key: project.key,
    description: project.description,
    status: project.status,
    dueDate: project.dueDate?.toISOString() ?? null,
  };

  return (
    <div className="mx-auto max-w-[1480px] space-y-6">
      <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" href="/projects">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Projects
      </Link>
      <section className="rounded-xl border border-border bg-card">
        <div className="flex flex-col justify-between gap-4 px-5 pt-5 sm:flex-row sm:items-start sm:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold tracking-[0.12em] text-muted-foreground">{project.key}</span>
              {project.archived && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Archived</span>}
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">{project.status.replaceAll("_", " ").toLowerCase()}</span>
            </div>
            <h1 className="mt-2 truncate text-xl font-semibold tracking-tight sm:text-2xl">{project.name}</h1>
            {project.description && <p className="mt-1 line-clamp-2 max-w-3xl text-sm text-muted-foreground">{project.description}</p>}
          </div>
          <div className="flex items-center gap-2">
            {project.dueDate && (
              <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
                <CalendarDays aria-hidden="true" className="size-3.5" />
                {new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(project.dueDate)}
              </span>
            )}
            {canManage && !project.archived && (
              <ProjectActions canDelete={canDelete} project={editable} workspaceId={project.workspaceId} />
            )}
          </div>
        </div>
        <nav aria-label="Project navigation" className="mt-5 flex gap-1 overflow-x-auto border-t border-border px-4 pt-2 sm:px-5">
          {tabs.map(({ label, href, icon: Icon, selected }) => (
            <Link
              aria-current={selected ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                selected
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              href={href}
              key={href}
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </Link>
          ))}
          <span className="ml-auto hidden items-center gap-1.5 self-center pb-2 text-xs text-muted-foreground md:flex">
            <Users aria-hidden="true" className="size-3.5" />
            {project._count.members} members
          </span>
        </nav>
      </section>
      {children}
    </div>
  );
}
