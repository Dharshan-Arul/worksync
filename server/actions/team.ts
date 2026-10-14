"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  changeMemberRoleSchema,
  createInviteLinkSchema,
  invitationTokenSchema,
  inviteMemberSchema,
  removeMemberSchema,
  revokeInvitationSchema,
  setProjectMemberSchema,
} from "@/lib/validation";
import { getAuthenticatedUser } from "@/server/auth/user";
import {
  createInvitationToken,
  hashInvitationToken,
  invitationExpiresAt,
} from "@/server/invitations";
import { requireWorkspacePermission } from "@/server/permissions";
import { sendEmail } from "@/server/email";

export type TeamActionResult = { error?: string; inviteUrl?: string; emailSent?: boolean };

function validationError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Please check your details and try again.";
}

function siteUrl() {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) throw new Error("Set NEXT_PUBLIC_SITE_URL in .env.local.");
  return url.replace(/\/$/, "");
}

function revalidateTeam() {
  revalidatePath("/team");
  revalidatePath("/projects");
}

function notificationResourceFilters(projectIds: string[], channelIds: string[]) {
  return [
    ...projectIds.map((projectId) => ({
      payload: { path: ["projectId"], equals: projectId },
    })),
    ...channelIds.map((channelId) => ({
      payload: { path: ["channelId"], equals: channelId },
    })),
  ];
}

async function deleteResourceNotifications(
  tx: Prisma.TransactionClient,
  userId: string,
  projectIds: string[],
  channelIds: string[],
) {
  const resources = notificationResourceFilters(projectIds, channelIds);
  if (!resources.length) return;
  await tx.notification.deleteMany({
    where: { userId, OR: resources },
  });
}

async function authorizeMemberManager(userId: string, workspaceId: string) {
  try {
    return {
      membership: await requireWorkspacePermission(userId, workspaceId, "member:manage"),
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "You do not have permission to perform this action."
    ) {
      return { error: error.message };
    }
    throw error;
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export async function inviteMemberAction(input: unknown): Promise<TeamActionResult> {
  const parsed = inviteMemberSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };

  const { workspaceId, email, role } = parsed.data;
  const authorization = await authorizeMemberManager(user.id, workspaceId);
  if (authorization.error) return { error: authorization.error };
  const inviteBaseUrl = `${siteUrl()}/accept-invite`;
  const existing = await prisma.workspaceMember.findFirst({
    where: { workspaceId, user: { email: { equals: email, mode: "insensitive" } } },
    select: { userId: true },
  });
  if (existing) return { error: "That person is already a workspace member." };

  const pendingInvite = await prisma.invitation.findFirst({
    where: { workspaceId, email, acceptedAt: null, expiresAt: { gt: new Date() } },
  });
  if (pendingInvite) return { error: "An active invitation already exists for that email." };

  const token = createInvitationToken();
  const expiresAt = invitationExpiresAt();
  const invitation = await prisma.invitation.create({
    data: {
      workspaceId,
      email,
      role,
      token: hashInvitationToken(token),
      expiresAt,
      invitedById: user.id,
    },
    include: { workspace: { select: { name: true } } },
  });
  const inviteUrl = `${inviteBaseUrl}/${token}`;

  let emailSent = false;
  try {
    emailSent = await sendEmail({
      to: email,
      subject: `Join ${invitation.workspace.name} on Workflow`,
      text: `${user.name} invited you to join ${invitation.workspace.name} as a ${role.toLowerCase()}. Accept your invitation: ${inviteUrl}\nThis link expires in 7 days.`,
      html: `<p>${escapeHtml(user.name)} invited you to join <strong>${escapeHtml(invitation.workspace.name)}</strong> as a ${role.toLowerCase()}.</p><p><a href="${inviteUrl}">Accept your invitation</a></p><p>This link expires in 7 days.</p>`,
    });
  } catch (error) {
    console.error("Invitation email delivery failed.", error);
  }

  return { inviteUrl, emailSent };
}

export async function createInviteLinkAction(input: unknown): Promise<TeamActionResult> {
  const parsed = createInviteLinkSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };
  const authorization = await authorizeMemberManager(user.id, parsed.data.workspaceId);
  if (authorization.error) return { error: authorization.error };
  const inviteBaseUrl = `${siteUrl()}/accept-invite`;

  const existingLink = await prisma.invitation.findFirst({
    where: {
      workspaceId: parsed.data.workspaceId,
      email: null,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
      role: "MEMBER",
    },
  });
  const token = createInvitationToken();
  if (existingLink) {
    await prisma.invitation.update({
      where: { id: existingLink.id },
      data: { token: hashInvitationToken(token), expiresAt: invitationExpiresAt(), invitedById: user.id },
    });
  } else {
    await prisma.invitation.create({
      data: {
        workspaceId: parsed.data.workspaceId,
        email: null,
        role: "MEMBER",
        token: hashInvitationToken(token),
        expiresAt: invitationExpiresAt(),
        invitedById: user.id,
      },
    });
  }
  return { inviteUrl: `${inviteBaseUrl}/${token}` };
}

