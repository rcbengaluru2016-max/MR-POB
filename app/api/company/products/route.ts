import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { resolveCompanyAdminContext } from "@/lib/server/company-admin";
import { transactStore } from "@/lib/server/store";
import type { CompanyProduct, UploadedFile } from "@/lib/types";

const IMAGE_KEYS = ["front", "composition", "manufacturer", "details"] as const;
const MAX_IMAGE_SIZE = 4 * 1024 * 1024;
const GST_RATES = new Set([0, 5, 12, 18, 28]);

async function getCompany() {
  const session = await getSession();
  if (!session || session.userType !== "company") return null;
  return resolveCompanyAdminContext(session.username);
}

function readImage(input: unknown): { image?: UploadedFile; error?: string } {
  if (!input || typeof input !== "object") return { error: "All four product images are required." };
  const file = input as Partial<UploadedFile>;
  if (typeof file.name !== "string" || typeof file.dataUrl !== "string") return { error: "Choose a valid product image." };
  const match = file.dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/);
  if (!match) return { error: "Product images must be JPEG, PNG, or WebP files." };
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_SIZE) return { error: "Each product image must be 4 MB or smaller." };
  const validSignature = match[1] === "image/png"
    ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : match[1] === "image/jpeg"
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!validSignature) return { error: "The selected file does not match its image format." };
  return { image: { name: file.name.slice(0, 120), type: match[1], size: bytes.length, dataUrl: file.dataUrl } };
}

function parseProduct(body: Record<string, unknown>) {
  const productCode = typeof body.productCode === "string" ? body.productCode.trim().toUpperCase() : "";
  const brandName = typeof body.brandName === "string" ? body.brandName.trim() : "";
  const composition = typeof body.composition === "string" ? body.composition.trim() : "";
  const mrp = typeof body.mrp === "number" ? body.mrp : Number(body.mrp);
  const ptr = typeof body.ptr === "number" ? body.ptr : Number(body.ptr);
  const pts = typeof body.pts === "number" ? body.pts : Number(body.pts);
  const gst = typeof body.gst === "number" ? body.gst : Number(body.gst);
  if (productCode && !/^[A-Z0-9-]{2,40}$/.test(productCode)) return { error: "Product Code may contain 2–40 letters, numbers, or hyphens." } as const;
  if (brandName.length < 1 || brandName.length > 120) return { error: "Enter a brand name (up to 120 characters)." } as const;
  if (composition.length > 2000) return { error: "Content / Composition must be 2,000 characters or fewer." } as const;
  if (![mrp, ptr, pts].every((value) => Number.isFinite(value) && value >= 0)) return { error: "MRP, PTR, and PTS must be non-negative numbers." } as const;
  if (!GST_RATES.has(gst)) return { error: "GST must be one of the configured rates: 0%, 5%, 12%, 18%, or 28%." } as const;
  return { productCode, brandName, composition, mrp, ptr, pts, gst } as const;
}

function parseImages(input: unknown, existing?: CompanyProduct["images"]) {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const images = { ...(existing ?? {}) } as Partial<CompanyProduct["images"]>;
  for (const key of IMAGE_KEYS) {
    if (source[key] === undefined && existing?.[key]) continue;
    const parsed = readImage(source[key]);
    if (parsed.error || !parsed.image) return { error: parsed.error ?? `Upload the ${key} image.` } as const;
    images[key] = parsed.image;
  }
  if (IMAGE_KEYS.some((key) => !images[key])) return { error: "All four product images are required." } as const;
  return { images: images as CompanyProduct["images"] } as const;
}

export async function GET(request: Request) {
  const context = await getCompany();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim().toLocaleLowerCase();
  const status = params.get("status") ?? "all";
  const products = context.store.companyProducts
    .filter((product) => product.companyCode === context.master.code)
    .filter((product) => status === "all" || product.status === status)
    .filter((product) => !query || [product.productCode, product.brandName, product.composition ?? ""].some((value) => value.toLocaleLowerCase().includes(query)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ products });
}

