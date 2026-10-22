import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { currency, orderDate, orderTotal } from "@/lib/mr/mock-service";
import type { Order } from "@/lib/mr/types";
import { cn } from "@/lib/utils";
import { MrOrderStatusBadge } from "./order-status-badge";

export function MrOrdersTable({ orders, emptyMessage = "No orders found.", caption }: { orders: Order[]; emptyMessage?: string; caption: string }) {
  if (!orders.length) return <div className="mr-empty"><ClipboardList size={28} aria-hidden="true" /><p>{emptyMessage}</p></div>;
  return <div className="company-table-scroll" role="region" aria-label={caption} tabIndex={0}>
    <table className={cn("company-table", "mr-table")}>
      <caption className="sr-only">{caption}</caption>
      <thead><tr><th scope="col">Order ID</th><th scope="col">Customer</th><th scope="col">Date</th><th scope="col">Products</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
      <tbody>{orders.map((order) => <tr key={order.id}>
        <td><strong className="text-brand">{order.reference}</strong></td>
        <td><strong>{order.customer.name}</strong><small>{order.customer.code}</small></td>
        <td>{orderDate(order.date)}</td><td>{order.items.length}</td><td className="mr-amount">{currency(orderTotal(order))}</td>
        <td><MrOrderStatusBadge status={order.status} /></td><td><Link className="company-table-action inline-flex" aria-label={`View ${order.reference}`} href={`/mr/my-orders/${order.id}`}>View</Link></td>
      </tr>)}</tbody>
    </table>
  </div>;
}
