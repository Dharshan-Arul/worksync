"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/server/auth/user";

const workspaceIdSchema = z.string().uuid();

export async function setActiveWorkspaceAction(formData: FormData) {
  const parsed = workspaceIdSchema.safeParse(formData.get("workspaceId"));
  if (!parsed.success) throw new Error("Choose a valid workspace.");

  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: parsed.data, userId: user.id } },
    select: { workspaceId: true },
  });
  if (!membership) throw new Error("You do not belong to that workspace.");

  const cookieStore = await cookies();
  cookieStore.set("workflow-workspace", membership.workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect("/dashboard");
}
