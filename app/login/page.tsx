import type { Metadata } from "next";
import { AuthShell, SignInForm } from "@/components/forms/auth-forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <AuthShell kind="login"><SignInForm nextPath={next} /></AuthShell>;
}
