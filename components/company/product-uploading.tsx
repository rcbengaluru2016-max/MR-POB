"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Image from "next/image";
import type { CompanyProduct } from "@/lib/types";

type Product = CompanyProduct;
type ImageKey = keyof Product["images"];
type BulkRow = { rowNumber: number; productCode: string; brandName: string; composition: string; packSize: string; mrp: number; ptr: number; pts: number; gst: number; errors: string[] };

const imageFields: Array<{ key: ImageKey; label: string }> = [
  { key: "front", label: "Front Image" },
  { key: "composition", label: "Content / Composition Side Image" },
  { key: "manufacturer", label: "Manufacturer Side Image" },
  { key: "details", label: "MRP and Batch Details Image" },
];
const gstOptions = [0, 5, 12, 18, 28];

function readImage(file: File) {
  return new Promise<Product["images"][ImageKey]>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: String(reader.result) });
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function money(value: number) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value); }

export function ProductUploading() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"brandName" | "productCode" | "mrp">("brandName");
  const [ascending, setAscending] = useState(true);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [draftPreviews, setDraftPreviews] = useState<Partial<Record<ImageKey, string>>>({});
  const [saving, setSaving] = useState(false);
  const [confirmProduct, setConfirmProduct] = useState<Product | null>(null);
  const [confirmAction, setConfirmAction] = useState<"status" | "delete">("status");
  const [viewing, setViewing] = useState<Product | null>(null);
  const [bulkWorkbook, setBulkWorkbook] = useState<File | null>(null);
  const [bulkImages, setBulkImages] = useState<File[]>([]);
  const [bulkRows, setBulkRows] = useState<BulkRow[] | null>(null);
  const [bulkSummary, setBulkSummary] = useState<{ total: number; valid: number; invalid: number; skipped: number } | null>(null);
  const [bulkResult, setBulkResult] = useState<{ total: number; imported: number; failed: number; skipped: number; rowErrors: Array<{ rowNumber: number; productCode: string; errors: string[] }>; skippedImageKeys: string[] } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/company/products", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load company products.");
      setProducts(data.products as Product[]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load company products."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/company/products", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load company products.");
      if (active) setProducts(data.products as Product[]);
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load company products."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => products.filter((product) => (statusFilter === "all" || product.status === statusFilter) && [product.productCode, product.brandName, product.composition ?? ""].some((value) => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))).sort((a, b) => {
    const left = a[sortBy]; const right = b[sortBy];
    const comparison = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
    return ascending ? comparison : -comparison;
  }), [products, query, statusFilter, sortBy, ascending]);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const pageRows = visible.slice((page - 1) * pageSize, page * pageSize);

  function startAdd() { setEditing(null); setDraftPreviews({}); setFormError(""); setShowForm(true); }
  function startEdit(product: Product) { setEditing(product); setDraftPreviews({}); setFormError(""); setShowForm(true); }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFormError(""); setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const images = { ...(editing?.images ?? {}) } as Partial<Product["images"]>;
      for (const { key } of imageFields) {
        const file = form.get(key);
        if (file instanceof File && file.size) images[key] = await readImage(file);
        if (!editing && !images[key]) throw new Error(`Upload the ${imageFields.find((field) => field.key === key)?.label?.toLowerCase() ?? "required product image"}.`);
      }
      for (const { key, label } of imageFields) {
        const image = images[key];
        if (image && (image.size > 4 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(image.type))) throw new Error(`${label} must be a JPEG, PNG, or WebP image no larger than 4 MB.`);
      }
      const payload = {
        productCode: form.get("productCode"), brandName: form.get("brandName"), composition: form.get("composition"), packSize: form.get("packSize"),
        mrp: Number(form.get("mrp")), ptr: Number(form.get("ptr")), pts: Number(form.get("pts")), gst: Number(form.get("gst")), images,
      };
      const response = await fetch("/api/company/products", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing ? { ...payload, id: editing.id } : payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save product.");
      setShowForm(false); setEditing(null); setNotice(editing ? "Product updated successfully." : "Product created successfully."); await load();
    } catch (reason) { setFormError(reason instanceof Error ? reason.message : "Unable to save product."); }
    finally { setSaving(false); }
  }

  async function updateStatus(product: Product) {
    const status = product.status === "active" ? "inactive" : "active";
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/company/products", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: product.id, action: "set-status", status }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to change product status.");
      setConfirmProduct(null); setNotice(`Product ${status === "active" ? "reactivated" : "deactivated"}.`); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to change product status."); }
    finally { setSaving(false); }
  }

  async function deleteProduct(product: Product) {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/company/products", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: product.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to delete product.");
      setConfirmProduct(null); setNotice("Product deleted."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to delete product."); }
    finally { setSaving(false); }
  }

  async function submitBulk(action: "preview" | "import") {
    setBulkError(""); setBulkBusy(true);
    try {
      const form = new FormData();
      if (!bulkWorkbook) throw new Error("Choose an Excel workbook first.");
      form.set("workbook", bulkWorkbook); bulkImages.forEach((file) => form.append("images", file)); form.set("action", action);
      const response = await fetch("/api/company/products/bulk", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to process this upload.");
      if (action === "preview") {
        setBulkRows(data.rows as BulkRow[]); setBulkSummary(data.summary); setBulkResult(null);
      } else {
        setBulkResult(data); setBulkRows(null); setBulkSummary(null); await load();
      }
    } catch (reason) { setBulkError(reason instanceof Error ? reason.message : "Unable to process this upload."); }
    finally { setBulkBusy(false); }
  }

  function downloadImportReport() {
    if (!bulkResult) return;
    const rows = [["Row", "Product Code", "Errors"], ...bulkResult.rowErrors.filter((row) => row.errors.length).map((row) => [row.rowNumber, row.productCode, row.errors.join("; ")]), ...bulkResult.skippedImageKeys.map((key) => ["", key, "Images did not match a workbook product code"])];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "product-import-results.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  function toggleSort(key: typeof sortBy) { if (sortBy === key) setAscending((value) => !value); else { setSortBy(key); setAscending(true); } setPage(1); }

  return <div className="company-content">
    <div className="company-page-heading"><div><h1>Product Uploading</h1><p>Register, review, and manage company products.</p></div><button className="company-primary-button" type="button" onClick={startAdd}>＋ Add Product</button></div>
    {notice && <div className="company-success" role="status">{notice}</div>}{error && <div className="company-error-banner" role="alert">{error}<button type="button" onClick={() => void load()}>Retry</button></div>}
    <section className="company-panel company-product-form-panel"><div className="company-panel-heading"><div><h2>Bulk Product Upload</h2><p>Download the template, then map each product to four images using the filename convention below.</p></div><a className="company-secondary-button" href="/api/company/products/template">Download Excel Template</a></div>
      <div className="company-bulk-form"><label>Excel workbook (.xlsx)<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setBulkWorkbook(event.target.files?.[0] ?? null); setBulkRows(null); setBulkSummary(null); }} /></label><label>Product images (up to 400)<input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => { setBulkImages(Array.from(event.target.files ?? [])); setBulkRows(null); setBulkSummary(null); }} /></label></div>
      <p className="company-import-help">Image names: <code>PRODUCTCODE_front.jpg</code>, <code>PRODUCTCODE_composition.jpg</code>, <code>PRODUCTCODE_manufacturer.jpg</code>, and <code>PRODUCTCODE_details.jpg</code>. PNG and WebP are also supported. Each image must be 4 MB or smaller.</p>
      {bulkError && <p className="company-error" role="alert">{bulkError}</p>}
      <div className="company-modal-actions"><button className="company-secondary-button" type="button" disabled={bulkBusy} onClick={() => { setBulkWorkbook(null); setBulkImages([]); setBulkRows(null); setBulkSummary(null); setBulkResult(null); setBulkError(""); }}>Clear</button><button className="company-primary-button" type="button" disabled={bulkBusy} onClick={() => void submitBulk("preview")}>{bulkBusy ? "Processing…" : "Preview Upload"}</button></div>
      {bulkSummary && <div className="company-import-summary" role="status"><strong>{bulkSummary.total} rows</strong><span>{bulkSummary.valid} valid</span><span>{bulkSummary.invalid} invalid</span><span>{bulkSummary.skipped} unmatched image keys</span>{bulkRows && bulkSummary.valid > 0 && <button className="company-primary-button" type="button" disabled={bulkBusy} onClick={() => void submitBulk("import")}>{bulkBusy ? "Importing…" : `Import ${bulkSummary.valid} Valid Products`}</button>}</div>}
      {bulkResult && <div className="company-import-summary" role="status"><strong>Import finished</strong><span>{bulkResult.imported} imported</span><span>{bulkResult.failed} failed</span><span>{bulkResult.skipped} unmatched image keys</span><button className="company-secondary-button" type="button" onClick={downloadImportReport}>Download Results</button></div>}
      {bulkRows && <div className="company-table-scroll company-bulk-preview"><table className="company-table"><thead><tr><th>Row</th><th>Product Code</th><th>Brand</th><th>Pack Size</th><th>MRP</th><th>PTR</th><th>PTS</th><th>GST</th><th>Validation</th></tr></thead><tbody>{bulkRows.map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.productCode || "—"}</td><td>{row.brandName || "—"}</td><td>{row.packSize || "—"}</td><td>{Number.isFinite(row.mrp) ? money(row.mrp) : "—"}</td><td>{Number.isFinite(row.ptr) ? money(row.ptr) : "—"}</td><td>{Number.isFinite(row.pts) ? money(row.pts) : "—"}</td><td>{Number.isFinite(row.gst) ? `${row.gst}%` : "—"}</td><td>{row.errors.length ? <span className="company-product-errors">{row.errors.join(" ")}</span> : <span className="company-status"><i />Ready</span>}</td></tr>)}</tbody></table></div>}
    </section>

    <section className="company-panel company-product-table-panel"><div className="company-panel-heading"><div><h2>Product Catalogue</h2><p>{products.length} product{products.length === 1 ? "" : "s"} · Active products can be used in new orders.</p></div></div>
      <div className="company-product-filters"><label>Search products<input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Product code, brand, or composition" /></label><label>Status<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label></div>
      <div className="company-table-scroll"><table className="company-table company-product-table"><thead><tr><th>Product Image</th><th><button type="button" onClick={() => toggleSort("brandName")}>Brand Name {sortBy === "brandName" ? ascending ? "↑" : "↓" : ""}</button></th><th>Content / Composition</th><th>Pack Size</th><th><button type="button" onClick={() => toggleSort("mrp")}>MRP {sortBy === "mrp" ? ascending ? "↑" : "↓" : ""}</button></th><th>PTR</th><th>PTS</th><th>GST</th><th>Product Status</th><th>Actions</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={10}><div className="company-empty">Loading products…</div></td></tr> : pageRows.length === 0 ? <tr><td colSpan={10}><div className="company-empty">No products match your search. Add a product or change the filters.</div></td></tr> : pageRows.map((product) => <tr key={product.id}><td><button className="company-product-thumbnail" type="button" onClick={() => setViewing(product)} aria-label={`View ${product.brandName} images`}><Image src={product.images.front.dataUrl} alt="" width={50} height={50} unoptimized /></button></td><td><strong>{product.brandName}</strong><small>{product.productCode}</small></td><td className="company-composition-cell">{product.composition || "—"}</td><td>{product.packSize || "—"}</td><td>{money(product.mrp)}</td><td>{money(product.ptr)}</td><td>{money(product.pts)}</td><td>{product.gst}%</td><td><span className={`company-product-status ${product.status}`}>{product.status === "active" ? "Active" : "Inactive"}</span></td><td><div className="company-product-actions"><button className="company-table-action" type="button" onClick={() => startEdit(product)}>Edit</button><button className="company-table-action" type="button" onClick={() => { setConfirmAction("status"); setConfirmProduct(product); }}>{product.status === "active" ? "Deactivate" : "Reactivate"}</button><button className="company-table-action danger" type="button" onClick={() => { setConfirmAction("delete"); setConfirmProduct(product); }}>Delete</button></div></td></tr>)}
      </tbody></table></div>
      <div className="company-pagination"><span>Showing {visible.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, visible.length)} of {visible.length}</span><div><button className="company-secondary-button" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {pageCount}</span><button className="company-secondary-button" type="button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>
    </section>

    {showForm && <div className="company-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setShowForm(false); setEditing(null); } }}><section className="company-modal company-product-modal" role="dialog" aria-modal="true" aria-labelledby="company-product-title"><div className="company-modal-heading"><div><h2 id="company-product-title">{editing ? "Edit Product" : "Register Product"}</h2><p>Enter accurate product details and provide all four required images.</p></div><button type="button" className="company-modal-close" aria-label="Close" onClick={() => { setShowForm(false); setEditing(null); }}>×</button></div>
      <form className="company-product-form" onSubmit={saveProduct} key={editing?.id ?? "new-product"}>
        <label>Brand Name*<input name="brandName" required maxLength={120} defaultValue={editing?.brandName ?? ""} /></label>
        <label>Content / Composition*<input name="composition" maxLength={2000} defaultValue={editing?.composition ?? ""} /></label>
        <label>Pack Size*<input name="packSize" required maxLength={100} placeholder="e.g. 10 tablets, 100 ml" defaultValue={editing?.packSize ?? ""} /></label>
        <label>MRP*<input name="mrp" type="number" min="0" step="0.01" required defaultValue={editing?.mrp ?? ""} /></label>
        <label>PTR*<input name="ptr" type="number" min="0" step="0.01" required defaultValue={editing?.ptr ?? ""} /></label>
        <label>PTS*<input name="pts" type="number" min="0" step="0.01" required defaultValue={editing?.pts ?? ""} /></label>
        <label>GST*<select name="gst" required defaultValue={editing?.gst ?? ""}><option value="" disabled>Select GST rate</option>{gstOptions.map((rate) => <option value={rate} key={rate}>{rate}%</option>)}</select></label>
        <div className="company-product-images">{imageFields.map(({ key, label }) => <label className="company-image-field" key={key}>{label} {!editing && <em>*</em>}<span>JPEG, PNG or WebP · up to 4 MB</span>{(draftPreviews[key] || editing?.images[key]?.dataUrl) && <Image className="company-image-preview" src={draftPreviews[key] || editing?.images[key]?.dataUrl || ""} alt={`${label} preview`} width={320} height={130} unoptimized />}<input name={key} type="file" accept="image/jpeg,image/png,image/webp" required={!editing && !draftPreviews[key]} onChange={(event) => { const file = event.target.files?.[0]; if (file) void readImage(file).then((image) => setDraftPreviews((previous) => ({ ...previous, [key]: image.dataUrl }))).catch((reason: unknown) => setFormError(reason instanceof Error ? reason.message : "Unable to preview this image.")); }} /></label>)}</div>
        {formError && <p className="company-error" role="alert">{formError}</p>}
        <div className="company-modal-actions"><button className="company-secondary-button" type="button" disabled={saving} onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button><button className="company-primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button></div>
      </form>
    </section></div>}

    {viewing && <div className="company-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewing(null); }}><section className="company-modal company-image-gallery" role="dialog" aria-modal="true" aria-labelledby="company-image-gallery-title"><div className="company-modal-heading"><div><h2 id="company-image-gallery-title">{viewing.brandName}</h2><p>{viewing.productCode} · {viewing.status === "active" ? "Active" : "Inactive"}</p><p className="mt-1 text-sm text-muted">Pack Size: {viewing.packSize || "Not specified"}</p></div><button type="button" className="company-modal-close" aria-label="Close" onClick={() => setViewing(null)}>×</button></div><div className="company-image-gallery-grid">{imageFields.map(({ key, label }) => <figure key={key}><Image src={viewing.images[key].dataUrl} alt={label} width={400} height={230} unoptimized /><figcaption>{label}</figcaption></figure>)}</div></section></div>}

    {confirmProduct && <div className="company-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmProduct(null); }}><section className="company-modal company-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="company-product-confirm-title"><div className="company-modal-heading"><div><h2 id="company-product-confirm-title">{confirmAction === "delete" ? "Delete" : confirmProduct.status === "active" ? "Deactivate" : "Reactivate"} {confirmProduct.brandName}</h2><p>{confirmAction === "delete" ? "Delete this product from the catalogue? Products used in historical orders cannot be deleted." : confirmProduct.status === "active" ? "This product will no longer be available for new orders. Existing order history will be preserved." : "Restore this product to the active catalogue for new orders."}</p></div></div>{error && <p className="company-error" role="alert">{error}</p>}<div className="company-modal-actions"><button className="company-secondary-button" type="button" disabled={saving} onClick={() => setConfirmProduct(null)}>Cancel</button>{confirmAction === "delete" ? <button className="company-danger-button" type="button" disabled={saving} onClick={() => void deleteProduct(confirmProduct)}>Delete Product</button> : <button className="company-primary-button" type="button" disabled={saving} onClick={() => void updateStatus(confirmProduct)}>{confirmProduct.status === "active" ? "Deactivate Product" : "Reactivate Product"}</button>}</div></section></div>}
  </div>;
}
