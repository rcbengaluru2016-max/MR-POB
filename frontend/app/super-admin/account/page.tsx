import { redirect } from "next/navigation";
import { AtSign, CalendarDays, Clock3, KeyRound, Mail, ShieldCheck, UserRound } from "lucide-react";
import { getSuperAdminAccount } from "@/lib/server/super-admin";
import { backendEnabled } from "@/lib/server/backend-client";
import { formatDateTime } from "@/lib/utils";
import { ChangeSuperAdminPassword } from "@/components/super-admin/change-password";

export const metadata = { title: "Super Admin Account Information" };
export const instant = false;

function getInitials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "SA";
}

function Detail({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-xl border border-line bg-white p-4">
      <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-panel text-brand">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
        <dd className="mt-1 break-words text-sm font-semibold text-foreground">{value}</dd>
      </div>
    </div>
  );
}

export default async function SuperAdminAccountPage() {
  const context = await getSuperAdminAccount();
  if (!context) redirect("/access-denied");
  const { account, store } = context;
  if (!account.mfaEnabled || account.passwordChangeRequired) redirect("/super-admin/security-setup");

  const name = account.displayName || "Super Admin";
  const email = account.email ?? "Not available";
  const lastLogin = account.lastLoginAt ?? store.audit.find(
    (event) => event.actor.toLowerCase() === account.username.toLowerCase() && event.action === "super_admin_mfa_login_succeeded",
  )?.at;
  const status = account.status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

  return (
    <section className="mx-auto max-w-5xl space-y-6 sm:space-y-8">
      <header>
        <p className="text-sm font-semibold text-brand">Super Admin</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Account Information</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Review your profile, account details, and security verification status.</p>
      </header>

      <article className="relative overflow-hidden rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-7">
        <div aria-hidden="true" className="absolute inset-y-0 right-0 hidden w-1/3 bg-gradient-to-l from-panel to-transparent sm:block" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex size-20 shrink-0 items-center justify-center rounded-full bg-brand text-2xl font-bold tracking-wide text-white ring-4 ring-pale-blue">
            {getInitials(name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-foreground sm:text-2xl">{name}</h2>
              <span className="rounded-full bg-panel px-3 py-1 text-xs font-semibold text-brand">Super Admin</span>
            </div>
            <p className="mt-2 flex min-w-0 items-center gap-2 break-all text-sm text-muted"><Mail aria-hidden="true" className="size-4 shrink-0" />{email}</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            <span className="size-2 rounded-full bg-emerald-500" />{status}
          </span>
        </div>
      </article>

      <div className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-panel text-brand"><UserRound aria-hidden="true" className="size-5" /></span>
            <div><h2 className="font-semibold text-foreground">Profile Information</h2><p className="mt-0.5 text-xs text-muted">Identity associated with this account</p></div>
          </div>
          <dl className="grid gap-3">
            <Detail icon={UserRound} label="Account holder" value={name} />
            <Detail icon={AtSign} label="Username" value={account.username} />
            <Detail icon={Mail} label="Registered email" value={email} />
          </dl>
        </article>

        <article className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-panel text-brand"><CalendarDays aria-hidden="true" className="size-5" /></span>
            <div><h2 className="font-semibold text-foreground">Account Details</h2><p className="mt-0.5 text-xs text-muted">Status and recent account activity</p></div>
          </div>
          <dl className="grid gap-3">
            <Detail icon={CalendarDays} label="Account created" value={account.createdAt ? formatDateTime(account.createdAt) : "Not available"} />
            <Detail icon={Clock3} label="Last successful login" value={lastLogin ? formatDateTime(lastLogin) : "Not recorded yet"} />
          </dl>
        </article>
      </div>

      <article className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><ShieldCheck aria-hidden="true" className="size-5" /></span>
            <div><h2 className="font-semibold text-foreground">Security Settings</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-muted">Authenticator verification is enabled for Super Admin sign-in. Your security credentials are never displayed here.</p></div>
          </div>
          <span className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            <KeyRound aria-hidden="true" className="size-4" /> MFA verified
          </span>
        </div>
        {backendEnabled() ? <p className="text-sm text-muted">Manage your password through Amazon Cognito.</p> : <ChangeSuperAdminPassword />}
      </article>
    </section>
  );
}

