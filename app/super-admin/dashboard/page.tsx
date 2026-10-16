import { redirect } from "next/navigation";
import { SuperAdminDashboard } from "@/components/super-admin/dashboard";
import { isSuperAdminReady } from "@/lib/server/super-admin";

export const metadata = { title: "Super Admin Dashboard" };
export const instant = false;

export default async function SuperAdminDashboardPage() {
  if (!(await isSuperAdminReady())) redirect("/super-admin/security-setup");
  return <SuperAdminDashboard />;
}
