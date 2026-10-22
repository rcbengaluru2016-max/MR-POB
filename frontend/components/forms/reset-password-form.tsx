"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

export function ResetPasswordForm({ token }: { token: string }) {
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: data.get("password"), confirmPassword: data.get("confirmPassword") }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Unable to reset password."); setComplete(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to reset password."); }
    finally { setBusy(false); }
  }
  return <section className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-lg sm:p-8"><h1 className="text-2xl font-semibold">Set a new password</h1>{complete ? <><p className="mt-3 text-sm text-muted">Your password has been updated. Existing MFA requirements remain in place.</p><Link href="/login" className="mt-5 inline-flex rounded-lg bg-brand px-4 py-2 font-semibold text-white">Back to Login</Link></> : <form onSubmit={(event) => void submit(event)} className="mt-5 grid gap-4"><p className="text-sm text-muted">Choose a strong password with at least 12 characters, uppercase and lowercase letters, a number, and a symbol.</p><label className="grid gap-1 text-sm font-medium">New password<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="h-11 rounded-lg border border-line px-3" /></label><label className="grid gap-1 text-sm font-medium">Confirm new password<input name="confirmPassword" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="h-11 rounded-lg border border-line px-3" /></label>{error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}<button disabled={busy || !token} className="h-11 rounded-lg bg-brand font-semibold text-white disabled:opacity-50">{busy ? "Updating…" : "Update Password"}</button>{!token ? <p className="text-sm text-danger">This reset link is missing a token.</p> : null}</form>}</section>;
}
