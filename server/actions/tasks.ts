"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  attachmentIdSchema,
  attachmentUploadSchema,
  checklistItemSchema,
  createCommentSchema,
  createTaskSchema,
  deleteChecklistSchema,
  moveTaskSchema,
  parseOptionalDate,
  toggleChecklistSchema,
  updateTaskSchema,
  watchTaskSchema,
} from "@/lib/validation";
import { getAuthenticatedUser } from "@/server/auth/user";
import { requireProjectPermission, requireTaskPermission } from "@/server/permissions";
import { createClient } from "@/lib/supabase/server";
import { ATTACHMENT_BUCKET, isAllowedAttachmentFile } from "@/lib/attachments";

export type TaskActionResult = { error?: string; taskId?: string; taskNumber?: number };

export type TaskDetails = {
  id: string;
  number: number;
  title: string;
  description: string;
  status: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: string | null;
  estimatePoints: number | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
  reporter: { id: string; name: string };
  checklistCount: number;
  commentCount: number;
  checklistItems: { id: string; text: string; done: boolean }[];
  comments: {
    id: string;
    body: string;
    createdAt: string;
    author: { id: string; name: string; avatarUrl: string | null };
  }[];
  activityLogs: {
    id: string;
    action: string;
    meta: unknown;
    createdAt: string;
    actor: { id: string; name: string };
  }[];
  attachments: {
    id: string;
    name: string;
    size: number;
    createdAt: string;
    uploadedById: string;
    uploadedBy: { name: string };
  }[];
  watcherCount: number;
  isWatching: boolean;
  watchers: { id: string; name: string; avatarUrl: string | null }[];
};

function validationError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Please check the task details.";
}

function permissionError(error: unknown) {
  if (error instanceof Error && error.message.includes("permission")) {
    return "You don't have permission to change this task.";
  }
  if (error instanceof Error && error.message.includes("only edit tasks assigned")) {
    return "You can only change tasks assigned to you.";
  }
  if (error instanceof Error && error.message.includes("not a member")) {
    return "You are not a member of this project.";
  }
  if (error instanceof Error && error.message.includes("Archived projects")) {
    return error.message;
  }
  throw error;
}

function cleanText(value: string) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

async function projectAccessUserIds(
  tx: Prisma.TransactionClient,
  projectId: string,
  workspaceId: string,
) {
  const [projectMembers, workspaceMembers, workspaceManagers] = await Promise.all([
    tx.projectMember.findMany({
      where: { projectId },
      select: { userId: true },
    }),
    tx.workspaceMember.findMany({
      where: { workspaceId },
      select: { userId: true },
    }),
    tx.workspaceMember.findMany({
      where: { workspaceId, role: { in: ["OWNER", "MANAGER"] } },
      select: { userId: true },
    }),
  ]);
  const activeWorkspaceMembers = new Set(workspaceMembers.map(({ userId }) => userId));
  return new Set([
    ...projectMembers
      .map(({ userId }) => userId)
      .filter((userId) => activeWorkspaceMembers.has(userId)),
    ...workspaceManagers.map(({ userId }) => userId),
  ]);
}

function taskPath(projectId: string) {
  return `/projects/${projectId}/board`;
}

