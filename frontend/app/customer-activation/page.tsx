import { CustomerDetailsForm } from "@/components/forms/customer-details-form";
import { CompanyLogo } from "@/components/company-logo";

export const metadata = { title: "Modify Customer Details" };

export default function CustomerDetailsPage() {
  return <main className="flex min-h-svh flex-col items-center justify-center bg-[linear-gradient(160deg,#eef4ff_0%,#f4f7fb_100%)] px-4 py-8 sm:py-12">
    <div className="w-full max-w-3xl text-center">
      <CompanyLogo className="mx-auto w-44 sm:w-52" />
      <CustomerDetailsForm />
    </div>
  </main>;
}
