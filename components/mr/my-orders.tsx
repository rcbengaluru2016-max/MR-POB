"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { getMrOrders, orderStatusLabels } from "@/lib/mr/mock-service";
import type { OrderStatus } from "@/lib/mr/types";
import { cn } from "@/lib/utils";
import { MrOrdersTable } from "./orders-table";
import { useMrWorkspace } from "./workspace-provider";

const pageSize = 6;

export function MrMyOrders() {
  const { orders, profile } = useMrWorkspace();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [page, setPage] = useState(1);
  const ownOrders = getMrOrders(orders, profile.id);
  const filtered = getMrOrders(orders, profile.id, query, status);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const offset = (currentPage - 1) * pageSize;
  const customerCount = new Set(ownOrders.map((order) => order.customer.id)).size;
  function clearFilters() { setQuery(""); setStatus("all"); setPage(1); }

  return <div className="mr-stack">
    <div className={cn("company-page-heading !mb-0", "mr-heading")}><div><h1>My Orders</h1><p>{ownOrders.length} orders placed for {customerCount} customers. Track approvals and billing.</p></div></div>
    <section className={cn("company-panel", "mr-filters")} aria-label="Order filters">
      <Field label="Search orders"><TextInput type="search" placeholder="Order ID, customer name or code" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></Field>
      <Field label="Order status"><SelectInput value={status} onChange={(event) => { setStatus(event.target.value as OrderStatus | "all"); setPage(1); }}><option value="all">All statuses</option>{Object.entries(orderStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectInput></Field>
      <Button type="button" variant="secondary" onClick={clearFilters}>Clear filters</Button>
    </section>
    <section className={cn("company-panel company-table-panel", "mr-tablePanel")} aria-labelledby="mr-orders-title"><div className="company-panel-heading"><div><h2 id="mr-orders-title">Your orders</h2><p role="status">{filtered.length} {filtered.length === 1 ? "order" : "orders"}{query || status !== "all" ? " matching your filters" : " in total"}</p></div></div>
      <MrOrdersTable caption="Your orders" orders={filtered.slice(offset, offset + pageSize)} emptyMessage={query || status !== "all" ? "No orders match your filters. Try another search or clear the filters." : "You haven't placed any orders yet. Create your first order to get started."} />
      <div className="company-pagination"><span>{filtered.length ? `Showing ${offset + 1}–${Math.min(offset + pageSize, filtered.length)} of ${filtered.length}` : "Showing 0 orders"}</span><div><Button type="button" className="!px-3 !py-2 !text-xs" variant="secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</Button><span>Page {currentPage} of {pageCount}</span><Button type="button" className="!px-3 !py-2 !text-xs" variant="secondary" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</Button></div></div>
    </section>
  </div>;
}
