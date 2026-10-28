import { BackToLoginButton } from "@/components/back-to-login-button";

export const metadata = { title: "Account Inactive", robots: { index: false, follow: false } };

export default function AccountInactivePage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-line bg-white p-7 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-foreground">Account inactive</h1>
        <p role="status" className="mt-2 text-sm leading-6 text-muted">Your account is currently inactive. Please contact the Super Admin to activate your account.</p>
        <BackToLoginButton />
      </section>
    </main>
  );
}
