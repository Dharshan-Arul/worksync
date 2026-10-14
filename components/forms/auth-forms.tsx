"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Workflow } from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validation";
import {
  requestPasswordResetAction,
  signInAction,
  signInWithGoogleAction,
  signUpAction,
  updatePasswordAction,
} from "@/server/actions/auth";
import type { z } from "zod";

type AuthKind = "login" | "signup" | "forgot";

export function AuthShell({
  kind,
  children,
}: {
  kind: AuthKind;
  children: ReactNode;
}) {
  const title =
    kind === "signup" ? "Create your account" : kind === "forgot" ? "Reset your password" : "Welcome back";
  const description =
    kind === "signup"
      ? "Start planning better work with your team."
      : kind === "forgot"
        ? "We’ll send you a secure password reset link."
        : "Sign in to pick up where your team left off.";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-[420px]">
        <Link className="mb-8 flex items-center justify-center gap-2.5 text-lg font-semibold tracking-tight" href="/">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Workflow aria-hidden="true" className="size-5" />
          </span>
          Workflow
        </Link>
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <h1 className="text-center text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">{description}</p>
          <div className="mt-7">{children}</div>
        </section>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Secure sign-in powered by Supabase
        </p>
      </div>
    </main>
  );
}

export function SignInForm({ nextPath }: { nextPath?: string }) {
  const [serverError, setServerError] = useState("");
  const [isPending, startTransition] = useTransition();
  const form = useForm<z.infer<typeof signInSchema>>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "", next: nextPath },
  });

  function submit(values: z.infer<typeof signInSchema>) {
    setServerError("");
    startTransition(async () => {
      const result = await signInAction({ ...values, next: nextPath });
      if (result.error) setServerError(result.error);
    });
  }

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(submit)} noValidate>
      {nextPath && <input type="hidden" {...form.register("next")} />}
      <div>
        <label className="form-label" htmlFor="email">Email address</label>
        <input
          autoComplete="email"
          className="form-control"
          id="email"
          type="email"
          {...form.register("email")}
        />
        {form.formState.errors.email && <FieldError>{form.formState.errors.email.message}</FieldError>}
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="form-label mb-0" htmlFor="password">Password</label>
          <Link className="text-xs font-medium text-primary hover:underline" href="/forgot-password">
            Forgot password?
          </Link>
        </div>
        <input
          autoComplete="current-password"
          className="form-control"
          id="password"
          type="password"
          {...form.register("password")}
        />
        {form.formState.errors.password && <FieldError>{form.formState.errors.password.message}</FieldError>}
      </div>
      {serverError && <FormNotice>{serverError}</FormNotice>}
      <Button className="h-11 w-full" disabled={isPending} type="submit">
        {isPending ? "Signing in..." : "Sign in"}
      </Button>
      <GoogleButton nextPath={nextPath} />
      <p className="pt-2 text-center text-sm text-muted-foreground">
        New to Workflow?{" "}
        <Link className="font-medium text-primary hover:underline" href={nextPath ? `/signup?next=${encodeURIComponent(nextPath)}` : "/signup"}>Create an account</Link>
      </p>
    </form>
  );
}