export async function changeMemberRoleAction(input: unknown): Promise<TeamActionResult> {
  const parsed = changeMemberRoleSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };
  const authorization = await authorizeMemberManager(user.id, parsed.data.workspaceId);
  if (authorization.error || !authorization.membership) {
    return { error: authorization.error ?? "You do not have permission to perform this action." };
  }
  const manager = authorization.membership;
  const target = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: parsed.data.workspaceId, userId: parsed.data.userId } },
  });
  if (!target) return { error: "Workspace member not found." };
  if (target.role === "OWNER") return { error: "The workspace owner role cannot be changed." };
  if (manager.role === "MANAGER" && parsed.data.userId === user.id) {
    return { error: "Managers cannot change their own role." };
  }

  await prisma.workspaceMember.update({
    where: { workspaceId_userId: { workspaceId: parsed.data.workspaceId, userId: parsed.data.userId } },
    data: { role: parsed.data.role },
  });
  revalidateTeam();
  return {};
}

export async function removeMemberAction(input: unknown): Promise<TeamActionResult> {
  const parsed = removeMemberSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };
  const authorization = await authorizeMemberManager(user.id, parsed.data.workspaceId);
  if (authorization.error || !authorization.membership) {
    return { error: authorization.error ?? "You do not have permission to perform this action." };
  }
  const manager = authorization.membership;
  const target = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: parsed.data.workspaceId, userId: parsed.data.userId } },
  });
  if (!target) return { error: "Workspace member not found." };
  if (target.role === "OWNER") return { error: "The workspace owner cannot be removed." };
  if (manager.role === "MANAGER" && parsed.data.userId === user.id) {
    return { error: "Managers cannot remove themselves." };
  }

  await prisma.$transaction(async (tx) => {
    const [projects, channels] = await Promise.all([
      tx.project.findMany({
        where: { workspaceId: parsed.data.workspaceId },
        select: { id: true },
      }),
      tx.channel.findMany({
        where: { workspaceId: parsed.data.workspaceId },
        select: { id: true },
      }),
    ]);
    await tx.task.updateMany({
      where: {
        assigneeId: parsed.data.userId,
        project: { workspaceId: parsed.data.workspaceId },
      },
      data: { assigneeId: null },
    });
    await tx.taskWatcher.deleteMany({
      where: {
        userId: parsed.data.userId,
        task: { project: { workspaceId: parsed.data.workspaceId } },
      },
    });
    await deleteResourceNotifications(
      tx,
      parsed.data.userId,
      projects.map(({ id }) => id),
      channels.map(({ id }) => id),
    );
    await tx.projectMember.deleteMany({
      where: {
        userId: parsed.data.userId,
        project: { workspaceId: parsed.data.workspaceId },
      },
    });
    await tx.channelMember.deleteMany({
      where: {
        userId: parsed.data.userId,
        channel: { workspaceId: parsed.data.workspaceId },
      },
    });
    await tx.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId: parsed.data.workspaceId, userId: parsed.data.userId } },
    });
  });
  revalidateTeam();
  return {};
}

export async function revokeInvitationAction(input: unknown): Promise<TeamActionResult> {
  const parsed = revokeInvitationSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };
  const authorization = await authorizeMemberManager(user.id, parsed.data.workspaceId);
  if (authorization.error) return { error: authorization.error };
  const invitation = await prisma.invitation.findFirst({
    where: { id: parsed.data.invitationId, workspaceId: parsed.data.workspaceId, email: { not: null } },
    select: { id: true },
  });
  if (!invitation) return { error: "Pending invitation not found." };
  await prisma.invitation.delete({ where: { id: invitation.id } });
  revalidateTeam();
  return {};
}

