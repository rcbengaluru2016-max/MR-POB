import Link from "next/link";
import { cn } from "@/lib/utils";

const sections = [
  { href: "/super-admin/registration-imports", label: "Bulk Upload" },
  { href: "/super-admin/registration-imports/single", label: "Single Upload" },
  { href: "/super-admin/registration-imports/uploads", label: "Uploads" },
];

export function RegistrationImportNavigation({ current }: { current: string }) {
  return <nav aria-label="Registration import sections" className="mt-5 flex flex-wrap gap-2 border-b border-line pb-3">{sections.map((section) => <Link key={section.href} aria-current={current === section.href ? "page" : undefined} href={section.href} className={cn("rounded-lg px-4 py-2 text-sm font-medium text-muted hover:bg-white", current === section.href && "bg-white text-brand shadow-sm")}>{section.label}</Link>)}</nav>;
}
