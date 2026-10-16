"use client";

import { useState } from "react";
import { RegistrationImportNavigation } from "@/components/super-admin/registration-imports/navigation";

type Kind = "customer" | "mr" | "patient";
type PreviewRow = { rowNumber: number; name: string; mobile: string; email: string; valid: boolean; duplicate: boolean; errors: string[] };
type ImportResultRow = { rowNumber: number; errors: string[] };

export function BulkRegistrationUpload() {
  const [kind, setKind] = useState<Kind>("customer");
  const [workbook, setWorkbook] = useState<File | null>(null);
  const [documents, setDocuments] = useState<File[]>([]);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [results, setResults] = useState<ImportResultRow[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(action: "preview" | "commit") {
    if (!workbook) { setMessage("Choose a completed .xlsx template first."); return; }
    setBusy(true); setMessage("");
    try {
      const form = new FormData(); form.set("kind", kind); form.set("action", action); form.set("file", workbook);
      for (const document of documents) form.append("documents", document);
      const response = await fetch("/api/super-admin/registration-imports/bulk", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to process this workbook.");
      if (action === "preview") {
        setPreview(result.rows as PreviewRow[]); setResults([]);
        setMessage(`${result.counts.valid} ready · ${result.counts.duplicates} duplicate${result.counts.duplicates === 1 ? "" : "s"} · ${result.counts.failed} other row error${result.counts.failed === 1 ? "" : "s"}`);
      } else {
        setPreview([]); setResults((result.results ?? []) as ImportResultRow[]);
        setMessage(`${result.imported} imported · ${result.duplicates} duplicates · ${result.failed} other failed`);
        setWorkbook(null); setDocuments([]);
      }
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Import failed."); }
    finally { setBusy(false); }
  }

  return <div className="mx-auto max-w-7xl">
    <h1 className="text-2xl font-semibold">Registration Imports</h1>
    <p className="mt-1 text-sm text-muted">Upload records for the existing review and approval workflow.</p>
    <RegistrationImportNavigation current="/super-admin/registration-imports" />
    <section className="mt-6 rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-7">
      <h2 className="text-xl font-semibold">Bulk Upload</h2>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">Download the category template, fill in up to 250 records, then select the workbook and any supporting files referenced in its file-name columns. Passwords are validated but never shown in the preview.</p>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <label className="grid gap-1 text-sm font-medium">Registration category<select value={kind} onChange={(event) => { setKind(event.target.value as Kind); setPreview([]); setResults([]); }} className="h-11 rounded-lg border border-line bg-white px-3"><option value="customer">Customer</option><option value="mr">MR</option><option value="patient">Patient</option></select></label>
        <div className="flex items-end"><a href={`/api/super-admin/registration-imports/bulk?kind=${kind}`} className="inline-flex h-11 items-center rounded-lg border border-brand px-4 text-sm font-semibold text-brand hover:bg-brand/5">Download Excel Template</a></div>
        <label className="grid gap-1 text-sm font-medium">Completed Excel file<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setWorkbook(event.target.files?.[0] ?? null); setPreview([]); setResults([]); }} className="block h-11 w-full rounded-lg border border-line p-2 text-sm" /></label>
      </div>
      <label className="mt-4 grid max-w-xl gap-1 text-sm font-medium">Supporting documents <span className="font-normal text-muted">Select the files named in the workbook (JPG, PNG, WEBP, or PDF; 5 MB each, 25 MB total).</span><input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setDocuments(Array.from(event.target.files ?? []))} className="block w-full rounded-lg border border-line p-2 text-sm" /></label>
      {message ? <p className="mt-4 rounded-lg bg-background p-3 text-sm" role="status">{message}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy || !workbook} onClick={() => void submit("preview")} className="rounded-lg border border-brand px-4 py-2 text-sm font-semibold text-brand disabled:opacity-50">{busy ? "Validating…" : "Upload Excel File & Validate"}</button><button type="button" disabled={busy || preview.length === 0} onClick={() => { if (window.confirm("Process this workbook? Valid records will be saved as Pending Verification.")) void submit("commit"); }} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Processing…" : "Confirm Import"}</button></div>
      {preview.length ? <div className="mt-5 max-h-96 overflow-auto rounded-xl border border-line"><table className="min-w-[740px] w-full text-left text-sm"><thead className="sticky top-0 bg-background"><tr>{["Row","Name","Mobile","Email","Validation"].map((heading) => <th key={heading} className="p-3 font-semibold">{heading}</th>)}</tr></thead><tbody>{preview.map((row) => <tr className="border-t border-line align-top" key={row.rowNumber}><td className="p-3">{row.rowNumber}</td><td className="p-3">{row.name || "—"}</td><td className="p-3">{row.mobile || "—"}</td><td className="p-3">{row.email || "—"}</td><td className={`p-3 ${row.valid ? "text-green-700" : "text-danger"}`}>{row.valid ? "Ready" : row.errors.join("; ")}</td></tr>)}</tbody></table></div> : null}
      {results.length ? <div className="mt-5 rounded-xl border border-line p-4"><h3 className="font-semibold">Rows not imported</h3><ul className="mt-2 grid gap-1 text-sm text-danger">{results.map((row) => <li key={row.rowNumber}>Row {row.rowNumber}: {row.errors.join("; ")}</li>)}</ul></div> : null}
    </section>
  </div>;
}
