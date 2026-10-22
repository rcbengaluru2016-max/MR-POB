import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/server/session";
import { getSession } from "@/lib/server/session";
import { recordSecurityEvent } from "@/lib/server/security-audit";

export async function POST() {
  const session = await getSession();
  if (session?.userType === "admin" || session?.userType === "super_admin") {
    await recordSecurityEvent(session.username, "admin_logout");
  }
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
