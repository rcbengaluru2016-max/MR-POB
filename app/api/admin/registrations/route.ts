import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getStore } from "@/lib/server/store";
import { isAdminSession } from "@/lib/server/super-admin";

export async function GET(request: Request) {
  const session = await getSession();
  if (!(await isAdminSession(session))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind");
  const status = searchParams.get("status");
  const store = await getStore();
  const items = store.registrations
    .filter((item) => (kind ? item.kind === kind : true))
    .filter((item) => (status ? item.status === status : true))
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      status: item.status,
      submittedAt: item.submittedAt,
      name:
        item.kind === "customer"
          ? item.customerName
          : item.kind === "company"
            ? item.companyName
            : item.patientName,
      mobile: item.mobile,
      email: item.email,
    }));
  return NextResponse.json({ items });
}
