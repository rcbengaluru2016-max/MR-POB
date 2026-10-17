"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type Kind = "customer" | "company" | "patient";
type Status = "pending_verification" | "submitted" | "approved" | "rejected" | "draft";
type Registration = {
  id: string;
  kind: Kind;
  status: Status;
  submittedAt: string;
  name: string;
  mobile: string;
  businessType: string;
};

const tabs: { kind: Kind; label: string }[] = [
  { kind: "customer", label: "Customer" },
  { kind: "company", label: "Company" },
  { kind: "patient", label: "Patient" },
];

function statusLabel(status: Status) {
  if (status === "pending_verification" || status === "submitted") return "Pending Verification";
  return status[0].toUpperCase() + status.slice(1);
}

function formatSubmitted(date: string) {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

function maskedMobile(mobile: string) {
  const digits = mobile.replace(/\D/g, "");
  return digits.length < 4 ? mobile : `${digits.slice(0, 2)}${"X".repeat(Math.max(0, digits.length - 4))}${digits.slice(-2)}`;
}

export function RegistrationApprovals() {
  const [items, setItems] = useState<Registration[]>([]);
  const [selectedKind, setSelectedKind] = useState<Kind>("customer");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/super-admin/approvals", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Unable to load registration approvals.");
        return data as { items: Registration[] };
      })
      .then((data) => setItems(data.items))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Unable to load registration approvals.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const selectedItems = useMemo(
    () => items.filter((item) => item.kind === selectedKind),
    [items, selectedKind],
  );
  const counts = useMemo(() => ({
    pending: selectedItems.filter((item) => item.status === "pending_verification" || item.status === "submitted").length,
    approved: selectedItems.filter((item) => item.status === "approved").length,
    rejected: selectedItems.filter((item) => item.status === "rejected").length,
  }), [selectedItems]);

  return (
    <div>
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Registration Approvals</h1>
        <p className="mt-1 text-sm text-muted">Review and approve new Customer, Company and Patient registrations</p>
      </header>

      <div className="mt-6 flex gap-2 overflow-x-auto border-b border-line" role="tablist" aria-label="Registration type">
        {tabs.map((tab) => (
          <button
            key={tab.kind}
            type="button"
            role="tab"
            aria-selected={selectedKind === tab.kind}
            onClick={() => setSelectedKind(tab.kind)}
            className={cn(
              "shrink-0 border-b-2 px-4 py-3 text-sm text-muted transition-colors hover:text-brand",
              selectedKind === tab.kind ? "border-brand font-semibold text-brand" : "border-transparent",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section className="mt-5 grid gap-4 md:grid-cols-3" aria-label="Registration status totals">
        <div className="rounded-xl border border-line border-l-4 border-l-amber-500 bg-white p-5">
          <p className="text-sm text-muted">Pending</p><p className="mt-1 text-2xl font-semibold text-foreground">{counts.pending}</p>
        </div>
        <div className="rounded-xl border border-line border-l-4 border-l-emerald-700 bg-white p-5">
          <p className="text-sm text-muted">Approved</p><p className="mt-1 text-2xl font-semibold text-foreground">{counts.approved}</p>
        </div>
        <div className="rounded-xl border border-line border-l-4 border-l-red-700 bg-white p-5">
          <p className="text-sm text-muted">Rejected</p><p className="mt-1 text-2xl font-semibold text-foreground">{counts.rejected}</p>
        </div>
      </section>

      {error ? <p className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-danger" role="alert">{error}</p> : null}

      <div className="mt-5 overflow-x-auto rounded-xl border border-line bg-white p-4 sm:p-5">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="text-muted"><tr className="border-b border-line">
            <th className="px-3 py-3 font-medium">Registration ID</th>
            <th className="px-3 py-3 font-medium">Name</th>
            <th className="px-3 py-3 font-medium">Mobile Number</th>
            <th className="px-3 py-3 font-medium">Business / Type</th>
            <th className="px-3 py-3 font-medium">Submitted</th>
            <th className="px-3 py-3 font-medium">Status</th>
            <th className="px-3 py-3 font-medium">Action</th>
          </tr></thead>
          <tbody>
            {selectedItems.map((item) => (
              <tr key={item.id} className="border-b border-line last:border-0">
                <td className="whitespace-nowrap px-3 py-4 font-mono text-xs font-semibold">{item.id}</td>
                <td className="px-3 py-4">{item.name}</td>
                <td className="whitespace-nowrap px-3 py-4">{maskedMobile(item.mobile)}</td>
                <td className="px-3 py-4">{item.businessType || "—"}</td>
                <td className="whitespace-nowrap px-3 py-4">{formatSubmitted(item.submittedAt)}</td>
                <td className="px-3 py-4"><span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-semibold", item.status === "approved" ? "bg-emerald-50 text-emerald-700" : item.status === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800")}>{statusLabel(item.status)}</span></td>
                <td className="px-3 py-4"><Link href={item.status === "approved" ? `/super-admin/registrations/${item.kind}/${encodeURIComponent(item.id)}` : `/super-admin/approvals/${item.kind}/${encodeURIComponent(item.id)}`} className="inline-flex min-h-9 items-center rounded-lg border border-line px-3 font-semibold text-foreground hover:border-brand hover:text-brand">View</Link></td>
              </tr>
            ))}
            {loading ? <tr><td className="px-3 py-10 text-center text-muted" colSpan={7}>Loading registrations…</td></tr> : null}
            {!loading && !error && selectedItems.length === 0 ? <tr><td className="px-3 py-10 text-center text-muted" colSpan={7}>No registrations have been submitted yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
