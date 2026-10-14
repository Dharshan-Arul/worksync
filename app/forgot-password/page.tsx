import type { Metadata } from "next";
import { AuthShell, ForgotPasswordForm } from "@/components/forms/auth-forms";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return <AuthShell kind="forgot"><ForgotPasswordForm /></AuthShell>;
}
