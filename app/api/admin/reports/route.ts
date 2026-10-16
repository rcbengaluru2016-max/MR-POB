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
  return NextResponse.json({
    audit: store.audit.slice(0, 50),
    emails: store.emails.slice(0, 50),
  });
}
