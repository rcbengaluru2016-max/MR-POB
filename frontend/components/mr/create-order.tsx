"use client";

import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { mockCustomers, mockProducts } from "@/lib/mr/mock-data";
import { cartUnitPrice, currency, emptyDraft, maxQuantity, submitMockOrder, validateDraft } from "@/lib/mr/mock-service";
import type { Customer, Order, Product } from "@/lib/mr/types";
import { cn } from "@/lib/utils";
import { MrCustomerDetails, MrCustomerSearch } from "./customer-search";
import { MrProductSearch } from "./product-search";
import { MrOrderCart } from "./order-cart";
import { useMrWorkspace } from "./workspace-provider";

export function MrCreateOrder() {
  const { draft, setDraft, profile, addOrder } = useMrWorkspace();
  const [choosingCustomer, setChoosingCustomer] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<Order | null>(null);
  const customer = mockCustomers.find((customer) => customer.id === draft.customerId);

  function trapReviewFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const dialog = event.currentTarget.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const controls = dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex="0"]');
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first) { event.preventDefault(); dialog.focus(); }
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function selectCustomer(selected: Customer) {
    if (selected.status !== "approved") return;
    setDraft((current) => ({ ...current, customerId: selected.id }));
    setChoosingCustomer(false); setError(""); setSuccess(null);
  }

  function addProduct(product: Product, quantity: string) {
    if (!customer || customer.status !== "approved") return "Select an approved customer first.";
    if (!product.active || !product.available || !profile.companyIds.includes(product.companyId)) return "This product is unavailable for your order.";
    const existing = draft.items.find((item) => item.productId === product.id);
    const total = Number(existing?.quantity ?? 0) + Number(quantity);
    if (!Number.isInteger(total) || total < 1 || total > maxQuantity) return "The combined cart quantity must be between 1 and 9,999. Check the existing quantity.";
    setDraft((current) => ({ ...current, items: existing ? current.items.map((item) => item.productId === product.id ? { ...item, quantity: String(total) } : item) : [...current.items, { productId: product.id, quantity }] }));
    setError(""); return null;
  }

  function review() {
    const message = validateDraft(draft, profile);
    setError(message ?? "");
    if (!message) setReviewOpen(true);
  }

  async function submit() {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      const order = await submitMockOrder(draft, profile);
      addOrder(order); setSuccess(order); setDraft(emptyDraft()); setReviewOpen(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to submit this demo order. Please try again."); }
    finally { submitting.current = false; setBusy(false); }
  }

  const total = draft.items.reduce((sum, item) => sum + (cartUnitPrice(item, mockProducts.find((product) => product.id === item.productId)!) ?? 0) * Number(item.quantity), 0);
  return <div className="mr-stack">
    <div className="company-page-heading !mb-0"><div><h1>Create Order</h1><p>Select an approved customer, add products, and review your order.</p></div></div>
    {success && <div className={cn("company-success !mb-0", "mr-success")} role="status"><div><h2 className="flex items-center gap-2"><CheckCircle2 size={17} aria-hidden="true" />Demo order created: {success.reference}</h2><p>Awaiting customer approval. This order exists only in this preview; no real order was saved.</p></div><Link href={`/mr/my-orders/${success.id}`}>View order</Link></div>}
    <ol className="mr-steps" aria-label="Order creation steps"><li aria-current={!customer || choosingCustomer ? "step" : undefined}><span>1</span>Select customer</li><li aria-current={customer && !choosingCustomer && !reviewOpen ? "step" : undefined}><span>2</span>Add products</li><li aria-current={reviewOpen ? "step" : undefined}><span>3</span>Review & submit</li></ol>
    {error && !reviewOpen && <p className="company-error-banner !mb-0" role="alert">{error}</p>}
    {(!customer || choosingCustomer) ? <div className="mr-stack">{customer && <div><Button type="button" variant="secondary" onClick={() => setChoosingCustomer(false)}>Keep {customer.name}</Button></div>}<MrCustomerSearch onSelect={selectCustomer} /></div> : <>
      <section className={cn("company-panel", "mr-selectedCustomer")} aria-labelledby="mr-selected-customer"><div className="company-panel-heading"><div><h2 id="mr-selected-customer">Selected customer</h2><p><StatusBadge value={customer.status} /></p></div><Button variant="secondary" type="button" onClick={() => { setChoosingCustomer(true); setError(""); }}>Change customer</Button></div><MrCustomerDetails customer={customer} /></section>
      <MrProductSearch onAdd={addProduct} />
      <MrOrderCart onReview={review} />
    </>}
    {!customer && <p className="mr-notice">Product selection becomes available after you select an approved customer.</p>}
    <div className="mr-review" onKeyDown={trapReviewFocus}><ConfirmDialog open={reviewOpen} title="Review your order" description="Check the customer, products, and quantities before creating this demo order." confirmLabel="Submit Order" busy={busy} error={error} onClose={() => { if (!busy) { setReviewOpen(false); setError(""); } }} onConfirm={() => void submit()}>
      {customer && <div className="mt-4 rounded-lg bg-background p-3 text-sm"><strong>{customer.name}</strong><p className="mt-1 text-xs text-muted">{customer.code} · {customer.phone} · {customer.pinCode}</p></div>}
      <ul className="mr-reviewLines">{draft.items.map((item) => { const product = mockProducts.find((product) => product.id === item.productId)!; const unitPrice = cartUnitPrice(item, product) ?? 0; return <li className="mr-reviewLine" key={item.productId}><div><strong>{product.brand}</strong><small>{item.quantity} × {currency(unitPrice)}</small></div><span>{currency(Number(item.quantity) * unitPrice)}</span></li>; })}</ul>
      <p className="mr-reviewTotal"><span>Total</span><span>{currency(total)}</span></p><p className="mt-3 text-xs text-muted">Taxes included in demo prices. No real order will be saved.</p>
    </ConfirmDialog></div>
  </div>;
}
