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
  assignedManager: z.string().optional(),
  territory: z.string().optional(),
  region: z.string().trim().max(120).optional(),
  monthlyTarget: z.number().finite().min(0).nullable().optional(),
  commissionPercent: z.number().finite().min(0).max(100).nullable().optional(),
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
  if (master.kind === "mr") {
    if ("assignedManager" in update) master.assignedManager = update.assignedManager;
    if ("territory" in update) master.territory = update.territory;
    if ("region" in update) master.region = update.region;
    if ("monthlyTarget" in update) master.monthlyTarget = update.monthlyTarget;
    if ("commissionPercent" in update) master.commissionPercent = update.commissionPercent;
  }
  if (master.kind === "patient") {
    if ("linkedPharmacy" in update) master.linkedPharmacy = update.linkedPharmacy;
    if ("discountPercent" in update) master.discountPercent = update.discountPercent;
    if ("refillCycle" in update) master.refillCycle = update.refillCycle;
    if ("paymentMode" in update) master.paymentMode = update.paymentMode || undefined;
  }
  if (update.status) master.status = update.status;
  await persistStore(store);
  return NextResponse.json({ item: master });
}
