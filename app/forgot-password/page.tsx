import { AuthShell } from "@/components/auth-shell";
import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";

export const metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Password recovery"
      subtitle="Enter the email used at registration. We never send your existing password by email."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
