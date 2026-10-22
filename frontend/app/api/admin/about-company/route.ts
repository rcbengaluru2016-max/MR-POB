import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/server/super-admin";
import { refreshStore } from "@/lib/server/store";
import type { CompanyMaster } from "@/lib/types";

export async function GET(request: Request) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const store = await refreshStore();
  const approvedRegistrationIds = new Set(
    store.registrations
      .filter((registration) => registration.kind === "company" && registration.status === "approved")
      .map((registration) => registration.id),
  );
  const companies = store.masters.filter(
    (master): master is CompanyMaster => master.kind === "company" && approvedRegistrationIds.has(master.registrationId),
  );
  const code = new URL(request.url).searchParams.get("code");

  if (!code) {
    return NextResponse.json({
      companies: companies
        .map((company) => ({
          code: company.code,
          companyName: company.companyName,
          division: company.division,
          headquarter: company.headquarter,
          adminFullName: company.adminFullName,
          status: company.status,
        }))
        .sort((a, b) => a.companyName.localeCompare(b.companyName)),
    });
  }

  const company = companies.find((item) => item.code === code);
  if (!company) return NextResponse.json({ error: "Approved company not found." }, { status: 404 });

  const employees = store.companyEmployees
    .filter((employee) => employee.companyCode === company.code && (employee.status ?? "active") === "active")
    .map((employee) => ({
      id: employee.id,
      fullName: employee.fullName,
      designation: employee.designation,
      division: employee.division,
      reportingManagerId: employee.reportingManagerId,
      contactNumber: employee.contactNumber,
      photo: employee.photo,
      status: employee.status ?? "active",
    }));

  return NextResponse.json({
    company: {
      code: company.code,
      companyName: company.companyName,
      division: company.division,
      headquarter: company.headquarter,
      adminFullName: company.adminFullName,
      mobile: company.mobile,
      photo: company.files?.adminPhoto,
      status: company.status,
    },
    employees,
  });
}
