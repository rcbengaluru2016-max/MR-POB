"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { TextArea } from "@/components/ui/field";
import { cn, formatDateTime } from "@/lib/utils";
import type { UploadedFile } from "@/lib/types";

type Kind = "customer" | "company" | "patient";
type RecordShape = {
  id: string;
  kind: Kind;
  status: string;
  submittedAt: string;
  rejectionReason?: string;
  decidedAt?: string;
  files?: Record<string, UploadedFile>;
  [key: string]: unknown;
};

const workflowSteps = [
  "Registration Submitted",
  "Pending Verification",
  "Approved",
  "Master Code Generated",
  "Account Activated",
  "Message Not Sent",
];

const documentLabels: Record<string, string> = {
  dl1: "View DL 1",
  dl2: "View DL 2",
  dl3: "View DL 3",
  gstCertificate: "View GST Certificate Upload",
  shopOutside: "View Shop Outside",
  shopInside: "View Shop Inside",
  companyLogo: "View Company Logo",
  adminPhoto: "View Admin Photo",
  idProof: "View ID Proof",
};

function detailEntries(record: RecordShape): [string, string][] {
  const keys: Record<Kind, string[]> = {
    customer: ["customerName", "mobile", "email", "businessName", "customerType", "addressLine1", "addressLine2", "addressLine3", "addressLine4", "pinCode", "address", "dlNumber1", "dlNumber2", "dlNumber3", "fssaiNumber", "gstNumber", "creditDays", "paymentMethod"],
    company: ["companyName", "division", "headquarter", "adminFullName", "mobile", "email"],
    patient: ["patientName", "mobile", "email", "gender", "address", "paymentMethod"],
  };
  const labels: Record<string, string> = {
    customerName: "Owner", adminFullName: "Admin Full Name", patientName: "Patient Name",
    mobile: "Mobile Number", email: "Email", businessName: "Name", customerType: "Customer Category",
    address: "Address", addressLine1: "Address Line 1", addressLine2: "Address Line 2", addressLine3: "Address Line 3", addressLine4: "Address Line 4", pinCode: "PIN Code", dlNumber1: "DL Number 1", dlNumber2: "DL Number 2", dlNumber3: "DL Number 3", fssaiNumber: "FSSAI Number",
    gstNumber: "GST Number", creditDays: "Credit Period", paymentMethod: "Payment Method",
    companyName: "Company Name", headquarter: "Headquarter", division: "Division", gender: "Gender",
  };
  return keys[record.kind]
    .filter((key) => record[key] !== undefined && record[key] !== "" && !(key === "address" && record.addressLine1))
    .map((key) => [labels[key] ?? key, String(record[key])]);
}

function currentWorkflowStep(record: RecordShape) {
  if (record.status === "approved") return record.activationPending ? 2 : 5;
  if (record.status === "rejected") return 1;
  return 1;
}

export function VerificationPage({ expectedKind, superAdminFlow = false, returnPath = "/super-admin/approvals" }: { expectedKind?: Kind; superAdminFlow?: boolean; returnPath?: string }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading registration details…</p>}>
      <VerificationContent expectedKind={expectedKind} superAdminFlow={superAdminFlow} returnPath={returnPath} />
    </Suspense>
  );
}

