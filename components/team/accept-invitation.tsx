"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { acceptInvitationAction } from "@/server/actions/team";

export function AcceptInvitation({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-6">
      {error && <p className="mb-3 text-sm text-destructive" role="alert">{error}</p>}
      <Button
        className="w-full"
        disabled={pending}
        onClick={() => {
          setError("");
          startTransition(async () => {
            const result = await acceptInvitationAction(token);
            if (result.error) setError(result.error);
            else router.refresh();
          });
        }}
      >
        {pending ? "Joining workspace..." : "Accept invitation"}
      </Button>
    </div>
  );
}
