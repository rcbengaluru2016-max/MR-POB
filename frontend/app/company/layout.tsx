import { Suspense } from "react";
import type { ReactNode } from "react";
import { CompanyAdminShell } from "@/components/company-admin-shell";
import { getCompanyAdminContext } from "@/lib/server/company-admin";

export const instant = false;

export default function CompanyLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<CompanyWorkspaceLoading />}><AuthenticatedCompanyShell>{children}</AuthenticatedCompanyShell></Suspense>;
}

async function AuthenticatedCompanyShell({ children }: { children: ReactNode }) {
  const { account, master } = await getCompanyAdminContext();
  return <CompanyAdminShell accountName={account.displayName} masterCode={master.code}>{children}</CompanyAdminShell>;
}

function CompanyWorkspaceLoading() {
  return <div className="company-workspace-loading" role="status" aria-live="polite">Loading your company workspace…</div>;
}
