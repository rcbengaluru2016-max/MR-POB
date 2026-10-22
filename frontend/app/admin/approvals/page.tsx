import { RegistrationApprovals } from "@/components/super-admin/registration-approvals";

export const metadata = { title: "Registrations" };
export const instant = false;

export default function AdminApprovalsPage() {
  return <RegistrationApprovals basePath="/admin" />;
}
