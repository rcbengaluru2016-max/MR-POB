"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { cn, formatDateTime } from "@/lib/utils";
import { CREDIT_DAY_OPTIONS, PAYMENT_MODES } from "@/lib/constants";

type Kind = "customer" | "company" | "patient";
type SafeDetails = {
  registration: Record<string, unknown> & { id: string; kind: Kind; status: string; submittedAt: string; files?: Record<string, { name: string; type: string; size: number; dataUrl: string }> };
  master: Record<string, unknown> & { code: string; status: string; createdAt: string; approvalDate: string };
  account: null | { username: string; displayName: string; email?: string; userType: string; status: string; createdAt: string; lastLoginAt?: string };
  activationMessage: null | { recipient: string; status: string; sentAt: string };
};
type ErpForm = Record<string, string>;
type Option = { value: string; label: string };
type OptionLists = { representatives: Option[] };

const emptyOptions: OptionLists = { representatives: [] };
const erpInputClass = "h-10 w-full rounded-lg border border-line bg-background px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-100";

const recordFields: Record<Kind, [string, string][]> = {
  customer: [
    ["customerName", "Owner"], ["mobile", "Mobile Number"], ["email", "Email"],
    ["businessName", "Name"], ["customerType", "Customer Category"],
    ["addressLine1", "Address Line 1"], ["addressLine2", "Address Line 2"], ["addressLine3", "Address Line 3"], ["addressLine4", "Address Line 4"], ["pinCode", "PIN Code"], ["address", "Address"],
    ["dlNumber1", "DL Number 1"], ["dlNumber2", "DL Number 2"], ["dlNumber3", "DL Number 3"], ["fssaiNumber", "FSSAI Number"],
    ["gstNumber", "GST Number"], ["creditDays", "Credit Period"], ["paymentMethod", "Payment Method"],
  ],
  company: [
    ["companyName", "Company Name"], ["division", "Division"], ["headquarter", "Headquarter"], ["adminFullName", "Admin Full Name"], ["mobile", "Admin Mobile Number"], ["email", "Admin Email Address"],
  ],
  patient: [
    ["patientName", "Patient Name"], ["mobile", "Mobile Number"], ["email", "Email"],
    ["gender", "Gender"], ["address", "Address"], ["paymentMethod", "Payment Method"],
  ],
};

const documentLabels: Record<string, string> = {
  dl1: "DL 1", dl2: "DL 2", dl3: "DL 3", gstCertificate: "GST Certificate Upload", shopOutside: "Shop Outside", shopInside: "Shop Inside",
  companyLogo: "Company Logo", adminPhoto: "Admin Photo", idProof: "ID Proof",
};

const progressSteps = [
  "Registration Submitted",
  "Pending Verification",
  "Approved",
  "Master Code Generated",
  "Account Activated",
  "Message Sent",
];

function display(value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  return String(value);
}

function accountIsActive(status: string) {
  return status === "active" || status === "unlocked";
}

function initialErpForm(master: SafeDetails["master"]): ErpForm {
  const value = (key: string, fallback = "") => {
    const field = master[key];
    return field === undefined || field === null || field === "" ? fallback : String(field);
  };
  const creditDays = value("creditDays");
  const creditLabel = CREDIT_DAY_OPTIONS.find((option) => option.value === creditDays)?.label ?? creditDays;
  return {
    salesRepresentative: value("salesRepresentative"),
    discountPercent: value("discountPercent"),
    creditPeriod: value("creditPeriod", creditLabel),
    creditLimit: value("creditLimit"),
    paymentMode: value("paymentMode", value("paymentMethod")),
  };
}

