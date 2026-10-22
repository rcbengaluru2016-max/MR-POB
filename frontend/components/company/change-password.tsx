"use client";

import { useState, type FormEvent } from "react";

export function CompanyChangePassword({ mfaRequired }: { mfaRequired: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/company/account/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: String(form.get("currentPassword") ?? ""), newPassword: String(form.get("newPassword") ?? ""), confirmPassword: String(form.get("confirmPassword") ?? ""), ...(mfaRequired ? { code: String(form.get("code") ?? "") } : {}) }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to change password.");
      setOpen(false); setNotice("Your password has been changed successfully.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to change password."); }
    finally { setBusy(false); }
  }

  const inputClass = "h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";
  return <div className="mt-5 border-t border-line pt-5">
    {notice && <p role="status" className="mb-3 text-sm font-semibold text-emerald-700">{notice}</p>}
    <button type="button" onClick={() => { setError(""); setOpen(true); }} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-foreground hover:border-brand hover:text-brand">Change Password</button>
    {open && <div className="company-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
      <section className="company-modal" role="dialog" aria-modal="true" aria-labelledby="company-password-title">
        <div className="company-modal-heading"><div><h2 id="company-password-title">Change Password</h2><p>Verify your current credentials and choose a secure new password.</p></div><button type="button" className="company-modal-close" aria-label="Close" disabled={busy} onClick={() => setOpen(false)}>×</button></div>
        <form onSubmit={(event) => void submit(event)} className="grid gap-4">
          <label className="grid gap-1 text-sm font-medium text-foreground">Current Password *<input className={inputClass} name="currentPassword" type="password" autoComplete="current-password" required /></label>
          <label className="grid gap-1 text-sm font-medium text-foreground">New Password *<input className={inputClass} name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
          <label className="grid gap-1 text-sm font-medium text-foreground">Confirm New Password *<input className={inputClass} name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
          {mfaRequired && <label className="grid gap-1 text-sm font-medium text-foreground">Authenticator Code *<input className={inputClass} name="code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required /></label>}
          <p className="text-xs text-muted">Use at least 12 characters with uppercase and lowercase letters, a number, and a symbol. Passwords are never displayed or stored in plain text.</p>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div className="company-modal-actions"><button className="company-secondary-button" type="button" disabled={busy} onClick={() => { setOpen(false); setError(""); }}>Cancel</button><button className="company-primary-button" type="submit" disabled={busy}>{busy ? "Changing…" : "Change Password"}</button></div>
        </form>
      </section>
    </div>}
  </div>;
}
