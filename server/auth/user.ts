
import "server-only";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) return null;

  const email = user.email;
  const name =
    (typeof user.user_metadata.name === "string" &&
      user.user_metadata.name) ||
    email.split("@")[0];

  const avatarUrl =
    typeof user.user_metadata.avatar_url === "string"
      ? user.user_metadata.avatar_url
      : null;

  // Find the existing database account by email first.
  const existingByEmail = await prisma.user.findUnique({
    where: { email },
  });

  if (existingByEmail) {
    if (existingByEmail.id === user.id) {
      return prisma.user.update({
        where: { id: user.id },
        data: { name, avatarUrl },
      });
    }

    // Preserve the existing ID and its database relationships.
    return existingByEmail;
  }

  const existingById = await prisma.user.findUnique({
    where: { id: user.id },
  });

  if (existingById) {
    return prisma.user.update({
      where: { id: user.id },
      data: { email, name, avatarUrl },
    });
  }

  return prisma.user.create({
    data: {
      id: user.id,
      email,
      name,
      avatarUrl,
    },
  });
}
