import { VerificationPage } from "@/components/admin/verification-page";

export const metadata = { title: "Registration Review" };
export const instant = false;

export default function AdminCompanyVerificationPage() {
  return <VerificationPage expectedKind="company" superAdminFlow returnPath="/admin/approvals" />;
}
