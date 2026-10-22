import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const sections = [
  { key: "registrations", path: "", label: "Registrations" },
  { key: "organisational-flow", path: "/organisational-flow", label: "Organisational Flow" },
] as const;

export function CompanyWorkspace({ basePath, current, children }: {
  basePath: "/admin" | "/super-admin";
  current: "registrations" | "organisational-flow";
  children: ReactNode;
}) {
  const root = `${basePath}/company`;
  return <div className="mx-auto max-w-7xl">
    <nav aria-label="Company sections" className="mb-6 flex flex-wrap gap-2 border-b border-line pb-3">
      {sections.map((section) => {
        const href = `${root}${section.path}`;
        const active = current === section.key;
        return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("rounded-lg px-4 py-2 text-sm font-medium text-muted hover:bg-white", active && "bg-white text-brand shadow-sm")}>
          {section.label}
        </Link>;
      })}
    </nav>
    {children}
  </div>;
}
