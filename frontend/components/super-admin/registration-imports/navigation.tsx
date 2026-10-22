import Link from "next/link";
import { cn } from "@/lib/utils";

const sections = [
  { path: "", label: "Bulk Upload" },
  { path: "/single", label: "Single Upload" },
  { path: "/uploads", label: "Uploads" },
];

export function RegistrationImportNavigation({ current, basePath = "/super-admin" }: { current: string; basePath?: string }) {
  const root = `${basePath}/registration-imports`;
  return <nav aria-label="Registration import sections" className="mt-5 flex flex-wrap gap-2 border-b border-line pb-3">{sections.map((section) => { const href = `${root}${section.path}`; return <Link key={href} aria-current={current === href ? "page" : undefined} href={href} className={cn("rounded-lg px-4 py-2 text-sm font-medium text-muted hover:bg-white", current === href && "bg-white text-brand shadow-sm")}>{section.label}</Link>; })}</nav>;
}
