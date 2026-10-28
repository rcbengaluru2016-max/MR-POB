"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatDateTime } from "@/lib/utils";

type Kind = "customer" | "company" | "patient";
type Item = { id: string; masterCode?: string; kind: Kind; accountStatus: "active" | "inactive"; submittedAt: string; name: string; email: string };
type SortKey = "id" | "name" | "email" | "submittedAt" | "accountStatus";
const pageSize = 10;

export function SuperAdminRegistrationTable({ kind, basePath = "/super-admin" }: { kind: Kind; basePath?: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("submittedAt");
  const [descending, setDescending] = useState(true);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/super-admin/registrations?kind=${kind}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load registrations.");
        return result as { items: Item[] };
      })
      .then((result) => { setItems(result.items); setError(""); })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Unable to load registrations.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [kind]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items
      .filter((item) => !query || [item.id, item.masterCode ?? "", item.name, item.email].some((value) => value.toLowerCase().includes(query)))
      .sort((left, right) => {
        const a = left[sortKey].toLowerCase();
        const b = right[sortKey].toLowerCase();
        return (a < b ? -1 : a > b ? 1 : 0) * (descending ? -1 : 1);
      });
  }, [items, search, sortKey, descending]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);

  function sortBy(key: SortKey) {
    setPage(0);
    if (sortKey === key) setDescending((current) => !current);
    else { setSortKey(key); setDescending(key === "submittedAt"); }
  }

  const heading = kind === "company" ? "Company Accounts" : `${kind[0].toUpperCase()}${kind.slice(1)} Accounts`;
  const header = (label: string, key: SortKey) => <button type="button" onClick={() => sortBy(key)} className="font-semibold hover:text-brand">{label}{sortKey === key ? (descending ? " ↓" : " ↑") : ""}</button>;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-2xl font-semibold text-foreground">{heading}</h1><p className="mt-1 text-sm text-muted">Approved registrations and their login account status.</p></div>
        <label className="grid w-full gap-1 text-xs font-medium text-muted sm:w-80">Search accounts<input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Name, email, or registration ID" className="h-10 rounded-lg border border-line bg-white px-3 text-sm text-foreground placeholder:text-muted" /></label>
      </div>
      {error ? <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-danger" role="alert">{error}</p> : null}
      <div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="min-w-[620px] w-full text-left text-sm">
          <thead className="bg-background text-foreground"><tr>
            <th className="px-3 py-2.5">{header("Name", "name")}</th>
            <th className="px-3 py-2.5">{header("Email ID", "email")}</th>
            <th className="px-3 py-2.5">{header("Registration Date", "submittedAt")}</th>
            <th className="px-3 py-2.5">{header("Account", "accountStatus")}</th>
            <th className="px-3 py-2.5">Action</th>
          </tr></thead>
          <tbody>
            {visible.map((item) => <tr key={item.id} className="border-t border-line">
              <td className="px-3 py-2.5 font-medium">{item.name}<span className="mt-1 block font-mono text-xs text-muted">{item.id}</span>{item.masterCode ? <span className="mt-1 block font-mono text-xs text-brand">Master Code: {item.masterCode}</span> : null}</td><td className="max-w-64 truncate px-3 py-2.5" title={item.email}>{item.email || "—"}</td><td className="whitespace-nowrap px-3 py-2.5">{formatDateTime(item.submittedAt)}</td><td className="px-3 py-2.5"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${item.accountStatus === "active" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{item.accountStatus === "active" ? "Active" : "Inactive"}</span></td><td className="px-3 py-2.5"><Link href={`${basePath}/registrations/${kind}/${encodeURIComponent(item.id)}`} className="inline-flex min-h-8 items-center rounded-lg border border-line px-3 text-xs font-semibold text-foreground hover:border-brand hover:text-brand">View</Link></td>
            </tr>)}
            {loading ? <tr><td className="px-4 py-8 text-center text-muted" colSpan={5}>Loading registrations…</td></tr> : null}
            {!loading && !error && visible.length === 0 ? <tr><td className="px-4 py-8 text-center text-muted" colSpan={5}>{search ? "No accounts match your search." : "No approved accounts are available yet."}</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <p>{filtered.length ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, filtered.length)} of ${filtered.length} accounts` : "0 accounts"}</p>
        <div className="flex gap-2"><button type="button" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))} className="rounded-lg border border-line bg-white px-3 py-2 disabled:opacity-50">Previous</button><span className="px-2 py-2">Page {page + 1} of {pageCount}</span><button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} className="rounded-lg border border-line bg-white px-3 py-2 disabled:opacity-50">Next</button></div>
      </div>
    </div>
  );
}
