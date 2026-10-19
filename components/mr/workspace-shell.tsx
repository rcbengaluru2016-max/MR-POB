"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FlaskConical, LogOut } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { CompanyLogo } from "@/components/company-logo";
import { mrInitials } from "@/lib/mr/profile";
import { cn } from "@/lib/utils";
import { useMrWorkspace } from "./workspace-provider";

const links = [
  { href: "/mr/dashboard", label: "Dashboard" },
  { href: "/mr/create-order", label: "Create Order" },
  { href: "/mr/my-orders", label: "My Orders" },
];

export function MrWorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile } = useMrWorkspace();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const logoutInFlight = useRef(false);

  async function logout() {
    if (logoutInFlight.current) return;
    logoutInFlight.current = true;
    setLoggingOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed");
      router.replace("/login");
      router.refresh();
    } catch {
      logoutInFlight.current = false;
      setLoggingOut(false);
      setLogoutError("Unable to log out. Please try again.");
    }
  }

  return <div className={cn("company-app", "mr-workspace")}>
    <a href="#mr-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3">Skip to content</a>
    <aside className={cn("company-sidebar", "mr-sidebar")}>
      <Link href="/mr/dashboard" className={cn("company-brand", "mr-brand")} aria-label="MR dashboard"><CompanyLogo className="w-full max-w-52" /></Link>
      <nav aria-label="MR workspace navigation" className="company-nav">
        {links.map((link) => <Link key={link.href} href={link.href} aria-current={pathname === link.href || pathname.startsWith(`${link.href}/`) ? "page" : undefined} className={cn("company-nav-link", (pathname === link.href || pathname.startsWith(`${link.href}/`)) && "is-active")}>{link.label}</Link>)}
      </nav>
      <div className={cn("company-sidebar-account", "mr-account")}>
        <Link href="/mr/account" className="company-avatar" aria-label="MR Account Details" title="Account Details" aria-current={pathname === "/mr/account" ? "page" : undefined}>{mrInitials(profile.name)}</Link>
        <button type="button" onClick={() => void logout()} disabled={loggingOut} aria-busy={loggingOut} className="company-logout flex items-center gap-2"><LogOut size={15} aria-hidden="true" />{loggingOut ? "Logging out…" : "Logout"}</button>
      </div>
    </aside>
    <main id="mr-content" className="company-main" tabIndex={-1}>
      <div className="company-content">
        {logoutError && <p className="company-error-banner" role="alert">{logoutError}</p>}
        {pathname !== "/mr/account" && <header className="mr-topbar"><div><p className="company-eyebrow">MR workspace</p><p className="mt-1 text-sm font-semibold">{profile.name}<span className="ml-2 text-xs font-normal text-muted">{profile.territory}</span></p></div><span className="mr-demo"><FlaskConical size={13} aria-hidden="true" />Demo preview</span></header>}
        {children}
        <footer className="mr-footer">Demo data only. Orders and drafts stay in this preview and reset when you refresh. <button type="button" onClick={() => void logout()} disabled={loggingOut} aria-busy={loggingOut} className="font-semibold text-brand hover:underline">{loggingOut ? "Logging out…" : "Logout"}</button></footer>
      </div>
    </main>
  </div>;
}
