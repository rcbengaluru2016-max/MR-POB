"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import type { ReactNode } from "react";
import { CompanyLogo } from "@/components/company-logo";
import { cn } from "@/lib/utils";

const links = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/approvals/customer", label: "Customer approvals" },
  { href: "/admin/approvals/company", label: "Company registrations" },
  { href: "/admin/approvals/patient", label: "Patient approvals" },
  { href: "/admin/masters/customer", label: "Customer Master" },
  { href: "/admin/masters/company", label: "Company" },
  { href: "/admin/masters/patient", label: "Patient Master" },
  { href: "/admin/accounts", label: "Users & Accounts" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/settings", label: "Settings" },
];

function AdminNavigation({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Admin navigation" className="mt-6 grid gap-1">
      {links.map((link) => {
        const active =
          pathname === link.href ||
          (link.href !== "/admin" && pathname.startsWith(`${link.href}/`));
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-2 text-sm hover:bg-white/10",
              active && "bg-white/15 font-semibold",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

function ActiveAdminNavigation() {
  const pathname = usePathname();
  return <AdminNavigation pathname={pathname} />;
}

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [logoutError, setLogoutError] = useState("");

  async function logout() {
    setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed.");
      router.push("/login");
      router.refresh();
    } catch {
      setLogoutError("Unable to log out. Check your connection and try again.");
    }
  }

  return (
    <div className="min-h-full lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="bg-foreground p-4 text-white">
        <CompanyLogo className="w-full max-w-52" />
        <p className="mt-3 text-sm text-white/70">Registration & Master ERP</p>
        <Suspense fallback={<AdminNavigation pathname="" />}>
          <ActiveAdminNavigation />
        </Suspense>
        {logoutError ? <p className="mt-4 text-sm text-white" role="alert">{logoutError}</p> : null}
        <button
          type="button"
          onClick={logout}
          className="mt-8 w-full rounded-lg border border-white/20 px-3 py-2 text-left text-sm hover:bg-white/10"
        >
          Logout
        </button>
      </aside>
      <div className="p-4 sm:p-8">{children}</div>
    </div>
  );
}
