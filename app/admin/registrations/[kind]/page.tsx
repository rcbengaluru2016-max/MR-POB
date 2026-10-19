import { notFound } from "next/navigation";
import { SuperAdminRegistrationTable } from "@/components/super-admin/registration-table";

export const metadata = { title: "Approved Registrations" };
export const instant = false;

export default async function AdminRegistrationListPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (kind !== "customer" && kind !== "company" && kind !== "patient") notFound();
  return <SuperAdminRegistrationTable kind={kind} basePath="/admin" />;
}
