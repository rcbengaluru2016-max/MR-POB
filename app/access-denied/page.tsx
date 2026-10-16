import { BackToLoginButton } from "@/components/back-to-login-button";

export const metadata = { title: "Access Denied" };

export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-line bg-white p-7 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-foreground">Access denied</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Your account does not have permission to open this page.</p>
        <BackToLoginButton />
      </section>
    </main>
  );
}
