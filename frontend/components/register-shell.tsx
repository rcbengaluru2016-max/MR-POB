import Link from "next/link";
import type { ReactNode } from "react";
import { CompanyLogo } from "@/components/company-logo";

export function RegisterShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-svh bg-background px-4 py-4 sm:px-6 sm:py-6">
      <header className="mx-auto w-full max-w-5xl rounded-2xl border border-line bg-white px-4 py-3 shadow-sm sm:px-6 sm:py-4">
        <div className="flex items-center justify-between gap-4">
          <CompanyLogo />
          <Link href="/login" className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-brand transition-colors hover:bg-brand/5 hover:underline focus-visible:outline-2 focus-visible:outline-brand sm:px-4">
            Back to Login
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-0 py-8 sm:py-10">
        <h1 className="text-3xl font-semibold text-foreground">{title}</h1>
        {subtitle ? <p className="mt-2 text-muted">{subtitle}</p> : null}
        <div className="mt-6 rounded-2xl border border-line bg-white p-6 shadow-sm">
          {children}
        </div>
      </main>
    </div>
  );
}
