import { redirect } from "next/navigation";
import { AboutCompany } from "@/components/about-company";
import { CompanyWorkspace } from "@/components/company-workspace";
import { isSuperAdminReady } from "@/lib/server/super-admin";

export const metadata = { title: "Company Organisational Flow" };
export const instant = false;

export default async function SuperAdminCompanyOrganisationalFlowPage() {
  if (!(await isSuperAdminReady())) redirect("/super-admin/security-setup");
  return <CompanyWorkspace basePath="/super-admin" current="organisational-flow"><AboutCompany /></CompanyWorkspace>;
}
