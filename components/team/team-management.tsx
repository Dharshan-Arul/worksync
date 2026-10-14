"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, Link2, Mail, Shield, Trash2, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { WorkspaceRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { inviteMemberSchema } from "@/lib/validation";
import {
  changeMemberRoleAction,
  createInviteLinkAction,
  inviteMemberAction,
  removeMemberAction,
  revokeInvitationAction,
  setProjectMemberAction,
} from "@/server/actions/team";
import type { z } from "zod";

type Member = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: WorkspaceRole;
  joinedAt: string;
  openTasks: number;
  projectIds: string[];
};

type Invitation = {
  id: string;
  email: string;
  role: WorkspaceRole;
  createdAt: string;
  expiresAt: string;
  invitedBy: string;
};

export function TeamManagement({
  workspace,
  role,
  currentUserId,
  canManage,
  members,
  invitations,
  projects,
}: {
  workspace: { id: string; name: string };
  role: WorkspaceRole;
  currentUserId: string;
  canManage: boolean;
  members: Member[];
  invitations: Invitation[];
  projects: { id: string; name: string; key: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const form = useForm<z.infer<typeof inviteMemberSchema>>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { workspaceId: workspace.id, email: "", role: "MEMBER" },
  });

  function report(result: { error?: string }, success?: string) {
    if (result.error) setError(result.error);
    else {
      setError("");
      setNotice(success ?? "Changes saved.");
      router.refresh();
    }
  }

  function sendInvite(values: z.infer<typeof inviteMemberSchema>) {
    setError("");
    setNotice("");
    setInviteUrl("");
    startTransition(async () => {
      const result = await inviteMemberAction(values);
      if (result.error) setError(result.error);
      else {
        setInviteUrl(result.inviteUrl ?? "");
        setNotice(
          result.emailSent
            ? `Invitation sent to ${values.email}.`
            : "Email not sent, copy the invite link instead",
        );
        form.reset({ workspaceId: workspace.id, email: "", role: "MEMBER" });
        router.refresh();
      }
    });
  }

  function createLink() {
    setError("");
    setNotice("");
    startTransition(async () => {
      const result = await createInviteLinkAction({ workspaceId: workspace.id });
      if (result.error) setError(result.error);
      else if (result.inviteUrl) {
        setInviteUrl(result.inviteUrl);
        setNotice("Shareable invite link created. It expires in 7 days.");
      }
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy the invite link. Select and copy it manually.");
    }
  }

  return (
    <div className="space-y-7">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-muted-foreground">{workspace.name}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[28px]">Team</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage workspace members, roles, and project access.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 self-start rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground sm:self-auto">
          <Shield aria-hidden="true" className="size-3.5" /> Your role: {role.toLowerCase()}
        </span>
      </header>

      {canManage && (
        <section className="grid gap-5 rounded-xl border border-border bg-card p-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="flex items-center gap-2">
              <Mail aria-hidden="true" className="size-4 text-primary" />
              <h2 className="font-semibold">Invite by email</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Send a secure, time-limited invitation link.</p>
            <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_140px_auto]" onSubmit={form.handleSubmit(sendInvite)} noValidate>
              <div>
                <label className="form-label" htmlFor="invite-email">Email address</label>
                <input autoComplete="email" className="form-control" id="invite-email" type="email" {...form.register("email")} />
                {form.formState.errors.email && <p className="mt-1 text-xs text-destructive" role="alert">{form.formState.errors.email.message}</p>}
              </div>
              <div>
                <label className="form-label" htmlFor="invite-role">Role</label>
                <select className="form-control" id="invite-role" {...form.register("role")}>
                  <option value="MEMBER">Member</option>
                  <option value="MANAGER">Manager</option>
                  <option value="VIEWER">Viewer</option>
                </select>
              </div>
              <div className="flex items-end">
                <Button className="w-full" disabled={pending} type="submit">
                  <UserPlus aria-hidden="true" /> {pending ? "Sending..." : "Send invite"}
                </Button>
              </div>
            </form>
          </div>
          <div className="border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <div className="flex items-center gap-2">
              <Link2 aria-hidden="true" className="size-4 text-primary" />
              <h2 className="font-semibold">Shareable invite link</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Anyone with this link can join as a member for 7 days.</p>
            <Button className="mt-4" disabled={pending} onClick={createLink} type="button" variant="outline">
              <Link2 aria-hidden="true" /> Create invite link
            </Button>
            {inviteUrl && (
              <div className="mt-3 flex gap-2">
                <input aria-label="Shareable invite link" className="form-control min-w-0" readOnly value={inviteUrl} />
                <Button aria-label={copied ? "Link copied" : "Copy invite link"} onClick={copyLink} type="button" variant="outline" size="icon">
                  {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                </Button>
              </div>
            )}
          </div>
          {(error || notice) && (
            <p className={`text-sm ${error ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`} role={error ? "alert" : "status"}>
              {error || notice}
            </p>
          )}
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold">Workspace members</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{members.length} {members.length === 1 ? "person" : "people"}</p>
          </div>
          <Users aria-hidden="true" className="size-5 text-muted-foreground" />
        </div>
        {members.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No members yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {members.map((member) => (
              <article className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(200px,1.2fr)_120px_100px_minmax(220px,1.6fr)_auto] lg:items-center" key={member.id}>
                <div className="flex min-w-0 items-center gap-3">
                  {member.avatarUrl ? (
                    // External avatar URLs are provided by the authenticated profile.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" className="size-9 rounded-full object-cover" height={36} src={member.avatarUrl} width={36} />
                  ) : (
                    <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {member.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{member.name}{member.id === currentUserId && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}</span>
                    <span className="block truncate text-xs text-muted-foreground">{member.email}</span>
                  </span>
                </div>
                {canManage && member.role !== "OWNER" ? (
                  <label className="sr-only" htmlFor={`role-${member.id}`}>Role for {member.name}</label>
                ) : null}
                {canManage && member.role !== "OWNER" ? (
                  <select
                    className="form-control h-9"
                    disabled={pending || (role === "MANAGER" && member.id === currentUserId)}
                    id={`role-${member.id}`}
                    value={member.role}
                    onChange={(event) => {
                      setError("");
                      startTransition(async () => report(await changeMemberRoleAction({
                        workspaceId: workspace.id,
                        userId: member.id,
                        role: event.target.value,
                      })));
                    }}
                  >
                    <option value="MANAGER">Manager</option>
                    <option value="MEMBER">Member</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                ) : (
                  <span className="text-sm capitalize text-muted-foreground">{member.role.toLowerCase()}</span>
                )}
                <span className="text-xs text-muted-foreground">{member.openTasks} open {member.openTasks === 1 ? "task" : "tasks"}</span>
                {canManage && (member.role === "OWNER" || member.role === "MANAGER") ? (
                  <span className="text-xs text-muted-foreground">All projects</span>
                ) : canManage && projects.length > 0 ? (
                  <fieldset className="flex flex-wrap gap-x-3 gap-y-1">
                    <legend className="sr-only">Project access for {member.name}</legend>
                    {projects.map((project) => (
                      <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" key={project.id}>
                        <input
                          checked={member.projectIds.includes(project.id)}
                          disabled={pending}
                          onChange={(event) => {
                            setError("");
                            startTransition(async () => report(await setProjectMemberAction({
                              workspaceId: workspace.id,
                              projectId: project.id,
                              userId: member.id,
                              isMember: event.target.checked,
                            })));
                          }}
                          type="checkbox"
                        />
                        {project.key}
                      </label>
                    ))}
                  </fieldset>
                ) : (
                  <span className="text-xs text-muted-foreground">{member.projectIds.length} projects</span>
                )}
                {canManage && member.role !== "OWNER" && !(role === "MANAGER" && member.id === currentUserId) ? (
                  <Button
                    aria-label={`Remove ${member.name}`}
                    disabled={pending}
                    onClick={() => {
                      if (!window.confirm(`Remove ${member.name} from ${workspace.name}?`)) return;
                      startTransition(async () => report(await removeMemberAction({ workspaceId: workspace.id, userId: member.id }), `${member.name} was removed.`));
                    }}
                    title={`Remove ${member.name}`}
                    type="button"
                    variant="ghost"
                    size="icon"
                  >
                    <Trash2 aria-hidden="true" className="text-destructive" />
                  </Button>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      {canManage && invitations.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-semibold">Pending invitations</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Invitations expire after 7 days.</p>
          </div>
          <div className="divide-y divide-border">
            {invitations.map((invitation) => (
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3" key={invitation.id}>
                <div>
                  <p className="text-sm font-medium">{invitation.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {invitation.role.toLowerCase()} · invited by {invitation.invitedBy} · expires {new Date(invitation.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  disabled={pending}
                  onClick={() => startTransition(async () => report(await revokeInvitationAction({ workspaceId: workspace.id, invitationId: invitation.id }), "Invitation revoked."))}
                  type="button"
                  variant="outline"
                  size="sm"
                >
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}
      {!canManage && <p className="text-sm text-muted-foreground">Contact a workspace manager to change member roles or project access.</p>}
    </div>
  );
}
