import { VerificationPage } from "@/components/admin/verification-page";

export const metadata = { title: "Registration Review" };
export const instant = false;

export default function AdminCustomerVerificationPage() {
  return <VerificationPage expectedKind="customer" superAdminFlow returnPath="/admin/approvals" />;
}