function VerificationContent({ expectedKind, superAdminFlow, returnPath }: { expectedKind?: Kind; superAdminFlow: boolean; returnPath: string }) {
  const params = useParams<{ id: string }>();
  const [record, setRecord] = useState<RecordShape | null>(null);
  const [error, setError] = useState("");
  const [isDeciding, setIsDeciding] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [masterCode, setMasterCode] = useState("");
  const [activationPending, setActivationPending] = useState(false);
  const [decisionNotice, setDecisionNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/registrations/${params.id}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Unable to load registration.");
        if (expectedKind && data.record.kind !== expectedKind) throw new Error("Registration not found.");
        return data as { record: RecordShape };
      })
      .then((data) => { setRecord(data.record); setActivationPending(data.record.activationPending === true); })
      .catch((item: unknown) => {
        if (item instanceof DOMException && item.name === "AbortError") return;
        setError(item instanceof Error ? item.message : "Unable to load registration.");
      });
    return () => controller.abort();
  }, [params.id, expectedKind]);

  async function decide(action: "approve" | "reject") {
    setError("");
    setIsDeciding(true);
    try {
      const response = await fetch(`/api/admin/registrations/${params.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Action failed");
      if (action === "approve" && superAdminFlow && typeof data.masterCode === "string") setMasterCode(data.masterCode);
      setActivationPending(data.activationPending === true);
      setDecisionNotice(action === "approve" ? "Registration approved. Account activation remains pending." : "Registration rejected.");
      setRecord((current) => current ? {
        ...current,
        status: action === "approve" ? "approved" : "rejected",
        decidedAt: new Date().toISOString(),
        rejectionReason: action === "reject" ? reason : current.rejectionReason,
      } : current);
      setApproveOpen(false);
      setRejectOpen(false);
      setReason("");
    } catch (item) {
      setError(item instanceof Error ? item.message : "Action failed");
    } finally {
      setIsDeciding(false);
    }
  }

  if (error && !record) return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-danger" role="alert">{error}</p>;
  if (!record) return <p className="text-sm text-muted">Loading registration details…</p>;

  if (masterCode && superAdminFlow) {
    const masterName = record.kind === "company" ? "Company" : record.kind[0].toUpperCase() + record.kind.slice(1);
    return (
      <section className="flex min-h-[55vh] flex-col items-center justify-center rounded-2xl border border-line bg-white px-5 py-12 text-center shadow-sm">
        <span aria-hidden="true" className="text-4xl font-semibold text-emerald-700">✓</span>
        <h1 className="mt-3 text-2xl font-semibold text-foreground">{masterName} Master Created Successfully</h1>
        <p className="mt-2 text-sm text-muted">{masterName} Code</p>
        <p className="mt-4 font-mono text-3xl font-semibold text-foreground">{masterCode}</p>
        <span className="mt-4 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold tracking-wide text-emerald-700">AUTO-GENERATED</span>
        <p className="mt-4 text-sm text-muted">Login account created and activated successfully.</p>
      </section>
    );
  }

  const files = record.files ?? {};
  const entries = detailEntries(record);
  const completedThrough = currentWorkflowStep(record);
  const rejectedAtReview = record.status === "rejected";
  const kindLabel = record.kind === "company" ? "Company" : record.kind[0].toUpperCase() + record.kind.slice(1);

  return (
    <div className="space-y-4 sm:space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {superAdminFlow ? <Link href={returnPath} className="mb-2 inline-flex text-sm font-medium text-brand hover:underline">← Registration Approvals</Link> : null}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">Registration Details</h1>
            <span className="rounded-full bg-panel px-3 py-1 text-xs font-semibold text-brand">{kindLabel}</span>
          </div>
          <p className="mt-1 text-sm text-muted">{record.id} <span className="px-1">·</span> Submitted {formatDateTime(record.submittedAt)}</p>
        </div>
        <StatusBadge value={record.status} />
      </header>

      <section aria-label="Registration progress" className="overflow-x-auto rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5">
        <ol className="grid min-w-[760px] grid-cols-8">
          {workflowSteps.map((step, index) => {
            const complete = index < completedThrough;
            const active = index === completedThrough && !rejectedAtReview;
            const rejected = rejectedAtReview && index === 1;
            return (
              <li key={step} className="relative flex flex-col items-center px-1 text-center">
                {index < workflowSteps.length - 1 ? <span aria-hidden="true" className={cn("absolute left-1/2 top-[15px] h-[3px] w-full", index < completedThrough ? "bg-emerald-700" : "bg-slate-200")} /> : null}
                <span className={cn("relative z-10 inline-flex size-[30px] items-center justify-center rounded-full border-2 bg-white text-xs font-semibold", complete && "border-emerald-700 bg-emerald-700 text-white", active && "border-brand text-brand", rejected && "border-red-600 bg-red-50 text-red-700", !complete && !active && !rejected && "border-slate-200 text-muted")}>
                  {complete ? "✓" : rejected ? "×" : index + 1}
                </span>
                <span className={cn("mt-2 max-w-28 text-[11px] leading-4 sm:text-xs", complete || active ? "font-medium text-foreground" : rejected ? "font-medium text-red-700" : "text-muted")}>{rejected ? "Rejected" : step}</span>
                {index === 0 ? <span className="mt-1 text-[10px] text-muted">{formatDateTime(record.submittedAt)}</span> : null}
                {index === 2 && complete && record.decidedAt ? <span className="mt-1 text-[10px] text-muted">{formatDateTime(record.decidedAt)}</span> : null}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-foreground">Registration details</h2>
        <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs font-medium text-muted">{label}</dt>
              <dd className="mt-1 break-words text-sm font-semibold text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
        {record.status === "rejected" && record.rejectionReason ? <div className="mt-5 rounded-xl border border-red-100 bg-red-50 p-4"><h3 className="text-sm font-semibold text-red-800">Rejection reason</h3><p className="mt-1 whitespace-pre-wrap text-sm text-red-700">{record.rejectionReason}</p></div> : null}
      </section>

      <section className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-base font-semibold text-foreground">Documents</h2><p className="mt-1 text-xs text-muted">Uploaded files submitted with this registration.</p></div>
          <span className="rounded-full bg-panel px-2.5 py-1 text-xs font-medium text-muted">{Object.keys(files).length} uploaded</span>
        </div>
        {Object.keys(files).length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(files).map(([key, file]) => (
              <div key={key} className="rounded-xl border border-dashed border-line bg-background">
              <a href={file.dataUrl} target="_blank" rel="noopener noreferrer" className="group flex min-h-16 items-center justify-between gap-3 rounded-xl px-4 py-3 transition hover:border-brand hover:bg-panel/60">
                <span className="min-w-0"><span className="block truncate text-sm font-medium text-foreground group-hover:text-brand">{documentLabels[key] ?? `View ${key}`}</span><span className="mt-1 block truncate text-xs text-muted">{file.name}</span></span>
                <span className="shrink-0 text-xs font-semibold text-brand">Preview ↗</span>
              </a>
              <a href={file.downloadUrl ?? file.dataUrl} download target="_blank" rel="noopener noreferrer" className="mb-3 ml-4 inline-flex text-xs font-medium text-brand underline" aria-label={`Download ${file.name}`}>Download</a>
              </div>
            ))}
          </div>
        ) : <p className="mt-4 rounded-xl border border-dashed border-line bg-background p-5 text-center text-sm text-muted">No documents were uploaded.</p>}
        {record.kind === "customer" && !files.gstCertificate ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">GST Certificate Upload * — required document not present.</p> : null}
      </section>

      {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-danger" role="alert">{error}</p> : null}
      {decisionNotice ? <p className="rounded-lg border border-line bg-panel p-3 text-sm" role="status">{decisionNotice}</p> : null}

      {record.status === "pending_verification" ? (
        <div className="flex flex-wrap justify-end gap-3 pb-2">
          <Button variant="danger" onClick={() => setRejectOpen(true)}>Reject</Button>
          <Button onClick={() => setApproveOpen(true)}>Approve Registration</Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={approveOpen}
        title="Approve registration"
        description={activationPending ? "Record this registration as approved. Account activation and master creation remain pending." : "This will create the respective Master, generate a Master Code username, and activate the account. WhatsApp notifications are not sent because delivery is not configured."}
        confirmLabel="Approve Registration"
        busy={isDeciding}
        error={approveOpen ? error : undefined}
        onClose={() => setApproveOpen(false)}
        onConfirm={() => decide("approve")}
      />
      <ConfirmDialog
        open={rejectOpen}
        title="Reason for Rejection"
        description="Explain what the applicant needs to correct."
        confirmLabel="Reject Registration"
        danger
        busy={isDeciding}
        confirmDisabled={reason.trim().length < 8}
        error={rejectOpen ? error : undefined}
        onClose={() => setRejectOpen(false)}
        onConfirm={() => decide("reject")}
      >
        <TextArea
          className="mt-4"
          placeholder="Explain what the applicant needs to correct"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </ConfirmDialog>
    </div>
  );
}
