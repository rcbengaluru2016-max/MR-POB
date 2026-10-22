import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { resolveCompanyAdminContext } from "@/lib/server/company-admin";
import { transactStore } from "@/lib/server/store";
import type { CompanyProduct, UploadedFile } from "@/lib/types";

const imageKinds = ["front", "composition", "manufacturer", "details"] as const;
const maxImageSize = 4 * 1024 * 1024;
const gstRates = new Set([0, 5, 12, 18, 28]);
type RowResult = { rowNumber: number; productCode: string; brandName: string; composition: string; packSize: string; mrp: number; ptr: number; pts: number; gst: number; images?: CompanyProduct["images"]; errors: string[] };

async function getCompany() {
  const session = await getSession();
  if (!session || session.userType !== "company") return null;
  return resolveCompanyAdminContext(session.username);
}

function cellText(value: ExcelJS.CellValue | undefined) { return value === null || value === undefined ? "" : String(value).trim(); }

async function readUpload(file: File): Promise<{ image?: UploadedFile; error?: string }> {
  if (file.size > maxImageSize) return { error: `${file.name} exceeds the 4 MB image limit.` };
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowed.has(file.type)) return { error: `${file.name} is not a JPEG, PNG, or WebP image.` };
  const buffer = Buffer.from(await file.arrayBuffer());
  const signatureValid = file.type === "image/png" ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : file.type === "image/jpeg" ? buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff : buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  if (!signatureValid) return { error: `${file.name} does not match its image format.` };
  const dataUrl = `data:${file.type};base64,${buffer.toString("base64")}`;
  return { image: { name: file.name.slice(0, 120), type: file.type, size: buffer.length, dataUrl } };
}

function normalizedImageKind(suffix: string) {
  const value = suffix.toLowerCase().replace(/[\s-]+/g, "");
  if (["front", "1", "frontimage"].includes(value)) return "front";
  if (["composition", "content", "side", "2", "compositionside"].includes(value)) return "composition";
  if (["manufacturer", "maker", "3", "manufacturerside"].includes(value)) return "manufacturer";
  if (["details", "mrp", "batch", "4", "mrpdetails", "mrpandbatch"].includes(value)) return "details";
  return null;
}

async function parseFiles(form: FormData, context: NonNullable<Awaited<ReturnType<typeof getCompany>>>) {
  const upload = form.get("workbook");
  if (!(upload instanceof File) || !upload.size) return { error: "Choose an Excel .xlsx file." } as const;
  if (!upload.name.toLowerCase().endsWith(".xlsx") || upload.size > 10 * 1024 * 1024) return { error: "Upload an .xlsx file no larger than 10 MB." } as const;
  const buffer = Buffer.from(await upload.arrayBuffer());
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) return { error: "The selected workbook is not a valid .xlsx file." } as const;

  const images = new Map<string, Partial<Record<(typeof imageKinds)[number], UploadedFile>>>();
  const imageErrors = new Map<string, string[]>();
  const imageFiles = form.getAll("images").filter((value): value is File => value instanceof File && value.size > 0);
  if (imageFiles.length > 400) return { error: "Upload no more than 400 product images at a time." } as const;
  if (imageFiles.reduce((total, file) => total + file.size, 0) > 60 * 1024 * 1024) return { error: "The combined product image upload must be no larger than 60 MB." } as const;
  for (const file of imageFiles) {
    const match = file.name.match(/^(.+)_([A-Za-z0-9 -]+)\.[^.]+$/);
    if (!match) continue;
    const code = match[1].trim().toUpperCase();
    const kind = normalizedImageKind(match[2]);
    if (!kind) continue;
    const loaded = await readUpload(file);
    if (loaded.error) imageErrors.set(code, [...(imageErrors.get(code) ?? []), loaded.error]);
    else if (loaded.image) {
      const mapped = images.get(code) ?? {};
      mapped[kind] = loaded.image;
      images.set(code, mapped);
    }
  }

  let workbook: ExcelJS.Workbook;
  try { workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer as unknown as Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0]); }
  catch { return { error: "The workbook could not be opened. Download a fresh template and try again." } as const; }
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2 || sheet.rowCount > 101) return { error: "The workbook must contain a header and between 1 and 100 product rows." } as const;
  const headers = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, column) => { headers.set(cellText(cell.value).toLowerCase().replace(/[^a-z0-9]/g, ""), column); });
  const headerAliases: Record<string, string[]> = {
    productCode: ["productcoderowkey", "productcode", "rowkey"], brandName: ["brandname"], composition: ["contentcomposition", "composition", "content"], packSize: ["packsize"],
    mrp: ["mrp"], ptr: ["ptr"], pts: ["pts"], gst: ["gst", "gstpercent"],
  };
  const columns = Object.fromEntries(Object.entries(headerAliases).map(([key, aliases]) => [key, aliases.map((alias) => headers.get(alias)).find((column) => column !== undefined)])) as Record<keyof typeof headerAliases, number | undefined>;
  const missingHeaders = ["productCode", "brandName", "packSize", "mrp", "ptr", "pts", "gst"].filter((key) => !columns[key as keyof typeof columns]);
  if (missingHeaders.length) return { error: `Missing required template columns: ${missingHeaders.join(", ")}.` } as const;

  const rows: RowResult[] = [];
  const seen = new Set<string>();
  const companyProducts = context.store.companyProducts.filter((product) => product.companyCode === context.master.code);
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (row.cellCount === 0) continue;
    const get = (key: keyof typeof columns) => cellText(columns[key] ? row.getCell(columns[key]!).text : "");
    const productCode = get("productCode").toUpperCase();
    const brandName = get("brandName");
    const composition = get("composition");
    const packSize = get("packSize");
    const mrp = Number(get("mrp")); const ptr = Number(get("ptr")); const pts = Number(get("pts")); const gst = Number(get("gst"));
    const errors: string[] = [];
    if (!/^[A-Z0-9-]{2,40}$/.test(productCode)) errors.push("Product Code / Row Key must contain 2–40 letters, numbers, or hyphens.");
    if (productCode && seen.has(productCode)) errors.push("Duplicate Product Code / Row Key in this workbook.");
    if (productCode) seen.add(productCode);
    if (companyProducts.some((product) => product.productCode.toUpperCase() === productCode)) errors.push("Product Code already exists for this company.");
    if (!brandName || brandName.length > 120) errors.push("Brand Name is required and must be no longer than 120 characters.");
    if (composition.length > 2000) errors.push("Content / Composition must be 2,000 characters or fewer.");
    if (!packSize || packSize.length > 100) errors.push("Pack Size is required and must be 100 characters or fewer.");
    if (![mrp, ptr, pts].every((value) => Number.isFinite(value) && value >= 0)) errors.push("MRP, PTR, and PTS must be non-negative numbers.");
    if (!gstRates.has(gst)) errors.push("GST must be 0%, 5%, 12%, 18%, or 28%.");
    const mapped = images.get(productCode) ?? {};
    errors.push(...(imageErrors.get(productCode) ?? []));
    for (const kind of imageKinds) if (!mapped[kind]) errors.push(`Missing image: ${productCode}_${kind}.jpg (or .png/.webp).`);
    if (errors.length === 0) rows.push({ rowNumber, productCode, brandName, composition, packSize, mrp, ptr, pts, gst, images: mapped as CompanyProduct["images"], errors });
    else rows.push({ rowNumber, productCode, brandName, composition, packSize, mrp, ptr, pts, gst, errors });
  }
  const mappedKeys = new Set(rows.map((row) => row.productCode));
  const skippedImages = [...images.keys()].filter((key) => !mappedKeys.has(key));
  return { rows, skippedImages } as const;
}

