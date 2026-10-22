"use client";

import { useState } from "react";
import { PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { currency, maxQuantity, searchProducts, validQuantity } from "@/lib/mr/mock-service";
import type { Product } from "@/lib/mr/types";
import { useMrWorkspace } from "./workspace-provider";

export function MrProductSearch({ onAdd }: { onAdd: (product: Product, quantity: string) => string | null }) {
  const { profile } = useMrWorkspace();
  const [query, setQuery] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const products = searchProducts(profile, query);

  function add(product: Product) {
    setError(""); setFeedback("");
    const quantity = quantities[product.id] ?? "1";
    if (!validQuantity(quantity)) { setError(`Enter a whole-number quantity between 1 and ${maxQuantity.toLocaleString("en-IN")} for ${product.brand}.`); return; }
    const message = onAdd(product, quantity);
    if (message) setError(message);
    else setFeedback(`${quantity} × ${product.brand} added to cart.`);
  }

  return <section className="company-panel" aria-labelledby="mr-product-search">
    <div className="company-panel-heading"><div><h2 id="mr-product-search">Add products</h2><p>Active products from your assigned companies. Prices are per pack.</p></div><PackageSearch size={19} className="text-muted" aria-hidden="true" /></div>
    <Field label="Search by brand name"><TextInput type="search" placeholder="e.g. Zenvit or Nova" value={query} onChange={(event) => { setQuery(event.target.value); setError(""); setFeedback(""); }} /></Field>
    {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
    <p className="mt-3 min-h-4 text-xs text-success" role="status">{feedback}</p>
    {products.length ? <div className="mr-productList">{products.map((product) => <article key={product.id} className="mr-productRow">
      <div><h3>{product.brand}</h3><p>{product.name}</p><p>{product.code} · {product.companyName}</p></div>
      <div className="mr-price"><strong>{currency(product.unitPrice)}</strong><small className={product.available ? undefined : "mr-unavailable"}>{product.available ? "Available" : "Out of stock"}</small></div>
      <label htmlFor={`qty-${product.id}`}>Quantity<TextInput id={`qty-${product.id}`} aria-label={`Quantity for ${product.brand}`} type="number" inputMode="numeric" min={1} max={maxQuantity} step={1} disabled={!product.available} value={quantities[product.id] ?? "1"} onChange={(event) => { setQuantities((current) => ({ ...current, [product.id]: event.target.value })); setError(""); setFeedback(""); }} /></label>
      <Button type="button" disabled={!product.available} aria-label={`Add ${product.brand} to cart`} onClick={() => add(product)}>Add to Cart</Button>
    </article>)}</div> : <div className="mr-empty"><PackageSearch size={26} aria-hidden="true" /><p>No active products match this brand.</p><Button variant="ghost" type="button" onClick={() => setQuery("")}>Clear search</Button></div>}
  </section>;
}
