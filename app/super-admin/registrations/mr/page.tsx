import { SuperAdminRegistrationTable } from "@/components/super-admin/registration-table";
import { redirect } from "next/navigation";
import { isSuperAdminReady } from "@/lib/server/super-admin";

export const metadata = { title: "MR Registrations" };
export const instant = false;

export default async function SuperAdminMrRegistrationsPage() {
  if (!(await isSuperAdminReady())) redirect("/super-admin/security-setup");
  return <SuperAdminRegistrationTable kind="mr" />;
}
