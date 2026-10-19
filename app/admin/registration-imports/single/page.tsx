import { SingleRegistrationUpload } from "@/components/super-admin/registration-imports/single-upload";

export const metadata = { title: "Single Registration Upload" };
export const instant = false;

export default function AdminSingleRegistrationUploadPage() {
  return <SingleRegistrationUpload basePath="/admin" />;
}
