import { Suspense } from "react";
import { MrOrderDetails } from "@/components/mr/order-details";

export const metadata = { title: "MR Order Details" };

export default function MrOrderDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<p className="company-panel text-muted" role="status">Loading order details…</p>}><OrderDetails params={params} /></Suspense>;
}

async function OrderDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MrOrderDetails id={id} />;
}
