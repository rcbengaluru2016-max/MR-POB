import { NextResponse } from "next/server";
import { formatCompanyOrder, isCompanyMr, orderDateValue } from "@/lib/company/order-view";
import { getSession } from "@/lib/server/session";
import { resolveCompanyAdminContext } from "@/lib/server/company-admin";

async function getCompany() {
  const session = await getSession();
  if (!session || session.userType !== "company") return null;
  return resolveCompanyAdminContext(session.username);
}

function dateParam(value: string | null) { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null; }

export async function GET(request: Request) {
  const context = await getCompany();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const from = params.get("from"); const to = params.get("to");
  if ((from && !dateParam(from)) || (to && !dateParam(to)) || (from && to && from > to)) return NextResponse.json({ error: "Choose a valid date range." }, { status: 400 });
  const mrId = params.get("mrId") ?? "";
  const query = (params.get("q") ?? "").trim().toLocaleLowerCase();
  const status = params.get("status") ?? "all";
  if (!new Set(["all", "pending", "completed", "cancelled", "rejected"]).has(status)) return NextResponse.json({ error: "Choose a valid order status." }, { status: 400 });
  const page = Math.max(1, Math.min(100000, Number.parseInt(params.get("page") ?? "1", 10) || 1));
  const pageSize = Math.max(10, Math.min(100, Number.parseInt(params.get("pageSize") ?? "25", 10) || 25));
  const companyCode = context.master.code;
  const employees = context.store.companyEmployees.filter((employee) => employee.companyCode === companyCode && isCompanyMr(employee.designation));
  const mrIds = new Set(employees.map((employee) => employee.id));
  if (mrId && !mrIds.has(mrId)) return NextResponse.json({ error: "Select an MR in this company." }, { status: 400 });
  const orders = context.store.companyOrders.filter((order) => order.companyCode === companyCode)
    .filter((order) => !mrId || order.mrEmployeeId === mrId)
    .filter((order) => !from || orderDateValue(order) >= from)
    .filter((order) => !to || orderDateValue(order) <= to)
    .filter((order) => status === "all" || (status === "rejected" ? order.customerApproval === "rejected" : order.status === status))
    .map((order) => formatCompanyOrder(order, context.store))
    .filter((order) => !query || [order.customerName, order.customerCode, order.orderNumber, order.mrName].some((value) => value.toLocaleLowerCase().includes(query)))
    .sort((a, b) => orderDateValue(b).localeCompare(orderDateValue(a)) || b.createdAt.localeCompare(a.createdAt));
  const total = orders.length;
  return NextResponse.json({ orders: orders.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, mrs: employees.map(({ id, fullName, contactNumber }) => ({ id, fullName, contactNumber })) });
}