export function SignUpForm({ nextPath }: { nextPath?: string }) {
  const [serverError, setServerError] = useState("");
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();
  const form = useForm<z.infer<typeof signUpSchema>>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "", next: nextPath },
  });

  function submit(values: z.infer<typeof signUpSchema>) {
    setServerError("");
    setNotice("");
    startTransition(async () => {
      const result = await signUpAction({ ...values, next: nextPath });
      if (result.error) setServerError(result.error);
      if (result.message) setNotice(result.message);
    });
  }

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(submit)} noValidate>
      {nextPath && <input type="hidden" {...form.register("next")} />}
      <div>
        <label className="form-label" htmlFor="name">Your name</label>
        <input autoComplete="name" className="form-control" id="name" {...form.register("name")} />
        {form.formState.errors.name && <FieldError>{form.formState.errors.name.message}</FieldError>}
      </div>
      <div>
        <label className="form-label" htmlFor="email">Work email</label>
        <input autoComplete="email" className="form-control" id="email" type="email" {...form.register("email")} />
        {form.formState.errors.email && <FieldError>{form.formState.errors.email.message}</FieldError>}
      </div>
      <div>
        <label className="form-label" htmlFor="password">Password</label>
        <input
          autoComplete="new-password"
          className="form-control"
          id="password"
          type="password"
          {...form.register("password")}
        />
        {form.formState.errors.password && <FieldError>{form.formState.errors.password.message}</FieldError>}
      </div>
      {serverError && <FormNotice>{serverError}</FormNotice>}
      {notice && <FormNotice success>{notice}</FormNotice>}
      <Button className="h-11 w-full" disabled={isPending} type="submit">
        {isPending ? "Creating account..." : "Create account"}
      </Button>
      <GoogleButton />
      <p className="pt-2 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link className="font-medium text-primary hover:underline" href={nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login"}>Sign in</Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [serverError, setServerError] = useState("");
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();
  const form = useForm<z.infer<typeof forgotPasswordSchema>>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  function submit(values: z.infer<typeof forgotPasswordSchema>) {
    setServerError("");
    setNotice("");
    startTransition(async () => {
      const result = await requestPasswordResetAction(values);
      if (result.error) setServerError(result.error);
      if (result.message) setNotice(result.message);
    });
  }

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(submit)} noValidate>
      <div>
        <label className="form-label" htmlFor="email">Email address</label>
        <input autoComplete="email" className="form-control" id="email" type="email" {...form.register("email")} />
        {form.formState.errors.email && <FieldError>{form.formState.errors.email.message}</FieldError>}
      </div>
      {serverError && <FormNotice>{serverError}</FormNotice>}
      {notice && <FormNotice success>{notice}</FormNotice>}
      <Button className="h-11 w-full" disabled={isPending} type="submit">
        {isPending ? "Sending link..." : "Send reset link"}
      </Button>
      <Link className="flex items-center justify-center gap-1.5 pt-2 text-sm font-medium text-primary hover:underline" href="/login">
        <ArrowLeft aria-hidden="true" className="size-3.5" />
        Back to sign in
      </Link>
    </form>
  );
}

export function ResetPasswordForm() {
  const [serverError, setServerError] = useState("");
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();
  const form = useForm<z.infer<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "" },
  });

  function submit(values: z.infer<typeof resetPasswordSchema>) {
    setServerError("");
    setNotice("");
    startTransition(async () => {
      const result = await updatePasswordAction(values);
      if (result.error) setServerError(result.error);
      if (result.message) setNotice(result.message);
    });
  }

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(submit)} noValidate>
      <div>
        <label className="form-label" htmlFor="password">New password</label>
        <input
          autoComplete="new-password"
          className="form-control"
          id="password"
          type="password"
          {...form.register("password")}
        />
        {form.formState.errors.password && <FieldError>{form.formState.errors.password.message}</FieldError>}
      </div>
      {serverError && <FormNotice>{serverError}</FormNotice>}
      {notice && <FormNotice success>{notice}</FormNotice>}
      <Button className="h-11 w-full" disabled={isPending} type="submit">
        {isPending ? "Updating password..." : "Update password"}
      </Button>
    </form>
  );
}

function GoogleButton({ nextPath }: { nextPath?: string }) {
  const [serverError, setServerError] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
        <div className="relative flex justify-center"><span className="bg-card px-3 text-xs text-muted-foreground">or continue with</span></div>
      </div>
      <Button
        className="h-11 w-full"
        disabled={isPending}
        onClick={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await signInWithGoogleAction({ next: nextPath });
            if (result?.error) setServerError(result.error);
          });
        }}
        type="button"
        variant="outline"
      >
        <GoogleMark />
        Continue with Google
      </Button>
      {serverError && <FormNotice>{serverError}</FormNotice>}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 48 48">
      <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.7h11c-.5 2.5-2 4.7-4.2 6.1v5h6.8c4-3.7 6-8.7 6-14.7Z" />
      <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.8-5c-1.9 1.3-4.1 2-6.7 2-5.2 0-9.6-3.5-11.2-8.2H5.8v5.2C9.2 39.7 16 44 24 44Z" />
      <path fill="#FBBC05" d="M12.8 28a12 12 0 0 1 0-7.9v-5.2H5.8a20 20 0 0 0 0 18.3l7-5.2Z" />
      <path fill="#EA4335" d="M24 11.9c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 6 29.5 4 24 4 16 4 9.2 8.3 5.8 14.9l7 5.2c1.6-4.7 6-8.2 11.2-8.2Z" />
    </svg>
  );
}

function FieldError({ children }: { children?: ReactNode }) {
  return <p className="mt-1 text-xs font-medium text-destructive" role="alert">{children}</p>;
}

function FormNotice({ children, success = false }: { children: ReactNode; success?: boolean }) {
  return (
    <p
      className={`rounded-lg border px-3 py-2.5 text-sm ${
        success
          ? "border-emerald-600/20 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
          : "border-destructive/20 bg-destructive/10 text-destructive"
      }`}
      role="status"
    >
      {children}
    </p>
  );
}
