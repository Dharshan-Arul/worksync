import type { Metadata } from "next";
import { AuthShell, ResetPasswordForm } from "@/components/forms/auth-forms";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return <AuthShell kind="forgot"><ResetPasswordForm /></AuthShell>;
}
