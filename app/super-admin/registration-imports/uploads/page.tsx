import { redirect } from "next/navigation";
import { RegistrationUploads } from "@/components/super-admin/registration-imports/uploads";
import { isSuperAdminReady } from "@/lib/server/super-admin";

export const metadata = { title: "Registration Upload History" };
export const instant = false;

export default async function RegistrationUploadHistoryPage() {
  if (!(await isSuperAdminReady())) redirect("/super-admin/security-setup");
  return <RegistrationUploads />;
}
