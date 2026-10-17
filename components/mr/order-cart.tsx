"use client";

import { ShoppingCart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";
import { mockProducts } from "@/lib/mr/mock-data";
import { currency, maxQuantity, validQuantity } from "@/lib/mr/mock-service";
import { cn } from "@/lib/utils";
import { useMrWorkspace } from "./workspace-provider";

export function MrOrderCart({ onReview }: { onReview: () => void }) {
  const { draft, setDraft } = useMrWorkspace();
  const hasInvalidQuantity = draft.items.some((item) => !validQuantity(item.quantity));
  const total = draft.items.reduce((sum, item) => sum + (mockProducts.find((product) => product.id === item.productId)?.unitPrice ?? 0) * (validQuantity(item.quantity) ? Number(item.quantity) : 0), 0);
  return <section className={cn("company-panel company-table-panel", "mr-tablePanel")} aria-labelledby="mr-cart-title">
    <div className="company-panel-heading"><div><h2 id="mr-cart-title">Order cart</h2><p>{draft.items.length} {draft.items.length === 1 ? "product" : "products"} · Review quantities before submitting.</p></div><ShoppingCart size={19} className="text-muted" aria-hidden="true" /></div>
    {!draft.items.length ? <div className="mr-empty"><ShoppingCart size={26} aria-hidden="true" /><p>Your cart is empty. Add a product to get started.</p></div> : <div className="company-table-scroll" role="region" aria-label="Order cart" tabIndex={0}><table className={cn("company-table", "mr-table", "mr-cartTable")}><caption className="sr-only">Products in your order cart</caption><thead><tr><th scope="col">Product / Brand</th><th scope="col">Quantity</th><th scope="col">Unit price</th><th scope="col">Line total</th><th scope="col">Action</th></tr></thead><tbody>{draft.items.map((item) => {
      const product = mockProducts.find((product) => product.id === item.productId)!;
      const invalid = !validQuantity(item.quantity);
      return <tr key={item.productId}><td><strong>{product.brand}</strong><small>{product.name}</small></td><td><TextInput className="mr-quantity" aria-label={`Cart quantity for ${product.brand}`} aria-invalid={invalid} aria-describedby={invalid ? `cart-error-${product.id}` : undefined} type="number" inputMode="numeric" min={1} max={maxQuantity} step={1} value={item.quantity} onChange={(event) => setDraft((current) => ({ ...current, items: current.items.map((line) => line.productId === item.productId ? { ...line, quantity: event.target.value } : line) }))} />{invalid && <small id={`cart-error-${product.id}`} className="!text-danger">Use 1–9,999 whole packs.</small>}</td><td className="mr-amount">{currency(product.unitPrice)}</td><td className="mr-amount">{invalid ? "—" : currency(product.unitPrice * Number(item.quantity))}</td><td><Button type="button" variant="ghost" className="p-2 text-danger" aria-label={`Remove ${product.brand}`} onClick={() => setDraft((current) => ({ ...current, items: current.items.filter((line) => line.productId !== item.productId) }))}><Trash2 size={16} aria-hidden="true" /></Button></td></tr>;
    })}</tbody></table></div>}
    <div className="mr-totals"><div><p>Order total · taxes included in demo prices</p><strong className="mr-amount">{hasInvalidQuantity ? "—" : currency(total)}</strong></div><Button type="button" onClick={onReview}>Review Order</Button></div>
  </section>;
}
