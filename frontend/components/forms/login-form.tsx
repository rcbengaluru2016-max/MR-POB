"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { loginSchema } from "@/lib/validation";
import type { z } from "zod";

type Values = z.infer<typeof loginSchema>;
const subscribeToHydration = () => () => {};

export function LoginForm() {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const passwordResetSucceeded = hydrated && new URLSearchParams(window.location.search).get('passwordReset') === 'success';
  const router = useRouter();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [serverError, setServerError] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [setupSecret, setSetupSecret] = useState("");
  const [mfaMethod, setMfaMethod] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const form = useForm<Values>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  async function onSubmit(values: Values) {
    setServerError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.code === 'ACCOUNT_INACTIVE') {
          form.reset(); setMfaRequired(false); setMfaCode(''); setSetupSecret('');
          router.replace('/account-inactive'); router.refresh(); return;
        }
        setServerError(data.error ?? "Unable to sign in");
        return;
      }
      if (data.requiresMfa) {
        setSetupSecret(data.mfaSetup ? data.secretCode ?? "" : "");
        setMfaMethod(data.mfaMethod ?? "");
        setMfaRequired(true);
        return;
      }
      if (data.requiresSecuritySetup) {
        router.push(data.redirectTo);
        router.refresh();
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      const isAdminDestination = next === "/admin" || next?.startsWith("/admin/");
      const isSuperAdminDestination = next === "/super-admin/dashboard" || next?.startsWith("/super-admin/");
      const isPortalDestination = next === "/portal" || next?.startsWith("/portal/");
      const canUseNext =
        next &&
        !next.startsWith("//") &&
        ((data.user.userType === "admin" && isAdminDestination) ||
          (data.user.userType === "super_admin" && isSuperAdminDestination) ||
          ((data.user.userType === "customer" || data.user.userType === "company" || data.user.userType === "patient") && isPortalDestination));
      form.reset();
      router.push(canUseNext ? next : data.redirectTo);
      router.refresh();
    } catch {
      setServerError("Unable to sign in. Check your connection and try again.");
    }
  }

  async function verifyMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError("");
    setMfaBusy(true);
    try {
      if (mfaMethod === 'NEW_PASSWORD_REQUIRED' && newPassword !== confirmPassword) throw new Error('Passwords do not match.');
      const response = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mfaMethod === 'NEW_PASSWORD_REQUIRED' ? { password: newPassword } : { code: mfaCode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to verify authenticator code.");
      setNewPassword(""); setConfirmPassword(""); setMfaCode("");
      if (data.requiresMfa) {
        setSetupSecret(data.mfaSetup ? data.secretCode ?? "" : "");
        setMfaMethod(data.mfaMethod ?? "");
        return;
      }
      // Next can retain this route's client state across dashboard navigation.
      // A later logout must return to a clean login form, not the old MFA step.
      setMfaRequired(false); setSetupSecret(""); setMfaMethod(""); form.reset();
      router.push(data.redirectTo);
      router.refresh();
    } catch (reason) {
      setServerError(reason instanceof Error ? reason.message : "Unable to verify authenticator code.");
    } finally {
      setMfaBusy(false);
    }
  }

  return (
    <form method="post" className="space-y-4" onSubmit={mfaRequired ? verifyMfa : form.handleSubmit(onSubmit)}>
      {passwordResetSucceeded ? <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">Your password has been reset. Sign in with your new password.</p> : null}
      {mfaRequired ? (
        <div key={mfaMethod} className="space-y-4">
        {setupSecret ? <div className="rounded-lg border border-line bg-panel p-4 text-sm"><p>Add a new account in your authenticator app using this setup key, then enter its six-digit code.</p><code className="mt-3 block break-all select-all font-mono">{setupSecret}</code></div> : null}
        {mfaMethod === 'NEW_PASSWORD_REQUIRED' ? <><p className="text-sm text-muted">Set your own private password before enrolling MFA.</p><Field label="New password"><TextInput type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} /></Field><Field label="Confirm new password"><TextInput type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></Field></> : <Field label={mfaMethod === "SMS_MFA" ? "SMS verification code" : "Authenticator code"}>
          <TextInput autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
        </Field>}
        </div>
      ) : <>
        <Field label="Username / Master Code" error={form.formState.errors.username?.message}>
          <TextInput autoComplete="username" {...form.register("username")} />
        </Field>
        <div className="space-y-1.5">
          <label htmlFor="login-password" className="block text-sm font-medium text-foreground">Password</label>
          <div className="relative">
            <TextInput id="login-password" type={passwordVisible ? "text" : "password"} autoComplete="current-password" className="pr-12" aria-invalid={Boolean(form.formState.errors.password)} aria-describedby={form.formState.errors.password ? "login-password-error" : undefined} {...form.register("password")} />
            <button type="button" aria-label={passwordVisible ? "Hide password" : "Show password"} aria-pressed={passwordVisible} aria-controls="login-password" onClick={() => setPasswordVisible((visible) => !visible)} className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-lg text-muted hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
              {passwordVisible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
          {form.formState.errors.password?.message && <span id="login-password-error" className="block text-sm text-danger">{form.formState.errors.password.message}</span>}
        </div>
      </>}
      {serverError ? <p className="text-sm text-danger" role="alert">{serverError}</p> : null}
      <Button className="w-full" disabled={!hydrated || form.formState.isSubmitting || mfaBusy}>
        {mfaRequired ? (mfaBusy ? "Verifying..." : mfaMethod === 'NEW_PASSWORD_REQUIRED' ? 'SET PASSWORD' : "VERIFY CODE") : (form.formState.isSubmitting ? "Signing in..." : "LOGIN")}
      </Button>
      {!mfaRequired ? <div className="space-y-3 text-sm">
        <Link className="block font-medium text-brand hover:underline" href="/customer-modification">Existing Customer? Modify Your Details</Link>
        <div className="flex items-center justify-between">
          <Link className="font-medium text-brand hover:underline" href="/forgot-password">Forgot Password?</Link>
          <Link className="font-medium text-brand hover:underline" href="/register">Register</Link>
        </div>
      </div> : <button type="button" className="w-full text-sm font-medium text-brand hover:underline" onClick={() => { setMfaRequired(false); setMfaCode(""); setServerError(""); }}>Use another account</button>}
    </form>
  );
}
