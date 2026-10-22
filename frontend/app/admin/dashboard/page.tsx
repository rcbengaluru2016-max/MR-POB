import { SuperAdminDashboard } from "@/components/super-admin/dashboard";

export const metadata = { title: "Admin Dashboard" };
export const instant = false;

export default function AdminDashboardPage() {
  return <SuperAdminDashboard basePath="/admin" />;
}
