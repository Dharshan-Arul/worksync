import "server-only";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const email = user.email;
  if (!email) return null;

  return prisma.user.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      email,
      name:
        (typeof user.user_metadata.name === "string" && user.user_metadata.name) ||
        email.split("@")[0],
      avatarUrl:
        typeof user.user_metadata.avatar_url === "string"
          ? user.user_metadata.avatar_url
          : null,
    },
    update: {
      email,
      ...(typeof user.user_metadata.name === "string"
        ? { name: user.user_metadata.name }
        : {}),
      ...(typeof user.user_metadata.avatar_url === "string"
        ? { avatarUrl: user.user_metadata.avatar_url }
        : {}),
    },
  });
}
