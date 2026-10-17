import Link from "next/link";
import { Building2, Building, UserRound } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";

export const metadata = { title: "Choose registration type" };

const options = [
  { href: "/register/customer", title: "Customer", icon: Building2 },
  { href: "/register/company", title: "Company", icon: Building },
  { href: "/register/patient", title: "Patient", icon: UserRound },
];

export default function RegisterTypePage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-[linear-gradient(160deg,#eef4ff_0%,#f4f7fb_100%)] px-4 py-10">
      <CompanyLogo className="w-60 sm:w-72" />
      <nav aria-label="Choose registration type" className="mt-6 grid w-full max-w-xl gap-3">
        {options.map((option) => (
          <Link
            key={option.href}
            href={option.href}
            className="flex min-h-20 items-center gap-4 rounded-xl border border-line bg-white px-5 py-4 shadow-sm transition hover:border-brand hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <option.icon aria-hidden="true" className="h-8 w-8 shrink-0 text-brand" />
            <span className="font-semibold text-brand">{option.title}</span>
          </Link>
        ))}
      </nav>
      <Link className="mt-5 text-sm font-medium text-brand hover:underline" href="/login">
        Back to login
      </Link>
    </main>
  );
}
