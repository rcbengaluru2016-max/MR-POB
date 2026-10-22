import { CompanyRegistrationForm } from "@/components/forms/company-registration-form";
import { RegisterShell } from "@/components/register-shell";

export const metadata = { title: "Company registration" };

export default function CompanyRegisterPage() {
  return (
    <RegisterShell
      title="Company registration"
      subtitle=""
    >
      <CompanyRegistrationForm />
    </RegisterShell>
  );
}
