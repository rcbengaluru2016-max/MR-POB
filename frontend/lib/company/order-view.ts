import type { AppStore } from "@/lib/server/store";
import type { CompanyOrder } from "@/lib/types";

export function isCompanyMr(designation: string) {
  return /medical\s+representative|\bmr\b/i.test(designation);
}

export function formatCompanyOrder(order: CompanyOrder, store: AppStore) {
  const employee = order.mrEmployeeId ? store.companyEmployees.find((item) => item.id === order.mrEmployeeId && item.companyCode === order.companyCode) : undefined;
  const customer = order.customerCode ? store.masters.find((item) => item.kind === "customer" && item.code === order.customerCode) : undefined;
  const items = (order.items ?? []).map((item) => ({
    ...item,
    lineTotal: item.lineTotal ?? (Number.isFinite(item.quantity) ? (item.unitPrice ?? item.specialRate ?? item.mrp) * item.quantity : undefined),
  }));
  const totalAmount = order.totalAmount ?? (items.length && items.every((item) => Number.isFinite(item.lineTotal)) ? items.reduce((sum, item) => sum + (item.lineTotal ?? 0), 0) : undefined);
  return {
    ...order,
    orderNumber: order.orderNumber ?? order.id,
    mrName: order.mrName ?? employee?.fullName ?? "—",
    mrContact: order.mrContact ?? employee?.contactNumber ?? "—",
    customerCode: order.customerCode ?? "—",
    customerName: order.customerName ?? (customer?.kind === "customer" ? customer.businessName || customer.customerName : "—"),
    customerPhone: order.customerPhone ?? (customer?.kind === "customer" ? customer.mobile : "—"),
    customerPin: order.customerPin ?? (customer?.kind === "customer" ? customer.pinCode ?? "—" : "—"),
    items,
    subtotal: order.subtotal,
    taxAmount: order.taxAmount,
    totalAmount,
  };
}

export function orderDateValue(order: CompanyOrder) {
  return order.orderDate || order.createdAt.slice(0, 10);
}

export function orderValue(order: CompanyOrder) {
  if (order.status === "cancelled" || order.customerApproval === "rejected") return 0;
  if (order.totalAmount !== undefined && Number.isFinite(order.totalAmount)) return order.totalAmount;
  if (!order.items?.length) return 0;
  return order.items.reduce((sum, item) => sum + (item.lineTotal ?? (item.unitPrice ?? item.specialRate ?? item.mrp) * item.quantity), 0);
}
