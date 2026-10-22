import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { overlapsSpecialRate, validIsoDate } from "@/lib/company/special-rates";
import { getSession } from "@/lib/server/session";
import { resolveCompanyAdminContext } from "@/lib/server/company-admin";
import { transactStore } from "@/lib/server/store";
import type { CompanyProduct, CompanySpecialRate } from "@/lib/types";

type BulkRow = { rowNumber: number; product: string; productName: string; mrp: number; specialRate: number; startDate: string; endDate: string; productId?: string; errors: string[] };

async function getCompany() {
  const session = await getSession();
  if (!session || session.userType !== "company") return null;
  return resolveCompanyAdminContext(session.username);
}

function text(value: ExcelJS.CellValue | undefined) { return value === null || value === undefined ? "" : String(value).trim(); }
function isoDate(cell: ExcelJS.Cell) {
  if (cell.value instanceof Date) return cell.value.toISOString().slice(0, 10);
  if (typeof cell.value === "number") return new Date(Date.UTC(1899, 11, 30) + Math.floor(cell.value) * 86400000).toISOString().slice(0, 10);
  return cell.text.trim();
}

function matchProduct(products: CompanyProduct[], input: string) {
  const normalized = input.trim().toLocaleLowerCase();
  if (!normalized) return { error: "Product Code or Name is required." } as const;
  const byCode = products.find((product) => product.productCode.toLocaleLowerCase() === normalized);
  if (byCode) return { product: byCode } as const;
  const byName = products.filter((product) => product.brandName.toLocaleLowerCase() === normalized);
  if (byName.length === 1) return { product: byName[0] } as const;
  if (byName.length > 1) return { error: "Product Name is ambiguous; use its Product Code." } as const;
  return { error: "Product Code or Name does not match an active product in this company." } as const;
}

async function parseWorkbook(file: File, products: CompanyProduct[], rates: CompanySpecialRate[], companyCode: string) {
  if (!file.name.toLowerCase().endsWith(".xlsx") || file.size > 10 * 1024 * 1024) return { error: "Upload an .xlsx workbook no larger than 10 MB." } as const;
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) return { error: "The selected workbook is not a valid .xlsx file." } as const;
  let workbook: ExcelJS.Workbook;
  try { workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer as unknown as Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0]); }
  catch { return { error: "The workbook could not be opened. Download a fresh template and try again." } as const; }
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2 || sheet.rowCount > 101) return { error: "The workbook must contain a header and between 1 and 100 special-rate rows." } as const;
  const headers = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, column) => headers.set(text(cell.value).toLowerCase().replace(/[^a-z0-9]/g, ""), column));
  const findColumn = (...names: string[]) => names.map((name) => headers.get(name)).find((column) => column !== undefined);
  const columns = { product: findColumn("productcodeorname", "product", "productcode", "productname"), specialRate: findColumn("specialrate", "rate"), startDate: findColumn("startdateyyyymmdd", "startdate"), endDate: findColumn("enddateyyyymmdd", "enddate") };
  if (Object.values(columns).some((column) => !column)) return { error: "Required columns: Product Code or Name, Special Rate, Start Date, and End Date." } as const;
  const rows: BulkRow[] = [];
  const seen: Array<{ productId: string; startDate: string; endDate: string; rowNumber: number }> = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const productInput = text(row.getCell(columns.product!).value);
    const specialRateText = text(row.getCell(columns.specialRate!).value);
    const matched = matchProduct(products, productInput);
    const specialRate = Number(specialRateText);
    const startDate = isoDate(row.getCell(columns.startDate!));
    const endDate = isoDate(row.getCell(columns.endDate!));
    if (![productInput, specialRateText, startDate, endDate].some((value) => value !== "")) continue;
    const errors: string[] = [];
    if ("error" in matched && matched.error) errors.push(matched.error);
    const product = "product" in matched ? matched.product : undefined;
    if (!Number.isFinite(specialRate) || specialRate <= 0 || (product && specialRate >= product.mrp)) errors.push("Special Rate must be greater than zero and lower than the product MRP.");
    if (!validIsoDate(startDate) || !validIsoDate(endDate)) errors.push("Start Date and End Date must be valid dates in YYYY-MM-DD format.");
    else if (endDate < startDate) errors.push("End Date cannot be earlier than Start Date.");
    if (product && validIsoDate(startDate) && validIsoDate(endDate) && endDate >= startDate) {
      if (rates.some((rate) => rate.companyCode === companyCode && rate.productId === product.id && rate.approvalStatus !== "rejected" && rate.startDate <= endDate && startDate <= rate.endDate)) errors.push("This product has an existing special rate that conflicts with these dates.");
      const sameBatch = seen.find((item) => item.productId === product.id && item.startDate <= endDate && startDate <= item.endDate);
      if (sameBatch) errors.push(`Conflicts with another uploaded row (${sameBatch.rowNumber}).`);
      else seen.push({ productId: product.id, startDate, endDate, rowNumber });
    }
    rows.push({ rowNumber, product: productInput, productName: product?.brandName ?? "", mrp: product?.mrp ?? Number.NaN, specialRate, startDate, endDate, productId: product?.id, errors });
  }
  return { rows } as const;
}

export async function POST(request: Request) {
  const context = await getCompany();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const upload = form?.get("workbook");
  if (!(upload instanceof File) || !upload.size) return NextResponse.json({ error: "Choose an Excel workbook." }, { status: 400 });
  const companyCode = context.master.code;
  const products = context.store.companyProducts.filter((product) => product.companyCode === companyCode && product.status === "active");
  const parsed = await parseWorkbook(upload, products, context.store.companySpecialRates, companyCode);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const valid = parsed.rows.filter((row) => row.errors.length === 0);
  if (form?.get("action") !== "import") return NextResponse.json({ rows: parsed.rows, summary: { total: parsed.rows.length, valid: valid.length, invalid: parsed.rows.length - valid.length, duplicates: parsed.rows.filter((row) => row.errors.some((error) => error.includes("conflict"))).length } });
  const result = await transactStore((store) => {
    const imported: number[] = [];
    const rowErrors = parsed.rows.map((row) => ({ rowNumber: row.rowNumber, product: row.product, errors: [...row.errors] }));
    for (const row of valid) {
      const product = store.companyProducts.find((item) => item.id === row.productId && item.companyCode === companyCode && item.status === "active");
      if (!product || row.specialRate <= 0 || row.specialRate >= product.mrp || overlapsSpecialRate(store, companyCode, product.id, row.startDate, row.endDate)) {
        rowErrors.find((item) => item.rowNumber === row.rowNumber)?.errors.push("Product or rate availability changed after preview; row skipped.");
        continue;
      }
      const now = new Date().toISOString();
      store.companySpecialRates.push({ id: crypto.randomUUID(), companyCode, productId: product.id, productCode: product.productCode, productName: product.brandName, mrp: product.mrp, specialRate: row.specialRate, startDate: row.startDate, endDate: row.endDate, enabled: true, approvalStatus: "approved", createdAt: now, updatedAt: now });
      imported.push(row.rowNumber);
    }
    const at = new Date().toISOString();
    store.audit.unshift({ id: crypto.randomUUID(), at, actor: context.account.username, action: "company_special_rates_bulk_imported", masterCode: companyCode, detail: `${imported.length} special rate(s) imported` });
    return { imported, rowErrors };
  });
  return NextResponse.json({ total: parsed.rows.length, imported: result.imported.length, failed: result.rowErrors.filter((row) => row.errors.length).length, skipped: parsed.rows.length - result.imported.length - result.rowErrors.filter((row) => row.errors.length).length, rowErrors: result.rowErrors });
}
