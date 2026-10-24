import { CompanyLogo } from "@/components/company-logo";
import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";

export const metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return <main className="flex min-h-svh flex-col items-center justify-center bg-[linear-gradient(160deg,#eef4ff_0%,#f4f7fb_100%)] px-4 py-8 sm:py-12">
    <div className="w-full max-w-md text-center">
      <CompanyLogo className="mx-auto w-44 sm:w-52" />
      <section aria-label="Password recovery" className="mt-6 rounded-2xl border border-line bg-white p-6 text-left shadow-xl shadow-black/10 sm:p-8">
        <h1 className="sr-only">Reset your password through WhatsApp</h1>
        <ForgotPasswordForm />
      </section>
    </div>
  </main>;
}
