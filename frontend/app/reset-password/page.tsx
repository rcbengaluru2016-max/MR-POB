import { ResetPasswordForm } from "@/components/forms/reset-password-form";
import { backendEnabled } from "@/lib/server/backend-client";

export const metadata = { title: "Set a new password", referrer: "no-referrer" as const, robots: { index: false, follow: false } };
export const instant = false;

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <main className="flex min-h-svh items-center justify-center bg-background p-4"><ResetPasswordForm token={token ?? ""} backendMode={backendEnabled()} /></main>;
}
