"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useState, useSyncExternalStore, type ReactNode } from "react";
import { CompanyLogo } from "@/components/company-logo";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};

const links = [
  { href: "/super-admin/dashboard", label: "Dashboard" },
  { href: "/super-admin/approvals", label: "Registrations" },
  { href: "/super-admin/registrations/customer", label: "Customer" },
  { href: "/super-admin/registrations/mr", label: "Medical Representative" },
  { href: "/super-admin/registrations/patient", label: "Patient" },
  { href: "/super-admin/registration-imports", label: "Imports" },
  { href: "/super-admin/users", label: "Users & Accounts" },
];

function useHydratedPathname() {
  const pathname = usePathname();
  return useSyncExternalStore(subscribe, () => pathname, () => "");
}

function Navigation({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Super Admin navigation" className="mt-7 space-y-5">
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

function CurrentNavigation() {
  const pathname = useHydratedPathname();
  return <Navigation pathname={pathname} />;
}

function initials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "SA";
}

export function SuperAdminShell({ children, accountName }: { children: ReactNode; accountName: string }) {
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
        <Suspense fallback={<Navigation pathname="" />}>
          <CurrentNavigation />
        </Suspense>
        {error ? <p className="mt-4 text-sm text-danger" role="alert">{error}</p> : null}
        <div className="mt-auto grid justify-items-start gap-3 pt-7">
          <Link
            href="/super-admin/account"
            aria-label="Account Information"
            aria-current={pathname === "/super-admin/account" ? "page" : undefined}
            title="Account Information"
            className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-white text-sm font-bold tracking-wide text-brand transition hover:bg-brand/5", pathname === "/super-admin/account" && "ring-2 ring-brand/40")}
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
