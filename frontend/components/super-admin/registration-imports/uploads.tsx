"use client";

import { useEffect, useState } from "react";
import { RegistrationImportNavigation } from "@/components/super-admin/registration-imports/navigation";
import { pollImport, terminalImportStatuses } from "@/lib/import-polling";
import { formatDateTime } from "@/lib/utils";

type Upload = { id:string; fileName:string; supportingFileName?:string; warnings?:string[]; kind:"customer"|"company"|"patient"; uploadedBy:string; uploadedAt:string; totalRecords:number; successfulRecords:number; failedRecords:number; progress:number; status:string; errorSummary?:string; rowErrors?:Array<{rowNumber:number;errors:string[]}> };
const typeName = (kind: Upload["kind"]) => kind === "company" ? "Company" : `${kind[0].toUpperCase()}${kind.slice(1)}`;

export function RegistrationUploads({ basePath = "/super-admin" }: { basePath?: string }) {
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [order, setOrder] = useState("desc");
  const [version, setVersion] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [items, setItems] = useState<Upload[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    return pollImport<{ items: Upload[]; total: number }>(
      `/api/super-admin/registration-imports/uploads?page=${page}&pageSize=25&order=${order}`,
      data => {
        setItems(data.items); setTotal(data.total); setError(""); setLoading(false);
        return data.items.some(item => !terminalImportStatuses.has(item.status));
      }, message => { setError(message); setLoading(false); },
    );
  }, [page, order, version]);
  async function remove(id: string) {
    if (!window.confirm("Delete this upload history entry? Imported accounts and their supporting documents will remain.")) return;
    setDeleting(id);
    try { const response = await fetch(`/api/super-admin/registration-imports/${id}`, { method: "DELETE" }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Unable to delete upload."); setVersion(v => v + 1); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to delete upload."); }
    finally { setDeleting(null); }
  }
  return <div className="mx-auto max-w-7xl">
    <h1 className="text-2xl font-semibold">Registration Imports</h1><p className="mt-1 text-sm text-muted">Monitor uploaded workbooks, processing progress, and row results.</p>
    <RegistrationImportNavigation current={`${basePath}/registration-imports/uploads`} basePath={basePath} />
    <section className="mt-6 rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-7"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold">Uploads</h2><button type="button" onClick={() => setVersion(v => v + 1)} className="text-sm text-brand underline">Refresh uploads</button><select aria-label="Sort uploads by date" value={order} onChange={event => { setOrder(event.target.value); setPage(1); }} className="rounded border border-line p-2 text-sm"><option value="desc">Newest first</option><option value="asc">Oldest first</option></select></div>
      {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-danger">{error}</p> : null}
      <div className="mt-4 overflow-x-auto rounded-xl border border-line"><table className="min-w-[760px] w-full text-left text-sm"><thead className="bg-background"><tr>{["File Name","Registration Type","Uploaded By","Uploaded At","Progress","Action"].map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-3 font-semibold">{heading}</th>)}</tr></thead><tbody>
        {items.map((item) => <tr key={item.id} className="border-t border-line"><td className="max-w-64 px-3 py-3 font-medium break-words">{item.fileName}{item.supportingFileName ? <span className="mt-1 block text-xs font-normal text-muted">ZIP: {item.supportingFileName}</span> : null}</td><td className="whitespace-nowrap px-3 py-3">{typeName(item.kind)}</td><td className="max-w-40 px-3 py-3 break-words">{item.uploadedBy}</td><td className="whitespace-nowrap px-3 py-3">{formatDateTime(item.uploadedAt)}</td><td className="px-3 py-3"><p className="mb-1 text-xs">{item.status.replaceAll("_", " ")}</p><div className="flex min-w-28 items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-brand transition-all" style={{ width:`${Math.max(0,Math.min(100,item.progress))}%` }} /></div><span className="text-xs">{item.progress}%</span></div><p className="mt-1 text-xs text-muted">{item.totalRecords} rows · {item.successfulRecords} imported · {item.failedRecords} failed</p>{item.warnings?.length ? <p className="mt-1 text-xs text-amber-800">{item.warnings.length} warnings; see row report</p> : null}{item.errorSummary ? <p className="mt-1 max-w-64 text-xs text-danger">{item.errorSummary}</p> : null}{item.rowErrors?.length ? <details className="mt-1 max-w-64 text-xs"><summary className="cursor-pointer font-semibold text-brand">View row errors ({item.rowErrors.length})</summary><ul className="mt-2 max-h-36 list-disc space-y-1 overflow-auto pl-4 text-danger">{item.rowErrors.map((row) => <li key={row.rowNumber}>Row {row.rowNumber}: {row.errors.join("; ")}</li>)}</ul></details> : null}</td><td className="px-3 py-3"><a href={`/api/super-admin/registration-imports/uploads/${encodeURIComponent(item.id)}/file`} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold hover:bg-background">Download</a><a className="ml-2 text-xs text-brand underline" href={`/api/super-admin/registration-imports/${item.id}/errors`}>Row report</a><button type="button" disabled={deleting === item.id || ["IMPORTING", "VALIDATING", "PENDING_VALIDATION"].includes(item.status)} onClick={() => void remove(item.id)} className="ml-2 rounded-lg border border-line px-3 py-2 text-xs font-semibold disabled:opacity-50">Delete</button></td></tr>)}
        {!loading && items.length === 0 ? <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">No uploaded workbooks yet.</td></tr> : null}
        {loading ? <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">Loading upload history…</td></tr> : null}
      </tbody></table></div><div className="mt-4 flex items-center justify-end gap-3 text-sm"><button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="disabled:opacity-50">Previous</button><span>Page {page} · {total} uploads</span><button disabled={page * 25 >= total} onClick={() => setPage(p => p + 1)} className="disabled:opacity-50">Next</button></div>
    </section>
  </div>;
}