export async function setProjectMemberAction(input: unknown): Promise<TeamActionResult> {
  const parsed = setProjectMemberSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };
  const authorization = await authorizeMemberManager(user.id, parsed.data.workspaceId);
  if (authorization.error) return { error: authorization.error };

  const project = await prisma.project.findFirst({
    where: { id: parsed.data.projectId, workspaceId: parsed.data.workspaceId },
    select: { id: true },
  });
  if (!project) return { error: "Project not found in this workspace." };
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: parsed.data.workspaceId, userId: parsed.data.userId } },
    select: { userId: true, role: true },
  });
  if (!member) return { error: "Choose a member of this workspace." };

  await prisma.$transaction(async (tx) => {
    if (parsed.data.isMember) {
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId: project.id, userId: member.userId } },
        create: { projectId: project.id, userId: member.userId },
        update: {},
      });
      const channel = await tx.channel.findFirst({
        where: { projectId: project.id, type: "PROJECT" },
        select: { id: true },
      });
      if (channel) {
        await tx.channelMember.upsert({
          where: { channelId_userId: { channelId: channel.id, userId: member.userId } },
          create: { channelId: channel.id, userId: member.userId },
          update: {},
        });
      }
      const taskChannels = await tx.channel.findMany({
        where: { projectId: project.id, type: "TASK" },
        select: { id: true },
      });
      for (const taskChannel of taskChannels) {
        await tx.channelMember.upsert({
          where: { channelId_userId: { channelId: taskChannel.id, userId: member.userId } },
          create: { channelId: taskChannel.id, userId: member.userId },
          update: {},
        });
      }
    } else {
      const channels = await tx.channel.findMany({
        where: { projectId: project.id },
        select: { id: true },
      });
      await tx.task.updateMany({
        where: { projectId: project.id, assigneeId: member.userId },
        data: { assigneeId: null },
      });
      if (member.role === "MEMBER" || member.role === "VIEWER") {
        await tx.taskWatcher.deleteMany({
          where: { userId: member.userId, task: { projectId: project.id } },
        });
        await deleteResourceNotifications(
          tx,
          member.userId,
          [project.id],
          channels.map(({ id }) => id),
        );
      }
      await tx.projectMember.deleteMany({
        where: { projectId: project.id, userId: member.userId },
      });
      const channel = await tx.channel.findFirst({
        where: { projectId: project.id, type: "PROJECT" },
        select: { id: true },
      });
      if (channel) {
        await tx.channelMember.deleteMany({
          where: { channelId: channel.id, userId: member.userId },
        });
      }
      await tx.channelMember.deleteMany({
        where: {
          userId: member.userId,
          channel: { projectId: project.id, type: "TASK" },
        },
      });
    }
  });
  revalidateTeam();
  revalidatePath(`/projects/${project.id}`);
  return {};
}

export async function acceptInvitationAction(input: unknown): Promise<TeamActionResult> {
  const parsed = invitationTokenSchema.safeParse(input);
  if (!parsed.success) return { error: "This invitation link is invalid." };
  const user = await getAuthenticatedUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/accept-invite/${parsed.data}`)}`);

  try {
    await prisma.$transaction(async (tx) => {
      const invitation = await tx.invitation.findUnique({
        where: { token: hashInvitationToken(parsed.data) },
      });
      if (!invitation || invitation.expiresAt <= new Date() || invitation.acceptedAt) {
        throw new Error("This invitation has expired or has already been used.");
      }
      if (invitation.email && invitation.email.toLowerCase() !== user.email.toLowerCase()) {
        throw new Error("Sign in with the email address that received this invitation.");
      }
      await tx.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: user.id } },
        create: { workspaceId: invitation.workspaceId, userId: user.id, role: invitation.role },
        update: {},
      });
      const projects = await tx.project.findMany({
        where: { workspaceId: invitation.workspaceId, archived: false },
        select: { id: true },
      });
      for (const project of projects) {
        await tx.projectMember.upsert({
          where: { projectId_userId: { projectId: project.id, userId: user.id } },
          create: { projectId: project.id, userId: user.id },
          update: {},
        });
      }
      const channels = await tx.channel.findMany({
        where: {
          workspaceId: invitation.workspaceId,
          type: "PROJECT",
          projectId: { in: projects.map(({ id }) => id) },
        },
        select: { id: true },
      });
      for (const channel of channels) {
        await tx.channelMember.upsert({
          where: { channelId_userId: { channelId: channel.id, userId: user.id } },
          create: { channelId: channel.id, userId: user.id },
          update: {},
        });
      }
      if (invitation.email) {
        await tx.invitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: new Date() },
        });
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "This invitation could not be accepted. Please contact a workspace manager." };
    }
    if (
      error instanceof Error &&
      [
        "This invitation has expired or has already been used.",
        "Sign in with the email address that received this invitation.",
      ].includes(error.message)
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidateTeam();
  redirect("/dashboard");
}
