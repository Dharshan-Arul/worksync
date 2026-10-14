"use client";

import { ArrowUpRight, FolderKanban, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ProjectActions } from "@/components/projects/project-actions";
import { ProjectDialog } from "@/components/projects/project-dialog";

type DirectoryProject = {
  id: string;
  name: string;
  key: string;
  description: string;
  status: "ON_TRACK" | "AT_RISK" | "OFF_TRACK" | "COMPLETED";
  dueDate: string | null;
  lead: { name: string };
  totalTasks: number;
  completedTasks: number;
  members: number;
};

const statusStyles: Record<DirectoryProject["status"], string> = {
  ON_TRACK: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  AT_RISK: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  OFF_TRACK: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  COMPLETED: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
};

export function ProjectDirectory({
  projects,
  workspaceId,
  canManage,
  canDelete,
}: {
  projects: DirectoryProject[];
  workspaceId: string;
  canManage: boolean;
  canDelete: boolean;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const filteredProjects = useMemo(
    () =>
      projects.filter((project) => {
        const matchesQuery = `${project.name} ${project.key} ${project.description}`
          .toLowerCase()
          .includes(query.trim().toLowerCase());
        return matchesQuery && (status === "ALL" || project.status === status);
      }),
    [projects, query, status],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative block flex-1">
          <span className="sr-only">Search projects</span>
          <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="form-control pl-9"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects..."
            type="search"
            value={query}
          />
        </label>
        <label className="sm:w-48">
          <span className="sr-only">Filter by project status</span>
          <select className="form-control" onChange={(event) => setStatus(event.target.value)} value={status}>
            <option value="ALL">All statuses</option>
            <option value="ON_TRACK">On track</option>
            <option value="AT_RISK">At risk</option>
            <option value="OFF_TRACK">Off track</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </label>
      </div>
      {filteredProjects.length ? (
        <section aria-label="Projects" className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {filteredProjects.map((project) => {
            const progress = project.totalTasks
              ? Math.round((project.completedTasks / project.totalTasks) * 100)
              : 0;
            return (
              <article
                className="group rounded-xl border border-border bg-card p-5 transition hover:border-primary/30 hover:shadow-md"
                key={project.id}
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <FolderKanban aria-hidden="true" className="size-5" />
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${statusStyles[project.status]}`}>
                    {project.status.replaceAll("_", " ").toLowerCase()}
                  </span>
                </div>
                <Link
                  className="mt-5 block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  href={`/projects/${project.id}/board`}
                >
                  <span className="flex items-center gap-1 truncate text-base font-semibold group-hover:text-primary">
                    {project.name}
                    <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0 opacity-0 transition group-hover:opacity-100" />
                  </span>
                  <span className="mt-1 block text-xs font-medium tracking-wide text-muted-foreground">{project.key}</span>
                </Link>
                <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">
                  {project.description || "No description yet."}
                </p>
                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">{progress}%</span>
                  </div>
                  <div aria-label={`${progress}% complete`} className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
                  <span>Lead · {project.lead.name}</span>
                  <span>{project.totalTasks} {project.totalTasks === 1 ? "task" : "tasks"}</span>
                </div>
                {canManage && (
                  <div className="mt-4 flex justify-end border-t border-border pt-3">
                    <ProjectActions
                      canDelete={canDelete}
                      project={project}
                      workspaceId={workspaceId}
                    />
                  </div>
                )}
              </article>
            );
          })}
        </section>
      ) : (
        <section className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-5 text-center">
          <FolderKanban aria-hidden="true" className="size-8 text-muted-foreground" />
          <h2 className="mt-4 font-semibold">{projects.length ? "No matching projects" : "No projects yet"}</h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            {projects.length
              ? "Try a different search or status filter."
              : "Projects keep your goals, plans, and team tasks together. Create one to get started."}
          </p>
          {!projects.length && canManage && (
            <div className="mt-5">
              <ProjectDialog workspaceId={workspaceId} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
