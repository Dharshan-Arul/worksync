"use client";

import { Archive, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ProjectDialog } from "@/components/projects/project-dialog";
import { Button } from "@/components/ui/button";
import {
  archiveProjectAction,
  deleteProjectAction,
} from "@/server/actions/projects";

type EditableProject = {
  id: string;
  name: string;
  key: string;
  description: string;
  status: "ON_TRACK" | "AT_RISK" | "OFF_TRACK" | "COMPLETED";
  dueDate: string | null;
};

export function ProjectActions({
  project,
  workspaceId,
  canDelete,
}: {
  project: EditableProject;
  workspaceId: string;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function archive() {
    if (!window.confirm(`Archive "${project.name}"? It will no longer appear in active projects.`)) {
      return;
    }
    startTransition(async () => {
      const result = await archiveProjectAction({ projectId: project.id });
      if (result.error) window.alert(result.error);
      else router.refresh();
    });
  }

  function remove() {
    if (
      !window.confirm(
        `Permanently delete "${project.name}" and all its tasks, comments, and activity? This cannot be undone.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await deleteProjectAction({ projectId: project.id });
      if (result.error) {
        window.alert(result.error);
      } else {
        router.push("/projects");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ProjectDialog project={project} workspaceId={workspaceId} />
      <Button disabled={pending} onClick={archive} type="button" variant="outline">
        <Archive aria-hidden="true" />
        <span className="hidden sm:inline">{pending ? "Working..." : "Archive"}</span>
      </Button>
      {canDelete && (
        <Button
          aria-label="Permanently delete project"
          disabled={pending}
          onClick={remove}
          title="Permanently delete project"
          type="button"
          variant="destructive"
          size="icon"
        >
          <Trash2 aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
