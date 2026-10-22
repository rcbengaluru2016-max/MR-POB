import { CompanyWorkspace } from "@/components/company-workspace";
import { SuperAdminRegistrationTable } from "@/components/super-admin/registration-table";

export const metadata = { title: "Company" };
export const instant = false;

export default function AdminCompanyPage() {
  return <CompanyWorkspace basePath="/admin" current="registrations"><SuperAdminRegistrationTable kind="company" basePath="/admin" /></CompanyWorkspace>;
}
