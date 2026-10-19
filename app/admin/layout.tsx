import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/super-admin-shell";
import { getSession } from "@/lib/server/session";
import { getZenexAdminAccount } from "@/lib/server/super-admin";

export const instant = false;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login?next=%2Fadmin");
  const context = await getZenexAdminAccount(session);
  if (!context) redirect("/access-denied");
  return <AdminShell accountName={context.account.displayName || session.displayName}>{children}</AdminShell>;
}
