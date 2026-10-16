import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getStore, persistStore } from "@/lib/server/store";
import { isAdminSession } from "@/lib/server/super-admin";
import { recordSecurityEvent } from "@/lib/server/security-audit";
import { isUserType } from "@/lib/types";

const accountStatusSchema = z.object({
  username: z.string().trim().min(1),
  status: z.enum(["active", "locked", "unlocked", "inactive"]),
});

export async function GET() {
  const session = await getSession();
  if (!session || !(await isAdminSession(session))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const store = await getStore();
  return NextResponse.json({
    items: store.accounts.filter((account) => isUserType(account.userType) && (session?.userType === "super_admin" || account.userType !== "super_admin")).map((account) => ({
      username: account.username,
      userType: account.userType,
      masterCode: account.masterCode,
      registrationId: account.registrationId,
      email: account.email,
      status: account.status,
      createdAt: account.createdAt,
      displayName: account.displayName,
      isCurrentUser: account.username.toLowerCase() === session.username.toLowerCase(),
    })),
  });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session || !(await isAdminSession(session))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = accountStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid account update" },
      { status: 400 },
    );
  }
  const store = await getStore();
  const account = store.accounts.find((item) => item.username === parsed.data.username);
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  if (!isUserType(account.userType)) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  if (account.userType === "super_admin" && session?.userType !== "super_admin") {
    return NextResponse.json({ error: "Only the Super Admin can change this account." }, { status: 403 });
  }
  if (account.username.toLowerCase() === session.username.toLowerCase()) {
    return NextResponse.json(
      { error: "You cannot change your own account status." },
      { status: 400 },
    );
  }
  account.status = parsed.data.status;
  await persistStore(store);
  await recordSecurityEvent(session.username, "admin_account_status_changed", `${account.username}: ${account.status}`);
  const safe = {
    username: account.username,
    userType: account.userType,
    masterCode: account.masterCode,
    registrationId: account.registrationId,
    email: account.email,
    status: account.status,
    createdAt: account.createdAt,
    displayName: account.displayName,
    isCurrentUser: false,
  };
  return NextResponse.json({ item: safe });
}
