import { NextResponse } from "next/server";
import { formatCompanyOrder, isCompanyMr } from "@/lib/company/order-view";
import { isAdminSession } from "@/lib/server/super-admin";
import { getSession } from "@/lib/server/session";
import { refreshStore } from "@/lib/server/store";
import type { CompanyOrder, CompanyMaster } from "@/lib/types";

const allowedStatuses = new Set(["all", "awaiting_customer_approval", "pending_billing", "billed", "completed", "cancelled", "rejected"]);
function overallStatus(order: CompanyOrder) {
  if (order.status === "completed") return "completed";
  if (order.status === "cancelled") return "cancelled";
  if (order.customerApproval === "rejected") return "rejected";
  if (order.customerApproval === "pending") return "awaiting_customer_approval";
  if (order.billingStatus === "pending") return "pending_billing";
  if (order.billingStatus === "billed") return "billed";
  return "completed";
}
function validDate(value: string | null) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function approvedCompanyMasters(store: Awaited<ReturnType<typeof refreshStore>>) {
  const approvedRegistrationIds = new Set(store.registrations.filter((item) => item.kind === "company" && item.status === "approved").map((item) => item.id));
  return store.masters.filter((item): item is CompanyMaster => item.kind === "company" && item.status === "active" && approvedRegistrationIds.has(item.registrationId));
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !(await isAdminSession(session))) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const store = await refreshStore();
  const params = new URL(request.url).searchParams;
  const companyCode = (params.get("companyCode") ?? "").trim();
  const mrId = (params.get("mrId") ?? "").trim();
  const query = (params.get("q") ?? "").trim().toLocaleLowerCase();
  const status = params.get("status") ?? "all";
  const sort = params.get("sort") ?? "date";
  const direction = params.get("direction") ?? "desc";
  const from = params.get("from"); const to = params.get("to");
  if (!allowedStatuses.has(status)) return NextResponse.json({ error: "Choose a valid order status." }, { status: 400 });
  if (!new Set(["date", "company", "mr", "order", "amount"]).has(sort) || !new Set(["asc", "desc"]).has(direction)) return NextResponse.json({ error: "Choose a valid sort order." }, { status: 400 });
  if (!validDate(from) || !validDate(to) || (from && to && from > to)) return NextResponse.json({ error: "Choose a valid date range." }, { status: 400 });
  if (query.length > 120) return NextResponse.json({ error: "Customer search must be 120 characters or fewer." }, { status: 400 });
  const companies = approvedCompanyMasters(store);
  const companyCodes = new Set(companies.map((company) => company.code));
  if (companyCode && !companyCodes.has(companyCode)) return NextResponse.json({ error: "The selected Company is unavailable." }, { status: 400 });
  const employees = store.companyEmployees.filter((employee) => companyCodes.has(employee.companyCode) && isCompanyMr(employee.designation) && (!companyCode || employee.companyCode === companyCode));
  const employeeIds = new Set(employees.map((employee) => employee.id));
  if (mrId && !employeeIds.has(mrId)) return NextResponse.json({ error: "The selected MR is unavailable for this Company." }, { status: 400 });
  const fromTime = from ? Date.parse(`${from}T00:00:00.000Z`) : Number.NEGATIVE_INFINITY;
  const toTime = to ? Date.parse(`${to}T23:59:59.999Z`) : Number.POSITIVE_INFINITY;
  const companyByCode = new Map(companies.map((company) => [company.code, company]));
  const orders = store.companyOrders
    .filter((order) => companyCodes.has(order.companyCode))
    .filter((order) => !companyCode || order.companyCode === companyCode)
    .filter((order) => !mrId || order.mrEmployeeId === mrId)
    .filter((order) => { const created = Date.parse(order.createdAt); return Number.isFinite(created) && created >= fromTime && created <= toTime; })
    .filter((order) => status === "all" || overallStatus(order) === status)
    .map((order) => ({ raw: order, view: formatCompanyOrder(order, store), company: companyByCode.get(order.companyCode)! }))
    .filter(({ view }) => !query || [view.customerName, view.customerCode].some((value) => value.toLocaleLowerCase().includes(query)))
    .sort((a, b) => {
      const amount = (value: typeof a) => value.raw.totalAmount ?? (value.raw.subtotal !== undefined ? value.raw.subtotal + (value.raw.taxAmount ?? 0) : value.view.totalAmount ?? 0);
      const comparison = sort === "company" ? a.company.companyName.localeCompare(b.company.companyName) : sort === "mr" ? a.view.mrName.localeCompare(b.view.mrName) : sort === "order" ? (a.raw.orderNumber ?? a.raw.id).localeCompare(b.raw.orderNumber ?? b.raw.id) : sort === "amount" ? amount(a) - amount(b) : a.raw.createdAt.localeCompare(b.raw.createdAt);
      return (direction === "asc" ? comparison : -comparison) || a.raw.id.localeCompare(b.raw.id);
    });
  const page = Math.max(1, Math.min(100000, Number.parseInt(params.get("page") ?? "1", 10) || 1));
  const pageSize = Math.max(10, Math.min(100, Number.parseInt(params.get("pageSize") ?? "25", 10) || 25));
  const pageOrders = orders.slice((page - 1) * pageSize, page * pageSize).map(({ raw, view, company }) => ({
    id: raw.id, orderNumber: raw.orderNumber ?? raw.id, createdAt: raw.createdAt, orderDate: raw.orderDate,
    companyCode: company.code, companyName: company.companyName, mrEmployeeId: raw.mrEmployeeId ?? "",
    mrName: view.mrName, mrContact: view.mrContact, customerName: view.customerName, customerCode: view.customerCode,
    products: view.items.map((item) => item.brandName).filter(Boolean).join(", ") || "—",
    totalQuantity: view.items.reduce((sum, item) => sum + (Number.isFinite(item.quantity) ? item.quantity : 0), 0),
    totalAmount: raw.totalAmount ?? (raw.subtotal !== undefined ? raw.subtotal + (raw.taxAmount ?? 0) : view.totalAmount),
    customerApproval: raw.customerApproval, billingStatus: raw.billingStatus, overallStatus: overallStatus(raw),
  }));
  return NextResponse.json({ companies: companies.map(({ code, companyName }) => ({ code, companyName })), mrs: employees.map(({ id, companyCode, fullName }) => ({ id, companyCode, fullName })), orders: pageOrders, total: orders.length, page, pageSize }, { headers: { "Cache-Control": "no-store" } });
}
