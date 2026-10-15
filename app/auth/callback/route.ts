
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { isSafeInternalPath } from "@/lib/safe-path";

function safeNextPath(path: string | null) {
  return path && isSafeInternalPath(path) ? path : null;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let dbUser = null;

      if (user?.email) {
        const email = user.email;
        const name =
          (typeof user.user_metadata.name === "string" &&
            user.user_metadata.name) ||
          email.split("@")[0];

        const avatarUrl =
          typeof user.user_metadata.avatar_url === "string"
            ? user.user_metadata.avatar_url
            : null;

        // Check email first to avoid a unique-email conflict.
        dbUser = await prisma.user.findUnique({
          where: { email },
        });

        if (dbUser) {
          if (dbUser.id === user.id) {
            dbUser = await prisma.user.update({
              where: { id: user.id },
              data: { name, avatarUrl },
            });
          }
          // Preserve the existing ID if other records may reference it.
        } else {
          const existingById = await prisma.user.findUnique({
            where: { id: user.id },
          });

          if (existingById) {
            dbUser = await prisma.user.update({
              where: { id: user.id },
              data: { email, name, avatarUrl },
            });
          } else {
            dbUser = await prisma.user.create({
              data: {
                id: user.id,
                email,
                name,
                avatarUrl,
              },
            });
          }
        }
      }

      const requestedPath = safeNextPath(
        request.nextUrl.searchParams.get("next")
      );

      const hasWorkspace = dbUser
        ? await prisma.workspaceMember.count({
            where: { userId: dbUser.id },
          })
        : 0;

      const destination =
        requestedPath ??
        (hasWorkspace ? "/dashboard" : "/onboarding/workspace");

      return NextResponse.redirect(new URL(destination, request.url));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth", request.url));
}
