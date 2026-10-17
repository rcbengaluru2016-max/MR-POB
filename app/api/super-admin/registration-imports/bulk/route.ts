import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSalt, hashPassword } from "@/lib/crypto";
import { encryptUploadFile } from "@/lib/server/upload-file";
import { CREDIT_DAY_VALUES, CUSTOMER_PAYMENT_METHODS, CUSTOMER_TYPES, MAX_FILE_BYTES, PATIENT_PAYMENT_METHODS, REGISTRATION_PREFIX, ALLOWED_FILE_TYPES } from "@/lib/constants";
import { toUploadedFile } from "@/lib/server/files";
import { isSuperAdminReady } from "@/lib/server/super-admin";
import { SUPER_ADMIN_EMAIL } from "@/lib/server/super-admin-config";
import { getSession } from "@/lib/server/session";
import { nextId, persistStore, refreshStore, transactStore } from "@/lib/server/store";
import type { RegistrationRecord } from "@/lib/types";
import { customerRegistrationFieldsSchema, companyRegistrationFieldsSchema, patientRegistrationFieldsSchema } from "@/lib/validation";

export const instant = false;
type Kind = "customer" | "company" | "patient";
const kinds = ["customer", "company", "patient"] as const;
type Field = { key: string; required: boolean; dropdown?: readonly string[]; file?: string; label?: string };
const fields: Record<Kind, Field[]> = {
  customer: [
    {key:"customerName",label:"Owner",required:true},{key:"mobile",label:"Mobile Number",required:true},{key:"email",label:"Email",required:false},{key:"password",label:"Password",required:true},{key:"confirmPassword",label:"Confirm Password",required:true},{key:"businessName",label:"Name",required:true},{key:"customerType",label:"Customer Category",required:true,dropdown:CUSTOMER_TYPES},{key:"addressLine1",label:"Address Line 1",required:true},{key:"addressLine2",label:"Address Line 2",required:false},{key:"addressLine3",label:"Address Line 3",required:false},{key:"addressLine4",label:"Address Line 4",required:false},{key:"pinCode",label:"PIN Code",required:true},{key:"dlNumber1",label:"DL Number 1",required:true},{key:"dlNumber2",label:"DL Number 2",required:true},{key:"dlNumber3",label:"DL Number 3",required:false},{key:"fssaiNumber",label:"FSSAI Number",required:false},{key:"gstNumber",label:"GST Number",required:true},{key:"creditDays",label:"Credit Days",required:true,dropdown:CREDIT_DAY_VALUES},{key:"paymentMethod",label:"Payment Method",required:true,dropdown:CUSTOMER_PAYMENT_METHODS},{key:"termsAccepted",label:"Terms Accepted",required:true,dropdown:["TRUE","FALSE"]},{key:"dl1File",label:"DL 1 File",required:true,file:"dl1"},{key:"dl2File",label:"DL 2 File",required:true,file:"dl2"},{key:"dl3File",label:"DL 3 File",required:false,file:"dl3"},{key:"gstCertificateFile",label:"GST Certificate File",required:true,file:"gstCertificate"},{key:"shopOutsideFile",label:"Shop Photo Outside",required:true,file:"shopOutside"},{key:"shopInsideFile",label:"Shop Photo Inside",required:true,file:"shopInside"},
  ],
  company: [
    {key:"companyName",required:true},{key:"division",required:true},{key:"headquarter",required:true},{key:"adminFullName",required:true},{key:"adminEmail",required:true},{key:"adminMobile",required:true},{key:"password",required:true},{key:"confirmPassword",required:true},{key:"termsAccepted",required:true,dropdown:["TRUE","FALSE"]},{key:"companyLogoFile",required:true,file:"companyLogo",label:"Company Logo"},{key:"adminPhotoFile",required:true,file:"adminPhoto",label:"Admin Photo"},
  ],
  patient: [
    {key:"patientName",required:true},{key:"mobile",required:true},{key:"email",required:false},{key:"password",required:true},{key:"confirmPassword",required:true},{key:"gender",required:false,dropdown:["Female","Male","Other","Prefer not to say"]},{key:"address",required:true},{key:"paymentMethod",required:true,dropdown:PATIENT_PAYMENT_METHODS},{key:"termsAccepted",required:true,dropdown:["TRUE","FALSE"]},{key:"idProofFile",required:false,file:"idProof"},
  ],
};
const schema = { customer: customerRegistrationFieldsSchema, company: companyRegistrationFieldsSchema, patient: patientRegistrationFieldsSchema };
const nameKey = { customer:"customerName", company:"companyName", patient:"patientName" } as const;