function numericValue(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function choicesWithCurrent(choices: Option[], selected: string, placeholder: string) {
  const hasSelected = !selected || choices.some((option) => option.value === selected);
  return [
    { value: "", label: placeholder },
    ...(!hasSelected ? [{ value: selected, label: selected }] : []),
    ...choices,
  ];
}

function masterTitle(kind: Kind) {
  return kind === "company" ? "Company" : `${kind[0].toUpperCase()}${kind.slice(1)}`;
}

export function ApprovedRegistrationDetails({ kind, id, basePath = "/super-admin" }: { kind: Kind; id: string; basePath?: string }) {
  const [data, setData] = useState<SafeDetails | null>(null);
  const [error, setError] = useState("");
  const [erpError, setErpError] = useState("");
  const [erpForm, setErpForm] = useState<ErpForm | null>(null);
  const [options, setOptions] = useState<OptionLists>(emptyOptions);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [accountActionBusy, setAccountActionBusy] = useState(false);
  const [accountActionError, setAccountActionError] = useState("");
  const [accountActionNotice, setAccountActionNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/super-admin/registrations/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load registration details.");
        if (result.registration.kind !== kind) throw new Error("Registration not found.");
        return result as SafeDetails;
      })
      .then(setData)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Unable to load registration details.");
      });
    return () => controller.abort();
  }, [id, kind]);

  useEffect(() => {
    const controller = new AbortController();
    const loadOptions = async (url: string) => {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return [];
      const result = await response.json();
      return result.items as Record<string, unknown>[];
    };
    if (kind === "customer") {
      void loadOptions("/api/admin/masters?kind=company").then((items) => setOptions({
        representatives: items.filter((item) => item.status === "active" && typeof item.adminFullName === "string").map((item) => ({ value: item.adminFullName as string, label: item.adminFullName as string })),
      })).catch(() => undefined);
    }
    return () => controller.abort();
  }, [kind]);

  async function saveErpFields() {
    if (!data) return;
    const currentForm = erpForm ?? initialErpForm(data.master);
    setErpError("");
    setSaving(true);
    const payload = { code: data.master.code, salesRepresentative: currentForm.salesRepresentative, discountPercent: numericValue(currentForm.discountPercent), creditPeriod: currentForm.creditPeriod, creditLimit: numericValue(currentForm.creditLimit), paymentMode: currentForm.paymentMode };
    try {
      const response = await fetch("/api/admin/masters", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to save customer details.");
      const updatedMaster = result.item as SafeDetails["master"];
      setData((current) => current ? { ...current, master: updatedMaster } : current);
      setErpForm(initialErpForm(updatedMaster));
      setEditing(false);
    } catch (reason) {
      setErpError(reason instanceof Error ? reason.message : "Unable to save customer details.");
    } finally {
      setSaving(false);
    }
  }

  async function updateAccountStatus() {
    if (!data?.account) return;
    const nextStatus = accountIsActive(data.account.status) ? "locked" : "unlocked";
    setAccountActionBusy(true);
    setAccountActionError("");
    setAccountActionNotice("");
    try {
      const response = await fetch(basePath === "/admin" ? "/api/admin/accounts" : "/api/super-admin/accounts", {
        method: basePath === "/admin" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(basePath === "/admin" ? { username: data.account.username, status: nextStatus } : { action: "status", username: data.account.username, status: nextStatus }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to update account status.");
      setData((current) => current?.account ? { ...current, account: { ...current.account, status: nextStatus } } : current);
      setAccountActionNotice(`Account set to ${nextStatus === "locked" ? "Inactive" : "Active"}.`);
      setAccountDialogOpen(false);
    } catch (reason) {
      setAccountActionError(reason instanceof Error ? reason.message : "Unable to update account status.");
    } finally {
      setAccountActionBusy(false);
    }
  }

  if (error) return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-danger" role="alert">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading approved registration…</p>;

  const { registration, master, account, activationMessage } = data;
  const form = erpForm ?? initialErpForm(master);
  const files = registration.files ?? {};
  const timeLabels = [
    formatDateTime(registration.submittedAt),
    "",
    formatDateTime(typeof registration.decidedAt === "string" ? registration.decidedAt : master.approvalDate),
    formatDateTime(master.createdAt),
    account ? formatDateTime(account.createdAt) : "Not available",
    activationMessage ? formatDateTime(activationMessage.sentAt) : "Not sent",
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <Link href={`${basePath}/registrations/${kind}`} className="inline-flex min-h-10 items-center rounded-lg border border-line bg-white px-3 text-sm font-semibold text-foreground shadow-sm transition hover:border-brand hover:text-brand">← Back</Link>
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{masterTitle(kind)}</h1>
        <span aria-hidden="true" className="text-muted">-</span>
        <span className="font-mono text-sm font-semibold text-foreground">{master.code}</span>
        {account ? <><span aria-hidden="true" className="text-muted">-</span><span className={`rounded-full px-3 py-1 text-xs font-semibold ${accountIsActive(account.status) ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{accountIsActive(account.status) ? "Active" : "Inactive"}</span></> : null}
      </header>

      <section aria-label="Registration progress" className="overflow-x-auto rounded-2xl border border-line bg-white px-4 py-5 shadow-sm sm:px-6">
        <ol className="grid min-w-[680px] grid-cols-6">
          {progressSteps.map((step, index) => {
            const isMessageMissing = index === 5 && !activationMessage;
            const complete = !isMessageMissing;
            return (
              <li key={step} className="relative flex flex-col items-center px-1 text-center">
                {index < progressSteps.length - 1 ? <span aria-hidden="true" className={cn("absolute left-1/2 top-4 h-[3px] w-full", activationMessage || index < progressSteps.length - 2 ? "bg-emerald-700" : "bg-slate-200")} /> : null}
                <span className={cn("relative z-10 inline-flex size-8 items-center justify-center rounded-full border-2 text-xs font-bold", complete ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-200 bg-white text-muted")}>
                  {complete ? "✓" : index + 1}
                </span>
                <span className={cn("mt-2 max-w-28 text-[11px] leading-4 sm:text-xs", complete ? "font-medium text-foreground" : "text-muted")}>{isMessageMissing ? "Message Not Sent" : step}</span>
                {timeLabels[index] ? <span className="mt-1 text-[10px] text-muted">{timeLabels[index]}</span> : null}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
        <div className="inline-flex rounded-md bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-brand">Details</div>
        <h2 className="sr-only">Registration information</h2>
        <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {recordFields[kind].filter(([key]) => registration[key] !== undefined && registration[key] !== "" && !(key === "address" && registration.addressLine1)).map(([key, label]) => (
            <div key={key} className="min-w-0"><dt className="text-xs font-medium text-muted">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-foreground">{display(registration[key])}</dd></div>
          ))}
        </dl>

        <div className="mt-6 border-t border-line pt-5">
          <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold text-foreground">Documents</h2><span className="text-xs text-muted">{Object.keys(files).length} uploaded</span></div>
          {Object.keys(files).length ? <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(files).map(([key, file]) => <a key={key} href={file.dataUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-dashed border-line bg-background px-4 py-3 text-center transition hover:border-brand hover:bg-panel"><span className="block text-sm font-medium text-foreground">{documentLabels[key] ?? `View ${key}`}</span><span className="mt-1 block text-xs text-muted">{file.name}</span><span className="mt-1 block text-[10px] font-semibold text-emerald-700">uploaded</span></a>)}
          </div> : <p className="mt-3 text-sm text-muted">No documents were uploaded.</p>}
          {kind === "customer" && !files.gstCertificate ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">GST Certificate Upload * — required document not present.</p> : null}
        </div>
      </section>

      {kind === "customer" ? <section className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="grid gap-1 text-xs font-medium text-muted">Company Contact<select disabled={!editing || saving} value={form.salesRepresentative ?? ""} onChange={(event) => setErpForm((current) => ({ ...form, ...current, salesRepresentative: event.target.value }))} className={erpInputClass}>{choicesWithCurrent(options.representatives, form.salesRepresentative ?? "", "Select Representative").map((option) => <option key={option.value || "empty"} value={option.value}>{option.label}</option>)}</select></label>
          <label className="grid gap-1 text-xs font-medium text-muted">Discount (%)<input disabled={!editing || saving} type="number" min="0" max="100" step="0.1" value={form.discountPercent ?? ""} onChange={(event) => setErpForm((current) => ({ ...form, ...current, discountPercent: event.target.value }))} placeholder="Enter discount" className={erpInputClass} /></label>
          <label className="grid gap-1 text-xs font-medium text-muted">Credit Period<input disabled={!editing || saving} value={form.creditPeriod ?? ""} onChange={(event) => setErpForm((current) => ({ ...form, ...current, creditPeriod: event.target.value }))} placeholder="e.g. 30 Days" className={erpInputClass} /></label>
          <label className="grid gap-1 text-xs font-medium text-muted">Credit Limit (₹)<input disabled={!editing || saving} type="number" min="0" value={form.creditLimit ?? ""} onChange={(event) => setErpForm((current) => ({ ...form, ...current, creditLimit: event.target.value }))} placeholder="Enter credit limit" className={erpInputClass} /></label>
          <label className="grid gap-1 text-xs font-medium text-muted">Payment Mode<select disabled={!editing || saving} value={form.paymentMode ?? ""} onChange={(event) => setErpForm((current) => ({ ...form, ...current, paymentMode: event.target.value }))} className={erpInputClass}>{choicesWithCurrent(PAYMENT_MODES.map((mode) => ({ value: mode, label: mode })), form.paymentMode ?? "", "Select Payment Mode").map((option) => <option key={option.value || "empty"} value={option.value}>{option.label}</option>)}</select></label>
        </div>
        {erpError ? <p className="mt-3 text-sm text-danger" role="alert">{erpError}</p> : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" disabled={saving} onClick={() => { setErpError(""); if (data) setErpForm(initialErpForm(data.master)); setEditing((current) => !current); }} className="min-h-10 rounded-lg border border-line bg-white px-4 text-sm font-semibold text-foreground transition hover:bg-background disabled:opacity-60">{editing ? "Cancel" : "Edit"}</button>
          <button type="button" disabled={!editing || saving} onClick={() => void saveErpFields()} className="min-h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving…" : "Save Changes"}</button>
        </div>
      </section> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-foreground">Login Account</h2>
          {account ? <>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <button type="button" aria-label={accountIsActive(account.status) ? "Account is Active. Change status to Inactive" : "Account is Inactive. Change status to Active"} onClick={() => { setAccountActionError(""); setAccountDialogOpen(true); }} className={`min-h-10 rounded-lg border px-4 text-sm font-semibold transition ${accountIsActive(account.status) ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"}`}>
                {accountIsActive(account.status) ? "Active" : "Inactive"}
              </button>
            </div>
            {accountActionNotice ? <p className="mt-2 text-sm text-emerald-700" role="status">{accountActionNotice}</p> : null}
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div><dt className="text-xs text-muted">Master Code</dt><dd className="mt-1 font-mono text-sm font-semibold text-foreground">{display(master.code)}</dd></div>
              <div><dt className="text-xs text-muted">Username</dt><dd className="mt-1 break-all font-mono text-sm font-semibold text-foreground">{display(account.username)}</dd><span className="mt-1 inline-flex rounded bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-brand">Username = {kind.toUpperCase()} code</span></div>
              <div><dt className="text-xs text-muted">Registered email</dt><dd className="mt-1 break-all text-sm font-medium text-foreground">{display(account.email ?? registration.email)}</dd></div>
              <div><dt className="text-xs text-muted">Account created</dt><dd className="mt-1 text-sm font-medium text-foreground">{formatDateTime(account.createdAt)}</dd></div>
              <div><dt className="text-xs text-muted">Last login</dt><dd className="mt-1 text-sm font-medium text-foreground">{account.lastLoginAt ? formatDateTime(account.lastLoginAt) : "Never"}</dd></div>
              <div className="sm:col-span-2"><p className="text-xs text-muted">Password is not displayed here.</p></div>
            </dl>
          </> : <p className="mt-3 text-sm text-muted">No login account is linked to this master.</p>}
        </section>

        <section className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-foreground">Account Activation Message</h2>
          {activationMessage ? <div className="mt-3 rounded-xl border border-line bg-background p-4">
            <dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-xs text-muted">Registered mobile number</dt><dd className="mt-1 break-all text-sm font-medium text-foreground">{activationMessage.recipient}</dd></div><div><dt className="text-xs text-muted">Status</dt><dd className="mt-1"><span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase text-emerald-700">{activationMessage.status} ✓</span></dd></div></dl>
            <ul className="mt-4 list-disc space-y-1 pl-4 text-sm text-foreground"><li>Account activated</li><li>Master Code and username</li><li>Login link and instructions</li><li>Password recovery instructions</li></ul>
            <p className="mt-2 text-xs text-muted">The password is never included.</p>
            <p className="mt-2 text-[11px] text-muted">Sent {formatDateTime(activationMessage.sentAt)}</p>
          </div> : <div className="mt-3 rounded-xl border border-dashed border-line bg-background p-4"><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase text-muted">Not sent</span><p className="mt-3 text-sm text-muted">No WhatsApp activation message has been sent. WhatsApp delivery is not configured.</p></div>}
        </section>
      </div>
      <ConfirmDialog
        open={accountDialogOpen && Boolean(account)}
        title={account && !accountIsActive(account.status) ? "Set this account to Active?" : "Set this account to Inactive?"}
        description={account && !accountIsActive(account.status) ? "The user will be able to sign in again after this change." : "The user will no longer be able to sign in after this change."}
        confirmLabel={account && !accountIsActive(account.status) ? "Set Active" : "Set Inactive"}
        danger={!account || accountIsActive(account.status)}
        busy={accountActionBusy}
        error={accountActionError}
        onClose={() => { setAccountDialogOpen(false); setAccountActionError(""); }}
        onConfirm={() => void updateAccountStatus()}
      />
    </div>
  );
}
