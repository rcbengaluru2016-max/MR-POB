import { AuthShell } from "@/components/auth-shell";
import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";

export const metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Password recovery"
      subtitle="Enter the email associated with your account. Your existing password is never included in a message."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
