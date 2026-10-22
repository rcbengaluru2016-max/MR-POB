import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { resolveCompanyAdminContext } from "@/lib/server/company-admin";

const RANGES = new Set(["30", "90", "365", "all"]);

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.userType !== "company") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const context = await resolveCompanyAdminContext(session.username);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requestedRange = new URL(request.url).searchParams.get("range") ?? "30";
  if (!RANGES.has(requestedRange)) return NextResponse.json({ error: "Select a valid date range." }, { status: 400 });
  const cutoff = requestedRange === "all" ? 0 : Date.now() - Number(requestedRange) * 24 * 60 * 60 * 1000;
  const inRange = (date: string | undefined) => {
    if (requestedRange === "all") return true;
    const timestamp = date ? new Date(date).getTime() : Number.NaN;
    return Number.isFinite(timestamp) && timestamp >= cutoff;
  };

  const employees = context.store.companyEmployees.filter((item) => item.companyCode === context.master.code && (item.status ?? "active") === "active" && inRange(item.createdAt));
  const products = context.store.companyProducts.filter((item) => item.companyCode === context.master.code && inRange(item.createdAt));
  const orders = context.store.companyOrders.filter((item) => item.companyCode === context.master.code && inRange(item.orderDate || item.createdAt));
  const isMr = (designation: string) => /medical representative|\bmr\b/i.test(designation);

  return NextResponse.json({
    range: requestedRange,
    stats: {
      totalEmployees: employees.length,
      totalMrs: employees.filter((item) => isMr(item.designation)).length,
      totalProducts: products.length,
      totalOrders: orders.length,
      ordersPendingCustomerApproval: orders.filter((item) => item.customerApproval === "pending").length,
      ordersPendingBilling: orders.filter((item) => item.billingStatus === "pending").length,
      completedOrders: orders.filter((item) => item.status === "completed").length,
    },
  });
}
