import type { ReactNode } from "react";
import { CompanyLogo } from "@/components/company-logo";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-svh bg-[linear-gradient(160deg,#eef4ff_0%,#f4f7fb_100%)] px-4 py-8 sm:py-10">
      <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="text-foreground">
          <CompanyLogo className="w-44 sm:w-52" />
          <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-tight">
            Registration, approval, master, and account creation
          </h1>
          <p className="mt-4 max-w-lg text-muted">
            Enter registration data once. After approval, the same information
            becomes the master record, generates a Master Code username, and
            activates the account.
          </p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-xl shadow-black/20 sm:p-8">
          <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
