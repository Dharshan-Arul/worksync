"use client";

import { Command, FolderKanban, ListTodo, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { searchWorkspaceAction } from "@/server/actions/search";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ projects: { id: string; name: string; key: string }[]; tasks: { id: string; number: number; title: string; project: { id: string; key: string }; href: string }[] }>({ projects: [], tasks: [] });
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const value = query.trim();
    if (!open || value.length < 2) return;
    const timeout = window.setTimeout(() => {
      startTransition(async () => {
        const result = await searchWorkspaceAction({ query: value });
        if (value !== inputRef.current?.value.trim()) return;
        if ("error" in result) setError(result.error ?? "Search failed.");
        else {
          setError("");
          setResults(result);
        }
      });
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [open, query]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <Button
        aria-label="Search tasks and projects"
        title="Search tasks and projects (Ctrl/Cmd+K)"
        className="h-9 w-9 justify-center gap-2 border border-border bg-background px-0 text-muted-foreground shadow-none hover:bg-muted sm:w-[280px] sm:justify-start sm:px-3"
        onClick={() => {
          setQuery("");
          setError("");
          setOpen(true);
          window.setTimeout(() => inputRef.current?.focus(), 0);
        }}
        variant="outline"
      >
        <Search aria-hidden="true" className="size-4" />
        <span className="hidden flex-1 text-left sm:block">Search anything...</span>
        <kbd className="hidden items-center gap-0.5 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium sm:inline-flex">
          <Command aria-hidden="true" className="size-2.5" /> K
        </kbd>
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/25 px-4 pt-[15vh] backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            aria-label="Search"
            aria-modal="true"
            className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
            role="dialog"
          >
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <input
                aria-label="Search tasks and projects"
                autoComplete="off"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setResults({ projects: [], tasks: [] });
                  setError("");
                }}
                placeholder="Search tasks and projects..."
                ref={inputRef}
                value={query}
              />
              <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px]">ESC</kbd>
            </div>
            <div className="max-h-80 overflow-auto p-2">
              {error ? <p className="px-3 py-5 text-center text-sm text-destructive" role="alert">{error}</p> : null}
              {pending ? <p className="px-3 py-5 text-center text-sm text-muted-foreground">Searching…</p> : null}
              {results.projects.length > 0 && (
                <>
                  <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">PROJECTS</p>
                  {results.projects.map((project) => (
                    <Link
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                      href={`/projects/${project.id}`}
                      key={project.id}
                      onClick={() => setOpen(false)}
                    >
                      <FolderKanban aria-hidden="true" className="size-4 text-muted-foreground" />
                      <span className="font-medium">{project.key}</span>
                      <span className="truncate">{project.name}</span>
                    </Link>
                  ))}
                </>
              )}
              {results.tasks.length > 0 && (
                <>
                  <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">TASKS</p>
                  {results.tasks.map((task) => (
                    <Link
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                      href={task.href}
                      key={task.id}
                      onClick={() => setOpen(false)}
                    >
                      <ListTodo aria-hidden="true" className="size-4 text-muted-foreground" />
                      <span className="shrink-0 text-xs font-medium text-muted-foreground">{task.project.key}-{task.number}</span>
                      <span className="truncate">{task.title}</span>
                    </Link>
                  ))}
                </>
              )}
              {query.trim().length >= 2 && !pending && !error && !results.projects.length && !results.tasks.length ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No tasks or projects found.
                </p>
              ) : null}
              {query.trim().length < 2 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Type at least 2 characters to search.</p>}
            </div>
            <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
              Search workspace tasks and projects · ESC to close
            </div>
          </section>
        </div>
      )}
    </>
  );
}
