import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/server/super-admin";
import { refreshStore } from "@/lib/server/store";

export const instant = false;

export async function GET() {
  if (!(await isAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const store = await refreshStore();
  const items = store.registrationUploads.map((item) => ({ id:item.id, fileName:item.fileName, kind:item.kind, uploadedBy:item.uploadedBy, uploadedAt:item.uploadedAt, totalRecords:item.totalRecords, successfulRecords:item.successfulRecords, failedRecords:item.failedRecords, progress:item.progress, status:item.status, errorSummary:item.errorSummary, rowErrors:item.rowErrors ?? [] }));
  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
