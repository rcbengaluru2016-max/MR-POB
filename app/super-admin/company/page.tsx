import { redirect } from "next/navigation";
import { CompanyWorkspace } from "@/components/company-workspace";
import { SuperAdminRegistrationTable } from "@/components/super-admin/registration-table";
import { isSuperAdminReady } from "@/lib/server/super-admin";

export const metadata = { title: "Company" };
export const instant = false;

export default async function SuperAdminCompanyPage() {
  if (!(await isSuperAdminReady())) redirect("/super-admin/security-setup");
  return <CompanyWorkspace basePath="/super-admin" current="registrations"><SuperAdminRegistrationTable kind="company" /></CompanyWorkspace>;
}
