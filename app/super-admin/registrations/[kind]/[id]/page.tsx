import { notFound, redirect } from "next/navigation";
import { ApprovedRegistrationDetails } from "@/components/super-admin/approved-registration-details";
import { isSuperAdminReady } from "@/lib/server/super-admin";

export const metadata = { title: "Approved Registration Details" };
export const instant = false;

export default async function ApprovedRegistrationDetailsPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  if (!(await isSuperAdminReady())) redirect("/super-admin/security-setup");
  const { kind, id } = await params;
  if (kind !== "customer" && kind !== "company" && kind !== "patient") notFound();
  return <ApprovedRegistrationDetails kind={kind} id={id} />;
}
