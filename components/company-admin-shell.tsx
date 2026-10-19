"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { CompanyLogo } from "@/components/company-logo";
import { cn } from "@/lib/utils";

const links = [
  { href: "/company/dashboard", label: "Dashboard" },
  { href: "/company/organisational-flow", label: "Organisational Flow" },
  { href: "/company/product-uploading", label: "Product Uploading" },
  { href: "/company/special-rates", label: "Special Rates" },
  { href: "/company/order-status", label: "Order Status" },
  { href: "/company/reports", label: "Reports" },
];

export function CompanyAdminShell({ children, accountName }: {
  children: ReactNode; accountName: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [logoutError, setLogoutError] = useState("");

  async function logout() {
    setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed");
      router.replace("/login");
      router.refresh();
    } catch {
      setLogoutError("Unable to log out. Please try again.");
    }
  }

  const initials = accountName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "CA";
  return <div className="company-app">
    <aside className="company-sidebar">
      <Link href="/company/dashboard" className="company-brand" aria-label="Company dashboard"><CompanyLogo className="w-full max-w-52" /></Link>
      <nav aria-label="Company workspace navigation" className="company-nav">
        {links.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("company-nav-link", active && "is-active")}>{item.label}</Link>;
        })}
      </nav>
      <div className="company-sidebar-account">
        {logoutError && <p className="company-error" role="alert">{logoutError}</p>}
        <Link href="/company/account-information" className={cn("company-account-link", pathname === "/company/account-information" && "is-active")} aria-current={pathname === "/company/account-information" ? "page" : undefined} aria-label="Account Information" title="Account Information">
          {initials}
        </Link>
        <button type="button" onClick={logout} className="company-logout">Logout</button>
      </div>
    </aside>
    <main className="company-main">
      {children}
    </main>
  </div>;
}
