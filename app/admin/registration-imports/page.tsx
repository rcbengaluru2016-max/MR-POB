import { BulkRegistrationUpload } from "@/components/super-admin/registration-imports/bulk-upload";

export const metadata = { title: "Registration Imports" };
export const instant = false;

export default function AdminRegistrationImportsPage() {
  return <BulkRegistrationUpload basePath="/admin" />;
}
