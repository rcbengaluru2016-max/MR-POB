"use client";

import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";
import { createPasswordRecoveryClient, RecoveryError, recoveryIdentitySchema, recoveryOtpSchema, recoveryPasswordSchema, type RecoveryChallenge, type RecoveryGrant } from "@/lib/auth/password-recovery";

const recovery = createPasswordRecoveryClient({
  requestOtp: process.env.NEXT_PUBLIC_PASSWORD_RECOVERY_REQUEST_URL,
  verifyOtp: process.env.NEXT_PUBLIC_PASSWORD_RECOVERY_VERIFY_URL,
  resetPassword: process.env.NEXT_PUBLIC_PASSWORD_RECOVERY_RESET_URL,
});
type Stage = { kind: "identity" } | { kind: "otp"; challenge: RecoveryChallenge } | { kind: "password"; grant: RecoveryGrant } | { kind: "complete" };
type Errors = Partial<Record<"identifier" | "mobile" | "otp" | "password" | "confirmPassword", string>>;

function PasswordField({ id, label, value, error, disabled, onChange }: { id: string; label: string; value: string; error?: string; disabled: boolean; onChange: (value: string) => void }) {
  const [visible, setVisible] = useState(false);
  return <div className="space-y-1.5">
    <label htmlFor={id} className="block text-sm font-medium text-foreground">{label}</label>
    <div className="relative">
      <TextInput id={id} name={id} type={visible ? "text" : "password"} autoComplete="new-password" required minLength={12} maxLength={128} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="pr-12" aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : "recovery-password-hint"} />
      <button type="button" disabled={disabled} aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`} aria-pressed={visible} aria-controls={id} onClick={() => setVisible((current) => !current)} className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-lg text-muted hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50">{visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>
    </div>
    {error && <p id={`${id}-error`} className="text-sm text-danger">{error}</p>}
  </div>;
}

export function ForgotPasswordForm() {
  const [stage, setStage] = useState<Stage>({ kind: "identity" });
  const [identifier, setIdentifier] = useState("");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [retryUntil, setRetryUntil] = useState(0);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearInterval(timer); inFlight.current?.abort(); };
  }, []);

  useEffect(() => {
    const id = stage.kind === "otp" ? "recovery-otp" : stage.kind === "password" ? "recovery-new-password" : null;
    if (id) document.getElementById(id)?.focus();
  }, [stage.kind]);

  useEffect(() => {
    const first = Object.keys(errors)[0] as keyof Errors | undefined;
    const ids = { identifier: "recovery-identifier", mobile: "recovery-mobile", otp: "recovery-otp", password: "recovery-new-password", confirmPassword: "recovery-confirm-password" };
    if (first) document.getElementById(ids[first])?.focus();
  }, [errors]);

  const cooldown = Math.max(0, Math.ceil((Math.max(resendAt, retryUntil) - now) / 1000));
  const throttled = retryUntil > now;
  const expired = (stage.kind === "otp" || stage.kind === "password") && now >= Date.parse(stage.kind === "otp" ? stage.challenge.expiresAt : stage.grant.expiresAt);

  function validation(issues: { path: PropertyKey[]; message: string }[]) {
    const fields: Errors = {};
    for (const issue of issues) { const key = issue.path[0] as keyof Errors; if (!fields[key]) fields[key] = issue.message; }
    setErrors(fields);
  }

  async function perform(action: (signal: AbortSignal) => Promise<void>) {
    if (inFlight.current || throttled) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setBusy(true); setError(""); setErrors({});
    try { await action(controller.signal); }
    catch (reason) {
      if (controller.signal.aborted) return;
      setError(reason instanceof RecoveryError ? reason.message : "Unable to connect to password recovery. Check your connection and try again.");
      if (reason instanceof RecoveryError && reason.retryAfterSeconds) { setNow(Date.now()); setRetryUntil(Date.now() + reason.retryAfterSeconds * 1000); }
    } finally {
      if (!controller.signal.aborted) { inFlight.current = null; setBusy(false); }
    }
  }

  async function sendOtp() {
    const identity = recoveryIdentitySchema.safeParse({ identifier, mobile });
    if (!identity.success) { validation(identity.error.issues); return; }
    if (stage.kind === "otp" && cooldown > 0) return;
    await perform(async (signal) => {
      const challenge = await recovery.requestOtp(identity.data, signal);
      if (signal.aborted) return;
      setNow(Date.now()); setResendAt(Date.now() + challenge.resendAfterSeconds * 1000);
      setOtp(""); setStage({ kind: "otp", challenge });
    });
  }

  async function verifyOtp() {
    if (stage.kind !== "otp" || expired) return;
    const code = recoveryOtpSchema.safeParse(otp);
    if (!code.success) { setErrors({ otp: code.error.issues[0].message }); return; }
    await perform(async (signal) => {
      const grant = await recovery.verifyOtp(stage.challenge, code.data, signal);
      if (signal.aborted) return;
      setOtp(""); setPassword(""); setConfirmPassword(""); setNow(Date.now()); setStage({ kind: "password", grant });
    });
  }

  async function resetPassword() {
    if (stage.kind !== "password" || expired) return;
    const values = recoveryPasswordSchema.safeParse({ password, confirmPassword });
    if (!values.success) { validation(values.error.issues); return; }
    await perform(async (signal) => {
      await recovery.resetPassword(stage.grant, values.data, signal);
      if (signal.aborted) return;
      setPassword(""); setConfirmPassword(""); setIdentifier(""); setMobile(""); setStage({ kind: "complete" });
    });
  }

  function startAgain() {
    if (busy) return;
    setStage({ kind: "identity" }); setOtp(""); setPassword(""); setConfirmPassword(""); setError(""); setErrors({});
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stage.kind === "identity") void sendOtp();
    else if (stage.kind === "otp") void verifyOtp();
    else if (stage.kind === "password") void resetPassword();
  }

  if (stage.kind === "complete") return <div className="space-y-4"><p role="status" className="text-sm text-success">Your password has been reset successfully.</p><Link href="/login" className="block rounded-lg bg-brand px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-brand-dark">Back to Login</Link></div>;

  return <form className="space-y-4" onSubmit={submit} noValidate aria-busy={busy}>
    {stage.kind === "identity" && <>
      <div className="space-y-1.5"><label htmlFor="recovery-identifier" className="block text-sm font-medium text-foreground">Username / Master Code</label><TextInput id="recovery-identifier" name="identifier" autoComplete="username" required maxLength={254} value={identifier} disabled={busy} onChange={(event) => setIdentifier(event.target.value)} aria-invalid={Boolean(errors.identifier)} aria-describedby={errors.identifier ? "recovery-identifier-error" : undefined} />{errors.identifier && <p id="recovery-identifier-error" className="text-sm text-danger">{errors.identifier}</p>}</div>
      <div className="space-y-1.5"><label htmlFor="recovery-mobile" className="block text-sm font-medium text-foreground">Registered WhatsApp Mobile Number</label><TextInput id="recovery-mobile" name="mobile" type="tel" autoComplete="tel" inputMode="tel" required maxLength={24} placeholder="+919876543210" value={mobile} disabled={busy} onChange={(event) => setMobile(event.target.value)} aria-invalid={Boolean(errors.mobile)} aria-describedby={errors.mobile ? "recovery-mobile-error" : undefined} />{errors.mobile && <p id="recovery-mobile-error" className="text-sm text-danger">{errors.mobile}</p>}</div>
    </>}
    {stage.kind === "otp" && <>
      <p role="status" className="text-sm text-muted">Enter the OTP sent to your registered WhatsApp number.</p>
      <div className="space-y-1.5"><label htmlFor="recovery-otp" className="block text-sm font-medium text-foreground">WhatsApp OTP</label><TextInput id="recovery-otp" name="otp" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={otp} disabled={busy || expired} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} aria-invalid={Boolean(errors.otp)} aria-describedby={errors.otp ? "recovery-otp-error" : "recovery-otp-expiry"} />{errors.otp && <p id="recovery-otp-error" className="text-sm text-danger">{errors.otp}</p>}</div>
      <p id="recovery-otp-expiry" role="status" className={`text-xs ${expired ? "text-danger" : "text-muted"}`}>{expired ? "OTP expired. Resend OTP to continue." : `Code expires in ${Math.max(0, Math.ceil((Date.parse(stage.challenge.expiresAt) - now) / 1000))}s`}</p>
    </>}
    {stage.kind === "password" && <>
      <PasswordField id="recovery-new-password" label="New Password" value={password} onChange={setPassword} error={errors.password} disabled={busy || expired} />
      <PasswordField id="recovery-confirm-password" label="Confirm New Password" value={confirmPassword} onChange={setConfirmPassword} error={errors.confirmPassword} disabled={busy || expired} />
      <p id="recovery-password-hint" className="text-xs text-muted">12-128 characters with uppercase, lowercase, a number, and a symbol.</p>
      {expired && <p role="alert" className="text-sm text-danger">Your reset session has expired. Start again to verify a new OTP.</p>}
    </>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    {throttled && <p role="status" className="text-xs text-muted">Try again in {Math.max(0, Math.ceil((retryUntil - now) / 1000))}s.</p>}
    <Button type="submit" className="w-full" disabled={busy || throttled || expired}>{busy ? "Please wait..." : stage.kind === "identity" ? "Send OTP" : stage.kind === "otp" ? "Verify OTP" : "Reset Password"}</Button>
    {stage.kind === "otp" && <button type="button" disabled={busy || cooldown > 0} onClick={() => void sendOtp()} className="block w-full text-center text-sm font-medium text-brand hover:underline disabled:cursor-not-allowed disabled:text-muted">{cooldown > 0 ? `Resend OTP in ${cooldown}s` : "Resend OTP"}</button>}
    {stage.kind !== "identity" && <button type="button" disabled={busy} onClick={startAgain} className="block w-full text-center text-sm font-medium text-brand hover:underline disabled:opacity-50">{stage.kind === "otp" ? "Use another account" : "Start again"}</button>}
    <Link className="block text-center text-sm font-medium text-brand hover:underline" href="/login">Back to Login</Link>
  </form>;
}
