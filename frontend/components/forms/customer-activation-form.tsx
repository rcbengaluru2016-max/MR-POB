"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CUSTOMER_PAYMENT_METHODS, CUSTOMER_TYPES, CREDIT_DAY_VALUES } from "@/lib/constants";

type Profile = { customerCode: string; customerName: string; mobile: string; email: string; businessName: string; customerType: string; addressLine1: string; addressLine2: string; addressLine3: string; addressLine4: string; pinCode: string; dlNumber1: string; dlNumber2: string; dlNumber3: string; fssaiNumber: string; gstNumber: string; creditDays: string; paymentMethod: string };
const empty: Profile = { customerCode: "", customerName: "", mobile: "", email: "", businessName: "", customerType: "", addressLine1: "", addressLine2: "", addressLine3: "", addressLine4: "", pinCode: "", dlNumber1: "", dlNumber2: "", dlNumber3: "", fssaiNumber: "", gstNumber: "", creditDays: "", paymentMethod: "" };
const inputClass = "mt-1 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

export function CustomerActivationForm() {
  const [step, setStep] = useState<"lookup" | "otp" | "profile" | "success">("lookup");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [customerCode, setCustomerCode] = useState("");
  const [mobile, setMobile] = useState("");
  const [profile, setProfile] = useState<Profile>(empty);
  const [seconds, setSeconds] = useState(60);

  useEffect(() => {
    if (step !== "otp" || seconds <= 0) return;
    const timer = window.setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [step, seconds]);

  async function requestOtp(resend = false) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/customer-activation/request-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(resend ? { challengeId } : { customerCode, mobile }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to request a verification code.");
      if (data.challengeId) setChallengeId(data.challengeId);
      setSeconds(60); setStep("otp");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to request a verification code."); }
    finally { setBusy(false); }
  }

  async function verifyOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/customer-activation/verify-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId, code }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Verification failed.");
      const profileResponse = await fetch("/api/customer-activation/profile", { cache: "no-store" });
      const profileData = await profileResponse.json();
      if (!profileResponse.ok) throw new Error(profileData.error ?? "Unable to load customer details.");
      setProfile(profileData.profile); setStep("profile");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Verification failed."); }
    finally { setBusy(false); }
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/api/customer-activation/profile", { method: "PATCH", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to update account details.");
      setStep("success");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update account details."); }
    finally { setBusy(false); }
  }

  const field = (key: keyof Profile, label: string, required = true, type = "text", readOnly = false) => <label key={key} className="block text-sm font-medium text-ink">{label}{required ? " *" : ""}<input className={inputClass} name={key} type={type} required={required} readOnly={readOnly} value={profile[key]} onChange={(event) => setProfile({ ...profile, [key]: event.target.value })} /></label>;
  return <section aria-label="Customer account activation" className="mt-6 rounded-2xl border border-line bg-white p-6 text-left shadow-xl shadow-black/10 sm:p-8">
      <Link href="/login" className="text-sm font-semibold text-brand hover:underline">← Back to Login</Link>
      <div className="mt-6 mb-7"><h1 className="text-2xl font-bold text-ink">{step === "success" ? "Account Activated Successfully" : "Existing Customer Account Activation"}</h1><p className="mt-2 text-sm leading-6 text-muted">Verify your existing customer account, review your details, and set a password to sign in.</p></div>
      {step === "lookup" && <div className="space-y-5"><label className="block text-sm font-medium text-ink">Customer Code *<input className={inputClass} autoComplete="off" value={customerCode} onChange={(e) => setCustomerCode(e.target.value)} required /></label><label className="block text-sm font-medium text-ink">Registered Mobile Number *<input className={inputClass} type="tel" inputMode="numeric" maxLength={10} autoComplete="tel-national" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} required /></label><button className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={busy || !customerCode || mobile.length !== 10} onClick={() => void requestOtp()}>{busy ? "Checking..." : "Continue"}</button></div>}
      {step === "otp" && <form className="space-y-5" onSubmit={verifyOtp}><p className="rounded-xl bg-pale-blue p-4 text-sm text-ink">If the information matches an eligible account, a verification code has been sent to the registered mobile number.</p><label className="block text-sm font-medium text-ink">One-Time Password *<input className={inputClass} autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} required /></label><button className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={busy || code.length !== 6}>{busy ? "Verifying..." : "Verify OTP"}</button><div className="text-center text-sm text-muted">{seconds > 0 ? `Resend code in ${seconds}s` : <button type="button" className="font-semibold text-brand disabled:opacity-60" disabled={busy} onClick={() => void requestOtp(true)}>Resend code</button>}</div></form>}
      {step === "profile" && <form className="space-y-6" onSubmit={saveProfile}>
        <section><h2 className="mb-4 text-base font-semibold text-ink">Business Information</h2><div className="grid gap-4 sm:grid-cols-2">{field("customerCode", "Customer Code", true, "text", true)}{field("businessName", "Name")}{<label className="block text-sm font-medium text-ink">Customer Category *<select className={inputClass} name="customerType" value={profile.customerType} onChange={(e) => setProfile({ ...profile, customerType: e.target.value })} required>{CUSTOMER_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>}{field("gstNumber", "GST Number")}{field("dlNumber1", "DL Number 1")}{field("dlNumber2", "DL Number 2")}{field("dlNumber3", "DL Number 3", false)}{field("fssaiNumber", "FSSAI Number", false)}</div></section>
        <section><h2 className="mb-4 text-base font-semibold text-ink">Basic Information</h2><div className="grid gap-4 sm:grid-cols-2">{field("customerName", "Owner")}{field("mobile", "Mobile Number")}{field("email", "Email", false, "email")}{field("addressLine1", "Address Line 1")}{field("addressLine2", "Address Line 2", false)}{field("addressLine3", "Address Line 3", false)}{field("addressLine4", "Address Line 4", false)}{field("pinCode", "PIN Code")}{<label className="block text-sm font-medium text-ink">Credit Days *<select className={inputClass} name="creditDays" value={profile.creditDays} onChange={(e) => setProfile({ ...profile, creditDays: e.target.value })} required>{CREDIT_DAY_VALUES.map((item) => <option key={item}>{item}</option>)}</select></label>}{<label className="block text-sm font-medium text-ink">Payment Method *<select className={inputClass} name="paymentMethod" value={profile.paymentMethod} onChange={(e) => setProfile({ ...profile, paymentMethod: e.target.value })} required>{CUSTOMER_PAYMENT_METHODS.map((item) => <option key={item}>{item}</option>)}</select></label>}</div></section>
        <section><h2 className="mb-4 text-base font-semibold text-ink">Documents</h2><p className="mb-3 text-sm text-muted">A new GST certificate is required. Other documents may be replaced optionally.</p><div className="grid gap-4 sm:grid-cols-2">{([ ["dl1", "DL 1"], ["dl2", "DL 2"], ["dl3", "DL 3"], ["gstCertificate", "GST Certificate Upload *"], ["shopOutside", "Shop Photo — Outside"], ["shopInside", "Shop Photo — Inside"] ] as const).map(([name, label]) => <label key={name} className="block text-sm font-medium text-ink">{label}<input className={inputClass} name={name} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required={name === "gstCertificate"} /></label>)}</div></section>
        <section><h2 className="mb-4 text-base font-semibold text-ink">Create or Reset Password</h2><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium text-ink">New Password *<input className={inputClass} name="password" type="password" minLength={8} required /></label><label className="block text-sm font-medium text-ink">Confirm Password *<input className={inputClass} name="confirmPassword" type="password" minLength={8} required /></label></div><p className="mt-2 text-xs text-muted">Use at least 8 characters, including uppercase, lowercase, and a number.</p></section>
        <button className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={busy}>{busy ? "Saving..." : "Save Details & Activate Account"}</button>
      </form>}
      {step === "success" && <div className="rounded-2xl bg-pale-blue p-6 text-center"><p className="text-emerald-700 font-semibold">Your account is ready. You can now sign in with your Customer Code and new password.</p><Link className="mt-5 inline-flex rounded-xl bg-brand px-6 py-3 font-semibold text-white" href="/login">Proceed to Login</Link></div>}
      {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-danger">{error}</p>}
    </section>;
}
