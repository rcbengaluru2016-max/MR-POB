"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { getSpecialRateStatus, type SpecialRateStatus } from "@/lib/company/special-rates";

type ProductOption = { id: string; productCode: string; brandName: string; mrp: number };
type SpecialRate = { id: string; companyCode: string; productId: string; productCode: string; productName: string; mrp: number; specialRate: number; startDate: string; endDate: string; enabled: boolean; approvalStatus: "approved" | "pending" | "rejected"; createdAt: string; status: SpecialRateStatus };
type PreviewRow = { rowNumber: number; product: string; productName: string; mrp: number; specialRate: number; startDate: string; endDate: string; errors: string[] };
type ImportResult = { total: number; imported: number; failed: number; skipped: number; rowErrors: Array<{ rowNumber: number; product: string; errors: string[] }> };

function currency(value: number) { return Number.isFinite(value) ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value) : "—"; }

export function SpecialRates() {
  const [rates, setRates] = useState<SpecialRate[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SpecialRate | null>(null);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [startDateDraft, setStartDateDraft] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmRate, setConfirmRate] = useState<SpecialRate | null>(null);
  const [confirmAction, setConfirmAction] = useState<"toggle" | "delete">("toggle");
  const [workbook, setWorkbook] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [bulkError, setBulkError] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [today, setToday] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/company/special-rates", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load special rates.");
      setRates(data.rates as SpecialRate[]); setProducts(data.products as ProductOption[]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load special rates."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/company/special-rates", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load special rates.");
      if (active) { setRates(data.rates as SpecialRate[]); setProducts(data.products as ProductOption[]); }
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load special rates."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => { const interval = window.setInterval(() => setToday(new Date().toISOString().slice(0, 10)), 60_000); return () => window.clearInterval(interval); }, []);

  const visibleRates = useMemo(() => rates.filter((rate) => {
    const status = getSpecialRateStatus(rate, today);
    return (statusFilter === "all" || status.toLowerCase() === statusFilter) && [rate.productName, rate.productCode].some((value) => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  }).sort((a, b) => (a.startDate.localeCompare(b.startDate) * (sortDirection === "asc" ? 1 : -1))), [rates, query, statusFilter, sortDirection, today]);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(visibleRates.length / pageSize));
  const pageRates = visibleRates.slice((page - 1) * pageSize, page * pageSize);
  const selectedProduct = products.find((product) => product.id === selectedProductId);

  function openAdd() { setEditing(null); setSelectedProductId(products[0]?.id ?? ""); setStartDateDraft(""); setFormError(""); setShowForm(true); }
  function openEdit(rate: SpecialRate) { setEditing(rate); setSelectedProductId(rate.productId); setStartDateDraft(rate.startDate); setFormError(""); setShowForm(true); }
  function closeForm() { setShowForm(false); setEditing(null); setFormError(""); }

  async function saveRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFormError(""); setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const body = { productId: selectedProductId, specialRate: Number(form.get("specialRate")), startDate: form.get("startDate"), endDate: form.get("endDate") };
      const response = await fetch("/api/company/special-rates", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing ? { ...body, id: editing.id } : body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save this special rate.");
      closeForm(); setNotice(editing ? "Special rate updated." : "Special rate saved."); await load();
    } catch (reason) { setFormError(reason instanceof Error ? reason.message : "Unable to save this special rate."); }
    finally { setSaving(false); }
  }

  async function runConfirmedAction() {
    if (!confirmRate) return;
    setSaving(true); setError("");
    try {
      const response = confirmAction === "delete"
        ? await fetch("/api/company/special-rates", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: confirmRate.id }) })
        : await fetch("/api/company/special-rates", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: confirmRate.id, action: "set-enabled", enabled: !confirmRate.enabled }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update this special rate.");
      setConfirmRate(null); setNotice(confirmAction === "delete" ? "Special rate deleted." : `Special rate ${confirmRate.enabled ? "deactivated" : "activated"}.`); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update this special rate."); }
    finally { setSaving(false); }
  }

  async function submitBulk(action: "preview" | "import") {
    setBulkError(""); setBulkBusy(true);
    try {
      if (!workbook) throw new Error("Choose a Special Rates Excel workbook.");
      const form = new FormData(); form.set("workbook", workbook); form.set("action", action);
      const response = await fetch("/api/company/special-rates/bulk", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to process this workbook.");
      if (action === "preview") { setPreview(data.rows as PreviewRow[]); setImportResult(null); }
      else { setImportResult(data as ImportResult); setPreview(null); await load(); }
    } catch (reason) { setBulkError(reason instanceof Error ? reason.message : "Unable to process this workbook."); }
    finally { setBulkBusy(false); }
  }

  function downloadReport() {
    if (!importResult) return;
    const rows = [["Row", "Product", "Errors"], ...importResult.rowErrors.filter((row) => row.errors.length).map((row) => [row.rowNumber, row.product, row.errors.join("; ")])];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "special-rate-import-results.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  return <div className="company-content">
    <div className="company-page-heading"><div><h1>Special Rates</h1><p>Create and manage company product offers by effective date.</p></div><button className="company-primary-button" type="button" disabled={!products.length} onClick={openAdd}>＋ Add Special Rate</button></div>
    {notice && <div className="company-success" role="status">{notice}</div>}{error && <div className="company-error-banner" role="alert">{error}<button type="button" onClick={() => void load()}>Retry</button></div>}

    <section className="company-panel company-product-form-panel"><div className="company-panel-heading"><div><h2>Bulk Special Rate Upload</h2><p>Import dated offers from an Excel workbook and review row validation before saving.</p></div><a className="company-secondary-button" href="/api/company/special-rates/template">Download Excel Template</a></div>
      <div className="company-bulk-form company-special-bulk-form"><label>Excel workbook (.xlsx)<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setWorkbook(event.target.files?.[0] ?? null); setPreview(null); setImportResult(null); }} /></label><p className="company-import-help">Required columns: Product Code or Name, Special Rate, Start Date, and End Date. Product names must match one active company product exactly; use a Product Code if names are ambiguous. MRP is retrieved from the product record. Dates use YYYY-MM-DD.</p></div>
      {bulkError && <p className="company-error" role="alert">{bulkError}</p>}
      <div className="company-modal-actions"><button className="company-secondary-button" type="button" disabled={bulkBusy} onClick={() => { setWorkbook(null); setPreview(null); setImportResult(null); setBulkError(""); }}>Clear</button><button className="company-primary-button" type="button" disabled={bulkBusy || !workbook} onClick={() => void submitBulk("preview")}>{bulkBusy ? "Processing…" : "Preview Upload"}</button></div>
      {preview && <><div className="company-import-summary" role="status"><strong>{preview.length} records</strong><span>{preview.filter((row) => !row.errors.length).length} valid</span><span>{preview.filter((row) => row.errors.length).length} invalid</span><span>{preview.filter((row) => row.errors.some((error) => error.toLowerCase().includes("conflict"))).length} duplicate/conflicting</span>{preview.some((row) => !row.errors.length) && <button className="company-primary-button" type="button" disabled={bulkBusy} onClick={() => void submitBulk("import")}>{bulkBusy ? "Importing…" : `Import ${preview.filter((row) => !row.errors.length).length} Valid Rates`}</button>}</div><div className="company-table-scroll company-bulk-preview"><table className="company-table"><thead><tr><th>Row</th><th>Product</th><th>MRP</th><th>Special Rate</th><th>Start Date</th><th>End Date</th><th>Validation</th></tr></thead><tbody>{preview.map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.productName || row.product}</td><td>{currency(row.mrp)}</td><td>{currency(row.specialRate)}</td><td>{row.startDate || "—"}</td><td>{row.endDate || "—"}</td><td>{row.errors.length ? <span className="company-product-errors">{row.errors.join(" ")}</span> : <span className="company-status"><i />Ready</span>}</td></tr>)}</tbody></table></div></>}
      {importResult && <div className="company-import-summary" role="status"><strong>Import complete</strong><span>{importResult.imported} imported</span><span>{importResult.failed} failed</span><span>{importResult.skipped} skipped</span><button className="company-secondary-button" type="button" onClick={downloadReport}>Download Results</button></div>}
    </section>

    <section className="company-panel company-product-table-panel"><div className="company-panel-heading"><div><h2>Special Rate Catalogue</h2><p>Offer status is calculated from the effective dates and activation state.</p></div></div>
      <div className="company-product-filters"><label>Search rates<input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Product name or code" /></label><label>Status<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="all">All statuses</option><option value="upcoming">Upcoming</option><option value="active">Active</option><option value="expired">Expired</option><option value="inactive">Inactive</option></select></label></div>
      <div className="company-table-scroll"><table className="company-table company-special-rate-table"><thead><tr><th>Product Name</th><th>Product Code</th><th>MRP</th><th>Special Rate</th><th><button type="button" onClick={() => setSortDirection((value) => value === "asc" ? "desc" : "asc")}>Start Date {sortDirection === "asc" ? "↑" : "↓"}</button></th><th>End Date</th><th>Status</th><th>Actions</th></tr></thead><tbody>{loading ? <tr><td colSpan={8}><div className="company-empty">Loading special rates…</div></td></tr> : pageRates.length === 0 ? <tr><td colSpan={8}><div className="company-empty">No special rates match the selected filters.</div></td></tr> : pageRates.map((rate) => { const status = getSpecialRateStatus(rate, today); return <tr key={rate.id}><td><strong>{rate.productName}</strong></td><td>{rate.productCode}</td><td>{currency(rate.mrp)}</td><td>{currency(rate.specialRate)}</td><td>{rate.startDate}</td><td>{rate.endDate}</td><td><span className={`company-special-status ${status.toLowerCase()}`}>{status}</span></td><td><div className="company-product-actions"><button className="company-table-action" type="button" onClick={() => openEdit(rate)}>Edit</button><button className="company-table-action" type="button" onClick={() => { setConfirmAction("toggle"); setConfirmRate(rate); }}>{rate.enabled ? "Deactivate" : "Activate"}</button><button className="company-table-action danger" type="button" onClick={() => { setConfirmAction("delete"); setConfirmRate(rate); }}>Delete</button></div></td></tr>; })}</tbody></table></div>
      <div className="company-pagination"><span>Showing {visibleRates.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, visibleRates.length)} of {visibleRates.length}</span><div><button className="company-secondary-button" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {pageCount}</span><button className="company-secondary-button" type="button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>
    </section>

    {showForm && <div className="company-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }}><section className="company-modal company-special-rate-modal" role="dialog" aria-modal="true" aria-labelledby="company-special-rate-title"><div className="company-modal-heading"><div><h2 id="company-special-rate-title">{editing ? "Edit Special Rate" : "Add Special Rate"}</h2><p>Special Rate must be below the selected product MRP.</p></div><button className="company-modal-close" type="button" aria-label="Close" onClick={closeForm}>×</button></div><form className="company-special-rate-form" onSubmit={saveRate} key={editing?.id ?? "new-rate"}>
      <label>Product Name <em>*</em><select value={selectedProductId} required onChange={(event) => setSelectedProductId(event.target.value)}><option value="" disabled>Select a product</option>{products.map((product) => <option value={product.id} key={product.id}>{product.brandName} ({product.productCode})</option>)}</select></label>
      <label>MRP<input value={selectedProduct ? currency(selectedProduct.mrp) : ""} readOnly placeholder="Automatically populated" /></label>
      <label>Special Rate <em>*</em><input name="specialRate" type="number" min="0.01" max={selectedProduct ? Math.max(0, selectedProduct.mrp - 0.01) : undefined} step="0.01" required defaultValue={editing?.specialRate ?? ""} /></label>
      <label>Start Date <em>*</em><input name="startDate" type="date" required value={startDateDraft} onChange={(event) => setStartDateDraft(event.target.value)} /></label>
      <label>End Date <em>*</em><input name="endDate" type="date" required min={startDateDraft || undefined} defaultValue={editing?.endDate ?? ""} /></label>
      {formError && <p className="company-error" role="alert">{formError}</p>}<div className="company-modal-actions"><button className="company-secondary-button" type="button" disabled={saving} onClick={closeForm}>Cancel</button><button className="company-primary-button" type="submit" disabled={saving || products.length === 0}>{saving ? "Saving…" : "Save Special Rate"}</button></div>
    </form></section></div>}

    {confirmRate && <div className="company-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmRate(null); }}><section className="company-modal company-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="company-special-confirm-title"><div className="company-modal-heading"><div><h2 id="company-special-confirm-title">{confirmAction === "delete" ? "Delete" : confirmRate.enabled ? "Deactivate" : "Activate"} special rate?</h2><p>{confirmRate.productName} ({confirmRate.productCode}) · {currency(confirmRate.specialRate)}. {confirmAction === "delete" ? "Historical order references prevent deletion; deactivate a rate used in an order." : confirmRate.enabled ? "This rate will no longer be available for new orders." : "This rate can only apply during its configured date range."}</p></div><button className="company-modal-close" type="button" aria-label="Close" onClick={() => setConfirmRate(null)}>×</button></div>{error && <p className="company-error" role="alert">{error}</p>}<div className="company-modal-actions"><button className="company-secondary-button" type="button" disabled={saving} onClick={() => setConfirmRate(null)}>Cancel</button><button className={confirmAction === "delete" ? "company-danger-button" : "company-primary-button"} type="button" disabled={saving} onClick={() => void runConfirmedAction()}>{confirmAction === "delete" ? "Delete Special Rate" : confirmRate.enabled ? "Deactivate" : "Activate"}</button></div></section></div>}
  </div>;
}
