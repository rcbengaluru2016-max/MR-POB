import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { resolveCompanyAdminContext } from "@/lib/server/company-admin";

export async function GET() {
  const session = await getSession();
  if (!session || session.userType !== "company" || !await resolveCompanyAdminContext(session.username)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Zenex";
  workbook.subject = "Company special rates upload template";
  const sheet = workbook.addWorksheet("Special Rates");
  sheet.columns = [
    { header: "Product Code or Name", key: "product", width: 32 },
    { header: "Special Rate", key: "specialRate", width: 18 },
    { header: "Start Date (YYYY-MM-DD)", key: "startDate", width: 25 },
    { header: "End Date (YYYY-MM-DD)", key: "endDate", width: 25 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF10254B" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  for (let row = 2; row <= 101; row++) {
    sheet.getCell(row, 2).dataValidation = { type: "decimal", operator: "greaterThan", formulae: [0], allowBlank: false, showErrorMessage: true, errorTitle: "Invalid special rate", error: "Enter a rate greater than zero and below the product MRP." };
    for (const column of [3, 4]) sheet.getCell(row, column).numFmt = "yyyy-mm-dd";
  }
  const bytes = await workbook.xlsx.writeBuffer();
  return new NextResponse(bytes, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": "attachment; filename=zenex-special-rates-template.xlsx", "Cache-Control": "no-store" } });
}