function cellText(value: ExcelJS.CellValue) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "text" in value) return String(value.text ?? "").trim();
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function rowInput(kind: Kind, row: Record<string, string>) {
  return { ...row, termsAccepted: row.termsAccepted.toLowerCase() === "true" || row.termsAccepted === "1" };
}

function matchingFile(files: File[], filename: string) {
  const matches = files.filter((file) => file.name.toLowerCase() === filename.trim().toLowerCase());
  if (matches.length > 1) throw new Error(`More than one uploaded document is named “${filename}”.`);
  return matches[0];
}

async function getRows(workbookFile: File, kind: Kind, documents: File[]) {
  if (workbookFile.size > 8 * 1024 * 1024) throw new Error("The workbook must be 8 MB or smaller.");
  if (!workbookFile.name.toLowerCase().endsWith(".xlsx")) throw new Error("Upload an Excel .xlsx workbook.");
  if (documents.reduce((sum, file) => sum + file.size, 0) > 25 * 1024 * 1024) throw new Error("Supporting documents must total 25 MB or less.");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await workbookFile.arrayBuffer());
  const sheet = workbook.getWorksheet("Registrations") ?? workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2 || sheet.columnCount > 40 || sheet.rowCount > 252) throw new Error("The workbook must contain a header and 1 to 250 data rows.");
  const headerAliases = new Map(fields[kind].flatMap((field) => [[field.key.toLowerCase(), field.key] as const, ...(field.label ? [[field.label.toLowerCase(), field.key] as const] : [])]));
  const headers = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => {
    const label = cellText(cell.value).replace(/\s+\*$/, "").trim().toLowerCase();
    headers.set(headerAliases.get(label) ?? label, col);
  });
  const missing = fields[kind].filter((field) => !headers.has(field.key)).map((field) => field.key);
  if (missing.length) throw new Error(`The workbook is missing template columns: ${missing.join(", ")}.`);
  const foundRows: Array<{ rowNumber: number; values: Record<string, string>; input: Record<string, unknown>; errors: string[]; duplicate: boolean; files: Record<string, File | undefined> }> = [];
  const seenMobiles = new Set<string>();
  const seenEmails = new Set<string>();
  const existing = await refreshStore();
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const values: Record<string, string> = {};
    for (const field of fields[kind]) values[field.key] = cellText(row.getCell(headers.get(field.key)!).value);
    if (Object.values(values).every((value) => !value)) continue;
    const errors: string[] = [];
    for (const field of fields[kind]) {
      if (field.required && !values[field.key]) errors.push(`${field.key} is required`);
      if (field.dropdown && values[field.key] && !field.dropdown.includes(values[field.key])) errors.push(`${field.key} must be one of: ${field.dropdown.join(", ")}`);
    }
    const input = rowInput(kind, values);
    const parsed = schema[kind].safeParse(input);
    if (!parsed.success) for (const issue of parsed.error.issues) errors.push(issue.message);
    const mobileKey = kind === "company" ? values.adminMobile : values.mobile;
    const emailKey = kind === "company" ? values.adminEmail : values.email;
    if (emailKey?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) errors.push("This email is reserved for administrator access");
    const fileMap: Record<string, File | undefined> = {};
    try {
      for (const field of fields[kind].filter((entry) => entry.file)) {
        const filename = values[field.key];
        if (!filename) continue;
        const file = matchingFile(documents, filename);
        if (!file) errors.push(`${field.key}: select the supporting file named “${filename}”`);
        else if (file.size > MAX_FILE_BYTES || (kind === "company" ? !["image/jpeg", "image/png", "image/webp"].includes(file.type) : !ALLOWED_FILE_TYPES.includes(file.type as (typeof ALLOWED_FILE_TYPES)[number]))) errors.push(`${field.key}: file type or size is not allowed`);
        else fileMap[field.file!] = file;
      }
    } catch (error) { errors.push(error instanceof Error ? error.message : "Invalid supporting document."); }
    const duplicate = Boolean(mobileKey && (seenMobiles.has(mobileKey) || (emailKey && seenEmails.has(emailKey.toLowerCase())) || existing.registrations.some((record) => record.status !== "rejected" && (record.mobile === mobileKey || (emailKey && record.email?.toLowerCase() === emailKey.toLowerCase())))));
    if (duplicate) errors.push("Duplicate mobile number or email address");
    if (mobileKey) seenMobiles.add(mobileKey);
    if (emailKey) seenEmails.add(emailKey.toLowerCase());
    foundRows.push({ rowNumber, values, input, errors: [...new Set(errors)], duplicate, files: fileMap });
  }
  if (!foundRows.length) throw new Error("The workbook has no registration rows.");
  return foundRows;
}

