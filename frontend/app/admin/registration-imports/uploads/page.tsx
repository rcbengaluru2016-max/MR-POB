import { RegistrationUploads } from "@/components/super-admin/registration-imports/uploads";

export const metadata = { title: "Registration Upload History" };
export const instant = false;

export default function AdminRegistrationUploadsPage() {
  return <RegistrationUploads basePath="/admin" />;
}
