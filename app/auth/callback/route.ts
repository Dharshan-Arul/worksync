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

      if (user?.email) {
        await prisma.user.upsert({
          where: { id: user.id },
          create: {
            id: user.id,
            email: user.email,
            name:
              (typeof user.user_metadata.name === "string" && user.user_metadata.name) ||
              user.email.split("@")[0],
            avatarUrl:
              typeof user.user_metadata.avatar_url === "string"
                ? user.user_metadata.avatar_url
                : null,
          },
          update: {
            email: user.email,
            ...(typeof user.user_metadata.name === "string"
              ? { name: user.user_metadata.name }
              : {}),
          },
        });
      }

      const requestedPath = safeNextPath(request.nextUrl.searchParams.get("next"));
      const hasWorkspace = user
        ? await prisma.workspaceMember.count({ where: { userId: user.id } })
        : 0;
      const destination = requestedPath ?? (hasWorkspace ? "/dashboard" : "/onboarding/workspace");
      return NextResponse.redirect(new URL(destination, request.url));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth", request.url));
}
