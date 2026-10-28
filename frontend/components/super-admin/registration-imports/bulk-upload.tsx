"use client";

import { useEffect, useState } from "react";
import { pollImport, terminalImportStatuses } from "@/lib/import-polling";
import { validateImportFiles } from "@/lib/import-files";
import { RegistrationImportNavigation } from "@/components/super-admin/registration-imports/navigation";

type Kind = "customer" | "company" | "patient";
type PreviewRow = { rowNumber: number; masterCode: string; category: string; documentStatus: string; name: string; mobile: string; email: string; valid: boolean; duplicate: boolean; errors: string[] };
type ImportResultRow = { rowNumber: number; errors: string[] };

export function BulkRegistrationUpload({ basePath = "/super-admin" }: { basePath?: string }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [monitoring, setMonitoring] = useState(false);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState<{ status: string; progress: number } | null>(null);
  const [kind, setKind] = useState<Kind>("customer");
  const [workbook, setWorkbook] = useState<File | null>(null);
  const [fileVersion, setFileVersion] = useState(0);
  const [archive, setArchive] = useState<File | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [results, setResults] = useState<ImportResultRow[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!sessionId || !monitoring) return;
    return pollImport<{ status: string; progress: number; importedRecords: number; totalRecords: number }>(
      `/api/super-admin/registration-imports/${sessionId}/progress`,
      result => {
        setProgress({ status: result.status, progress: result.progress });
        if (terminalImportStatuses.has(result.status)) {
          setReady(false); setMonitoring(false);
          if (["COMPLETED", "PARTIALLY_COMPLETED", "FAILED"].includes(result.status)) setMessage(`${result.importedRecords} imported of ${result.totalRecords}. Download the validation report for row results.`);
          return false;
        }
        return true;
      }, setMessage,
    );
  }, [sessionId, monitoring]);

  async function submit(action: "preview" | "commit") {
    if (!workbook || !archive) { setMessage("Choose a completed .xlsx or .csv template and its Supporting Documents ZIP first."); return; }
    setBusy(true); setMessage("");
    try {
      await validateImportFiles(workbook, archive);
      const form = new FormData(); form.set("kind", kind); form.set("file", workbook); form.set("documentsZip", archive);
      if (action === "commit") form.delete("kind");
      const response = await fetch(action === "preview" ? "/api/super-admin/registration-imports/bulk" : `/api/super-admin/registration-imports/${sessionId}/confirm`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to process this workbook.");
      if (action === "preview") {
        setMonitoring(false); setProgress({ status: result.ready ? "READY" : "VALIDATION_FAILED", progress: 0 });
        setSessionId(result.id); setReady(result.ready === true); setPreview(result.rows as PreviewRow[]); setWarnings(result.warnings ?? []); setResults([]);
        setMessage(`${result.counts.total} total · ${result.counts.valid} ready · ${result.counts.failed} invalid · ${result.counts.duplicates} duplicates · ${result.counts.extractedDocuments} extracted documents · ${result.counts.readyDocuments} documents ready · ${result.counts.documentFailures} document failures`);
      } else {
        setMonitoring(result.queued === true);
        setPreview([]); setReady(false); setResults((result.results ?? []) as ImportResultRow[]);
        setMessage(result.queued ? "Import queued. Processing progress will update automatically." : `${result.imported} imported; ${result.failed} failed`);
        setWorkbook(null); setArchive(null); setFileVersion(version => version + 1);
      }
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Import failed."); }
    finally { setBusy(false); }
  }

  return <div className="mx-auto max-w-7xl">
    <h1 className="text-2xl font-semibold">Registration Imports</h1>
    <p className="mt-1 text-sm text-muted">Imported registrations are automatically approved and added to their account pages.</p>
    <RegistrationImportNavigation current={`${basePath}/registration-imports`} basePath={basePath} />
    <section className="mt-6 rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-7">
      <h2 className="text-xl font-semibold">Bulk Upload</h2>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">Download the category template, fill in up to 250 records, keep existing users’ Master Codes exactly as assigned (for example C01234), leave the Master Code blank only for new users to receive a ZI code, and enter exact document filenames, then upload the spreadsheet and a ZIP containing those documents. Use the same filenames, including letter case; subfolders are allowed only when filenames are unique. Passwords are validated but never shown in the preview.</p>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <label className="grid gap-1 text-sm font-medium">Registration category<select disabled={busy} value={kind} onChange={(event) => { setKind(event.target.value as Kind); setWorkbook(null); setArchive(null); setWarnings([]); setMessage(""); setPreview([]); setReady(false); setSessionId(null); setMonitoring(false); setProgress(null); setResults([]); }} className="h-11 rounded-lg border border-line bg-white px-3"><option value="customer">Customer</option><option value="company">Company</option><option value="patient">Patient</option></select></label>
        <div className="flex items-end"><a href={`/api/super-admin/registration-imports/bulk?kind=${kind}`} className="inline-flex h-11 items-center rounded-lg border border-brand px-4 text-sm font-semibold text-brand hover:bg-brand/5">Download Excel Template</a></div>
        <label className="grid gap-1 text-sm font-medium">Completed Excel File<input key={`sheet-${kind}-${fileVersion}`} disabled={busy} type="file" accept=".xlsx,.csv" onChange={(event) => { setWorkbook(event.target.files?.[0] ?? null); setWarnings([]); setMessage(""); setPreview([]); setReady(false); setSessionId(null); setMonitoring(false); setProgress(null); setResults([]); }} className="block h-11 w-full rounded-lg border border-line p-2 text-sm" /></label>
      </div>
      <label className="mt-4 grid max-w-xl gap-1 text-sm font-medium">Supporting Documents (ZIP)<input key={`zip-${kind}-${fileVersion}`} disabled={busy} type="file" accept=".zip" onChange={event => { setArchive(event.target.files?.[0] ?? null); setReady(false); setSessionId(null); setMonitoring(false); setProgress(null); setPreview([]); setResults([]); setWarnings([]); setMessage(""); }} className="block h-11 w-full rounded-lg border border-line p-2 text-sm" /><span className="font-normal text-muted">PDF, PNG, JPG/JPEG or WEBP; 5 MiB per document, 25 MiB expanded total. Use an empty ZIP when no documents are required.</span></label>
      {workbook || archive ? <p className="mt-3 break-words text-sm text-muted">Spreadsheet: {workbook?.name ?? "Not selected"} · ZIP: {archive?.name ?? "Not selected"}</p> : null}
      {warnings.length ? <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><h3 className="font-semibold">Validation warnings</h3><ul className="mt-2 max-h-40 list-disc overflow-auto pl-5">{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div> : null}
      {message ? <p className="mt-4 rounded-lg bg-background p-3 text-sm" role="status">{message}</p> : null}
      {progress ? <p className="mt-2 text-sm text-muted">{progress.status.replaceAll("_", " ")} · {progress.progress}% committed</p> : null}
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy || !workbook || !archive} onClick={() => void submit("preview")} className="rounded-lg border border-brand px-4 py-2 text-sm font-semibold text-brand disabled:opacity-50">{busy ? "Validating…" : "Upload Excel File & Validate"}</button><button type="button" disabled={busy || !ready || !sessionId || !workbook || !archive} onClick={() => { if (window.confirm("Import this workbook? Eligible records will be approved and added to accounts. Invalid records will be skipped.")) void submit("commit"); }} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Processing…" : "Confirm Import"}</button></div>
      {sessionId ? <a className="mt-4 inline-block text-sm text-brand underline" href={`/api/super-admin/registration-imports/${sessionId}/errors`}>Download validation report</a> : null}
      {preview.length ? <div className="mt-5 max-h-96 overflow-auto rounded-xl border border-line"><table className="min-w-[740px] w-full text-left text-sm"><thead className="sticky top-0 bg-background"><tr>{["Row","Master Code","Name","Category","Documents","Validation"].map((heading) => <th key={heading} className="p-3 font-semibold">{heading}</th>)}</tr></thead><tbody>{preview.map((row) => <tr className="border-t border-line align-top" key={row.rowNumber}><td className="p-3">{row.rowNumber}</td><td className="p-3">{row.masterCode || "—"}</td><td className="p-3">{row.name || "—"}</td><td className="p-3">{row.category}</td><td className="p-3">{row.documentStatus}</td><td className={`p-3 ${row.valid ? "text-green-700" : "text-danger"}`}>{row.valid ? "Ready" : row.errors.join("; ")}</td></tr>)}</tbody></table></div> : null}
      {results.length ? <div className="mt-5 rounded-xl border border-line p-4"><h3 className="font-semibold">Rows not imported</h3><ul className="mt-2 grid gap-1 text-sm text-danger">{results.map((row) => <li key={row.rowNumber}>Row {row.rowNumber}: {row.errors.join("; ")}</li>)}</ul></div> : null}
    </section>
  </div>;
}
