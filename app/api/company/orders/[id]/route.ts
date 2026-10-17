import { NextResponse } from "next/server";
import { formatCompanyOrder } from "@/lib/company/order-view";
import { getSession } from "@/lib/server/session";
import { resolveCompanyAdminContext } from "@/lib/server/company-admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.userType !== "company") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const context = await resolveCompanyAdminContext(session.username);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const order = context.store.companyOrders.find((item) => item.id === id && item.companyCode === context.master.code);
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  return NextResponse.json({ order: formatCompanyOrder(order, context.store) });
}
