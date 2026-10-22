import { redirect } from "next/navigation";

export const metadata = { title: "Company Registrations" };
export const instant = false;

export default async function SuperAdminCompanyRegistrationsPage() {
  redirect("/super-admin/company");
}
