"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { CompanyLogo } from "@/components/company-logo";
import { cn } from "@/lib/utils";
import { useMrWorkspace } from "./workspace-provider";

const links = [
  { href: "/mr/dashboard", label: "Dashboard" },
  { href: "/mr/create-order", label: "Create Order" },
  { href: "/mr/my-orders", label: "My Orders" },
];

export function MrWorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { profile } = useMrWorkspace();
  return <div className={cn("company-app", "mr-workspace")}>
    <a href="#mr-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3">Skip to content</a>
    <aside className={cn("company-sidebar", "mr-sidebar")}>
      <Link href="/mr/dashboard" className={cn("company-brand", "mr-brand")} aria-label="MR dashboard"><CompanyLogo className="w-full max-w-52" /></Link>
      <nav aria-label="MR workspace navigation" className="company-nav">
        {links.map((link) => <Link key={link.href} href={link.href} aria-current={pathname === link.href || pathname.startsWith(`${link.href}/`) ? "page" : undefined} className={cn("company-nav-link", (pathname === link.href || pathname.startsWith(`${link.href}/`)) && "is-active")}>{link.label}</Link>)}
      </nav>
      <div className={cn("company-sidebar-account", "mr-account")}>
        <div className="mr-profile"><span className="company-avatar" aria-hidden="true">MK</span><div><strong>{profile.name}</strong><small>Medical Representative</small><small>{profile.employeeCode}</small></div></div>
        <Link href="/login" className="company-logout flex items-center gap-2"><LogOut size={15} aria-hidden="true" />Back to login</Link>
      </div>
    </aside>
    <main id="mr-content" className="company-main" tabIndex={-1}>
      <div className="company-content">
        <header className="mr-topbar"><div><p className="company-eyebrow">MR workspace</p><p className="mt-1 text-sm font-semibold">{profile.name}<span className="ml-2 text-xs font-normal text-muted">{profile.territory}</span></p></div><span className="mr-demo"><FlaskConical size={13} aria-hidden="true" />Demo preview</span></header>
        {children}
        <footer className="mr-footer">Demo data only. Orders and drafts stay in this preview and reset when you refresh. <Link className="font-semibold text-brand hover:underline" href="/login">Back to login</Link></footer>
      </div>
    </main>
  </div>;
}
