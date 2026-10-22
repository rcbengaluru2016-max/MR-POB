import { redirect } from "next/navigation";
import { SuperAdminSecuritySetupForm } from "@/components/super-admin/security-setup-form";
import { getSuperAdminAccount } from "@/lib/server/super-admin";

export const metadata = { title: "Secure Super Admin Account" };
export const instant = false;

export default async function SuperAdminSecuritySetupPage() {
  const context = await getSuperAdminAccount();
  if (!context) redirect("/access-denied");
  const { account } = context;
  if (account.mfaEnabled && !account.passwordChangeRequired) redirect("/super-admin/dashboard");

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-brand">First sign-in setup</p><h1 className="mt-2 text-2xl font-semibold text-foreground">Secure your Super Admin account</h1><p className="mt-2 text-sm leading-6 text-muted">Change the initial password and verify an authenticator before dashboard access is enabled.</p></div>
      <div className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-7">
        <SuperAdminSecuritySetupForm changePasswordRequired={Boolean(account.passwordChangeRequired)} />
      </div>
    </div>
  );
}
