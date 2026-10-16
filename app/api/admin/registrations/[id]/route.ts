import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getStore } from "@/lib/server/store";
import { approveRegistration, rejectRegistration } from "@/lib/server/workflow";
import { rejectSchema } from "@/lib/validation";
import { isAdminSession } from "@/lib/server/super-admin";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session || !(await isAdminSession(session))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const store = await getStore();
  const record = store.registrations.find((item) => item.id === id);
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const safe: Record<string, unknown> = { ...record };
  delete safe.passwordHash;
  delete safe.passwordSalt;
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
      return NextResponse.json({ ok: true, masterCode: result.master.code });
    }
    if (body.action === "reject") {
      const parsed = rejectSchema.safeParse({ reason: body.reason });
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? "Rejection reason required" },
          { status: 400 },
        );
      }
      await rejectRegistration(id, session.username, parsed.data.reason);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Action failed" },
      { status: 400 },
    );
  }
}
