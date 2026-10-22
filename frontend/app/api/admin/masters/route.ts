import { NextResponse } from "next/server";
import { z } from "zod";
import { PAYMENT_MODES } from "@/lib/constants";
import { getSession } from "@/lib/server/session";
import { getStore, persistStore } from "@/lib/server/store";
import { isAdminSession } from "@/lib/server/super-admin";

const masterUpdateSchema = z.object({
  code: z.string().trim().min(1),
  status: z.enum(["created", "active", "inactive"]).optional(),
  salesRepresentative: z.string().optional(),
  discountPercent: z.number().finite().min(0).max(100).nullable().optional(),
  creditPeriod: z.string().optional(),
  creditLimit: z.number().finite().min(0).nullable().optional(),
  paymentMode: z.enum(PAYMENT_MODES).or(z.literal("")).optional(),
  companyName: z.string().trim().min(2).max(180).optional(),
  division: z.string().trim().min(1).max(120).optional(),
  headquarter: z.string().trim().min(2).max(180).optional(),
  adminFullName: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(254).optional(),
  mobile: z.string().trim().regex(/^[6-9]\d{9}$/).optional(),
  linkedPharmacy: z.string().trim().max(180).optional(),
  refillCycle: z.string().trim().max(80).optional(),
});

export async function GET(request: Request) {
  const session = await getSession();
  if (!(await isAdminSession(session))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind");
  const store = await getStore();
  const items = store.masters.filter((item) => (kind ? item.kind === kind : true));
  return NextResponse.json({ items });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!(await isAdminSession(session))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = masterUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid master update" },
      { status: 400 },
    );
  }
  const store = await getStore();
  const update = parsed.data;
  const master = store.masters.find((item) => item.code === update.code);
  if (!master) return NextResponse.json({ error: "Master not found" }, { status: 404 });

  if (master.kind === "customer") {
    if ("salesRepresentative" in update) master.salesRepresentative = update.salesRepresentative;
    if ("discountPercent" in update) master.discountPercent = update.discountPercent;
    if ("creditPeriod" in update) master.creditPeriod = update.creditPeriod;
    if ("creditLimit" in update) master.creditLimit = update.creditLimit;
    if ("paymentMode" in update) master.paymentMode = update.paymentMode || undefined;
  }
  if (master.kind === "company") {
    const registration = store.registrations.find((item) => item.id === master.registrationId);
    const account = store.accounts.find((item) => item.registrationId === master.registrationId && item.userType === "company");
    const email = update.email?.toLowerCase();
    if (email && store.accounts.some((item) => item.username !== account?.username && item.email?.toLowerCase() === email)) {
      return NextResponse.json({ error: "Another account already uses this email address." }, { status: 409 });
    }
    if (update.mobile && store.registrations.some((item) => item.id !== master.registrationId && item.mobile === update.mobile && item.status !== "rejected")) {
      return NextResponse.json({ error: "Another registration already uses this mobile number." }, { status: 409 });
    }
    if ("companyName" in update) master.companyName = update.companyName!;
    if ("division" in update) master.division = update.division!;
    if ("headquarter" in update) master.headquarter = update.headquarter!;
    if ("adminFullName" in update) master.adminFullName = update.adminFullName!;
    if ("email" in update && update.email) { master.email = update.email; if (registration && registration.kind === "company") registration.email = update.email; if (account) account.email = update.email; }
    if ("mobile" in update && update.mobile) { master.mobile = update.mobile; if (registration && registration.kind === "company") registration.mobile = update.mobile; }
    if (account && "adminFullName" in update) account.displayName = update.adminFullName!;
  }
  if (master.kind === "patient") {
    if ("linkedPharmacy" in update) master.linkedPharmacy = update.linkedPharmacy;
    if ("discountPercent" in update) master.discountPercent = update.discountPercent;
    if ("refillCycle" in update) master.refillCycle = update.refillCycle;
    if ("paymentMode" in update) master.paymentMode = update.paymentMode || undefined;
  }
  if (update.status) master.status = update.status;
  store.audit.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), actor: session?.username ?? "admin", action: "master_updated", masterCode: master.code, registrationId: master.registrationId });
  await persistStore(store);
  return NextResponse.json({ item: master });
}
