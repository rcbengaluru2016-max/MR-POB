import { NextResponse } from "next/server";
import { getSpecialRateStatus, overlapsSpecialRate, validIsoDate } from "@/lib/company/special-rates";
import { getSession } from "@/lib/server/session";
import { resolveCompanyAdminContext } from "@/lib/server/company-admin";
import { transactStore } from "@/lib/server/store";
import type { CompanySpecialRate } from "@/lib/types";

async function getCompany() {
  const session = await getSession();
  if (!session || session.userType !== "company") return null;
  return resolveCompanyAdminContext(session.username);
}

function parseFields(body: Record<string, unknown>, mrp: number): { specialRate: number; startDate: string; endDate: string } | { error: string } {
  const specialRate = typeof body.specialRate === "number" ? body.specialRate : Number(body.specialRate);
  const startDate = body.startDate;
  const endDate = body.endDate;
  if (!Number.isFinite(specialRate) || specialRate <= 0 || specialRate >= mrp) return { error: "Special Rate must be greater than zero and lower than the selected product's MRP." } as const;
  if (!validIsoDate(startDate) || !validIsoDate(endDate)) return { error: "Enter valid Start Date and End Date values." } as const;
  if (endDate < startDate) return { error: "End Date cannot be earlier than Start Date." } as const;
  return { specialRate, startDate, endDate } as const;
}

export async function GET() {
  const context = await getCompany();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const today = new Date().toISOString().slice(0, 10);
  const rates = context.store.companySpecialRates.filter((rate) => rate.companyCode === context.master.code).map((rate) => ({ ...rate, status: getSpecialRateStatus(rate, today) })).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const products = context.store.companyProducts.filter((product) => product.companyCode === context.master.code && product.status === "active").map(({ id, productCode, brandName, mrp }) => ({ id, productCode, brandName, mrp }));
  return NextResponse.json({ rates, products, today });
}

export async function POST(request: Request) {
  const context = await getCompany();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.productId !== "string") return NextResponse.json({ error: "Select a product." }, { status: 400 });
  const product = context.store.companyProducts.find((item) => item.id === body.productId && item.companyCode === context.master.code && item.status === "active");
  if (!product) return NextResponse.json({ error: "The selected product is unavailable." }, { status: 400 });
  const fields = parseFields(body, product.mrp);
  if ("error" in fields) return NextResponse.json({ error: fields.error }, { status: 400 });
  const result = await transactStore((store) => {
    const currentProduct = store.companyProducts.find((item) => item.id === product.id && item.companyCode === context.master.code && item.status === "active");
    if (!currentProduct) return { error: "The selected product is unavailable." } as const;
    if (fields.specialRate >= currentProduct.mrp) return { error: "Special Rate must remain below the product's current MRP." } as const;
    if (overlapsSpecialRate(store, context.master.code, currentProduct.id, fields.startDate, fields.endDate)) return { error: "This product already has a special rate that overlaps the selected dates." } as const;
    const now = new Date().toISOString();
    const rate: CompanySpecialRate = { id: crypto.randomUUID(), companyCode: context.master.code, productId: currentProduct.id, productCode: currentProduct.productCode, productName: currentProduct.brandName, mrp: currentProduct.mrp, ...fields, enabled: true, approvalStatus: "approved", createdAt: now, updatedAt: now };
    store.companySpecialRates.push(rate);
    store.audit.unshift({ id: crypto.randomUUID(), at: now, actor: context.account.username, action: "company_special_rate_created", masterCode: context.master.code, detail: `Special rate created for product ${product.productCode}` });
    return { rate } as const;
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ rate: { ...result.rate, status: getSpecialRateStatus(result.rate) } }, { status: 201 });
}

export async function PATCH(request: Request) {
  const context = await getCompany();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string") return NextResponse.json({ error: "Select a valid special rate." }, { status: 400 });
  const result = await transactStore((store) => {
    const rate = store.companySpecialRates.find((item) => item.id === body.id && item.companyCode === context.master.code);
    if (!rate) return { error: "Special rate not found." } as const;
    const now = new Date().toISOString();
    if (body.action === "set-enabled") {
      if (typeof body.enabled !== "boolean") return { error: "Select a valid availability state." } as const;
      if (body.enabled && overlapsSpecialRate(store, context.master.code, rate.productId, rate.startDate, rate.endDate, rate.id)) return { error: "Another special rate overlaps this product's effective dates." } as const;
      rate.enabled = body.enabled;
      rate.updatedAt = now;
      store.audit.unshift({ id: crypto.randomUUID(), at: now, actor: context.account.username, action: body.enabled ? "company_special_rate_activated" : "company_special_rate_deactivated", masterCode: context.master.code, detail: `Special rate for ${rate.productCode} ${body.enabled ? "activated" : "deactivated"}` });
      return { rate } as const;
    }
    if (typeof body.productId !== "string") return { error: "Select a product." } as const;
    const product = store.companyProducts.find((item) => item.id === body.productId && item.companyCode === context.master.code && item.status === "active");
    if (!product) return { error: "The selected product is unavailable." } as const;
    const fields = parseFields(body, product.mrp);
    if ("error" in fields) return fields;
    if (overlapsSpecialRate(store, context.master.code, product.id, fields.startDate, fields.endDate, rate.id)) return { error: "This product already has a special rate that overlaps the selected dates." } as const;
    Object.assign(rate, { productId: product.id, productCode: product.productCode, productName: product.brandName, mrp: product.mrp, ...fields, updatedAt: now });
    store.audit.unshift({ id: crypto.randomUUID(), at: now, actor: context.account.username, action: "company_special_rate_updated", masterCode: context.master.code, detail: `Special rate for ${rate.productCode} updated` });
    return { rate } as const;
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ rate: { ...result.rate, status: getSpecialRateStatus(result.rate) } });
}

export async function DELETE(request: Request) {
  const context = await getCompany();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { id?: unknown } | null;
  if (!body || typeof body.id !== "string") return NextResponse.json({ error: "Select a valid special rate." }, { status: 400 });
  const result = await transactStore((store) => {
    const index = store.companySpecialRates.findIndex((rate) => rate.id === body.id && rate.companyCode === context.master.code);
    if (index < 0) return { error: "Special rate not found." } as const;
    const rate = store.companySpecialRates[index];
    if (store.companyOrders.some((order) => order.companyCode === context.master.code && order.items?.some((item) => item.specialRateId === rate.id))) return { error: "This special rate is referenced by order history. Deactivate it instead." } as const;
    store.companySpecialRates.splice(index, 1);
    store.audit.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), actor: context.account.username, action: "company_special_rate_deleted", masterCode: context.master.code, detail: `Special rate for ${rate.productCode} deleted` });
    return { deleted: true } as const;
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ deleted: true });
}
