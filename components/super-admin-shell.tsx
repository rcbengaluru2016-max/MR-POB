"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useState, useSyncExternalStore, type ReactNode } from "react";
import { CompanyLogo } from "@/components/company-logo";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};

function useHydratedPathname() {
  const pathname = usePathname();
  return useSyncExternalStore(subscribe, () => pathname, () => "");
}

function initials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "SA";
}

function Navigation({ pathname, basePath, includeUsers }: { pathname: string; basePath: string; includeUsers: boolean }) {
  const links = [
    { href: `${basePath}/dashboard`, label: "Dashboard" },
    { href: `${basePath}/approvals`, label: "Registrations" },
    { href: `${basePath}/registrations/customer`, label: "Customer" },
    { href: `${basePath}/registrations/company`, label: "Company" },
    { href: `${basePath}/registrations/patient`, label: "Patient" },
    { href: `${basePath}/registration-imports`, label: "Imports" },
    { href: `${basePath}/order-status`, label: "Order Status" },
    ...(includeUsers ? [{ href: `${basePath}/users`, label: "Users & Accounts" }] : []),
  ];

  return (
    <nav aria-label="Dashboard navigation" className="mt-7 space-y-5">
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn("block rounded-lg px-3 py-2 text-sm hover:bg-brand/5", active && "bg-brand/10 font-semibold text-brand")}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

function ActiveNavigation({ basePath, includeUsers }: { basePath: string; includeUsers: boolean }) {
  const pathname = useHydratedPathname();
  return <Navigation pathname={pathname} basePath={basePath} includeUsers={includeUsers} />;
}

function DashboardShell({ children, accountName, basePath, includeUsers }: { children: ReactNode; accountName: string; basePath: string; includeUsers: boolean }) {
  const pathname = useHydratedPathname();
  const router = useRouter();
  const [error, setError] = useState("");

  async function logout() {
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed.");
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Unable to log out. Check your connection and try again.");
    }
  }

  return (
    <div className="min-h-svh bg-background lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="flex min-h-svh flex-col bg-panel p-4 text-foreground sm:p-5 lg:sticky lg:top-0 lg:h-svh">
        <CompanyLogo className="w-full max-w-52" />
        <Suspense fallback={<Navigation pathname="" basePath={basePath} includeUsers={includeUsers} />}>
          <ActiveNavigation basePath={basePath} includeUsers={includeUsers} />
        </Suspense>
        {error ? <p className="mt-4 text-sm text-danger" role="alert">{error}</p> : null}
        <div className="mt-auto grid justify-items-start gap-3 pt-7">
          <Link
            href={`${basePath}/account`}
            aria-label="Account Information"
            aria-current={pathname === `${basePath}/account` ? "page" : undefined}
            title="Account Information"
            className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-white text-sm font-bold tracking-wide text-brand transition hover:bg-brand/5", pathname === `${basePath}/account` && "ring-2 ring-brand/40")}
          >
            {initials(accountName)}
          </Link>
          <button type="button" onClick={logout} className="w-full rounded-lg border border-line px-3 py-2 text-left text-sm hover:bg-white">
            Logout
          </button>
        </div>
      </aside>
      <main className="min-w-0 p-4 sm:p-8">{children}</main>
    </div>
  );
}

export function SuperAdminShell({ children, accountName }: { children: ReactNode; accountName: string }) {
  return <DashboardShell basePath="/super-admin" includeUsers accountName={accountName}>{children}</DashboardShell>;
}

export function AdminShell({ children, accountName }: { children: ReactNode; accountName: string }) {
  return <DashboardShell basePath="/admin" includeUsers={false} accountName={accountName}>{children}</DashboardShell>;
}
