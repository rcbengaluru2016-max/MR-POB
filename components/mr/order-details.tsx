"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { currency, getMrOrder, orderDate, orderTotal } from "@/lib/mr/mock-service";
import { cn } from "@/lib/utils";
import { MrCustomerDetails } from "./customer-search";
import { MrOrderStatusBadge } from "./order-status-badge";
import { useMrWorkspace } from "./workspace-provider";

export function MrOrderDetails({ id }: { id: string }) {
  const { orders, profile } = useMrWorkspace();
  const order = getMrOrder(orders, profile.id, id);
  if (!order) return <section className="company-panel"><h1 className="text-xl font-semibold">Order unavailable</h1><p className="mt-3 text-sm text-muted">This order is not in your current demo workspace. Orders created in the preview reset when the page is refreshed.</p><Link className="company-back-link" href="/mr/my-orders">Back to My Orders</Link></section>;
  return <div className="mr-stack">
    <div><Link className="inline-flex items-center gap-2 text-sm font-semibold text-brand" href="/mr/my-orders"><ArrowLeft size={16} aria-hidden="true" />Back to My Orders</Link></div>
    <div className={cn("company-page-heading !mb-0", "mr-heading")}><div><h1>Order {order.reference}</h1><p>Placed on {orderDate(order.date)} by {profile.name}</p></div><MrOrderStatusBadge status={order.status} /></div>
    <section className="company-panel" aria-labelledby="mr-order-customer"><div className="company-panel-heading"><div><h2 id="mr-order-customer">Customer details</h2><p>{order.customer.address}</p></div></div><MrCustomerDetails customer={order.customer} /></section>
    <section className={cn("company-panel company-table-panel", "mr-tablePanel")} aria-labelledby="mr-order-products"><div className="company-panel-heading"><div><h2 id="mr-order-products">Products ordered</h2><p>{order.items.length} product lines · Prices per pack</p></div></div>
      <div className="company-table-scroll" role="region" aria-label="Ordered products" tabIndex={0}><table className={cn("company-table", "mr-table", "mr-cartTable")}><caption className="sr-only">Products ordered in {order.reference}</caption><thead><tr><th scope="col">Product / Brand</th><th scope="col">Company</th><th scope="col">Quantity</th><th scope="col">Unit price</th><th scope="col">Line total</th></tr></thead><tbody>{order.items.map((item) => <tr key={item.product.id}><td><strong>{item.product.brand}</strong><small>{item.product.name}</small><small>{item.product.code}</small></td><td>{item.product.companyName}</td><td>{item.quantity}</td><td className="mr-amount">{currency(item.unitPrice)}</td><td className="mr-amount">{currency(item.unitPrice * item.quantity)}</td></tr>)}</tbody></table></div>
      <div className="mr-totals"><p>Taxes included in demo prices</p><div><p>Order total</p><strong>{currency(orderTotal(order))}</strong></div></div>
    </section>
    <div className="mr-details">
      <section className="company-panel"><div className="company-panel-heading"><div><h2>Order history</h2><p>Customer approval and billing milestones.</p></div></div><ol className="mr-history">{order.history.map((event, index) => <li key={`${event.date}-${index}`}><strong>{event.label}</strong><time dateTime={event.date}>{orderDate(event.date)} · {new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(event.date))}</time>{event.note && <p>{event.note}</p>}</li>)}</ol></section>
      <section className="company-panel"><div className="company-panel-heading"><div><h2>Processing status</h2><p>Current stage of this order.</p></div></div><dl className="mr-customerDetails"><div><dt>Customer approval</dt><dd>{order.status === "awaiting_customer_approval" ? "Awaiting approval" : order.status === "rejected" ? "Rejected" : "Approved"}</dd></div><div><dt>Billing</dt><dd>{order.status === "completed" ? "Completed" : order.status === "pending_billing" ? "Pending Billing" : order.status === "rejected" ? "Not applicable" : "Awaiting approval"}</dd></div></dl></section>
    </div>
  </div>;
}
