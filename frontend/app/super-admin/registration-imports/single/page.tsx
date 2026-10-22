import { redirect } from "next/navigation";
import { SingleRegistrationUpload } from "@/components/super-admin/registration-imports/single-upload";
import { isSuperAdminReady } from "@/lib/server/super-admin";

export const metadata = { title: "Single Registration Upload" };
export const instant = false;

export default async function SingleRegistrationImportPage() {
  if (!(await isSuperAdminReady())) redirect("/super-admin/security-setup");
  return <SingleRegistrationUpload />;
}
