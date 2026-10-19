import { notFound } from "next/navigation";
import { ApprovedRegistrationDetails } from "@/components/super-admin/approved-registration-details";

export const metadata = { title: "Approved Registration Details" };
export const instant = false;

export default async function AdminRegistrationDetailsPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (kind !== "customer" && kind !== "company" && kind !== "patient") notFound();
  return <ApprovedRegistrationDetails kind={kind} id={id} basePath="/admin" />;
}
