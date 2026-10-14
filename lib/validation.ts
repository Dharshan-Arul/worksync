import { z } from "zod";
import { isSafeInternalPath } from "@/lib/safe-path";
import { ATTACHMENT_CONTENT_TYPES, MAX_ATTACHMENT_SIZE } from "@/lib/attachments";

const calendarDateSchema = z.string().refine(
  (value) => {
    if (!value) return true;
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  },
  "Enter a valid date.",
);

export const signUpSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters").max(128),
  next: z.string().refine(isSafeInternalPath, "Choose a valid destination.").optional(),
});

export const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password").max(128),
  next: z.string().refine(isSafeInternalPath, "Choose a valid destination.").optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8, "Use at least 8 characters").max(128),
});

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2, "Workspace name is too short").max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Workspace URL must be at least 2 characters")
    .max(48)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens"),
});

export const createProjectSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().trim().min(2, "Project name is too short").max(100),
  key: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, "Project key must be at least 2 characters")
    .max(10)
    .regex(/^[A-Z][A-Z0-9]*$/, "Use letters and numbers, starting with a letter"),
  description: z.string().trim().max(2000).optional().transform((value) => value ?? ""),
});

export const updateProjectSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(2, "Project name is too short").max(100),
  key: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, "Project key must be at least 2 characters")
    .max(10)
    .regex(/^[A-Z][A-Z0-9]*$/, "Use letters and numbers, starting with a letter"),
  description: z.string().trim().max(2000),
  status: z.enum(["ON_TRACK", "AT_RISK", "OFF_TRACK", "COMPLETED"]),
  dueDate: calendarDateSchema.optional(),
});

export const taskStatusSchema = z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]);
export const taskPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const createTaskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(2, "Task title is too short").max(200),
  description: z.string().trim().max(10000).default(""),
  status: taskStatusSchema.default("TODO"),
  priority: taskPrioritySchema.default("MEDIUM"),
  assigneeId: z.string().uuid().optional().or(z.literal("")),
  dueDate: calendarDateSchema.optional(),
  estimatePoints: z.number().int().min(0).max(100).optional(),
});

export const updateTaskSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(10000).optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  dueDate: calendarDateSchema.nullable().optional(),
  estimatePoints: z.number().int().min(0).max(100).nullable().optional(),
}).refine(
  (value) => Object.keys(value).some((key) => key !== "taskId"),
  "Choose at least one task field to update.",
);

export const moveTaskSchema = z.object({
  taskId: z.string().uuid(),
  status: taskStatusSchema,
});

export const checklistItemSchema = z.object({
  taskId: z.string().uuid(),
  text: z.string().trim().min(1).max(240),
});

export const toggleChecklistSchema = z.object({
  taskId: z.string().uuid(),
  itemId: z.string().uuid(),
  done: z.boolean(),
});

export const deleteChecklistSchema = z.object({
  taskId: z.string().uuid(),
  itemId: z.string().uuid(),
});

export const createCommentSchema = z.object({
  taskId: z.string().uuid(),
  body: z.string().trim().min(1, "Comment can't be empty").max(5000),
});

export const attachmentUploadSchema = z.object({
  taskId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(255),
  size: z.number().int().positive().max(MAX_ATTACHMENT_SIZE),
  contentType: z.enum(ATTACHMENT_CONTENT_TYPES),
}).refine((value) => Boolean(value.taskId) !== Boolean(value.projectId), {
  message: "Choose exactly one task or project.",
});

export const attachmentIdSchema = z.string().uuid();
export const watchTaskSchema = z.object({
  taskId: z.string().uuid(),
  watching: z.boolean(),
});

export const projectMutationSchema = z.object({
  projectId: z.string().uuid(),
});

export const inviteMemberSchema = z.object({
  workspaceId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  role: z.enum(["MANAGER", "MEMBER", "VIEWER"]),
});

export const createInviteLinkSchema = z.object({
  workspaceId: z.string().uuid(),
});

export const invitationTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const changeMemberRoleSchema = z.object({
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(["MANAGER", "MEMBER", "VIEWER"]),
});

export const removeMemberSchema = z.object({
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
});

export const revokeInvitationSchema = z.object({
  workspaceId: z.string().uuid(),
  invitationId: z.string().uuid(),
});

export const setProjectMemberSchema = z.object({
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  isMember: z.boolean(),
});

export const createSprintSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(2, "Sprint name is too short").max(100),
  goal: z.string().trim().max(1000).default(""),
  startDate: calendarDateSchema,
  endDate: calendarDateSchema,
}).refine(
  (value) => value.startDate <= value.endDate,
  { message: "Sprint end date must be on or after its start date.", path: ["endDate"] },
);

export const sprintMutationSchema = z.object({
  projectId: z.string().uuid(),
  sprintId: z.string().uuid(),
});

export const moveTaskToSprintSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  sprintId: z.string().uuid().nullable(),
});

export const setSprintCapacitySchema = z.object({
  projectId: z.string().uuid(),
  sprintId: z.string().uuid(),
  userId: z.string().uuid(),
  capacityPoints: z.number().int().min(0).max(500),
});

export const channelIdSchema = z.string().uuid();

export const createDirectChannelSchema = z.object({
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
});

export const createTaskChannelSchema = z.object({
  taskId: z.string().uuid(),
});

export const sendMessageSchema = z.object({
  channelId: z.string().uuid(),
  body: z.string().trim().min(1, "Message can't be empty").max(5000),
});

export const messagePageSchema = z.object({
  channelId: z.string().uuid(),
  before: z.string().datetime().optional(),
});

export const notificationFilterSchema = z.enum(["ALL", "UNREAD", "MENTIONS", "ASSIGNED"]);

export const globalSearchSchema = z.object({
  query: z.string().trim().min(1).max(100),
});

export const markNotificationReadSchema = z.object({
  notificationId: z.string().uuid(),
});

export function parseOptionalDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}
