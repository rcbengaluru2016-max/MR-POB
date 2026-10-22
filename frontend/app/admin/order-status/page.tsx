import { SuperAdminOrderStatus } from "@/components/super-admin/order-status";

export const metadata = { title: "Order Status" };
export const instant = false;

export default function AdminOrderStatusPage() {
  return <SuperAdminOrderStatus />;
}
