"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Layers3, Sparkles, Workflow } from "lucide-react";
import Link from "next/link";
import { useTransition, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { createProjectSchema, createWorkspaceSchema } from "@/lib/validation";
import {
  createFirstProjectAction,
  createWorkspaceAction,
} from "@/server/actions/onboarding";
import type { z } from "zod";

function OnboardingFrame({
  step,
  children,
}: {
  step: number;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-[520px]">
        <Link className="mb-12 flex items-center justify-center gap-2.5 text-lg font-semibold tracking-tight" href="/">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Workflow aria-hidden="true" className="size-5" />
          </span>
          Workflow
        </Link>
        <div className="mb-7 flex items-center justify-center gap-2" aria-label={`Step ${step} of 2`}>
          {[1, 2].map((number) => (
            <span
              aria-current={number === step ? "step" : undefined}
              className={`h-1.5 w-16 rounded-full ${number <= step ? "bg-primary" : "bg-muted"}`}
              key={number}
            />
          ))}
        </div>
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-9">
          {children}
        </section>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Your workspace is private and only visible to invited members.
        </p>
      </div>
    </main>
  );
}

export function WorkspaceOnboardingForm() {
  const form = useForm<z.infer<typeof createWorkspaceSchema>>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: { name: "", slug: "" },
  });
  const [pending, startTransition] = useTransition();
  const name = useWatch({ control: form.control, name: "name" });

  function submit(values: z.infer<typeof createWorkspaceSchema>) {
    startTransition(async () => {
      const result = await createWorkspaceAction(values);
      if (result.error) form.setError("root", { message: result.error });
    });
  }

  return (
    <OnboardingFrame step={1}>
      <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Layers3 aria-hidden="true" className="size-6" />
      </div>
      <p className="text-center text-xs font-semibold uppercase tracking-[0.15em] text-primary">Step 1 of 2</p>
      <h1 className="mt-2 text-center text-2xl font-semibold tracking-tight">Create your workspace</h1>
      <p className="mt-2 text-center text-sm leading-6 text-muted-foreground">
        A home for your projects, teammates, and all the work you do together.
      </p>
      <form className="mt-8 space-y-5" onSubmit={form.handleSubmit(submit)} noValidate>
        <div>
          <label className="form-label" htmlFor="workspace-name">Workspace name</label>
          <input
            autoComplete="organization"
            className="form-control"
            id="workspace-name"
            placeholder="e.g. Atlas Studio"
            {...form.register("name", {
              onChange: (event) => {
                if (!form.formState.dirtyFields.slug) {
                  form.setValue(
                    "slug",
                    event.target.value
                      .toLowerCase()
                      .trim()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-|-$/g, ""),
                  );
                }
              },
            })}
          />
          {form.formState.errors.name && <InlineError>{form.formState.errors.name.message}</InlineError>}
        </div>
        <div>
          <label className="form-label" htmlFor="workspace-slug">Workspace URL</label>
          <div className="flex overflow-hidden rounded-lg border border-input focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
            <span className="flex items-center border-r border-border bg-muted/50 px-3 text-sm text-muted-foreground">
              workflow.app/
            </span>
            <input
              autoComplete="off"
              className="h-11 min-w-0 flex-1 bg-background px-3 text-sm outline-none"
              id="workspace-slug"
              {...form.register("slug")}
            />
          </div>
          {form.formState.errors.slug && <InlineError>{form.formState.errors.slug.message}</InlineError>}
        </div>
        {form.formState.errors.root && <InlineError>{form.formState.errors.root.message}</InlineError>}
        <Button className="h-11 w-full" disabled={pending || !name?.trim()} type="submit">
          {pending ? "Creating workspace..." : "Continue"}
          {!pending && <ArrowRight aria-hidden="true" className="ml-1 size-4" />}
        </Button>
      </form>
    </OnboardingFrame>
  );
}

export function FirstProjectForm({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  type ProjectInput = z.input<typeof createProjectSchema>;
  type ProjectOutput = z.output<typeof createProjectSchema>;
  const form = useForm<ProjectInput, undefined, ProjectOutput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { workspaceId, name: "", key: "", description: "" },
  });
  const [pending, startTransition] = useTransition();
  const name = useWatch({ control: form.control, name: "name" });

  function submit(values: ProjectOutput) {
    startTransition(async () => {
      const result = await createFirstProjectAction(values);
      if (result.error) form.setError("root", { message: result.error });
    });
  }

  return (
    <OnboardingFrame step={2}>
      <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Sparkles aria-hidden="true" className="size-6" />
      </div>
      <p className="text-center text-xs font-semibold uppercase tracking-[0.15em] text-primary">Step 2 of 2</p>
      <h1 className="mt-2 text-center text-2xl font-semibold tracking-tight">Create a project</h1>
      <p className="mt-2 text-center text-sm leading-6 text-muted-foreground">
        Give your team a clear place to organize and move work forward.
      </p>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        In <span className="font-medium text-foreground">{workspaceName}</span>
      </p>
      <form className="mt-8 space-y-5" onSubmit={form.handleSubmit(submit)} noValidate>
        <input type="hidden" {...form.register("workspaceId")} />
        <div>
          <label className="form-label" htmlFor="project-name">Project name</label>
          <input
            className="form-control"
            id="project-name"
            placeholder="e.g. Atlas launch"
            {...form.register("name", {
              onChange: (event) => {
                if (!form.formState.dirtyFields.key) {
                  form.setValue(
                    "key",
                    event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]+/g, "")
                      .slice(0, 10),
                  );
                }
              },
            })}
          />
          {form.formState.errors.name && <InlineError>{form.formState.errors.name.message}</InlineError>}
        </div>
        <div>
          <label className="form-label" htmlFor="project-key">Project key</label>
          <input
            autoCapitalize="characters"
            className="form-control uppercase"
            id="project-key"
            placeholder="ATL"
            {...form.register("key", {
              setValueAs: (value: string) => value.toUpperCase(),
            })}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">Used to identify tasks, for example ATL-12.</p>
          {form.formState.errors.key && <InlineError>{form.formState.errors.key.message}</InlineError>}
        </div>
        <div>
          <label className="form-label" htmlFor="project-description">What is this project about? <span className="font-normal text-muted-foreground">(optional)</span></label>
          <textarea
            className="min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
            id="project-description"
            placeholder="A short description to help your team get started"
            {...form.register("description")}
          />
        </div>
        {form.formState.errors.root && <InlineError>{form.formState.errors.root.message}</InlineError>}
        <Button className="h-11 w-full" disabled={pending || !name?.trim()} type="submit">
          {pending ? "Creating project..." : "Create project"}
          {!pending && <ArrowRight aria-hidden="true" className="ml-1 size-4" />}
        </Button>
      </form>
    </OnboardingFrame>
  );
}

function InlineError({ children }: { children?: ReactNode }) {
  return <p className="mt-1.5 text-xs font-medium text-destructive" role="alert">{children}</p>;
}
