"use client";

import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, TextArea, TextInput } from "@/components/ui/field";
import { mockProducts } from "@/lib/mr/mock-data";
import { cartLineTotals, cartUnitPrice, currency, maxQuantity, validQuantity } from "@/lib/mr/mock-service";
import type { CartItem } from "@/lib/mr/types";
import { cn } from "@/lib/utils";
import { useMrWorkspace } from "./workspace-provider";

export function MrOrderCart({ onReview }: { onReview: () => void }) {
  const { draft, setDraft } = useMrWorkspace();
  const lines = draft.items.map((item) => {
    const product = mockProducts.find((product) => product.id === item.productId)!;
    return { item, product, totals: cartLineTotals(item, product) };
  });
  const invalid = lines.some((line) => line.totals === null);
  const totals = lines.reduce((sum, { item, totals }) => ({
    quantity: sum.quantity + (validQuantity(item.quantity) ? Number(item.quantity) : 0),
    amount: sum.amount + (totals?.amount ?? 0),
    gst: sum.gst + (totals?.gst ?? 0),
    total: sum.total + (totals?.total ?? 0),
  }), { quantity: 0, amount: 0, gst: 0, total: 0 });

  function updateItem(productId: string, changes: Partial<CartItem>) {
    setDraft((current) => ({ ...current, items: current.items.map((item) => item.productId === productId ? { ...item, ...changes } : item) }));
  }

  return <section className={cn("company-panel company-table-panel", "mr-tablePanel")} aria-labelledby="mr-cart-title">
    <div className="company-panel-heading"><div><h2 id="mr-cart-title">Order Cart</h2><p>{draft.items.length} {draft.items.length === 1 ? "product" : "products"} · Review quantities before submitting.</p></div><ShoppingCart size={19} className="text-muted" aria-hidden="true" /></div>
    {!draft.items.length ? <div className="mr-empty"><ShoppingCart size={26} aria-hidden="true" /><p>Your cart is empty. Add a product to get started.</p></div> : <div className="company-table-scroll" role="region" aria-label="Order cart" tabIndex={0}>
      <table className={cn("company-table", "mr-table", "mr-cartTable", "mr-orderCartTable")}>
        <caption className="sr-only">Products in your order cart</caption>
        <thead><tr>
          <th scope="col">Product Name</th><th scope="col">MRP</th><th scope="col">PTR</th><th scope="col">GST</th><th scope="col">Quantity</th><th scope="col">Offer</th><th scope="col" className="mr-cartCheckbox">Scheme</th><th scope="col">Scheme Type</th><th scope="col" className="mr-cartCheckbox">Special Rate</th><th scope="col">Special Rate Price</th><th scope="col">Amount</th><th scope="col">Action</th>
        </tr></thead>
        <tbody>{lines.map(({ item, product, totals }) => {
          const invalidQuantity = !validQuantity(item.quantity);
          const invalidRate = cartUnitPrice(item, product) === null;
          return <tr key={item.productId}>
            <td><strong>{product.brand}</strong><small>{product.name}</small></td>
            <td className="mr-amount">{currency(product.mrp)}</td>
            <td className="mr-amount">{currency(product.unitPrice)}</td>
            <td>{product.gst}%</td>
            <td><TextInput className="mr-quantity" aria-label={`Cart quantity for ${product.brand}`} aria-invalid={invalidQuantity} aria-describedby={invalidQuantity ? `cart-error-${product.id}` : undefined} type="number" inputMode="numeric" min={1} max={maxQuantity} step={1} value={item.quantity} onChange={(event) => updateItem(item.productId, { quantity: event.target.value })} />{invalidQuantity && <small id={`cart-error-${product.id}`} className="!text-danger">Use 1–9,999 whole packs.</small>}</td>
            <td><TextInput className="mr-cartOffer" aria-label={`Offer for ${product.brand}`} value={item.offer ?? ""} onChange={(event) => updateItem(item.productId, { offer: event.target.value })} /></td>
            <td className="mr-cartCheckbox"><input type="checkbox" aria-label={`Scheme for ${product.brand}`} checked={item.scheme ?? false} onChange={(event) => updateItem(item.productId, { scheme: event.target.checked })} /></td>
            <td><TextInput className="mr-cartInput" aria-label={`Scheme type for ${product.brand}`} placeholder="10+2" disabled={!item.scheme} value={item.schemeType ?? ""} onChange={(event) => updateItem(item.productId, { schemeType: event.target.value })} /></td>
            <td className="mr-cartCheckbox"><input type="checkbox" aria-label={`Special rate for ${product.brand}`} checked={item.specialRate ?? false} onChange={(event) => updateItem(item.productId, { specialRate: event.target.checked })} /></td>
            <td><TextInput className="mr-cartInput" aria-label={`Special rate price for ${product.brand}`} aria-invalid={invalidRate} aria-describedby={invalidRate ? `cart-rate-error-${product.id}` : undefined} type="number" inputMode="decimal" min="0.01" step="0.01" disabled={!item.specialRate} value={item.specialRatePrice ?? ""} onChange={(event) => updateItem(item.productId, { specialRatePrice: event.target.value })} />{invalidRate && <small id={`cart-rate-error-${product.id}`} className="!text-danger">Enter a positive price<br />with up to 2 decimals.</small>}</td>
            <td className="mr-amount">{totals ? currency(totals.amount) : "—"}</td>
            <td><Button type="button" variant="ghost" className="p-2 text-danger" aria-label={`Remove ${product.brand}`} onClick={() => setDraft((current) => ({ ...current, items: current.items.filter((line) => line.productId !== item.productId) }))}>Remove</Button></td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
    <div className="px-4 py-4 sm:px-5">
      <Field label="Delivery Instructions (Optional)">
        <TextArea name="deliveryInstructions" rows={4} maxLength={2000} className="resize-y" placeholder="For example, call before arrival or deliver through the side entrance." value={draft.deliveryInstructions ?? ""} onChange={(event) => setDraft((current) => ({ ...current, deliveryInstructions: event.target.value }))} aria-describedby="delivery-instructions-help" />
      </Field>
      <p id="delivery-instructions-help" className="mt-2 text-xs text-muted">Additional delivery information, up to 2,000 characters.</p>
    </div>
    <div className="mr-totals">
      <div className="mr-cartSummary" aria-live="polite">
        <span>Total Quantity: <strong>{invalid ? "—" : totals.quantity}</strong></span>
        <span>Amount: <strong className="mr-amount">{invalid ? "—" : currency(totals.amount)}</strong></span>
        <span>GST: <strong className="mr-amount">{invalid ? "—" : currency(totals.gst)}</strong></span>
        <span>Total Order Amount: <strong className="mr-amount">{invalid ? "—" : currency(totals.total)}</strong></span>
      </div>
      <Button type="button" onClick={onReview}>Review Order</Button>
    </div>
  </section>;
}
