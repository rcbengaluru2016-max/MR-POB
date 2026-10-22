import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { resolveCompanyAdminContext } from "@/lib/server/company-admin";
import { transactStore } from "@/lib/server/store";
import type { CompanyEmployee, UploadedFile } from "@/lib/types";

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function getCompany() {
  const session = await getSession();
  if (!session || session.userType !== "company") return null;
  return resolveCompanyAdminContext(session.username);
}

function parsePhoto(value: unknown): { photo?: UploadedFile; error?: string } {
  if (value === undefined || value === null) return {};
  const input = value as Partial<UploadedFile>;
  if (typeof input !== "object" || typeof input.dataUrl !== "string" || typeof input.name !== "string") return { error: "Choose a valid employee photo." };
  const match = input.dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/);
  if (!match || !ALLOWED_PHOTO_TYPES.has(match[1])) return { error: "Upload a JPEG, PNG, or WebP photo." };
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) return { error: "Employee photos must be 2 MB or smaller." };
  return { photo: { name: input.name.slice(0, 120), type: match[1], size: bytes.length, dataUrl: input.dataUrl } };
}

function fields(body: Record<string, unknown>) {
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const designation = typeof body.designation === "string" ? body.designation.trim() : "";
  const contactNumber = typeof body.contactNumber === "string" ? body.contactNumber.replace(/\s+/g, "") : "";
  const reportingManagerId = typeof body.reportingManagerId === "string" ? body.reportingManagerId.trim() : "";
  if (fullName.length < 2 || fullName.length > 100 || designation.length < 2 || designation.length > 80) return { error: "Enter an employee name and designation." };
  if (!/^\+?[0-9]{10,15}$/.test(contactNumber)) return { error: "Enter a valid contact number." };
  return { fullName, designation, contactNumber, reportingManagerId };
}

function isEligibleReportingManager(designation: string) {
  return /regional manager|sales manager|medical representative|\bmr\b/i.test(designation);
}

export async function GET() {
  const context = await getCompany();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const employees = context.store.companyEmployees
    .filter((employee) => employee.companyCode === context.master.code)
    .map((employee) => ({ ...employee, status: employee.status ?? "active" as const }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return NextResponse.json({ employees });
}

export async function POST(request: Request) {
  const context = await getCompany();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Enter valid employee details." }, { status: 400 });
  const parsed = fields(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const parsedPhoto = parsePhoto(body.photo);
  if (parsedPhoto.error) return NextResponse.json({ error: parsedPhoto.error }, { status: 400 });

  const result = await transactStore((store) => {
    const employees = store.companyEmployees.filter((item) => item.companyCode === context.master.code);
    const activeEmployees = employees.filter((item) => (item.status ?? "active") === "active");
    const manager = parsed.reportingManagerId ? employees.find((item) => item.id === parsed.reportingManagerId) : undefined;
    if (!parsed.reportingManagerId && activeEmployees.length > 0) return { error: "Select a reporting manager for this employee." } as const;
    if (parsed.reportingManagerId && (!manager || manager.status === "inactive" || !isEligibleReportingManager(manager.designation))) return { error: "Select an active Regional Manager, Sales Manager, or Medical Representative from this company." } as const;
    const employee: CompanyEmployee = {
      id: crypto.randomUUID(), companyCode: context.master.code, fullName: parsed.fullName,
      designation: parsed.designation, reportingManagerId: parsed.reportingManagerId || undefined,
      contactNumber: parsed.contactNumber, photo: parsedPhoto.photo, status: "active", createdAt: new Date().toISOString(),
    };
    store.companyEmployees.push(employee);
    store.audit.unshift({ id: crypto.randomUUID(), at: employee.createdAt, actor: context.account.username, action: "company_employee_created", masterCode: context.master.code, detail: `Employee ${employee.fullName} added to company organisation` });
    return { employee } as const;
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ employee: result.employee }, { status: 201 });
}

export async function PATCH(request: Request) {
  const context = await getCompany();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string") return NextResponse.json({ error: "Select a valid employee." }, { status: 400 });

  const action = body.action === "deactivate" ? "deactivate" : "edit";
  let parsed: ReturnType<typeof fields> | undefined;
  let parsedPhoto: ReturnType<typeof parsePhoto> | undefined;
  if (action === "edit") {
    parsed = fields(body);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    parsedPhoto = parsePhoto(body.photo);
    if (parsedPhoto.error) return NextResponse.json({ error: parsedPhoto.error }, { status: 400 });
  }
  const values = parsed as { fullName: string; designation: string; contactNumber: string; reportingManagerId: string } | undefined;

  const result = await transactStore((store) => {
    const employees = store.companyEmployees.filter((item) => item.companyCode === context.master.code);
    const employee = employees.find((item) => item.id === body.id);
    if (!employee) return { error: "Employee not found." } as const;
    if (action === "deactivate") {
      if (employee.status === "inactive") return { error: "This employee is already inactive." } as const;
      if (employees.some((item) => item.status !== "inactive" && item.reportingManagerId === employee.id)) return { error: "Reassign this employee’s direct reports before deactivating them." } as const;
      employee.status = "inactive";
      const at = new Date().toISOString();
      store.audit.unshift({ id: crypto.randomUUID(), at, actor: context.account.username, action: "company_employee_deactivated", masterCode: context.master.code, detail: `Employee ${employee.fullName} deactivated` });
      return { employee } as const;
    }

    if (employee.status === "inactive") return { error: "Inactive employees cannot be edited." } as const;
    const managerId = values!.reportingManagerId;
    if (managerId === employee.id) return { error: "An employee cannot report to themselves." } as const;
    if (!managerId && employee.reportingManagerId) return { error: "Select a reporting manager for this employee." } as const;
    const manager = managerId ? employees.find((item) => item.id === managerId && item.status !== "inactive") : undefined;
    if (managerId && (!manager || !isEligibleReportingManager(manager.designation))) return { error: "Select an active Regional Manager, Sales Manager, or Medical Representative from this company." } as const;
    let ancestor = manager;
    const visited = new Set<string>();
    while (ancestor) {
      if (ancestor.id === employee.id || visited.has(ancestor.id)) return { error: "That reporting manager would create a circular reporting relationship." } as const;
      visited.add(ancestor.id);
      ancestor = ancestor.reportingManagerId ? employees.find((item) => item.id === ancestor!.reportingManagerId) : undefined;
    }
    employee.fullName = values!.fullName;
    employee.designation = values!.designation;
    employee.contactNumber = values!.contactNumber;
    employee.reportingManagerId = managerId || undefined;
    if (parsedPhoto!.photo) employee.photo = parsedPhoto!.photo;
    const at = new Date().toISOString();
    store.audit.unshift({ id: crypto.randomUUID(), at, actor: context.account.username, action: "company_employee_updated", masterCode: context.master.code, detail: `Employee ${employee.fullName} details updated` });
    return { employee } as const;
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ employee: result.employee });
}
