"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Summary = {
  customer: { pending: number; approved: number; rejected: number };
  mr: { pending: number; approved: number; rejected: number };
  patient: { pending: number; approved: number; rejected: number };
  masters: number;
  accounts: number;
  emails: number;
};

export default function AdminDashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/summary")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Unable to load dashboard.");
        return data;
      })
      .then(setSummary)
      .catch((item: unknown) => {
        setError(item instanceof Error ? item.message : "Unable to load dashboard.");
      });
  }, []);

  if (error) return <p className="text-danger" role="alert">{error}</p>;
  if (!summary) return <p>Loading dashboard…</p>;

  const cards = [
    ["Customer pending", summary.customer.pending, "/admin/approvals/customer"],
    ["MR pending", summary.mr.pending, "/admin/approvals/mr"],
    ["Patient pending", summary.patient.pending, "/admin/approvals/patient"],
    ["Approved customers", summary.customer.approved, "/admin/masters/customer"],
    ["Approved MRs", summary.mr.approved, "/admin/masters/mr"],
    ["Approved patients", summary.patient.approved, "/admin/masters/patient"],
  ] as const;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Registration Approvals</h1>
      <p className="mt-1 text-sm text-muted">
        Pending, approved, and rejected counts for each registration type.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(([label, value, href]) => (
          <Link key={label} href={href} className="rounded-2xl border border-line bg-white p-5 hover:border-brand">
            <p className="text-sm text-muted">{label}</p>
            <p className="mt-2 text-3xl font-semibold text-brand">{value}</p>
          </Link>
        ))}
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="text-sm text-muted">Rejected customers / MR / patients</p>
          <p className="mt-2 font-semibold">
            {summary.customer.rejected} / {summary.mr.rejected} / {summary.patient.rejected}
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="text-sm text-muted">Masters created</p>
          <p className="mt-2 text-3xl font-semibold text-brand">{summary.masters}</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="text-sm text-muted">Activation emails logged</p>
          <p className="mt-2 text-3xl font-semibold text-brand">{summary.emails}</p>
        </div>
      </div>
    </div>
  );
}
