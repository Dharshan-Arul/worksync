import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AttachmentPanel } from "@/components/attachments/attachment-panel";
import { ProjectWorkLayout } from "@/components/projects/project-work-layout";
import { getAuthenticatedUser } from "@/server/auth/user";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Project files" };

export default async function ProjectFilesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  if (!z.string().uuid().safeParse(projectId).success) notFound();
  const user = await getAuthenticatedUser();
  if (!user) return null;
  const context = await getWorkspaceContext(user.id);
  if (!context) return null;

  const manager = context.membership.role === "OWNER" || context.membership.role === "MANAGER";
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      workspaceId: context.workspace.id,
      ...(manager ? {} : { members: { some: { userId: user.id } } }),
    },
    include: {
      lead: { select: { name: true } },
      _count: { select: { tasks: true, members: true } },
    },
  });
  if (!project) notFound();

  const attachments = await prisma.attachment.findMany({
    where: {
      OR: [
        { projectId: project.id },
        { task: { projectId: project.id } },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: {
      uploadedBy: { select: { id: true, name: true } },
      task: { select: { number: true, project: { select: { key: true } } } },
    },
  });
  const canUpload =
    !project.archived &&
    context.membership.role !== "VIEWER" &&
    (manager || await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: project.id, userId: user.id } },
      select: { userId: true },
    }) !== null);

  return (
    <ProjectWorkLayout
      canDelete={context.membership.role === "OWNER"}
      canManage={manager && !project.archived}
      project={project}
      view="files"
    >
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <div>
          <h2 className="text-base font-semibold">Project files</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Files are private and available to members of this project.
          </p>
        </div>
        <AttachmentPanel
          attachments={attachments.map((attachment) => ({
            id: attachment.id,
            name: attachment.name,
            size: attachment.size,
            createdAt: attachment.createdAt.toISOString(),
            uploadedById: attachment.uploadedById,
            uploadedBy: { name: attachment.uploadedBy.name },
            taskLabel: attachment.task
              ? `${attachment.task.project.key}-${attachment.task.number}`
              : null,
          }))}
          canManage={manager}
          canUpload={canUpload}
          currentUserId={user.id}
          projectId={project.id}
        />
      </section>
    </ProjectWorkLayout>
  );
}
