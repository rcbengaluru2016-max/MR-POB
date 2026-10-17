import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { refreshStore } from "@/lib/server/store";

/** Returns only the approved Company account and its own Company Master record. */
export async function getCompanyAdminContext() {
  const session = await getSession();
  if (!session) redirect("/login?next=%2Fcompany%2Fdashboard");
  if (session.userType !== "company") redirect("/access-denied");

  const context = await resolveCompanyAdminContext(session.username);
  if (!context) redirect("/access-denied");
  return context;
}

export async function resolveCompanyAdminContext(username: string) {
  const store = await refreshStore();
  const account = store.accounts.find(
    (item) => item.username.toLowerCase() === username.toLowerCase() && item.userType === "company",
  );
  if (!account || (account.status !== "active" && account.status !== "unlocked")) return null;

  const master = store.masters.find(
    (item) => item.kind === "company" &&
      item.registrationId === account.registrationId &&
      item.code === account.masterCode &&
      item.status === "active",
  );
  if (!master || master.kind !== "company") return null;

  const registration = store.registrations.find(
    (item) => item.kind === "company" && item.id === account.registrationId && item.status === "approved",
  );
  if (!registration) return null;

  return { account, master, registration, store };
}
