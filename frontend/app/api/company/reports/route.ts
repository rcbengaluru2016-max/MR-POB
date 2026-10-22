import { NextResponse } from "next/server";
import { isCompanyMr, orderDateValue, orderValue } from "@/lib/company/order-view";
import { getSession } from "@/lib/server/session";
import { resolveCompanyAdminContext } from "@/lib/server/company-admin";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.userType !== "company") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const context = await resolveCompanyAdminContext(session.username);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const from = params.get("from") ?? ""; const to = params.get("to") ?? ""; const mrId = params.get("mrId") ?? "";
  const validDate = (date: string) => !date || (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`)));
  if (!validDate(from) || !validDate(to) || (from && to && from > to)) return NextResponse.json({ error: "Choose a valid date range." }, { status: 400 });
  const companyCode = context.master.code;
  const employees = context.store.companyEmployees.filter((employee) => employee.companyCode === companyCode && isCompanyMr(employee.designation));
  if (mrId && !employees.some((employee) => employee.id === mrId)) return NextResponse.json({ error: "Select an MR in this company." }, { status: 400 });
  const orders = context.store.companyOrders.filter((order) => order.companyCode === companyCode)
    .filter((order) => !mrId || order.mrEmployeeId === mrId)
    .filter((order) => !from || orderDateValue(order) >= from)
    .filter((order) => !to || orderDateValue(order) <= to);
  const reportRows = employees.filter((employee) => !mrId || employee.id === mrId).map((employee) => {
    const mrOrders = orders.filter((order) => order.mrEmployeeId === employee.id);
    return { mrId: employee.id, mrName: employee.fullName, contactNumber: employee.contactNumber, totalOrders: mrOrders.length, orderValue: mrOrders.reduce((total, order) => total + orderValue(order), 0), awaitingApproval: mrOrders.filter((order) => order.customerApproval === "pending").length, pendingBilling: mrOrders.filter((order) => order.customerApproval === "approved" && order.billingStatus === "pending" && order.status !== "cancelled").length, completed: mrOrders.filter((order) => order.status === "completed").length };
  });
  const unassignedOrders = orders.filter((order) => !order.mrEmployeeId || !employees.some((employee) => employee.id === order.mrEmployeeId));
  if (!mrId && unassignedOrders.length) reportRows.push({ mrId: "unassigned", mrName: "Unassigned / historical", contactNumber: "—", totalOrders: unassignedOrders.length, orderValue: unassignedOrders.reduce((total, order) => total + orderValue(order), 0), awaitingApproval: unassignedOrders.filter((order) => order.customerApproval === "pending").length, pendingBilling: unassignedOrders.filter((order) => order.customerApproval === "approved" && order.billingStatus === "pending" && order.status !== "cancelled").length, completed: unassignedOrders.filter((order) => order.status === "completed").length });
  return NextResponse.json({ reports: reportRows.sort((a, b) => a.mrName.localeCompare(b.mrName)), mrs: employees.map(({ id, fullName }) => ({ id, fullName })), totalOrders: orders.length, orderValue: orders.reduce((total, order) => total + orderValue(order), 0), policy: "Order Value includes stored order-time pricing for orders except those rejected by the customer or cancelled. Total Orders includes all lifecycle statuses." });
}
