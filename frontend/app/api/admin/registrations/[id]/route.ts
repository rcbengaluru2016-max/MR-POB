import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { refreshStore } from "@/lib/server/store";
import { approveRegistration, rejectRegistration } from "@/lib/server/workflow";
import { validateRejection } from "@/lib/rejection-reasons";
import { isAdminSession } from "@/lib/server/super-admin";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session || !(await isAdminSession(session))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const store = await refreshStore();
  const record = store.registrations.find((item) => item.id === id);
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const safe: Record<string, unknown> = { ...record };
  if (record.status === "rejected" && record.decidedAt && new Date(record.rejectionExpiresAt ?? new Date(new Date(record.decidedAt).getTime() + 30 * 86400000).toISOString()) <= new Date()) { delete safe.rejectionReason; delete safe.rejectionReasonCode; }
  delete safe.passwordHash;
  delete safe.passwordSalt;
  const master = store.masters.find((item) => item.registrationId === id);
  const account = store.accounts.find((item) => item.registrationId === id);
  safe.masterCode = master?.code ?? null;
  safe.accountStatus = account?.status ?? null;
  safe.activationPending = record.status === "approved" && !account;
  safe.notificationStatus = store.registrationNotifications?.find((item) => item.registrationId === id)?.status ?? null;
  return NextResponse.json({ record: safe });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session || !(await isAdminSession(session))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof body.action !== "string") {
    return NextResponse.json({ error: "Invalid registration action." }, { status: 400 });
  }
  try {
    if (body.action === "approve") {
      const result = await approveRegistration(id, session.username);
      return NextResponse.json({ ok: true, masterCode: result.master.code, status: "APPROVED", decidedAt: result.record.decidedAt, activationPending: false, accountStatus: result.account.status, notificationStatus: result.notification?.status ?? "NOT_CONFIGURED" });
    }
    if (body.action === "reject") {
      validateRejection(body);
      const record = await rejectRegistration(id, session.username, body);
      return NextResponse.json({ ok: true, status: "REJECTED", decidedAt: record.decidedAt, rejectionReason: record.rejectionReason ?? null, notificationStatus: record.notificationStatus });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Action failed" },
      { status: 400 },
    );
  }
}
