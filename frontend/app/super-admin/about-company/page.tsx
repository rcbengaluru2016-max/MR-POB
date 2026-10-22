import { redirect } from "next/navigation";

export const instant = false;

export default function SuperAdminAboutCompanyPage() {
  redirect("/super-admin/company/organisational-flow");
}
