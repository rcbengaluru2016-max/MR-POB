"use client";

import { useEffect, useState } from "react";

type OrderItem = { productCode: string; brandName: string; composition?: string; quantity: number; mrp: number; specialRate?: number; unitPrice?: number; gst: number; lineTotal?: number };
type Order = { id: string; orderNumber: string; orderDate: string; mrEmployeeId?: string; mrName: string; mrContact: string; customerCode: string; customerName: string; customerPhone: string; customerPin: string; subtotal?: number; taxAmount?: number; totalAmount?: number; customerApproval: "pending" | "approved" | "rejected"; billingStatus: "pending" | "billed" | "completed"; status: "pending" | "completed" | "cancelled"; items: OrderItem[]; history?: Array<{ status: string; changedAt: string; changedBy?: string; note?: string }> };
type MrOption = { id: string; fullName: string; contactNumber: string };
type PageResponse = { orders: Order[]; total: number; page: number; pageSize: number; mrs: MrOption[] };

function currency(amount: number | undefined) { return amount === undefined || !Number.isFinite(amount) ? "—" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount); }
function approvalLabel(value: Order["customerApproval"]) { return value === "pending" ? "Awaiting Customer Approval" : value === "approved" ? "Approved by Customer" : "Rejected"; }
function overallLabel(order: Order) { if (order.status === "completed") return "Completed"; if (order.status === "cancelled") return "Cancelled"; if (order.customerApproval === "pending") return "Awaiting Customer Approval"; if (order.customerApproval === "rejected") return "Rejected"; if (order.billingStatus === "pending") return "Pending Billing"; return "In Progress"; }

