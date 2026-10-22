import { redirect } from "next/navigation";

export const instant = false;

export default function AdminAboutCompanyPage() {
  redirect("/admin/company/organisational-flow");
}
