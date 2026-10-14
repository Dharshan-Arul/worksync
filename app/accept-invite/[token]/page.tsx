import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AcceptInvitation } from "@/components/team/accept-invitation";
import { getAuthenticatedUser } from "@/server/auth/user";
import { findInvitation } from "@/server/invitations";

export const metadata: Metadata = { title: "Accept workspace invitation" };
export const dynamic = "force-dynamic";

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const invitation = await findInvitation(token);
  const isValid =
    invitation &&
    invitation.expiresAt > new Date() &&
    (!invitation.email || !invitation.acceptedAt);
  const user = await getAuthenticatedUser();
  const nextPath = `/accept-invite/${token}`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-7 text-center shadow-sm">
        <Link className="text-sm font-semibold text-primary hover:underline" href="/">Workflow</Link>
        {!isValid ? (
          <>
            <h1 className="mt-6 text-2xl font-semibold">Invitation unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This invitation has expired, was already used, or is no longer valid.
            </p>
            <Link className="mt-6 inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/login">Go to sign in</Link>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-2xl font-semibold">You’re invited</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Join <span className="font-medium text-foreground">{invitation.workspace.name}</span>
              {invitation.email ? ` as ${invitation.role.toLowerCase()}.` : " as a member."}
            </p>
            {invitation.email && user && user.email.toLowerCase() !== invitation.email.toLowerCase() ? (
              <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                This invitation was sent to {invitation.email}. Sign in with that email address.
              </p>
            ) : user ? (
              <AcceptInvitation token={token} />
            ) : (
              <div className="mt-6 grid gap-2">
                <Link className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={`/login?next=${encodeURIComponent(nextPath)}`}>Sign in to accept</Link>
                <Link className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={`/signup?next=${encodeURIComponent(nextPath)}`}>Create account</Link>
              </div>
            )}
            <p className="mt-5 text-xs text-muted-foreground">
              Expires {invitation.expiresAt.toLocaleDateString()}.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
