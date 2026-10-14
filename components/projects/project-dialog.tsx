"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import {
  createProjectSchema,
  updateProjectSchema,
} from "@/lib/validation";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  createProjectAction,
  updateProjectAction,
} from "@/server/actions/projects";

type ExistingProject = {
  id: string;
  name: string;
  key: string;
  description: string;
  status: "ON_TRACK" | "AT_RISK" | "OFF_TRACK" | "COMPLETED";
  dueDate: string | null;
};

export function ProjectDialog({
  workspaceId,
  project,
}: {
  workspaceId: string;
  project?: ExistingProject;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  type ProjectInput = z.input<typeof createProjectSchema>;
  type ProjectOutput = z.output<typeof createProjectSchema>;
  const createForm = useForm<ProjectInput, undefined, ProjectOutput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { workspaceId, name: "", key: "", description: "" },
  });
  type UpdateInput = z.input<typeof updateProjectSchema>;
  type UpdateOutput = z.output<typeof updateProjectSchema>;
  const updateForm = useForm<UpdateInput, undefined, UpdateOutput>({
    resolver: zodResolver(updateProjectSchema),
    defaultValues: {
      projectId: project?.id ?? "",
      name: project?.name ?? "",
      key: project?.key ?? "",
      description: project?.description ?? "",
      status: project?.status ?? "ON_TRACK",
      dueDate: project?.dueDate?.slice(0, 10) ?? "",
    },
  });

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement;
    dialogRef.current?.querySelector<HTMLElement>("input:not([type=hidden])")?.focus();

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [open]);

  function submitCreate(values: ProjectOutput) {
    setServerError("");
    startTransition(async () => {
      const result = await createProjectAction(values);
      if (result.error) {
        setServerError(result.error);
        return;
      }
      setOpen(false);
      createForm.reset({ workspaceId, name: "", key: "", description: "" });
      if (result.projectId) router.push(`/projects/${result.projectId}/board`);
      router.refresh();
    });
  }

  function submitUpdate(values: UpdateOutput) {
    setServerError("");
    startTransition(async () => {
      const result = await updateProjectAction(values);
      if (result.error) {
        setServerError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        {project ? null : <Plus aria-hidden="true" />}
        {project ? "Edit project" : "New project"}
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 p-4 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) setOpen(false);
          }}
        >
          <section
            aria-labelledby="project-dialog-title"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl sm:p-7"
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold" id="project-dialog-title">
                  {project ? "Edit project" : "Create a project"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {project ? "Update the project details and status." : "Give your team a place to organize their work."}
                </p>
              </div>
              <Button aria-label="Close dialog" disabled={pending} onClick={() => setOpen(false)} size="icon" variant="ghost">
                <X aria-hidden="true" />
              </Button>
            </div>
            {project ? (
              <form className="mt-6 space-y-4" onSubmit={updateForm.handleSubmit(submitUpdate)} noValidate>
                <input type="hidden" {...updateForm.register("projectId")} />
                <EditProjectFields form={updateForm} />
                {serverError && <FormError>{serverError}</FormError>}
                <div className="flex justify-end gap-2 pt-2">
                  <Button disabled={pending} onClick={() => setOpen(false)} type="button" variant="outline">Cancel</Button>
                  <Button disabled={pending} type="submit">{pending ? "Saving..." : "Save changes"}</Button>
                </div>
              </form>
            ) : (
              <form className="mt-6 space-y-4" onSubmit={createForm.handleSubmit(submitCreate)} noValidate>
                <input type="hidden" {...createForm.register("workspaceId")} />
                <CreateProjectFields form={createForm} />
                {serverError && <FormError>{serverError}</FormError>}
                <div className="flex justify-end gap-2 pt-2">
                  <Button disabled={pending} onClick={() => setOpen(false)} type="button" variant="outline">Cancel</Button>
                  <Button disabled={pending} type="submit">{pending ? "Creating..." : "Create project"}</Button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function CreateProjectFields({
  form,
}: {
  form: ReturnType<typeof useForm<z.input<typeof createProjectSchema>, undefined, z.output<typeof createProjectSchema>>>;
}) {
  const identity = {
    name: form.register("name"),
    key: form.register("key", { setValueAs: (value: string) => value.toUpperCase() }),
    description: form.register("description"),
  };
  return (
    <ProjectIdentityFields
      errors={{
        name: form.formState.errors.name?.message,
        key: form.formState.errors.key?.message,
        description: form.formState.errors.description?.message,
      }}
      fields={identity}
      onNameChange={(value) => {
        if (!form.formState.dirtyFields.key) {
          form.setValue("key", value.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10));
        }
      }}
    />
  );
}

function EditProjectFields({
  form,
}: {
  form: ReturnType<typeof useForm<z.input<typeof updateProjectSchema>, undefined, z.output<typeof updateProjectSchema>>>;
}) {
  const identity = {
    name: form.register("name"),
    key: form.register("key", { setValueAs: (value: string) => value.toUpperCase() }),
    description: form.register("description"),
  };
  return (
    <>
      <ProjectIdentityFields
        errors={{
          name: form.formState.errors.name?.message,
          key: form.formState.errors.key?.message,
          description: form.formState.errors.description?.message,
        }}
        fields={identity}
        onNameChange={(value) => {
          if (!form.formState.dirtyFields.key) {
            form.setValue("key", value.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10));
          }
        }}
      />
      <div>
        <label className="form-label" htmlFor="project-status">Project status</label>
        <select className="form-control" id="project-status" {...form.register("status")}>
          <option value="ON_TRACK">On track</option>
          <option value="AT_RISK">At risk</option>
          <option value="OFF_TRACK">Off track</option>
          <option value="COMPLETED">Completed</option>
        </select>
      </div>
      <div>
        <label className="form-label" htmlFor="project-due-date">Due date <span className="font-normal text-muted-foreground">(optional)</span></label>
        <input className="form-control" id="project-due-date" type="date" {...form.register("dueDate")} />
      </div>
    </>
  );
}

function ProjectIdentityFields({
  fields,
  errors,
  onNameChange,
}: {
  fields: {
    name: UseFormRegisterReturn<"name">;
    key: UseFormRegisterReturn<"key">;
    description: UseFormRegisterReturn<"description">;
  };
  errors: { name?: string; key?: string; description?: string };
  onNameChange: (value: string) => void;
}) {
  return (
    <>
      <div>
        <label className="form-label" htmlFor="project-name">Project name</label>
        <input
          className="form-control"
          id="project-name"
          placeholder="e.g. Atlas launch"
          {...fields.name}
          onChange={(event) => {
            fields.name.onChange(event);
            onNameChange(event.target.value);
          }}
        />
        {errors.name && <FormError>{errors.name}</FormError>}
      </div>
      <div>
        <label className="form-label" htmlFor="project-key">Project key</label>
        <input
          autoCapitalize="characters"
          className="form-control uppercase"
          id="project-key"
          placeholder="ATL"
          {...fields.key}
        />
        <p className="mt-1 text-xs text-muted-foreground">Task identifiers use this key, for example ATL-1.</p>
        {errors.key && <FormError>{errors.key}</FormError>}
      </div>
      <div>
        <label className="form-label" htmlFor="project-description">Description</label>
        <textarea
          className="min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
          id="project-description"
          maxLength={2000}
          {...fields.description}
        />
        {errors.description && <FormError>{errors.description}</FormError>}
      </div>
    </>
  );
}

function FormError({ children }: { children?: string }) {
  return <p className="mt-1.5 text-xs font-medium text-destructive" role="alert">{children}</p>;
}
