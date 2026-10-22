"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { loginSchema } from "@/lib/validation";
import type { z } from "zod";

type Values = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
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
        setServerError(data.error ?? "Unable to sign in");
        return;
      }
      if (data.requiresMfa) {
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
      const response = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: mfaCode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to verify authenticator code.");
      router.push(data.redirectTo);
      router.refresh();
    } catch (reason) {
      setServerError(reason instanceof Error ? reason.message : "Unable to verify authenticator code.");
    } finally {
      setMfaBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={mfaRequired ? verifyMfa : form.handleSubmit(onSubmit)}>
      {mfaRequired ? (
        <Field label="Authenticator code">
          <TextInput autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
        </Field>
      ) : <>
        <Field label="Username / Master Code" error={form.formState.errors.username?.message}>
          <TextInput autoComplete="username" {...form.register("username")} />
        </Field>
        <Field label="Password" error={form.formState.errors.password?.message}>
          <TextInput type="password" autoComplete="current-password" {...form.register("password")} />
        </Field>
      </>}
      {serverError ? <p className="text-sm text-danger" role="alert">{serverError}</p> : null}
      <Button className="w-full" disabled={form.formState.isSubmitting || mfaBusy}>
        {mfaRequired ? (mfaBusy ? "Verifying..." : "VERIFY CODE") : (form.formState.isSubmitting ? "Signing in..." : "LOGIN")}
      </Button>
      {!mfaRequired ? <div className="space-y-3 text-sm">
        <Link className="block font-medium text-brand hover:underline" href="/customer-activation">Existing Customer? Activate Your Account</Link>
        <div className="flex items-center justify-between">
          <Link className="font-medium text-brand hover:underline" href="/forgot-password">Forgot Password?</Link>
          <Link className="font-medium text-brand hover:underline" href="/register">Register</Link>
        </div>
      </div> : <button type="button" className="w-full text-sm font-medium text-brand hover:underline" onClick={() => { setMfaRequired(false); setMfaCode(""); setServerError(""); }}>Use another account</button>}
    </form>
  );
}
