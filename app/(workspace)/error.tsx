"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function WorkspaceError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const router = useRouter();

  return (
    <section
      aria-labelledby="workspace-error-title"
      className="mx-auto flex min-h-72 max-w-lg flex-col items-center justify-center rounded-xl border border-border bg-card p-8 text-center"
      role="alert"
    >
      <h1 className="text-lg font-semibold" id="workspace-error-title">
        This page couldn’t be loaded
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Try again. If the problem continues, contact your workspace administrator.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-muted-foreground">Error reference: {error.digest}</p>
      )}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button onClick={retry} type="button">Try again</Button>
        <Button onClick={() => router.push("/dashboard")} type="button" variant="outline">
          Go to dashboard
        </Button>
      </div>
    </section>
  );
}