export async function getTaskDetailsAction(
  input: unknown,
): Promise<{ error?: string; task?: TaskDetails }> {
  const parsed = z.string().uuid().safeParse(
    typeof input === "object" && input !== null && "taskId" in input
      ? input.taskId
      : input,
  );
  if (!parsed.success) return { error: "Choose a valid task." };

  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };

  let authorized;
  try {
    authorized = await requireTaskPermission(user.id, parsed.data, "project:view");
  } catch (error) {
    return { error: permissionError(error) };
  }

  const task = await prisma.task.findFirst({
    where: { id: parsed.data, projectId: authorized.project.id },
    include: {
      assignee: { select: { id: true, name: true, avatarUrl: true } },
      reporter: { select: { id: true, name: true } },
      checklistItems: { orderBy: { id: "asc" } },
      comments: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { author: { select: { id: true, name: true, avatarUrl: true } } },
      },
      attachments: {
        orderBy: { createdAt: "desc" },
        include: { uploadedBy: { select: { name: true } } },
      },
      watchers: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      },
      activityLogs: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { actor: { select: { id: true, name: true } } },
      },
      _count: { select: { checklistItems: true, comments: true } },
    },
  });
  if (!task) return { error: "Task not found." };

  return {
    task: {
      ...task,
      dueDate: task.dueDate?.toISOString() ?? null,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      completedAt: task.completedAt?.toISOString() ?? null,
      checklistCount: task._count.checklistItems,
      commentCount: task._count.comments,
      comments: task.comments.map((comment) => ({
        ...comment,
        createdAt: comment.createdAt.toISOString(),
      })),
      activityLogs: task.activityLogs.map((activity) => ({
        ...activity,
        createdAt: activity.createdAt.toISOString(),
      })),
      attachments: task.attachments.map((attachment) => ({
        id: attachment.id,
        name: attachment.name,
        size: attachment.size,
        createdAt: attachment.createdAt.toISOString(),
        uploadedById: attachment.uploadedById,
        uploadedBy: attachment.uploadedBy,
      })),
      watcherCount: task.watchers.length,
      isWatching: task.watchers.some((watcher) => watcher.userId === user.id),
      watchers: task.watchers.map(({ user: watcher }) => watcher),
    },
  };
}

export async function watchTaskAction(input: unknown) {
  const parsed = watchTaskSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };
  try {
    await requireTaskPermission(user.id, parsed.data.taskId, "project:view");
  } catch (error) {
    return { error: permissionError(error) };
  }

  if (parsed.data.watching) {
    await prisma.taskWatcher.upsert({
      where: { taskId_userId: { taskId: parsed.data.taskId, userId: user.id } },
      create: { taskId: parsed.data.taskId, userId: user.id },
      update: {},
    });
  } else {
    await prisma.taskWatcher.deleteMany({
      where: { taskId: parsed.data.taskId, userId: user.id },
    });
  }
  revalidatePath(taskPath((await prisma.task.findUniqueOrThrow({
    where: { id: parsed.data.taskId },
    select: { projectId: true },
  })).projectId));
  return {};
}

type AttachmentUploadInput = {
  taskId?: string;
  projectId?: string;
  name: string;
  size: number;
  contentType: string;
};

async function authorizeAttachmentUpload(userId: string, input: AttachmentUploadInput) {
  if (input.taskId) {
    const authorized = await requireTaskPermission(userId, input.taskId, "task:comment");
    return {
      taskId: input.taskId,
      projectId: authorized.project.id,
      workspaceId: authorized.project.workspaceId,
    };
  }
  if (input.projectId) {
    const authorized = await requireProjectPermission(userId, input.projectId, "task:comment");
    return {
      taskId: null,
      projectId: authorized.project.id,
      workspaceId: authorized.project.workspaceId,
    };
  }
  throw new Error("Choose exactly one task or project.");
}

function safeAttachmentName(value: string) {
  const name = value.replace(/\\/g, "/").split("/").pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return name && name !== "." && name !== ".." ? name.slice(0, 255) : null;
}

export async function prepareAttachmentUploadAction(input: unknown) {
  const parsed = attachmentUploadSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };
  const name = safeAttachmentName(parsed.data.name);
  if (!name || !isAllowedAttachmentFile(name, parsed.data.contentType)) {
    return { error: "Choose a supported file with a matching extension." };
  }

  let location;
  try {
    location = await authorizeAttachmentUpload(user.id, parsed.data);
  } catch (error) {
    return { error: permissionError(error) };
  }

  const scope = location.taskId ?? "_project";
  return {
    path: `${location.workspaceId}/${location.projectId}/${scope}/${user.id}/${crypto.randomUUID()}`,
    name,
    size: parsed.data.size,
    contentType: parsed.data.contentType,
  };
}

