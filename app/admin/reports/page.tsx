"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateTime } from "@/lib/utils";
import type { AuditEvent, EmailLog } from "@/lib/types";

export default function ReportsPage() {
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [emails, setEmails] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/reports")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Unable to load reports.");
        return data;
      })
      .then((data) => {
        setAudit(data.audit ?? []);
        setEmails(data.emails ?? []);
      })
      .catch((item: unknown) => {
        setError(item instanceof Error ? item.message : "Unable to load reports.");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Reports</h1>
        <p className="mt-1 text-sm text-muted">Audit trail and activation email log.</p>
        {error ? <p className="mt-3 text-sm text-danger" role="alert">{error}</p> : null}
      </div>
      <section className="overflow-x-auto rounded-2xl border border-line bg-white">
        <h2 className="px-4 pt-4 font-semibold text-foreground">Audit trail</h2>
        <table className="mt-2 min-w-full text-left text-sm">
          <thead className="text-foreground">
            <tr>
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">Actor</th>
              <th className="px-4 py-2">Action</th>
              <th className="px-4 py-2">Registration</th>
              <th className="px-4 py-2">Master Code</th>
            </tr>
          </thead>
          <tbody>
            {!loading && !error && audit.length === 0 ? (
              <tr><td className="px-4 py-6 text-muted" colSpan={5}>No audit events yet.</td></tr>
            ) : null}
            {audit.map((item) => (
              <tr key={item.id} className="border-t border-line">
                <td className="px-4 py-2">{formatDateTime(item.at)}</td>
                <td className="px-4 py-2">{item.actor}</td>
                <td className="px-4 py-2">{item.action}</td>
                <td className="px-4 py-2">{item.registrationId ?? "—"}</td>
                <td className="px-4 py-2">{item.masterCode ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="overflow-x-auto rounded-2xl border border-line bg-white">
        <h2 className="px-4 pt-4 font-semibold">Email trigger status</h2>
        <table className="mt-2 min-w-full text-left text-sm">
          <thead className="text-foreground">
            <tr>
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">To</th>
              <th className="px-4 py-2">Subject</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {!loading && !error && emails.length === 0 ? (
              <tr><td className="px-4 py-6 text-muted" colSpan={4}>No email events yet.</td></tr>
            ) : null}
            {emails.map((item) => (
              <tr key={item.id} className="border-t border-line">
                <td className="px-4 py-2">{formatDateTime(item.at)}</td>
                <td className="px-4 py-2">{item.to}</td>
                <td className="px-4 py-2">{item.subject}</td>
                <td className="px-4 py-2">
                  <StatusBadge value={item.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
