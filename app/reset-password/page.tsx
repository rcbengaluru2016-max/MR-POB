import { ResetPasswordForm } from "@/components/forms/reset-password-form";

export const metadata = { title: "Set a new password" };
export const instant = false;

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <main className="flex min-h-svh items-center justify-center bg-background p-4"><ResetPasswordForm token={token ?? ""} /></main>;
}
