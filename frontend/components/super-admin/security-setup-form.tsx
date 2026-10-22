"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";

export function SuperAdminSecuritySetupForm({ changePasswordRequired }: {
  changePasswordRequired: boolean;
}) {
  const [secret, setSecret] = useState("");
  const [provisioningUri, setProvisioningUri] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [setupBusy, setSetupBusy] = useState(false);

  useEffect(() => {
    if (!provisioningUri) return;
    let active = true;
    QRCode.toDataURL(provisioningUri, { errorCorrectionLevel: "M", margin: 2, width: 220 })
      .then((value) => { if (active) setQrCode(value); })
      .catch(() => { if (active) setError("Unable to generate the authenticator QR code. Use the manual setup key instead."); });
    return () => { active = false; };
  }, [provisioningUri]);

  async function startMfaSetup() {
    setError("");
    setSetupBusy(true);
    try {
      const response = await fetch("/api/super-admin/security-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to start authenticator setup.");
      if (result.redirectTo) {
        window.location.replace(result.redirectTo);
        return;
      }
      setSecret(result.secret);
      setProvisioningUri(result.provisioningUri);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to start authenticator setup.");
    } finally {
      setSetupBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/super-admin/security-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", password, confirmPassword, code }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to complete security setup.");
      window.location.replace(result.redirectTo ?? "/super-admin/dashboard");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to complete security setup.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <section className="rounded-xl border border-line bg-background p-4">
        <h2 className="font-semibold text-foreground">1. Connect an authenticator</h2>
        <p className="mt-2 text-sm leading-6 text-muted">Connect an authenticator app by scanning the QR code, opening the setup link on a device with an authenticator installed, or entering the key manually.</p>
        {!provisioningUri ? (
          <Button type="button" className="mt-3" disabled={setupBusy} onClick={startMfaSetup}>
            {setupBusy ? "Starting setup…" : "Start authenticator setup"}
          </Button>
        ) : (
          <div className="mt-4 grid justify-items-start gap-3">
            {qrCode ? <Image src={qrCode} alt="Scan this QR code with your authenticator app" width={220} height={220} unoptimized className="rounded-lg border border-line bg-white p-2" /> : <p className="text-sm text-muted">Generating QR code…</p>}
            <a className="inline-flex rounded-lg border border-brand bg-white px-3 py-2 text-sm font-semibold text-brand hover:bg-brand/5" href={provisioningUri}>Open in authenticator app</a>
            <div className="w-full">
              <p className="text-xs font-medium text-muted">Manual setup key</p>
              <code className="mt-1 block overflow-x-auto rounded-lg bg-white p-3 text-sm font-semibold tracking-wider text-foreground">{secret}</code>
            </div>
          </div>
        )}
      </section>

      {changePasswordRequired ? (
        <section className="space-y-4">
          <h2 className="font-semibold text-foreground">2. Change the initial password</h2>
          <label className="grid gap-1 text-sm font-medium text-foreground">New password
            <input type="password" required minLength={12} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 rounded-lg border border-line px-3 font-normal" />
            <span className="text-xs font-normal text-muted">Use 12 or more characters, including uppercase, lowercase, a number, and a symbol.</span>
          </label>
          <label className="grid gap-1 text-sm font-medium text-foreground">Confirm new password
            <input type="password" required minLength={12} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="h-11 rounded-lg border border-line px-3 font-normal" />
          </label>
        </section>
      ) : null}

      <label className="grid gap-1 text-sm font-medium text-foreground">Authenticator verification code
        <input type="text" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} className="h-11 rounded-lg border border-line px-3 font-mono tracking-[0.3em]" />
      </label>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <Button className="w-full" disabled={busy || setupBusy || !provisioningUri}>{busy ? "Securing account…" : "Verify and continue"}</Button>
    </form>
  );
}
