import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { resolveCompanyAdminContext } from "@/lib/server/company-admin";

export async function GET() {
  const session = await getSession();
  if (!session || session.userType !== "company") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await resolveCompanyAdminContext(session.username)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Zenex";
  workbook.subject = "Company product upload template";
  const sheet = workbook.addWorksheet("Products");
  sheet.columns = [
    { header: "Product Code / Row Key", key: "productCode", width: 28 },
    { header: "Brand Name", key: "brandName", width: 32 },
    { header: "Content / Composition", key: "composition", width: 42 },
    { header: "Pack Size", key: "packSize", width: 22 },
    { header: "MRP", key: "mrp", width: 16 },
    { header: "PTR", key: "ptr", width: 16 },
    { header: "PTS", key: "pts", width: 16 },
    { header: "GST (%)", key: "gst", width: 16 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF10254B" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  for (let row = 2; row <= 1000; row++) {
    for (const col of [5, 6, 7]) sheet.getCell(row, col).dataValidation = { type: "decimal", operator: "greaterThanOrEqual", formulae: [0], allowBlank: false, showErrorMessage: true, errorTitle: "Invalid price", error: "Enter a non-negative number." };
    sheet.getCell(row, 4).dataValidation = { type: "textLength", operator: "between", formulae: [1, 100], allowBlank: false, showErrorMessage: true, errorTitle: "Invalid Pack Size", error: "Enter a Pack Size with up to 100 characters." };
    sheet.getCell(row, 8).dataValidation = { type: "list", formulae: ['"0,5,12,18,28"'], allowBlank: false, showErrorMessage: true, errorTitle: "Invalid GST", error: "Choose 0, 5, 12, 18, or 28 percent." };
  }
  const bytes = await workbook.xlsx.writeBuffer();
  return new NextResponse(bytes, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": "attachment; filename=zenex-product-upload-template.xlsx", "Cache-Control": "no-store" } });
}
