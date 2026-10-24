"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";
import { createCustomerDetailsClient, CustomerDetailsError, customerChangesSchema, customerIdentitySchema, customerMobileSchema, customerOtpSchema, validateShopPhoto, parseShopPhoto, type CustomerShopPhoto, type CustomerChallenge, type CustomerChanges, type CustomerGrant, type CustomerProfile, type MobileGrant } from "@/lib/auth/customer-details";

const client = createCustomerDetailsClient({
  requestOtp: process.env.NEXT_PUBLIC_CUSTOMER_DETAILS_REQUEST_URL,
  verifyOtp: process.env.NEXT_PUBLIC_CUSTOMER_DETAILS_VERIFY_URL,
  profile: process.env.NEXT_PUBLIC_CUSTOMER_DETAILS_PROFILE_URL,
  save: process.env.NEXT_PUBLIC_CUSTOMER_DETAILS_SAVE_URL,
  requestMobileOtp: process.env.NEXT_PUBLIC_CUSTOMER_DETAILS_MOBILE_REQUEST_URL,
  verifyMobileOtp: process.env.NEXT_PUBLIC_CUSTOMER_DETAILS_MOBILE_VERIFY_URL,
});
type Stage = { kind: "identity" } | { kind: "otp"; challenge: CustomerChallenge } | { kind: "profile"; grant: CustomerGrant; profile: CustomerProfile } | { kind: "complete" };
const readOnlyFields = [["customerCode", "Username / Master Code"], ["customerName", "Owner"], ["businessName", "Business Name"], ["customerType", "Customer Category"], ["email", "Email"], ["address", "Registered Address"], ["addressType", "Address Type"], ["dlNumber1", "DL Number 1"], ["dlNumber2", "DL Number 2"], ["dlNumber3", "DL Number 3"], ["fssaiNumber", "FSSAI Number"], ["gstNumber", "GST Number"], ["creditDays", "Credit Days"], ["paymentMethod", "Payment Method"]] as const;
const fileLabels = { dl1: "DL 1", dl2: "DL 2", dl3: "DL 3", gstCertificate: "GST Certificate", shopOutside: "Shop Photo - Outside", shopInside: "Shop Photo - Inside" };
const emptyDraft: CustomerChanges = { addressLine1: "", addressLine2: "", addressLine3: "", addressLine4: "", pinCode: "", mobile: "" };

function InputField({ id, label, ...props }: React.ComponentProps<typeof TextInput> & { id: string; label: string }) {
  return <div className="min-w-0 space-y-1.5"><label htmlFor={id} className="block text-sm font-medium text-foreground">{label}</label><TextInput id={id} {...props} /></div>;
}
function OtpInput({ id, value, onChange, disabled }: { id: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  return <InputField id={id} label="WhatsApp OTP" autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={value} required disabled={disabled} onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))} />;
}

