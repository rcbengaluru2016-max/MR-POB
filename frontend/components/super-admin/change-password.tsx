"use client";

import { useState, type FormEvent } from "react";

type Stage = "closed" | "challenge" | "verify" | "password" | "done";

export function ChangeSuperAdminPassword({ backend = false }: { backend?: boolean }) {
  const [stage, setStage] = useState<Stage>("closed");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [proof, setProof] = useState("");

  function close() { setStage("closed"); setCode(""); setCurrentPassword(""); setChallengeId(""); setProof(""); setError(""); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    const action = stage === "challenge" ? "challenge" : stage === "verify" ? "verify" : "update";
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");
    if (action === 'update' && password !== confirmPassword) { setError('Passwords do not match.'); setBusy(false); return; }
    const payload = backend
      ? action === 'challenge' ? { currentPassword } : action === 'verify' ? { challengeId, code } : { currentPassword, password, confirmPassword, stepUpProof: proof }
      : action === 'verify' ? { action, code } : { action, password, confirmPassword };
    try {
      const url = backend ? `/api/account/me/change-password${action === 'update' ? '' : `/${action}`}` : "/api/super-admin/account/change-password";
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { error?: string; verified?: boolean; ok?: boolean; challengeId?: string; stepUpProof?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to change password.");
      if (action === 'challenge' && data.challengeId) { setChallengeId(data.challengeId); setStage('verify'); }
      else if (action === "verify" && (data.verified || data.stepUpProof)) { setProof(data.stepUpProof ?? ''); setCode(""); setStage("password"); }
      else if (action === "update" && data.ok) {
        setCurrentPassword(''); setProof(''); setStage("done");
        setNotice(backend ? "Your password has been changed successfully. Please sign in again using your new password." : "Your password has been updated successfully.");
        if (backend) window.setTimeout(() => window.location.replace('/login'), 2500);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to change password.");
    } finally { setBusy(false); }
  }

  const inputClass = "h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

  return <div className="mt-5 border-t border-line pt-5">
    {stage === "closed" && <button type="button" onClick={() => { setStage(backend ? "challenge" : "verify"); setError(""); }} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-foreground hover:border-brand hover:text-brand">Change Password</button>}
    {stage === 'challenge' && <form onSubmit={(event) => void submit(event)} className="max-w-md space-y-3">
      <h3 className="font-semibold text-foreground">Verify your identity</h3>
      <p className="text-sm text-muted">Enter your current password to start a fresh authenticator challenge.</p>
      <label className="grid gap-1 text-sm font-medium text-foreground">Current password<input className={inputClass} type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} maxLength={256} required /></label>
      <button disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Starting…' : 'Continue'}</button>
      <button type="button" onClick={close} className="ml-2 rounded-lg border border-line px-4 py-2 text-sm font-semibold">Cancel</button>
    </form>}
    {stage === "verify" && <form onSubmit={(event) => void submit(event)} className="max-w-md space-y-3">
      <h3 className="font-semibold text-foreground">Verify your identity</h3>
      <p className="text-sm text-muted">Enter your current authenticator code to continue.</p>
      <label className="grid gap-1 text-sm font-medium text-foreground">Authenticator code<input className={inputClass} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required /></label>
      <div className="flex gap-2"><button disabled={busy || code.length !== 6} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Verifying…" : "Verify and continue"}</button><button type="button" onClick={close} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold">Cancel</button></div>
    </form>}
    {stage === "password" && <form onSubmit={(event) => void submit(event)} className="max-w-md space-y-3">
      <h3 className="font-semibold text-foreground">Set a new password</h3>
      <label className="grid gap-1 text-sm font-medium text-foreground">New password<input className={inputClass} name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
      <label className="grid gap-1 text-sm font-medium text-foreground">Confirm new password<input className={inputClass} name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
      <p className="text-xs text-muted">Use at least 12 characters, including uppercase, lowercase, a number, and a symbol. Your existing password is never displayed.</p>
      <div className="flex gap-2"><button disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Updating…" : "Update Password"}</button><button type="button" onClick={close} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold">Cancel</button></div>
    </form>}
    {stage === "done" && <div role="status" className="flex flex-wrap items-center gap-3"><p className="text-sm font-semibold text-emerald-700">{notice}</p>{!backend && <button type="button" onClick={close} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold">Done</button>}</div>}
    {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
  </div>;
}
