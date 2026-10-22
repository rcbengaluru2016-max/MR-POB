import { PatientRegistrationForm } from "@/components/forms/patient-registration-form";
import { RegisterShell } from "@/components/register-shell";

export const metadata = { title: "Patient registration" };

export default function PatientRegisterPage() {
  return (
    <RegisterShell
      title="Patient registration"
      subtitle=""
    >
      <PatientRegistrationForm />
    </RegisterShell>
  );
}
