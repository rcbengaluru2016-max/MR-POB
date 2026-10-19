import { NextResponse } from "next/server";
import { formatCompanyOrder } from "@/lib/company/order-view";
import { isAdminSession } from "@/lib/server/super-admin";
import { getSession } from "@/lib/server/session";
import { refreshStore } from "@/lib/server/store";
import type { CompanyMaster, CompanyOrder } from "@/lib/types";

function overallStatus(order: CompanyOrder) {
  if (order.status === "completed") return "Completed";
  if (order.status === "cancelled") return "Cancelled";
  if (order.customerApproval === "rejected") return "Rejected";
  if (order.customerApproval === "pending") return "Awaiting Customer Approval";
  if (order.billingStatus === "pending") return "Pending Billing";
  if (order.billingStatus === "billed") return "Billed";
  return "Completed";
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !(await isAdminSession(session))) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const store = await refreshStore();
  const { id } = await params;
  const registrationIds = new Set(store.registrations.filter((item) => item.kind === "company" && item.status === "approved").map((item) => item.id));
  const companies = store.masters.filter((item): item is CompanyMaster => item.kind === "company" && item.status === "active" && registrationIds.has(item.registrationId));
  const companyCodes = new Set(companies.map((company) => company.code));
  const order = store.companyOrders.find((item) => item.id === id && companyCodes.has(item.companyCode));
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const company = companies.find((item) => item.code === order.companyCode)!;
  const view = formatCompanyOrder(order, store);
  const lineSubtotal = view.items.reduce((sum, item) => sum + (item.lineTotal ?? (item.unitPrice ?? item.specialRate ?? item.mrp) * item.quantity), 0);
  const subtotal = order.subtotal ?? lineSubtotal;
  const totalAmount = order.totalAmount ?? subtotal + (order.taxAmount ?? 0);
  const items = view.items.map((item) => {
    const specialRate = item.specialRateId ? store.companySpecialRates.find((rate) => rate.id === item.specialRateId && rate.companyCode === order.companyCode) : undefined;
    return { ...item, specialRateApprovalStatus: specialRate?.approvalStatus };
  });
  const lifecycle = [
    { action: "Order Created", at: order.createdAt, by: "System" },
    ...(order.history ?? []).map((item) => ({ action: item.status, at: item.changedAt, by: item.changedBy || "System", note: item.note })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const orderEvents = store.audit.filter((event) => event.masterCode === order.companyCode && event.detail?.includes(order.orderNumber ?? order.id));
  const events = [...lifecycle, ...orderEvents.map((event) => ({ action: event.action, at: event.at, by: event.actor, note: event.detail }))].sort((a, b) => a.at.localeCompare(b.at));
  return NextResponse.json({ order: { ...view, id: order.id, orderNumber: order.orderNumber ?? order.id, companyCode: company.code, companyName: company.companyName, mrEmployeeId: order.mrEmployeeId ?? "", createdAt: order.createdAt, overallStatus: overallStatus(order), totalQuantity: view.items.reduce((sum, item) => sum + item.quantity, 0), items, subtotal, taxAmount: order.taxAmount ?? 0, totalAmount, events } }, { headers: { "Cache-Control": "no-store" } });
}