export async function registerAttachmentAction(input: unknown) {
  const parsed = attachmentUploadSchema.extend({ path: z.string().min(1).max(1024) }).safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };
  const name = safeAttachmentName(parsed.data.name);
  if (!name || !isAllowedAttachmentFile(name, parsed.data.contentType)) {
    return { error: "Choose a supported file with a matching extension." };
  }

  let location;
  try {
    location = await authorizeAttachmentUpload(user.id, parsed.data);
  } catch (error) {
    return { error: permissionError(error) };
  }

  const prefix = `${location.workspaceId}/${location.projectId}/${location.taskId ?? "_project"}/${user.id}/`;
  const objectId = parsed.data.path.startsWith(prefix)
    ? parsed.data.path.slice(prefix.length)
    : "";
  if (!z.string().uuid().safeParse(objectId).success) {
    return { error: "Uploaded file path is invalid." };
  }

  const supabase = await createClient();
  const { data: objects, error: storageError } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .list(prefix.slice(0, -1), { search: objectId });
  if (storageError) return { error: "We couldn't verify the uploaded file." };
  const storedObject = objects.find((object) => object.name === objectId);
  const storedMetadata = storedObject?.metadata as { size?: number; mimetype?: string } | null;
  if (
    !storedObject ||
    storedMetadata?.size !== parsed.data.size ||
    storedMetadata?.mimetype !== parsed.data.contentType
  ) {
    return { error: "The uploaded file could not be verified. Please try again." };
  }

  const attachment = await prisma.$transaction(async (tx) => {
    const created = await tx.attachment.create({
      data: {
        taskId: location.taskId,
        projectId: location.taskId ? null : location.projectId,
        fileUrl: parsed.data.path,
        name,
        size: parsed.data.size,
        uploadedById: user.id,
      },
      select: { id: true },
    });
    await tx.activityLog.create({
      data: {
        workspaceId: location.workspaceId,
        projectId: location.projectId,
        taskId: location.taskId,
        actorId: user.id,
        action: "ATTACHMENT_ADDED",
        meta: { attachmentId: created.id, name, size: parsed.data.size },
      },
    });
    if (location.taskId) {
      const [watchers, task, accessibleUsers] = await Promise.all([
        tx.taskWatcher.findMany({
          where: { taskId: location.taskId, userId: { not: user.id } },
          select: { userId: true },
        }),
        tx.task.findUniqueOrThrow({
          where: { id: location.taskId },
          select: { number: true, project: { select: { key: true } } },
        }),
        projectAccessUserIds(tx, location.projectId, location.workspaceId),
      ]);
      const eligibleWatchers = watchers.filter(({ userId }) => accessibleUsers.has(userId));
      if (eligibleWatchers.length) {
        await tx.notification.createMany({
          data: eligibleWatchers.map(({ userId }) => ({
            userId,
            type: "WATCHED_TASK_UPDATED",
            payload: {
              taskId: location.taskId,
              projectId: location.projectId,
              taskNumber: task.number,
              projectKey: task.project.key,
              senderName: user.name,
              body: `${user.name} attached a file to ${task.project.key}-${task.number}.`,
            },
          })),
        });
      }
    }
    return created;
  });

  revalidatePath(taskPath(location.projectId));
  revalidatePath(`/projects/${location.projectId}`);
  revalidatePath(`/projects/${location.projectId}/files`);
  return { attachmentId: attachment.id };
}

