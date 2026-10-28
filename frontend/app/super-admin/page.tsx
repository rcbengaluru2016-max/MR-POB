import { redirect } from "next/navigation";

export const instant = false;

export default function SuperAdminRootPage() {
  redirect("/super-admin/dashboard");
}
