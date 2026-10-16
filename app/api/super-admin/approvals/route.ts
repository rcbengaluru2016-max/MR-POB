import { NextResponse } from "next/server";
import { getStore } from "@/lib/server/store";
import { isSuperAdminReady } from "@/lib/server/super-admin";

export async function GET() {
  if (!(await isSuperAdminReady())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const store = await getStore();
  const items = store.registrations.map((record) => ({
    id: record.id,
    kind: record.kind,
    status: record.status,
    submittedAt: record.submittedAt,
    name: record.kind === "customer" ? record.customerName : record.kind === "mr" ? record.mrName : record.patientName,
    mobile: record.mobile,
    businessType: record.kind === "customer" ? record.customerType : record.kind === "mr" ? record.division : "Patient",
  }));

  return NextResponse.json({ items });
}
