import { orderStatusLabels } from "@/lib/mr/mock-service";
import type { OrderStatus } from "@/lib/mr/types";

const statusClasses: Record<OrderStatus, string> = {
  awaiting_customer_approval: "overall-pending-approval",
  pending_billing: "overall-pending-billing",
  completed: "overall-completed",
  rejected: "overall-rejected",
};

export function MrOrderStatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`company-order-status ${statusClasses[status]}`}>{orderStatusLabels[status]}</span>;
}