export function OrderStatus() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [mrs, setMrs] = useState<MrOption[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [mrId, setMrId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ page: String(page), pageSize: "25", status });
      if (mrId) params.set("mrId", mrId); if (from) params.set("from", from); if (to) params.set("to", to);
      fetch(`/api/company/orders?${params}`, { cache: "no-store" }).then(async (response) => {
        const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to load orders."); return data as PageResponse;
      }).then((data) => { if (active) { setOrders(data.orders); setTotal(data.total); setMrs(data.mrs); setError(""); } })
        .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load orders."); })
        .finally(() => { if (active) setLoading(false); });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [page, mrId, from, to, status, refreshCount]);

  async function viewOrder(order: Order) {
    setSelectedOrder(order); setDetailLoading(true);
    try {
      const response = await fetch(`/api/company/orders/${encodeURIComponent(order.id)}`, { cache: "no-store" });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to load order details.");
      setSelectedOrder(data.order as Order);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load order details."); setSelectedOrder(null); }
    finally { setDetailLoading(false); }
  }

  function clearFilters() { setMrId(""); setFrom(""); setTo(""); setStatus("all"); setPage(1); }
  const pageCount = Math.max(1, Math.ceil(total / 25));

  return <div className="company-content">
    <div className="company-page-heading"><div><h1>Order Status</h1><p>Track customer approvals, billing, and order lifecycle activity.</p></div></div>
    {error && <div className="company-error-banner" role="alert">{error}<button type="button" onClick={() => setRefreshCount((value) => value + 1)}>Retry</button></div>}
    <section className="company-panel company-order-filters" aria-label="Order filters">
      <label>MR Name<select value={mrId} onChange={(event) => { setMrId(event.target.value); setPage(1); }}><option value="">All MRs</option>{mrs.map((mr) => <option value={mr.id} key={mr.id}>{mr.fullName}</option>)}</select></label>
      <label>From<input type="date" value={from} max={to || undefined} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label>
      <label>To<input type="date" value={to} min={from || undefined} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label>
      <label>Order Status<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="all">All statuses</option><option value="pending">Pending</option><option value="rejected">Rejected</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
      <button className="company-secondary-button company-clear-filters" type="button" onClick={clearFilters}>Clear Filters</button>
    </section>
    <section className="company-panel company-order-panel"><div className="company-panel-heading"><div><h2>Company Orders</h2><p>{total} order{total === 1 ? "" : "s"} match the current filters.</p></div></div>
      <div className="company-table-scroll"><table className="company-table company-orders-table"><thead><tr><th>Order ID</th><th>Order Date</th><th>MR Name</th><th>MR Contact</th><th>Customer Name</th><th>Customer Code</th><th>Customer Phone</th><th>Customer PIN</th><th>Product Details</th><th>Order Amount</th><th>Customer Approval</th><th>Billing Status</th><th>Overall Status</th><th>Action</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={14}><div className="company-empty">Loading orders…</div></td></tr> : orders.length === 0 ? <tr><td colSpan={14}><div className="company-empty">No orders match these filters.</div></td></tr> : orders.map((order) => <tr key={order.id}><td><strong>{order.orderNumber}</strong></td><td>{order.orderDate}</td><td>{order.mrName}</td><td>{order.mrContact}</td><td>{order.customerName}</td><td>{order.customerCode}</td><td>{order.customerPhone}</td><td>{order.customerPin}</td><td className="company-order-products">{order.items.length ? order.items.map((item) => `${item.brandName} × ${item.quantity}`).join(", ") : "—"}</td><td>{currency(order.totalAmount)}</td><td><span className={`company-order-status approval-${order.customerApproval}`}>{approvalLabel(order.customerApproval)}</span></td><td><span className={`company-order-status billing-${order.billingStatus}`}>{order.billingStatus === "pending" ? "Pending Billing" : order.billingStatus === "billed" ? "Billed" : "Completed"}</span></td><td><span className={`company-order-status overall-${order.status === "pending" ? order.customerApproval === "pending" ? "pending-approval" : order.customerApproval === "rejected" ? "rejected" : "pending-billing" : order.status}`}>{overallLabel(order)}</span></td><td><button className="company-table-action" type="button" onClick={() => void viewOrder(order)}>View</button></td></tr>)}
      </tbody></table></div>
      <div className="company-pagination"><span>Showing {total ? (page - 1) * 25 + 1 : 0}–{Math.min(page * 25, total)} of {total}</span><div><button className="company-secondary-button" type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {pageCount}</span><button className="company-secondary-button" type="button" disabled={page >= pageCount || loading} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>
    </section>

    {selectedOrder && <div className="company-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedOrder(null); }}><section className="company-modal company-order-detail-modal" role="dialog" aria-modal="true" aria-labelledby="company-order-detail-title"><div className="company-modal-heading"><div><h2 id="company-order-detail-title">Order {selectedOrder.orderNumber}</h2><p>{selectedOrder.orderDate} · {overallLabel(selectedOrder)}</p></div><button type="button" className="company-modal-close" aria-label="Close order details" onClick={() => setSelectedOrder(null)}>×</button></div>
      {detailLoading ? <div className="company-empty">Loading order details…</div> : <>
        <div className="company-order-detail-grid"><section><h3>Medical Representative</h3><p><strong>{selectedOrder.mrName}</strong><span>{selectedOrder.mrContact}</span></p></section><section><h3>Customer</h3><p><strong>{selectedOrder.customerName}</strong><span>Code: {selectedOrder.customerCode}</span><span>Phone: {selectedOrder.customerPhone}</span><span>PIN: {selectedOrder.customerPin}</span></p></section><section><h3>Approval & Billing</h3><p><span className={`company-order-status approval-${selectedOrder.customerApproval}`}>{approvalLabel(selectedOrder.customerApproval)}</span><span className={`company-order-status billing-${selectedOrder.billingStatus}`}>{selectedOrder.billingStatus === "pending" ? "Pending Billing" : selectedOrder.billingStatus === "billed" ? "Billed" : "Completed"}</span></p></section></div>
        <h3 className="company-order-section-title">Ordered Products</h3><div className="company-table-scroll"><table className="company-table company-order-lines"><thead><tr><th>Product</th><th>Code</th><th>Quantity</th><th>MRP</th><th>Applied Rate</th><th>GST</th><th>Line Total</th></tr></thead><tbody>{selectedOrder.items.length ? selectedOrder.items.map((item,index) => <tr key={`${item.productCode}-${index}`}><td>{item.brandName}{item.composition ? <small>{item.composition}</small> : null}</td><td>{item.productCode}</td><td>{item.quantity}</td><td>{currency(item.mrp)}</td><td>{currency(item.specialRate ?? item.unitPrice ?? item.mrp)}</td><td>{item.gst}%</td><td>{currency(item.lineTotal)}</td></tr>) : <tr><td colSpan={7}>No order-line snapshot is available.</td></tr>}</tbody></table></div>
        <div className="company-order-totals"><span>Subtotal <strong>{currency(selectedOrder.subtotal)}</strong></span><span>Tax <strong>{currency(selectedOrder.taxAmount)}</strong></span><span>Order Total <strong>{currency(selectedOrder.totalAmount)}</strong></span></div>
        <h3 className="company-order-section-title">Order Lifecycle</h3>{selectedOrder.history?.length ? <ol className="company-order-history">{selectedOrder.history.map((item,index) => <li key={`${item.changedAt}-${index}`}><strong>{item.status}</strong><time>{new Date(item.changedAt).toLocaleString()}</time>{item.changedBy && <span>By {item.changedBy}</span>}{item.note && <p>{item.note}</p>}</li>)}</ol> : <div className="company-empty">No order status history has been recorded.</div>}
      </>}</section></div>}
  </div>;
}
