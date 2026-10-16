import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { getSession } from "@/lib/server/session";
import { isAdminSession, isSuperAdminReady } from "@/lib/server/super-admin";

export const instant = false;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login?next=%2Fadmin");
  if (session.userType === "super_admin" && !(await isSuperAdminReady())) redirect("/super-admin/security-setup");
  if (!(await isAdminSession(session))) redirect("/access-denied");
  return <AdminShell>{children}</AdminShell>;
}
