import { CustomerRegistrationForm } from "@/components/forms/customer-registration-form";
import { RegisterShell } from "@/components/register-shell";

export const metadata = { title: "Customer registration" };

export default function CustomerRegisterPage() {
  return (
    <RegisterShell
      title="Customer registration"
      subtitle="Pharmacy, hospital, and business customers. All mandatory fields and documents must be complete before submission."
    >
      <CustomerRegistrationForm />
    </RegisterShell>
  );
}