export async function POST(request: Request) {
  const context = await getCompany();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Enter valid product details." }, { status: 400 });
  const product = parseProduct(body);
  if ("error" in product) return NextResponse.json({ error: product.error }, { status: 400 });
  const images = parseImages(body.images);
  if ("error" in images) return NextResponse.json({ error: images.error }, { status: 400 });

  const result = await transactStore((store) => {
    const code = product.productCode || `PRD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    if (store.companyProducts.some((item) => item.companyCode === context.master.code && item.productCode.toLowerCase() === code.toLowerCase())) return { error: "That Product Code is already in use for this company." } as const;
    const now = new Date().toISOString();
    const record: CompanyProduct = { id: crypto.randomUUID(), companyCode: context.master.code, productCode: code, brandName: product.brandName, composition: product.composition || undefined, mrp: product.mrp, ptr: product.ptr, pts: product.pts, gst: product.gst, images: images.images, status: "active", createdAt: now, updatedAt: now };
    store.companyProducts.push(record);
    store.audit.unshift({ id: crypto.randomUUID(), at: now, actor: context.account.username, action: "company_product_created", masterCode: context.master.code, detail: `Product ${record.productCode} created` });
    return { product: record } as const;
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ product: result.product }, { status: 201 });
}

export async function PATCH(request: Request) {
  const context = await getCompany();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string") return NextResponse.json({ error: "Select a valid product." }, { status: 400 });
  const result = await transactStore((store) => {
    const product = store.companyProducts.find((item) => item.id === body.id && item.companyCode === context.master.code);
    if (!product) return { error: "Product not found." } as const;
    const now = new Date().toISOString();
    if (body.action === "set-status") {
      if (body.status !== "active" && body.status !== "inactive") return { error: "Select a valid product status." } as const;
      product.status = body.status;
      product.updatedAt = now;
      store.audit.unshift({ id: crypto.randomUUID(), at: now, actor: context.account.username, action: body.status === "active" ? "company_product_activated" : "company_product_deactivated", masterCode: context.master.code, detail: `Product ${product.productCode} set to ${body.status}` });
      return { product } as const;
    }
    const fields = parseProduct(body);
    if ("error" in fields) return { error: fields.error } as const;
    const code = fields.productCode || product.productCode;
    if (store.companyProducts.some((item) => item.id !== product.id && item.companyCode === context.master.code && item.productCode.toLowerCase() === code.toLowerCase())) return { error: "That Product Code is already in use for this company." } as const;
    const images = parseImages(body.images, product.images);
    if ("error" in images) return { error: images.error } as const;
    Object.assign(product, { productCode: code, brandName: fields.brandName, composition: fields.composition || undefined, mrp: fields.mrp, ptr: fields.ptr, pts: fields.pts, gst: fields.gst, images: images.images, updatedAt: now });
    store.audit.unshift({ id: crypto.randomUUID(), at: now, actor: context.account.username, action: "company_product_updated", masterCode: context.master.code, detail: `Product ${product.productCode} details updated` });
    return { product } as const;
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ product: result.product });
}

export async function DELETE(request: Request) {
  const context = await getCompany();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { id?: unknown } | null;
  if (!body || typeof body.id !== "string") return NextResponse.json({ error: "Select a valid product." }, { status: 400 });
  const result = await transactStore((store) => {
    const index = store.companyProducts.findIndex((item) => item.id === body.id && item.companyCode === context.master.code);
    if (index < 0) return { error: "Product not found." } as const;
    const product = store.companyProducts[index];
    const hasHistory = store.companyOrders.some((order) => order.companyCode === context.master.code && order.items?.some((item) => item.productId === product.id));
    if (hasHistory) return { error: "This product is referenced by historical orders. Deactivate it instead." } as const;
    store.companyProducts.splice(index, 1);
    store.audit.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), actor: context.account.username, action: "company_product_deleted", masterCode: context.master.code, detail: `Product ${product.productCode} deleted` });
    return { id: product.id } as const;
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ deleted: true });
}
