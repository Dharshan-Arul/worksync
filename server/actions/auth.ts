"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validation";
import { getAuthenticatedUser } from "@/server/auth/user";
import { isSafeInternalPath } from "@/lib/safe-path";

export type AuthActionResult = { error?: string; message?: string };

function siteUrl() {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) throw new Error("Set NEXT_PUBLIC_SITE_URL in .env.local.");
  return url.replace(/\/$/, "");
}

function validationError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Please check your details and try again.";
}

async function firstWorkspacePath(userId: string) {
  const workspaces = await prisma.workspaceMember.findMany({
    where: { userId },
    select: { workspaceId: true },
    take: 1,
  });
  return workspaces.length ? "/dashboard" : "/onboarding/workspace";
}

export async function signUpAction(input: unknown): Promise<AuthActionResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { name: parsed.data.name },
      emailRedirectTo: `${siteUrl()}/auth/callback${parsed.data.next ? `?next=${encodeURIComponent(parsed.data.next)}` : ""}`,
    },
  });

  if (error) return { error: "We couldn't create your account. Check your details and try again." };

  if (data.user && data.session) {
    await getAuthenticatedUser();
    redirect(parsed.data.next ?? "/onboarding/workspace");
  }

  return { message: "Check your email to confirm your account, then sign in." };
}

export async function signInAction(input: unknown): Promise<AuthActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) return { error: "Incorrect email or password." };

  const user = await getAuthenticatedUser();
  if (!user) return { error: "We couldn't load your account. Please try again." };

  redirect(parsed.data.next ?? await firstWorkspacePath(user.id));
}

export async function signInWithGoogleAction(input?: unknown): Promise<AuthActionResult> {
  const parsed = z.object({
    next: z.string().refine(isSafeInternalPath, "Choose a valid destination.").optional(),
  }).safeParse(input ?? {});
  if (!parsed.success) return { error: validationError(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${siteUrl()}/auth/callback${parsed.data.next ? `?next=${encodeURIComponent(parsed.data.next)}` : ""}`,
    },
  });

  if (error || !data.url) {
    return { error: "Google sign-in is unavailable. Please try email and password." };
  }

  redirect(data.url);
}

export async function requestPasswordResetAction(
  input: unknown,
): Promise<AuthActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
  });

  if (error) return { error: "We couldn't send a reset link. Please try again shortly." };

  return { message: "If an account exists for that email, a reset link is on its way." };
}

export async function updatePasswordAction(input: unknown): Promise<AuthActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { error: "Your reset link is invalid or has expired." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "We couldn't update your password. Request a new reset link." };

  redirect("/");
}

export async function signOutAction() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error("We couldn't sign you out. Please try again.");
  redirect("/login");
}
