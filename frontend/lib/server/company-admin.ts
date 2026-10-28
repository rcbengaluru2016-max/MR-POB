import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { refreshStore } from "@/lib/server/store";
import { cookies } from "next/headers";
import { ACCESS_COOKIE, backendEnabled, backendFetch, backendUser } from "./backend-client";
import { approvedBackendProfile } from "./backend-profile";
import type { StoredCompanyRegistration, CompanyMaster } from "@/lib/types";

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
  if (backendEnabled()) {
    const token = (await cookies()).get(ACCESS_COOKIE)?.value;
    const user = await backendUser(token);
    if (!token || user?.userType !== "company" || user.username !== username) return null;
    const response = await backendFetch("/registrations/me", token);
    if (!response.ok) return null;
    const body = await response.json();
    const source = body.items?.find((item: Record<string, unknown>) => item.kind === "company" && item.status === "APPROVED" && item.masterCode);
    if (!source) return null;
    const registration = { ...source, status: "approved", files: Object.fromEntries(Object.entries(source.files ?? {}).map(([key, value]) => {
      const file = value as { id: string; name: string; type: string; size: number };
      return [key, { name: file.name, type: file.type, size: file.size, dataUrl: `/api/documents/${encodeURIComponent(file.id)}`, downloadUrl: `/api/documents/${encodeURIComponent(file.id)}?download=1` }];
    })) } as StoredCompanyRegistration;
    const { account, master } = approvedBackendProfile(registration);
    if (!account || master.kind !== "company") return null;
    account.username = user.username;
    // Operational rows are always scoped using the verified backend Master Code.
    return { account, master: master as CompanyMaster, registration, store: await refreshStore() };
  }
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
