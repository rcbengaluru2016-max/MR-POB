import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SuperAdminShell } from "@/components/super-admin-shell";
import { getSession } from "@/lib/server/session";
import { getSuperAdminAccount } from "@/lib/server/super-admin";

export const instant = false;

export default async function SuperAdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login?next=%2Fsuper-admin%2Fdashboard");
  const context = await getSuperAdminAccount();
  if (!context) redirect("/access-denied");
  return <SuperAdminShell accountName={context.account.displayName || session.displayName}>{children}</SuperAdminShell>;
}
