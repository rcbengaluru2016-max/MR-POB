import { NextResponse } from "next/server";
import { refreshStore } from "@/lib/server/store";
import { isAdminSession } from "@/lib/server/super-admin";

const kinds = ["customer", "company", "patient"] as const;

export async function GET(request: Request) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const kind = new URL(request.url).searchParams.get("kind");
  if (!kind || !kinds.includes(kind as (typeof kinds)[number])) {
    return NextResponse.json({ error: "Choose a valid registration category." }, { status: 400 });
  }
  const store = await refreshStore();
  const items = store.registrations
    .filter((record) => record.kind === kind && record.status === "approved")
    .flatMap((record) => {
      const account = store.accounts.find((item) => item.registrationId === record.id);
      if (!account) return [];
      return [{
        id: record.id,
        masterCode: account.masterCode,
        kind: record.kind,
        accountStatus: account.status === "active" || account.status === "unlocked" ? "active" : "inactive",
        submittedAt: record.submittedAt,
        name: record.kind === "customer" ? record.customerName : record.kind === "company" ? record.companyName : record.patientName,
        email: record.email || "",
      }];
    });
  return NextResponse.json({ items });
}
