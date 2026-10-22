import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getStore } from "@/lib/server/store";
import { isAdminSession } from "@/lib/server/super-admin";

export async function GET() {
  const session = await getSession();
  if (!(await isAdminSession(session))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const store = await getStore();
  const count = (kind: "customer" | "company" | "patient", status: string) =>
    store.registrations.filter((item) => item.kind === kind && item.status === status).length;

  return NextResponse.json({
    customer: {
      pending: count("customer", "pending_verification"),
      approved: count("customer", "approved"),
      rejected: count("customer", "rejected"),
    },
    company: {
      pending: count("company", "pending_verification"),
      approved: count("company", "approved"),
      rejected: count("company", "rejected"),
    },
    patient: {
      pending: count("patient", "pending_verification"),
      approved: count("patient", "approved"),
      rejected: count("patient", "rejected"),
    },
    masters: store.masters.length,
    accounts: store.accounts.filter((item) => item.userType !== "admin" && item.userType !== "super_admin").length,
    emails: store.emails.length,
  });
}
