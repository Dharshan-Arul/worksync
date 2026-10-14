import { redirect } from "next/navigation";
import { WorkspaceOnboardingForm } from "@/components/forms/onboarding-forms";
import { getAuthenticatedUser } from "@/server/auth/user";
import { getWorkspaceContext } from "@/server/auth/workspace";

export const dynamic = "force-dynamic";

export default async function OnboardWorkspacePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const context = await getWorkspaceContext(user.id);
  if (context) redirect("/dashboard");

  return <WorkspaceOnboardingForm />;
}
