import { notFound, redirect } from "next/navigation";
import { VerificationPage } from "@/components/admin/verification-page";
import { isSuperAdminReady } from "@/lib/server/super-admin";

export const metadata = { title: "Registration Review" };
export const instant = false;

export default async function SuperAdminRegistrationReviewPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  if (!(await isSuperAdminReady())) redirect("/super-admin/security-setup");
  const { kind } = await params;
  if (kind !== "customer" && kind !== "company" && kind !== "patient") notFound();
  return <VerificationPage expectedKind={kind} superAdminFlow />;
}
