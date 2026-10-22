import { VerificationPage } from "@/components/admin/verification-page";

export const metadata = { title: "Registration Review" };
export const instant = false;

export default function AdminPatientVerificationPage() {
  return <VerificationPage expectedKind="patient" superAdminFlow returnPath="/admin/approvals" />;
}
