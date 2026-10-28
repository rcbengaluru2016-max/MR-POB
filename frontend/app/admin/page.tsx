import { redirect } from "next/navigation";

// This segment redirects; it has no instant UI to validate.
export const instant = false;

export default function AdminPage() {
  redirect("/admin/dashboard");
}
