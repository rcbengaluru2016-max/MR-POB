import { redirect } from "next/navigation";
import { UserManagement } from "@/components/super-admin/user-management";
import { isSuperAdminReady } from "@/lib/server/super-admin";
import { backendEnabled } from "@/lib/server/backend-client";

export const metadata = { title: "User Management" };
export const instant = false;

export default async function UserManagementPage() {
  if (!(await isSuperAdminReady())) redirect("/super-admin/security-setup");
  return <UserManagement backendMode={backendEnabled()} />;
}
