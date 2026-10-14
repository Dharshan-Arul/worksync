import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { FirstProjectForm } from "@/components/forms/onboarding-forms";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/server/auth/user";

export const dynamic = "force-dynamic";

export default async function OnboardProjectPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const cookieStore = await cookies();
  const requestedWorkspaceId = cookieStore.get("workflow-workspace")?.value;
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id },
    select: { workspaceId: true, workspace: { select: { name: true } } },
    orderBy: { joinedAt: "asc" },
  });
  if (!memberships.length) redirect("/onboarding/workspace");

  const active =
    memberships.find(({ workspaceId }) => workspaceId === requestedWorkspaceId) ??
    memberships[0];
  return (
    <FirstProjectForm
      workspaceId={active.workspaceId}
      workspaceName={active.workspace.name}
    />
  );
}
