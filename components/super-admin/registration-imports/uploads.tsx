"use client";

import { useEffect, useState } from "react";
import { RegistrationImportNavigation } from "@/components/super-admin/registration-imports/navigation";
import { formatDateTime } from "@/lib/utils";

type Upload = { id:string; fileName:string; kind:"customer"|"company"|"patient"; uploadedBy:string; uploadedAt:string; totalRecords:number; successfulRecords:number; failedRecords:number; progress:number; status:string; errorSummary?:string; rowErrors?:Array<{rowNumber:number;errors:string[]}> };
const typeName = (kind: Upload["kind"]) => kind === "company" ? "Company" : `${kind[0].toUpperCase()}${kind.slice(1)}`;

export function RegistrationUploads() {
  const [items, setItems] = useState<Upload[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try { const response = await fetch("/api/super-admin/registration-imports/uploads", { cache:"no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Unable to load upload history."); if (active) { setItems(data.items as Upload[]); setError(""); } }
      catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "Unable to load upload history."); }
      finally { if (active) setLoading(false); }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  return <div className="mx-auto max-w-7xl">
    <h1 className="text-2xl font-semibold">Registration Imports</h1><p className="mt-1 text-sm text-muted">Monitor uploaded workbooks, processing progress, and row results.</p>
    <RegistrationImportNavigation current="/super-admin/registration-imports/uploads" />
    <section className="mt-6 rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-7"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold">Uploads</h2><span className="text-xs text-muted">Refreshes every 3 seconds</span></div>
      {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-danger">{error}</p> : null}
      <div className="mt-4 overflow-x-auto rounded-xl border border-line"><table className="min-w-[880px] w-full text-left text-sm"><thead className="bg-background"><tr>{["File Name","Registration Type","Uploaded By","Uploaded At","Progress","Status","Action"].map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-3 font-semibold">{heading}</th>)}</tr></thead><tbody>
        {items.map((item) => <tr key={item.id} className="border-t border-line"><td className="max-w-64 px-3 py-3 font-medium break-words">{item.fileName}</td><td className="whitespace-nowrap px-3 py-3">{typeName(item.kind)}</td><td className="max-w-40 px-3 py-3 break-words">{item.uploadedBy}</td><td className="whitespace-nowrap px-3 py-3">{formatDateTime(item.uploadedAt)}</td><td className="px-3 py-3"><div className="flex min-w-28 items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-brand transition-all" style={{ width:`${Math.max(0,Math.min(100,item.progress))}%` }} /></div><span className="text-xs">{item.progress}%</span></div></td><td className="px-3 py-3"><span className="rounded-full bg-background px-2 py-1 text-xs font-semibold">{item.status.replaceAll("_"," ")}</span>{item.errorSummary ? <p className="mt-1 max-w-48 text-xs text-danger">{item.errorSummary}</p> : null}{item.rowErrors?.length ? <details className="mt-1 max-w-64 text-xs"><summary className="cursor-pointer font-semibold text-brand">View row errors ({item.rowErrors.length})</summary><ul className="mt-2 max-h-36 list-disc space-y-1 overflow-auto pl-4 text-danger">{item.rowErrors.map((row) => <li key={row.rowNumber}>Row {row.rowNumber}: {row.errors.join("; ")}</li>)}</ul></details> : null}</td><td className="px-3 py-3"><a href={`/api/super-admin/registration-imports/uploads/${encodeURIComponent(item.id)}/file`} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold hover:bg-background">Download</a></td></tr>)}
        {!loading && items.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-muted">No uploaded workbooks yet.</td></tr> : null}
        {loading ? <tr><td colSpan={7} className="px-4 py-10 text-center text-muted">Loading upload history…</td></tr> : null}
      </tbody></table></div>
    </section>
  </div>;
}
