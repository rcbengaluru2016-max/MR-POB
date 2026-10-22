import { redirect } from "next/navigation";
import { RegistrationApprovals } from "@/components/super-admin/registration-approvals";
import { isSuperAdminReady } from "@/lib/server/super-admin";

export const metadata = { title: "Registration Approvals" };
export const instant = false;

export default async function SuperAdminApprovalsPage() {
  if (!(await isSuperAdminReady())) redirect("/super-admin/security-setup");
  return <RegistrationApprovals />;
}
