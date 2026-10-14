"use client";

import { ChevronsUpDown, Layers3 } from "lucide-react";
import { setActiveWorkspaceAction } from "@/server/actions/workspace";

type WorkspaceOption = { id: string; name: string; slug: string };

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
}: {
  workspaces: WorkspaceOption[];
  activeWorkspaceId: string;
}) {
  const selected = workspaces.find((workspace) => workspace.id === activeWorkspaceId);

  return (
    <form action={setActiveWorkspaceAction}>
      <label className="sr-only" htmlFor="workspace-switcher">
        Switch workspace
      </label>
      <div className="relative">
        <Layers3
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <select
          className="h-10 w-full appearance-none rounded-lg border border-border bg-card pl-9 pr-8 text-left text-sm font-medium text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
          defaultValue={selected?.id ?? ""}
          id="workspace-switcher"
          name="workspaceId"
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          aria-label="Switch workspace"
        >
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
        <ChevronsUpDown
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
      </div>
    </form>
  );
}
