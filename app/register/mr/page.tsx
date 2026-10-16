import { MrRegistrationForm } from "@/components/forms/mr-registration-form";
import { RegisterShell } from "@/components/register-shell";

export const metadata = { title: "MR registration" };

export default function MrRegisterPage() {
  return (
    <RegisterShell
      title="Medical Representative registration"
      subtitle=""
    >
      <MrRegistrationForm />
    </RegisterShell>
  );
}
