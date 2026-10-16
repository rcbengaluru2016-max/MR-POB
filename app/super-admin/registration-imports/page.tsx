import { redirect } from "next/navigation";
import { BulkRegistrationUpload } from "@/components/super-admin/registration-imports/bulk-upload";
import { isSuperAdminReady } from "@/lib/server/super-admin";

export const metadata = { title: "Bulk Registration Upload" };
export const instant = false;

export default async function BulkRegistrationImportPage() {
  if (!(await isSuperAdminReady())) redirect("/super-admin/security-setup");
  return <BulkRegistrationUpload />;
}
