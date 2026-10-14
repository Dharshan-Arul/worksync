import type { Metadata } from "next";
import { AuthShell, SignUpForm } from "@/components/forms/auth-forms";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <AuthShell kind="signup"><SignUpForm nextPath={next} /></AuthShell>;
}