export function CustomerDetailsForm() {
  const [stage, setStage] = useState<Stage>({ kind: "identity" });
  const [identifier, setIdentifier] = useState("");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [draft, setDraft] = useState<CustomerChanges>(emptyDraft);
  const [photos, setPhotos] = useState<Partial<Record<"shopOutside" | "shopInside", CustomerShopPhoto>>>({});
  const [mobileChallenge, setMobileChallenge] = useState<{ challenge: CustomerChallenge; mobile: string } | null>(null);
  const [mobileGrant, setMobileGrant] = useState<MobileGrant | undefined>();
  const [mobileOtp, setMobileOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [mobileResendAt, setMobileResendAt] = useState(0);
  const [retryUntil, setRetryUntil] = useState(0);
  const inFlight = useRef<AbortController | null>(null);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => { window.clearInterval(timer); inFlight.current?.abort(); }; }, []);
  useEffect(() => { if (stage.kind === "otp") document.getElementById("customer-otp")?.focus(); else if (stage.kind === "profile" || stage.kind === "complete") panel.current?.focus(); }, [stage.kind]);
  const sessionExpired = stage.kind === "profile" && now >= Date.parse(stage.grant.expiresAt);
  const otpExpired = stage.kind === "otp" && now >= Date.parse(stage.challenge.expiresAt);
  const throttled = now < retryUntil;
  const cooldown = Math.max(0, Math.ceil((Math.max(resendAt, retryUntil) - now) / 1000));
  const mobileCooldown = Math.max(0, Math.ceil((Math.max(mobileResendAt, retryUntil) - now) / 1000));
  const changedMobile = stage.kind === "profile" && draft.mobile.trim() !== stage.profile.mobile;
  const verifiedMobile = mobileGrant?.mobile === draft.mobile.trim() && now < Date.parse(mobileGrant.expiresAt);
  const mobileOtpExpired = Boolean(mobileChallenge && now >= Date.parse(mobileChallenge.challenge.expiresAt));

  const perform = useCallback(async (action: (signal: AbortSignal) => Promise<void>) => {
    if (inFlight.current || throttled) return;
    const controller = new AbortController(); inFlight.current = controller; setBusy(true); setError("");
    try { await action(controller.signal); }
    catch (reason) {
      if (controller.signal.aborted) return;
      setError(reason instanceof CustomerDetailsError ? reason.message : "Unable to complete this request. Check your connection and try again.");
      if (reason instanceof CustomerDetailsError && reason.retryAfterSeconds) { setNow(Date.now()); setRetryUntil(Date.now() + reason.retryAfterSeconds * 1000); }
    } finally { if (!controller.signal.aborted) { setBusy(false); inFlight.current = null; } }
  }, [throttled]);
  function restart() {
    if (busy) return;
    setStage({ kind: "identity" }); setIdentifier(""); setMobile(""); setOtp(""); setDraft(emptyDraft); setPhotos({}); setMobileChallenge(null); setMobileGrant(undefined); setMobileOtp(""); setError("");
  }
  async function requestOtp() {
    const identity = customerIdentitySchema.safeParse({ identifier, mobile });
    if (!identity.success) { setError(identity.error.issues[0].message); return; }
    if (stage.kind === "otp" && cooldown) return;
    await perform(async (signal) => { const challenge = await client.requestOtp(identity.data, signal); if (signal.aborted) return; setNow(Date.now()); setResendAt(Date.now() + challenge.resendAfterSeconds * 1000); setOtp(""); setStage({ kind: "otp", challenge }); });
  }
  async function verifyOtp() {
    if (stage.kind !== "otp" || otpExpired) return;
    const code = customerOtpSchema.safeParse(otp); if (!code.success) { setError(code.error.issues[0].message); return; }
    await perform(async (signal) => {
      const grant = await client.verifyOtp(stage.challenge, code.data, signal);
      const profile = await client.profile(grant, signal);
      if (signal.aborted) return;
      setDraft({ addressLine1: profile.addressLine1 || profile.address, addressLine2: profile.addressLine2, addressLine3: profile.addressLine3, addressLine4: profile.addressLine4, pinCode: profile.pinCode, mobile: profile.mobile });
      setOtp(""); setIdentifier(""); setMobile(""); setNow(Date.now()); setStage({ kind: "profile", grant, profile });
    });
  }
  async function requestMobileOtp() {
    if (stage.kind !== "profile" || sessionExpired || mobileCooldown) return;
    const number = customerMobileSchema.safeParse(draft.mobile); if (!number.success) { setError(number.error.issues[0].message); return; }
    await perform(async (signal) => { const challenge = await client.requestMobileOtp(stage.grant, number.data, signal); if (signal.aborted) return; setMobileChallenge({ challenge, mobile: number.data }); setMobileGrant(undefined); setMobileOtp(""); setNow(Date.now()); setMobileResendAt(Date.now() + challenge.resendAfterSeconds * 1000); });
  }
  async function verifyMobileOtp() {
    if (stage.kind !== "profile" || !mobileChallenge || sessionExpired || mobileOtpExpired) return;
    const code = customerOtpSchema.safeParse(mobileOtp); if (!code.success) { setError(code.error.issues[0].message); return; }
    await perform(async (signal) => { const verified = await client.verifyMobileOtp(stage.grant, mobileChallenge.challenge, draft.mobile, code.data, signal); if (signal.aborted) return; setMobileGrant(verified); setMobileChallenge(null); setMobileOtp(""); setNow(Date.now()); });
  }
  async function choosePhoto(key: "shopOutside" | "shopInside", file: File) {
    const message = validateShopPhoto(file); if (message) { setError(message); return; }
    await perform(async (signal) => {
      const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Unable to read photo")); reader.readAsDataURL(file); });
      const image = new window.Image(); image.src = dataUrl; await image.decode();
      if (!signal.aborted) setPhotos((current) => ({ ...current, [key]: parseShopPhoto({ name: file.name, type: file.type, size: file.size, dataUrl }) }));
    });
  }
  async function save() {
    if (stage.kind !== "profile" || sessionExpired) return;
    const updates = customerChangesSchema.safeParse(draft); if (!updates.success) { setError(updates.error.issues[0].message); return; }
    if (changedMobile && !verifiedMobile) { setError("Verify the new mobile number before saving."); return; }
    await perform(async (signal) => { await client.save(stage.grant, stage.profile, updates.data, photos, mobileGrant, signal); if (signal.aborted) return; setDraft(emptyDraft); setPhotos({}); setMobileGrant(undefined); setMobileChallenge(null); setMobileOtp(""); setStage({ kind: "complete" }); });
  }

  return <section ref={panel} tabIndex={-1} aria-label="Modify customer details" className={`mx-auto mt-6 rounded-2xl border border-line bg-white p-6 text-left shadow-xl shadow-black/10 sm:p-8 ${stage.kind === "profile" && !sessionExpired ? "w-full" : "max-w-md"}`}>
    <h1 className="sr-only">Modify Your Customer Details</h1>
    {stage.kind === "identity" && <form className="space-y-4" noValidate onSubmit={(event) => { event.preventDefault(); void requestOtp(); }}>
      <InputField id="customer-identifier" label="Username / Master Code" autoComplete="username" required maxLength={254} value={identifier} disabled={busy} onChange={(event) => setIdentifier(event.target.value)} />
      <InputField id="customer-mobile" label="Registered Mobile Number" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="10-digit mobile number" maxLength={10} required value={mobile} disabled={busy} onChange={(event) => setMobile(event.target.value.replace(/\D/g, ""))} />
      <Button type="submit" className="w-full" disabled={busy || throttled}>{busy ? "Please wait..." : "Send OTP"}</Button>
    </form>}
    {stage.kind === "otp" && <form className="space-y-4" noValidate onSubmit={(event) => { event.preventDefault(); void verifyOtp(); }}>
      <p role="status" className="text-sm text-muted">If the details match, an OTP will be sent to the registered WhatsApp number.</p>
      <OtpInput id="customer-otp" value={otp} onChange={setOtp} disabled={busy || otpExpired} />
      {otpExpired && <p role="alert" className="text-sm text-danger">OTP expired. Resend OTP to continue.</p>}
      <Button type="submit" className="w-full" disabled={busy || throttled || otpExpired}>{busy ? "Please wait..." : "Verify OTP"}</Button>
      <button type="button" disabled={busy || cooldown > 0} onClick={() => void requestOtp()} className="block w-full text-center text-sm font-medium text-brand disabled:text-muted">{cooldown ? `Resend OTP in ${cooldown}s` : "Resend OTP"}</button>
      <button type="button" disabled={busy} onClick={restart} className="block w-full text-center text-sm font-medium text-brand">Use another account</button>
    </form>}
    {sessionExpired && <div className="space-y-4"><p role="alert" className="text-sm text-danger">Your verification session has expired.</p><Button type="button" disabled={busy} onClick={restart}>Start again</Button></div>}
    {stage.kind === "profile" && !sessionExpired && <form noValidate className="space-y-5" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <section aria-labelledby="customer-registered-details"><h2 id="customer-registered-details" className="text-base font-semibold">Registered Details</h2><dl className="mt-3 grid gap-3 rounded-lg bg-background p-4 text-sm sm:grid-cols-2">{readOnlyFields.map(([key, label]) => <div key={key} className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{stage.profile[key] || "Not provided"}</dd></div>)}{stage.profile.additionalDetails.map((detail, index) => <div key={index} className="min-w-0"><dt className="text-xs text-muted">{detail.label}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{detail.value || "Not provided"}</dd></div>)}</dl></section>
      <section aria-labelledby="customer-documents"><h2 id="customer-documents" className="text-base font-semibold">Existing Documents and Photos</h2><ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">{Object.entries(fileLabels).map(([key, label]) => { const file = stage.profile.files[key as keyof CustomerProfile["files"]]; return <li key={key} className="min-w-0 break-words">{label}: {file ? <a href={file.dataUrl} download={file.name} className="font-medium text-brand underline">Download {file.name}</a> : <span className="text-muted">Not provided</span>}</li>; })}</ul></section>
      <section aria-labelledby="customer-edit-address"><h2 id="customer-edit-address" className="mb-3 text-base font-semibold">Address</h2><div className="grid gap-4 sm:grid-cols-2">{([['addressLine1', 'Address Line 1'], ['addressLine2', 'Address Line 2'], ['addressLine3', 'Address Line 3'], ['addressLine4', 'Address Line 4'], ['pinCode', 'PIN Code']] as const).map(([key, label]) => <InputField key={key} id={`customer-${key}`} label={label} required={key === "addressLine1" || key === "pinCode"} maxLength={key === "pinCode" ? 6 : 250} inputMode={key === "pinCode" ? "numeric" : "text"} value={draft[key]} disabled={busy} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} />)}</div></section>
      <section aria-labelledby="customer-edit-mobile" className="space-y-3"><h2 id="customer-edit-mobile" className="text-base font-semibold">Mobile Number</h2><InputField id="customer-new-mobile" label="Mobile Number" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={10} required value={draft.mobile} disabled={busy} onChange={(event) => { setDraft((current) => ({ ...current, mobile: event.target.value.replace(/\D/g, "") })); setMobileGrant(undefined); setMobileChallenge(null); setMobileOtp(""); }} />
        {changedMobile && <><p role="status" className={`text-xs ${verifiedMobile ? "text-success" : "text-muted"}`}>{verifiedMobile ? "New mobile number verified." : "Verify the new WhatsApp number before saving changes."}</p>{!verifiedMobile && <><button type="button" disabled={busy || throttled || mobileCooldown > 0} onClick={() => void requestMobileOtp()} className="text-sm font-medium text-brand disabled:text-muted">{mobileCooldown ? `Resend OTP in ${mobileCooldown}s` : mobileChallenge ? "Resend OTP" : "Send OTP to New Number"}</button>{mobileChallenge && <><OtpInput id="customer-mobile-otp" value={mobileOtp} onChange={setMobileOtp} disabled={busy || mobileOtpExpired} />{mobileOtpExpired && <p className="text-sm text-danger">OTP expired. Resend OTP to continue.</p>}<Button type="button" variant="secondary" disabled={busy || throttled || mobileOtpExpired} onClick={() => void verifyMobileOtp()}>Verify New Number</Button></>}</>}</>}
      </section>
      <section aria-labelledby="customer-edit-photos"><h2 id="customer-edit-photos" className="mb-3 text-base font-semibold">Shop Photos</h2><div className="grid gap-4 sm:grid-cols-2">{(["shopOutside", "shopInside"] as const).map((key) => { const preview = photos[key] ?? stage.profile.files[key]; return <div key={key} className="min-w-0 space-y-2"><label htmlFor={`customer-${key}`} className="block text-sm font-medium">{fileLabels[key]}</label>{preview?.type.startsWith("image/") && <Image src={preview.dataUrl} alt={fileLabels[key]} width={320} height={160} className="h-40 w-full rounded-lg border border-line object-contain" unoptimized />}<TextInput id={`customer-${key}`} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || throttled} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void choosePhoto(key, file); }} /><p className="text-xs text-muted">JPEG, PNG or WebP, up to 5 MB. Leave unchanged to keep the current photo.</p>{photos[key] && <button type="button" disabled={busy} className="text-sm font-medium text-brand" onClick={() => setPhotos((current) => { const next = { ...current }; delete next[key]; return next; })}>Undo replacement</button>}</div>; })}</div></section>
      <div className="flex flex-wrap justify-end gap-3"><Button type="button" variant="secondary" disabled={busy} onClick={restart}>Cancel</Button><Button type="submit" disabled={busy || throttled || (changedMobile && !verifiedMobile)}>{busy ? "Please wait..." : "Save Changes"}</Button></div>
    </form>}
    {stage.kind === "complete" && <p role="status" className="text-sm text-success">Your customer details have been saved successfully.</p>}
    {busy && <p className="sr-only" role="status">Processing request.</p>}
    {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
    {throttled && <p className="mt-3 text-xs text-muted">Try again in {Math.max(0, Math.ceil((retryUntil - now) / 1000))}s.</p>}
    <Link href="/login" className="mt-4 block text-center text-sm font-medium text-brand hover:underline">Back to Login</Link>
  </section>;
}
