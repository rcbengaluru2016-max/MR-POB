import { AboutCompany } from "@/components/about-company";
import { CompanyWorkspace } from "@/components/company-workspace";

export const metadata = { title: "Company Organisational Flow" };
export const instant = false;

export default function AdminCompanyOrganisationalFlowPage() {
  return <CompanyWorkspace basePath="/admin" current="organisational-flow"><AboutCompany /></CompanyWorkspace>;
}
