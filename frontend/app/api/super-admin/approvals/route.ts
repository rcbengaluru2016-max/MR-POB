import { NextResponse } from "next/server";
import { refreshStore } from "@/lib/server/store";
import { isAdminSession } from "@/lib/server/super-admin";

export async function GET() {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const store = await refreshStore();
  const items = store.registrations.map((record) => ({
    id: record.id,
    masterCode: store.masters.find((item) => item.registrationId === record.id)?.code ?? null,
    notificationStatus: store.registrationNotifications?.find((item) => item.registrationId === record.id)?.status ?? null,
    kind: record.kind,
    status: record.status,
    submittedAt: record.submittedAt,
    name: record.kind === "customer" ? record.customerName : record.kind === "company" ? record.companyName : record.patientName,
    mobile: record.mobile,
    businessType: record.kind === "customer" ? record.customerType : record.kind === "company" ? record.companyName : "Patient",
  }));

  return NextResponse.json({ items });
}