export async function getAttachmentDownloadAction(input: unknown) {
  const parsed = attachmentIdSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose a valid attachment." };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };
  const attachment = await prisma.attachment.findUnique({
    where: { id: parsed.data },
    select: {
      id: true,
      fileUrl: true,
      name: true,
      taskId: true,
      projectId: true,
      task: { select: { projectId: true } },
    },
  });
  if (!attachment) return { error: "Attachment not found." };
  const projectId = attachment.projectId ?? attachment.task?.projectId;
  if (!projectId) return { error: "Attachment is not associated with a project." };
  try {
    await requireProjectPermission(user.id, projectId, "project:view");
  } catch (error) {
    return { error: permissionError(error) };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(attachment.fileUrl, 60, { download: attachment.name });
  if (error) return { error: "We couldn't prepare this file for download." };
  return { url: data.signedUrl };
}

export async function deleteAttachmentAction(input: unknown) {
  const parsed = attachmentIdSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose a valid attachment." };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };
  const attachment = await prisma.attachment.findUnique({
    where: { id: parsed.data },
    select: {
      id: true,
      fileUrl: true,
      uploadedById: true,
      taskId: true,
      projectId: true,
      task: { select: { projectId: true } },
    },
  });
  if (!attachment) return { error: "Attachment not found." };
  const projectId = attachment.projectId ?? attachment.task?.projectId;
  if (!projectId) return { error: "Attachment is not associated with a project." };
  let authorization;
  try {
    authorization = await requireProjectPermission(user.id, projectId, "project:view");
  } catch (error) {
    return { error: permissionError(error) };
  }
  if (
    attachment.uploadedById !== user.id &&
    authorization.membership.role !== "OWNER" &&
    authorization.membership.role !== "MANAGER"
  ) {
    return { error: "You can only remove files you uploaded." };
  }

  const supabase = await createClient();
  const { error: storageError } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .remove([attachment.fileUrl]);
  if (storageError) return { error: "We couldn't remove the stored file." };
  await prisma.$transaction(async (tx) => {
    await tx.attachment.delete({ where: { id: attachment.id } });
    await tx.activityLog.create({
      data: {
        workspaceId: authorization.project.workspaceId,
        projectId: authorization.project.id,
        taskId: attachment.taskId,
        actorId: user.id,
        action: "ATTACHMENT_REMOVED",
      },
    });
  });
  revalidatePath(taskPath(projectId));
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/files`);
  return {};
}

export async function createTaskAction(input: unknown): Promise<TaskActionResult> {
  const parsed = createTaskSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const dueDate = parseOptionalDate(parsed.data.dueDate);
  if (dueDate === undefined) return { error: "Enter a valid due date." };

  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };
  let project;
  try {
    ({ project } = await requireProjectPermission(
      user.id,
      parsed.data.projectId,
      "task:create",
    ));
  } catch (error) {
    return { error: permissionError(error) };
  }

  const role = await prisma.workspaceMember.findUniqueOrThrow({
    where: { workspaceId_userId: { workspaceId: project.workspaceId, userId: user.id } },
    select: { role: true },
  });
  const assigneeId = parsed.data.assigneeId || (role.role === "MEMBER" ? user.id : null);
  if (assigneeId) {
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: project.id, userId: assigneeId } },
    });
    if (!member) return { error: "Choose a member of this project to assign the task to." };
  }

  if (role.role === "MEMBER" && assigneeId && assigneeId !== user.id) {
    return { error: "Members can only assign tasks to themselves." };
  }

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        projectId: project.id,
        number: 0,
        title: cleanText(parsed.data.title),
        description: cleanText(parsed.data.description),
        status: parsed.data.status,
        priority: parsed.data.priority,
        assigneeId,
        reporterId: user.id,
        dueDate,
        estimatePoints: parsed.data.estimatePoints,
        position: Date.now(),
        completedAt: parsed.data.status === "DONE" ? new Date() : null,
      },
      select: { id: true, number: true },
    });
    await tx.activityLog.create({
      data: {
        workspaceId: project.workspaceId,
        projectId: project.id,
        taskId: created.id,
        actorId: user.id,
        action: "TASK_CREATED",
        meta: { number: created.number, title: cleanText(parsed.data.title) },
      },
    });
    const accessibleUsers = await projectAccessUserIds(tx, project.id, project.workspaceId);
    if (assigneeId && assigneeId !== user.id && accessibleUsers.has(assigneeId)) {
      await tx.notification.create({
        data: {
          userId: assigneeId,
          type: "TASK_ASSIGNED",
          payload: {
            taskId: created.id,
            taskNumber: created.number,
            projectId: project.id,
          },
        },
      });
    }
    return created;
  });

  revalidatePath(taskPath(project.id));
  revalidatePath(`/projects/${project.id}/list`);
  revalidatePath("/dashboard");
  return { taskId: task.id, taskNumber: task.number };
}

async function updateTask(input: unknown, statusOnly: boolean): Promise<TaskActionResult> {
  let taskValues: z.infer<typeof updateTaskSchema>;
  if (statusOnly) {
    const moved = moveTaskSchema.safeParse(input);
    if (!moved.success) return { error: validationError(moved.error) };
    taskValues = { taskId: moved.data.taskId, status: moved.data.status };
  } else {
    const parsed = updateTaskSchema.safeParse(input);
    if (!parsed.success) return { error: validationError(parsed.error) };
    taskValues = parsed.data;
  }

  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };

  const taskId = taskValues.taskId;
  let authorized;
  try {
    authorized = await requireTaskPermission(user.id, taskId, "task:edit:assigned");
  } catch (error) {
    return { error: permissionError(error) };
  }

  if (!statusOnly && taskValues.assigneeId !== undefined) {
    if (authorized.membership.role === "MEMBER") {
      return { error: "Only workspace managers can change task assignment." };
    }
    const assigneeId = taskValues.assigneeId;
    if (assigneeId) {
      const member = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: authorized.project.id, userId: assigneeId } },
      });
      if (!member) return { error: "Choose a member of this project to assign the task to." };
    }
  }

  let updateData: Prisma.TaskUncheckedUpdateInput;
  if (statusOnly) {
    if (!taskValues.status) return { error: "Choose a valid task status." };
    updateData = { status: taskValues.status };
  } else {
    const dueDate =
      taskValues.dueDate === undefined ? undefined : parseOptionalDate(taskValues.dueDate);
    if (dueDate === undefined && taskValues.dueDate) {
      return { error: "Enter a valid due date." };
    }
    updateData = {
      ...(taskValues.title !== undefined ? { title: cleanText(taskValues.title) } : {}),
      ...(taskValues.description !== undefined
        ? { description: cleanText(taskValues.description) }
        : {}),
      ...(taskValues.status !== undefined ? { status: taskValues.status } : {}),
      ...(taskValues.priority !== undefined ? { priority: taskValues.priority } : {}),
      ...(taskValues.assigneeId !== undefined ? { assigneeId: taskValues.assigneeId } : {}),
      ...(taskValues.dueDate !== undefined ? { dueDate } : {}),
      ...(taskValues.estimatePoints !== undefined
        ? { estimatePoints: taskValues.estimatePoints }
        : {}),
    };
  }

  const oldTask = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: {
      status: true,
      title: true,
      description: true,
      priority: true,
      assigneeId: true,
      dueDate: true,
      estimatePoints: true,
      number: true,
      project: { select: { workspaceId: true, key: true } },
    },
  });
  const resultingStatus = updateData.status ?? oldTask.status;
  const changedFields = [
    updateData.title !== undefined && updateData.title !== oldTask.title ? "title" : null,
    updateData.description !== undefined && updateData.description !== oldTask.description
      ? "description"
      : null,
    updateData.status !== undefined && updateData.status !== oldTask.status ? "status" : null,
    updateData.priority !== undefined && updateData.priority !== oldTask.priority
      ? "priority"
      : null,
    updateData.assigneeId !== undefined && updateData.assigneeId !== oldTask.assigneeId
      ? "assignee"
      : null,
    updateData.dueDate !== undefined &&
      (updateData.dueDate === null
        ? oldTask.dueDate !== null
        : updateData.dueDate instanceof Date &&
          updateData.dueDate.getTime() !== oldTask.dueDate?.getTime())
      ? "due date"
      : null,
    updateData.estimatePoints !== undefined &&
      updateData.estimatePoints !== oldTask.estimatePoints
      ? "estimate"
      : null,
  ].filter((field): field is string => field !== null);
  if (!changedFields.length) return { taskId };

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: {
        ...updateData,
        ...(resultingStatus === "DONE" && oldTask.status !== "DONE"
          ? { completedAt: new Date() }
          : {}),
        ...(resultingStatus !== "DONE" && oldTask.status === "DONE"
          ? { completedAt: null }
          : {}),
      },
    });
    await tx.activityLog.create({
      data: {
        workspaceId: oldTask.project.workspaceId,
        projectId: authorized.project.id,
        taskId,
        actorId: user.id,
        action: statusOnly ? "TASK_STATUS_CHANGED" : "TASK_UPDATED",
        meta: statusOnly
          ? { from: oldTask.status, to: resultingStatus }
          : {
              fields: Object.keys(updateData),
              ...(oldTask.status !== resultingStatus
                ? { status: { from: oldTask.status, to: resultingStatus } }
                : {}),
            },
      },
    });
    if (
      typeof taskValues.assigneeId === "string" &&
      taskValues.assigneeId !== oldTask.assigneeId &&
      taskValues.assigneeId !== user.id
    ) {
      const accessibleUsers = await projectAccessUserIds(
        tx,
        authorized.project.id,
        authorized.project.workspaceId,
      );
      if (accessibleUsers.has(taskValues.assigneeId)) {
        await tx.notification.create({
          data: {
            userId: taskValues.assigneeId,
            type: "TASK_ASSIGNED",
            payload: { taskId, projectId: authorized.project.id },
          },
        });
      }
    }

    const accessibleUsers = await projectAccessUserIds(
      tx,
      authorized.project.id,
      authorized.project.workspaceId,
    );
    const watchers = await tx.taskWatcher.findMany({
      where: { taskId, userId: { not: user.id } },
      select: { userId: true },
    });
    const assignedTo = typeof taskValues.assigneeId === "string" ? taskValues.assigneeId : null;
    const notificationWatchers = watchers.filter(
      ({ userId }) => userId !== assignedTo && accessibleUsers.has(userId),
    );
    if (notificationWatchers.length) {
      await tx.notification.createMany({
        data: notificationWatchers.map(({ userId }) => ({
          userId,
          type: "WATCHED_TASK_UPDATED",
          payload: {
            taskId,
            projectId: authorized.project.id,
            taskNumber: oldTask.number,
            projectKey: oldTask.project.key,
            senderName: user.name,
            body: `${user.name} updated ${oldTask.project.key}-${oldTask.number}: ${changedFields.join(", ")}.`,
          },
        })),
      });
    }
  });

  revalidatePath(taskPath(authorized.project.id));
  revalidatePath(`/projects/${authorized.project.id}/list`);
  revalidatePath(`/projects/${authorized.project.id}`);
  revalidatePath("/dashboard");
  return { taskId };
}

export async function updateTaskAction(input: unknown) {
  return updateTask(input, false);
}

export async function moveTaskAction(input: unknown) {
  return updateTask(input, true);
}

export async function addChecklistItemAction(input: unknown): Promise<TaskActionResult> {
  const parsed = checklistItemSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };

  let authorized;
  try {
    authorized = await requireTaskPermission(user.id, parsed.data.taskId, "task:edit:assigned");
  } catch (error) {
    return { error: permissionError(error) };
  }

  await prisma.$transaction(async (tx) => {
    await tx.checklistItem.create({
      data: { taskId: parsed.data.taskId, text: cleanText(parsed.data.text) },
    });
    await tx.activityLog.create({
      data: {
        workspaceId: authorized.project.workspaceId,
        projectId: authorized.project.id,
        taskId: parsed.data.taskId,
        actorId: user.id,
        action: "CHECKLIST_ITEM_ADDED",
        meta: { text: cleanText(parsed.data.text) },
      },
    });
  });
  revalidatePath(taskPath(authorized.project.id));
  return { taskId: parsed.data.taskId };
}

export async function toggleChecklistItemAction(input: unknown): Promise<TaskActionResult> {
  const parsed = toggleChecklistSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };

  let authorized;
  try {
    authorized = await requireTaskPermission(user.id, parsed.data.taskId, "task:edit:assigned");
  } catch (error) {
    return { error: permissionError(error) };
  }
  const item = await prisma.checklistItem.findFirst({
    where: { id: parsed.data.itemId, taskId: parsed.data.taskId },
    select: { id: true },
  });
  if (!item) return { error: "Checklist item not found." };

  await prisma.$transaction(async (tx) => {
    await tx.checklistItem.update({
      where: { id: item.id },
      data: { done: parsed.data.done },
    });
    await tx.activityLog.create({
      data: {
        workspaceId: authorized.project.workspaceId,
        projectId: authorized.project.id,
        taskId: parsed.data.taskId,
        actorId: user.id,
        action: parsed.data.done ? "CHECKLIST_ITEM_COMPLETED" : "CHECKLIST_ITEM_REOPENED",
        meta: { itemId: item.id },
      },
    });
  });
  revalidatePath(taskPath(authorized.project.id));
  return { taskId: parsed.data.taskId };
}

export async function deleteChecklistItemAction(input: unknown): Promise<TaskActionResult> {
  const parsed = deleteChecklistSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };

  let authorized;
  try {
    authorized = await requireTaskPermission(user.id, parsed.data.taskId, "task:edit:assigned");
  } catch (error) {
    return { error: permissionError(error) };
  }
  const item = await prisma.checklistItem.findFirst({
    where: { id: parsed.data.itemId, taskId: parsed.data.taskId },
    select: { id: true },
  });
  if (!item) return { error: "Checklist item not found." };

  await prisma.$transaction(async (tx) => {
    await tx.checklistItem.delete({ where: { id: item.id } });
    await tx.activityLog.create({
      data: {
        workspaceId: authorized.project.workspaceId,
        projectId: authorized.project.id,
        taskId: parsed.data.taskId,
        actorId: user.id,
        action: "CHECKLIST_ITEM_REMOVED",
      },
    });
  });
  revalidatePath(taskPath(authorized.project.id));
  return { taskId: parsed.data.taskId };
}

export async function addCommentAction(input: unknown): Promise<TaskActionResult> {
  const parsed = createCommentSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Your session expired. Sign in to continue." };

  let authorized;
  try {
    authorized = await requireTaskPermission(user.id, parsed.data.taskId, "task:comment");
  } catch (error) {
    return { error: permissionError(error) };
  }

  const body = cleanText(parsed.data.body);
  await prisma.$transaction(async (tx) => {
    await tx.comment.create({
      data: { taskId: parsed.data.taskId, authorId: user.id, body },
    });
    await tx.activityLog.create({
      data: {
        workspaceId: authorized.project.workspaceId,
        projectId: authorized.project.id,
        taskId: parsed.data.taskId,
        actorId: user.id,
        action: "COMMENT_ADDED",
      },
    });
    const accessibleUsers = await projectAccessUserIds(
      tx,
      authorized.project.id,
      authorized.project.workspaceId,
    );
    const watchers = await tx.taskWatcher.findMany({
      where: { taskId: parsed.data.taskId, userId: { not: user.id } },
      select: { userId: true },
    });
    const recipientTypes = new Map<string, "WATCHED_TASK_COMMENT" | "TASK_COMMENT">(
      watchers
        .filter(({ userId }) => accessibleUsers.has(userId))
        .map(({ userId }) => [userId, "WATCHED_TASK_COMMENT"] as const),
    );
    if (
      authorized.task.assigneeId &&
      authorized.task.assigneeId !== user.id &&
      accessibleUsers.has(authorized.task.assigneeId)
    ) {
      recipientTypes.set(authorized.task.assigneeId, "TASK_COMMENT");
    }
    if (recipientTypes.size) {
      await tx.notification.createMany({
        data: [...recipientTypes].map(([userId, type]) => ({
          userId,
          type,
          payload: {
            taskId: parsed.data.taskId,
            projectId: authorized.project.id,
            senderName: user.name,
            body: body.slice(0, 240),
          },
        })),
      });
    }
  });
  revalidatePath(taskPath(authorized.project.id));
  return { taskId: parsed.data.taskId };
}
