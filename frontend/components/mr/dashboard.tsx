"use client";

import Link from "next/link";
import { CheckCircle2, ClipboardList, Clock3, ReceiptText } from "lucide-react";
import { getDashboardStatistics, getMrOrders } from "@/lib/mr/mock-service";
import { cn } from "@/lib/utils";
import { useMrWorkspace } from "./workspace-provider";
import { MrOrdersTable } from "./orders-table";

export function MrDashboard() {
  const { orders, profile } = useMrWorkspace();
  const stats = getDashboardStatistics(orders, profile.id);
  const tiles = [
    { label: "Total Orders", value: stats.total, icon: ClipboardList },
    { label: "Awaiting Customer Approval", value: stats.awaiting_customer_approval, icon: Clock3 },
    { label: "Pending Billing", value: stats.pending_billing, icon: ReceiptText },
    { label: "Completed Orders", value: stats.completed, icon: CheckCircle2 },
  ];
  return <div className="mr-stack">
    <div className={cn("company-page-heading !mb-0", "mr-heading")}><div><h1>Dashboard</h1><p>Your orders, customer approvals, and billing at a glance.</p></div></div>
    <section className="company-kpis" aria-label="Your order summary">{tiles.map(({ label, value, icon: Icon }) => <article key={label} className={cn("company-kpi", "mr-kpi")}><Icon size={20} className="mr-kpiIcon" aria-hidden="true" /><strong>{value}</strong><span>{label}</span></article>)}</section>
    <section className={cn("company-panel company-table-panel", "mr-tablePanel")} aria-labelledby="mr-recent-orders"><div className="company-panel-heading"><div><h2 id="mr-recent-orders">Recent orders</h2><p>Your six most recent orders across assigned companies.</p></div><Link href="/mr/my-orders">View all orders</Link></div><MrOrdersTable caption="Recent orders" orders={getMrOrders(orders, profile.id).slice(0, 6)} /></section>
  </div>;
}