export async function GET(request: Request) {
  if (!(await isSuperAdminReady())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const kind = new URL(request.url).searchParams.get("kind") as Kind | null;
  if (!kind || !kinds.includes(kind)) return NextResponse.json({ error: "Choose a valid registration category." }, { status: 400 });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Registrations");
  const columns = fields[kind];
  sheet.addRow(columns.map((field) => `${field.label ?? field.key}${field.required ? " *" : ""}`));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF123DAA" } };
  columns.forEach((field, index) => {
    sheet.getColumn(index + 1).width = Math.min(32, Math.max(18, field.key.length + 5));
    const options = field.dropdown;
    if (options) for (let row = 2; row <= 251; row++) sheet.getCell(row, index + 1).dataValidation = { type: "list", allowBlank: !field.required, formulae: [`"${options.join(",")}"`] };
  });
  const instructions = workbook.addWorksheet("Instructions");
  instructions.addRows([["Zenex International — Registration Import"],["Use the Registrations sheet; keep its column names unchanged."],["* marks mandatory fields. Password and confirmation are required and never shown in preview."],["Enter TRUE in termsAccepted only when the applicant has accepted the applicable Terms & Conditions."],["File columns contain exact filenames. Select those files together with this workbook when importing."],["Customer required files: dl1File, dl2File, gstCertificateFile, shopOutsideFile, shopInsideFile. dl3File and fssaiNumber are optional. Company required files: companyLogoFile, adminPhotoFile. Patient idProofFile is optional."],["Customer and Patient documents: JPG, PNG, WEBP, or PDF; Company logo and admin photo: JPG, PNG, or WEBP. 5 MB each. Total documents: 25 MB."],["Up to 250 registration rows per workbook. Imports remain Pending Verification."],[`Allowed values are provided as dropdowns where applicable. Customer creditDays values: ${CREDIT_DAY_VALUES.join(", ")}.`]]);
  instructions.getColumn(1).width = 120;
  instructions.getColumn(1).alignment = { wrapText: true, vertical: "top" };
  const data = Buffer.from(await workbook.xlsx.writeBuffer());
  return new Response(data, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="zenex-${kind}-registration-template.xlsx"`, "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await isSuperAdminReady())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let activeUploadId: string | undefined;
  try {
    const form = await request.formData();
    const kind = String(form.get("kind")) as Kind;
    const action = String(form.get("action"));
    const workbookFile = form.get("file");
    if (!kinds.includes(kind) || !(workbookFile instanceof File) || !["preview", "commit"].includes(action)) return NextResponse.json({ error: "Choose a category, workbook, and valid import action." }, { status: 400 });
    const documents = form.getAll("documents").filter((value): value is File => value instanceof File && value.size > 0);
    const rows = await getRows(workbookFile, kind, documents);
    const preview = rows.map(({ rowNumber, values, errors, duplicate }) => ({ rowNumber, name: values[nameKey[kind]], mobile: (kind === "company" ? values.adminMobile : values.mobile), email: (kind === "company" ? values.adminEmail : values.email) || "", valid: errors.length === 0, duplicate, errors }));
    if (action === "preview") return NextResponse.json({ rows: preview, counts: { total: rows.length, valid: preview.filter((row) => row.valid).length, failed: preview.filter((row) => !row.valid && !row.duplicate).length, duplicates: preview.filter((row) => row.duplicate).length } });
    const ready = rows.filter((row) => row.errors.length === 0);
    const actor = (await getSession())?.username ?? "super_admin";
    activeUploadId = crypto.randomUUID();
    const originalFile = encryptUploadFile(Buffer.from(await workbookFile.arrayBuffer()));
    await transactStore((store) => {
      store.registrationUploads.unshift({ id: activeUploadId!, fileName: workbookFile.name, kind, uploadedBy: actor, uploadedAt: new Date().toISOString(), totalRecords: rows.length, successfulRecords: 0, failedRecords: 0, progress: 5, status: "processing", originalFile });
    });
    const imported = await transactStore(async (store) => {
      const upload = store.registrationUploads.find((item) => item.id === activeUploadId);
      const usedMobiles = new Set(store.registrations.filter((record) => record.status !== "rejected").map((record) => record.mobile));
      const usedEmails = new Set(store.registrations.filter((record) => record.status !== "rejected").map((record) => record.email?.toLowerCase()).filter(Boolean));
      const results: Array<{ rowNumber: number; id?: string; errors?: string[] }> = [];
      let processed = rows.length - ready.length;
      const checkpointEvery = Math.max(1, Math.ceil(rows.length / 10));
      if (upload) upload.failedRecords = processed;
      const checkpoint = async () => {
        processed++;
        if (upload) upload.progress = Math.min(99, Math.round((processed / rows.length) * 100));
        if (processed % checkpointEvery === 0 || processed === rows.length) await persistStore(store);
      };
      for (const row of ready) {
        const { values, rowNumber } = row;
        const mobileValue = kind === "company" ? values.adminMobile : values.mobile; const emailValue = kind === "company" ? values.adminEmail : values.email;
        if (usedMobiles.has(mobileValue) || (emailValue && usedEmails.has(emailValue.toLowerCase()))) { results.push({ rowNumber, errors: ["Duplicate mobile number or email address"] }); if (upload) upload.failedRecords++; await checkpoint(); continue; }
        const parsed = schema[kind].safeParse(row.input);
        if (!parsed.success) { results.push({ rowNumber, errors: parsed.error.issues.map((issue) => issue.message) }); if (upload) upload.failedRecords++; await checkpoint(); continue; }
        const salt = createSalt();
        const common = { kind, id: "", status: "pending_verification" as const, submittedAt: new Date().toISOString(), mobile: mobileValue, email: emailValue || "", passwordSalt: salt, passwordHash: await hashPassword(values.password, salt) };
        let record: RegistrationRecord;
        const uploadFile = async (key: string, label: string) => row.files[key] ? toUploadedFile(row.files[key]!, label) : undefined;
        if (kind === "customer") {
          const data = parsed.data as z.infer<typeof customerRegistrationFieldsSchema>;
          const counter = ++store.counters.customerReg; const id = nextId(REGISTRATION_PREFIX.customer, counter);
          record = { ...common, kind, id, customerName: data.customerName, businessName: data.businessName, customerType: data.customerType, address: [data.addressLine1,data.addressLine2,data.addressLine3,data.addressLine4,data.pinCode].filter(Boolean).join(", "), addressLine1:data.addressLine1,addressLine2:data.addressLine2 || undefined,addressLine3:data.addressLine3 || undefined,addressLine4:data.addressLine4 || undefined,pinCode:data.pinCode,dlNumber1:data.dlNumber1,dlNumber2:data.dlNumber2,dlNumber3:data.dlNumber3 || undefined,fssaiNumber:data.fssaiNumber || undefined,gstNumber:data.gstNumber,creditDays:data.creditDays,paymentMethod:data.paymentMethod,files:{dl1:(await uploadFile("dl1","DL 1"))!,dl2:(await uploadFile("dl2","DL 2"))!,dl3:await uploadFile("dl3","DL 3"),gstCertificate:(await uploadFile("gstCertificate","GST certificate"))!,shopOutside:(await uploadFile("shopOutside","Shop photo — outside"))!,shopInside:(await uploadFile("shopInside","Shop photo — inside"))!} };
        } else if (kind === "company") {
          const data = parsed.data as z.infer<typeof companyRegistrationFieldsSchema>;
          const counter = ++store.counters.companyReg; const id = nextId(REGISTRATION_PREFIX.company, counter);
          const companyLogo = row.files.companyLogo; const adminPhoto = row.files.adminPhoto;
          if (!companyLogo || !adminPhoto || [companyLogo, adminPhoto].some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > MAX_FILE_BYTES)) { results.push({ rowNumber, errors: ["Company logo and admin photo must be JPG, PNG, or WEBP images up to 5 MB."] }); if (upload) upload.failedRecords++; await checkpoint(); continue; }
          record = { ...common, kind, id, mobile: data.adminMobile, email: data.adminEmail, adminFullName: data.adminFullName, companyName: data.companyName, headquarter: data.headquarter, division: data.division, files: { companyLogo: (await uploadFile("companyLogo", "Company logo"))!, adminPhoto: (await uploadFile("adminPhoto", "Admin photo"))! } };
        } else {
          const data = parsed.data as z.infer<typeof patientRegistrationFieldsSchema>;
          const counter = ++store.counters.patientReg; const id = nextId(REGISTRATION_PREFIX.patient, counter);
          record = { ...common, kind, id, patientName: data.patientName, email: data.email || undefined, gender: data.gender || "", address: data.address, paymentMethod: data.paymentMethod, files: await uploadFile("idProof", "ID proof").then((file) => file ? { idProof: file } : undefined) };
        }
        store.registrations.unshift(record);
        store.audit.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), actor, action: "registration_imported", registrationId: record.id, detail: `${kind} imported; pending verification` });
        usedMobiles.add(mobileValue); if (emailValue) usedEmails.add(emailValue.toLowerCase());
        results.push({ rowNumber, id: record.id });
        if (upload) upload.successfulRecords++;
        await checkpoint();
      }
      if (upload) {
        const failedCount = upload.failedRecords;
        upload.progress = 100;
        upload.status = upload.successfulRecords === 0 ? "failed" : failedCount === 0 ? "completed" : "partially_completed";
        upload.rowErrors = [
          ...rows.filter((row) => row.errors.length > 0).map((row) => ({ rowNumber:row.rowNumber,errors:row.errors })),
          ...results.filter((row) => row.errors).map((row) => ({ rowNumber:row.rowNumber,errors:row.errors! })),
        ];
        if (failedCount) upload.errorSummary = `${failedCount} row(s) failed validation, were duplicates, or could not be imported.`;
      }
      return results;
    });
    const failedRows = rows.filter((row) => row.errors.length > 0);
    const failed = failedRows.map(({rowNumber,errors}) => ({ rowNumber, errors }));
    const commitErrors = imported.filter((row) => row.errors);
    const commitDuplicates = commitErrors.filter((row) => row.errors?.some((message) => message.includes("Duplicate")));
    return NextResponse.json({ imported: imported.filter((row) => row.id).length, failed: failedRows.filter((row) => !row.duplicate).length + commitErrors.length - commitDuplicates.length, duplicates: rows.filter((row) => row.duplicate).length + commitDuplicates.length, results: [...failed, ...commitErrors] });
  } catch (error) {
    if (activeUploadId) {
      try {
        await transactStore((store) => {
          const upload = store.registrationUploads.find((item) => item.id === activeUploadId);
          if (upload) { upload.status = "failed"; upload.progress = 100; upload.errorSummary = error instanceof Error ? error.message : "Import processing failed."; }
        });
      } catch { /* The upload remains visible as processing if the store itself is unavailable. */ }
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to import registration workbook." }, { status: 400 });
  }
}