export async function POST(request: Request) {
  const context = await getCompany();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Upload a valid Excel workbook and image set." }, { status: 400 });
  const parsed = await parseFiles(form, context);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const preview = parsed.rows.map((row) => {
    const { images, ...previewRow } = row;
    void images;
    return previewRow;
  });
  if (form.get("action") !== "import") {
    const validCount = parsed.rows.filter((row) => row.errors.length === 0).length;
    return NextResponse.json({ rows: preview, skippedImageKeys: parsed.skippedImages, summary: { total: parsed.rows.length, valid: validCount, invalid: parsed.rows.length - validCount, skipped: parsed.skippedImages.length } });
  }

  const result = await transactStore((store) => {
    const successful: string[] = [];
    const rowErrors = preview.map((row) => ({ rowNumber: row.rowNumber, productCode: row.productCode, errors: [...row.errors] }));
    for (const row of parsed.rows) {
      if (row.errors.length) continue;
      if (store.companyProducts.some((product) => product.companyCode === context.master.code && product.productCode.toUpperCase() === row.productCode)) {
        rowErrors.find((item) => item.rowNumber === row.rowNumber)?.errors.push("Product Code was added by another import; record skipped.");
        continue;
      }
      const now = new Date().toISOString();
      store.companyProducts.push({ id: crypto.randomUUID(), companyCode: context.master.code, productCode: row.productCode, brandName: row.brandName, composition: row.composition || undefined, packSize: row.packSize || undefined, mrp: row.mrp, ptr: row.ptr, pts: row.pts, gst: row.gst, images: row.images!, status: "active", createdAt: now, updatedAt: now });
      successful.push(row.productCode);
    }
    const at = new Date().toISOString();
    store.audit.unshift({ id: crypto.randomUUID(), at, actor: context.account.username, action: "company_products_bulk_imported", masterCode: context.master.code, detail: `${successful.length} product(s) imported from Excel` });
    return { successful, rowErrors };
  });
  return NextResponse.json({ summary: { total: preview.length, imported: result.successful.length, failed: result.rowErrors.filter((row) => row.errors.length > 0).length, skipped: parsed.skippedImages.length }, successfulProductCodes: result.successful, rowErrors: result.rowErrors, skippedImageKeys: parsed.skippedImages });
}
