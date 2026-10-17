"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateTime } from "@/lib/utils";

type Item = {
  id: string;
  kind: string;
  status: string;
  submittedAt: string;
  name: string;
  mobile: string;
  email?: string;
};

export function RegistrationTable({
  kind,
  title,
}: {
  kind: "customer" | "company" | "patient";
  title: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/admin/registrations?kind=${kind}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Unable to load registrations.");
        return data;
      })
      .then((data) => {
        if (active) setItems(data.items ?? []);
      })
      .catch((item: unknown) => {
        if (active) setError(item instanceof Error ? item.message : "Unable to load registrations.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [kind]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
      <p className="mt-1 text-sm text-muted">Open VIEW to verify submitted fields and documents.</p>
      {error ? <p className="mt-3 text-sm text-danger" role="alert">{error}</p> : null}
      <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-background text-foreground">
            <tr>
              <th className="px-4 py-3">Registration ID</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Mobile</th>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-line">
                <td className="px-4 py-3 font-medium">{item.id}</td>
                <td className="px-4 py-3">{item.name}</td>
                <td className="px-4 py-3">{item.mobile}</td>
                <td className="px-4 py-3">{formatDateTime(item.submittedAt)}</td>
                <td className="px-4 py-3">
                  <StatusBadge value={item.status} />
                </td>
                <td className="px-4 py-3">
                  <Link className="font-semibold text-brand hover:underline" href={`/admin/approvals/${kind}/${item.id}`}>
                    VIEW
                  </Link>
                </td>
              </tr>
            ))}
            {!loading && !error && items.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-muted" colSpan={6}>
                  No registrations yet.
                </td>
              </tr>
            ) : null}
            {loading ? <tr><td className="px-4 py-8 text-muted" colSpan={6}>Loading registrations…</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
