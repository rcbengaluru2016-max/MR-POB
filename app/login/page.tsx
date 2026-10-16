import { LoginForm } from "@/components/forms/login-form";
import { CompanyLogo } from "@/components/company-logo";

export const metadata = { title: "Login" };

export default function LoginPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-[linear-gradient(160deg,#eef4ff_0%,#f4f7fb_100%)] px-4 py-8 sm:py-12">
      <div className="w-full max-w-md text-center">
        <CompanyLogo className="mx-auto w-44 sm:w-52" />
        <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-muted sm:text-base">
          Secure access to Zenex International&apos;s pharmaceutical ordering and account services.
        </p>
        <section aria-label="Sign in" className="mt-6 rounded-2xl border border-line bg-white p-6 text-left shadow-xl shadow-black/10 sm:p-8">
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
