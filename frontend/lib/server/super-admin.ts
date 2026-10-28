import { getSession } from "@/lib/server/session";
import { refreshStore } from "@/lib/server/store";
import type { SessionUser } from "@/lib/types";
import { backendEnabled } from "./backend-client";
import type { AccountRecord } from "@/lib/types";
import type { AppStore } from "./store";

function backendContext(session: SessionUser) {
  const account: AccountRecord = { ...session, passwordHash: "", passwordSalt: "", status: "active", createdAt: session.createdAt ?? "", mfaEnabled: true, passwordChangeRequired: false };
  const store: AppStore = { counters: { customerReg: 0, companyReg: 0, patientReg: 0, customerMaster: 0, companyMaster: 0, patientMaster: 0 }, accounts: [account], audit: [], registrations: [], masters: [], companyEmployees: [], companyProducts: [], companySpecialRates: [], companyOrders: [], emails: [], passwordResetTokens: [], registrationUploads: [], customerActivationChallenges: [], superAdminPasswordChangeChallenges: [] };
  return { account, store, session };
}

export { SUPER_ADMIN_EMAIL } from "@/lib/server/super-admin-config";

export async function getSuperAdminAccount() {
  const session = await getSession();
  if (!session || session.userType !== "super_admin") return null;
  if (backendEnabled()) return backendContext(session);
  const store = await refreshStore();
  const account = store.accounts.find(
    (item) => item.username.toLowerCase() === session.username.toLowerCase(),
  );
  if (
    account?.userType !== "super_admin" ||
    (account.status !== "active" && account.status !== "unlocked")
  ) return null;
  return { account, store, session };
}

export async function getZenexAdminAccount(sessionOverride?: SessionUser | null) {
  const session = sessionOverride === undefined ? await getSession() : sessionOverride;
  if (!session || session.userType !== "admin") return null;
  if (backendEnabled()) return backendContext(session);
  const store = await refreshStore();
  const account = store.accounts.find(
    (item) => item.username.toLowerCase() === session.username.toLowerCase() && item.userType === "admin",
  );
  if (!account || (account.status !== "active" && account.status !== "unlocked")) return null;
  return { account, store, session };
}

export async function isSuperAdminSession() {
  return Boolean(await getSuperAdminAccount());
}

export async function isSuperAdminReady() {
  const result = await getSuperAdminAccount();
  return Boolean(result && result.account.mfaEnabled && !result.account.passwordChangeRequired);
}

export async function isAdminSession(session?: SessionUser | null) {
  const current = session === undefined ? await getSession() : session;
  if (current?.userType === "admin") {
    return Boolean(await getZenexAdminAccount(current));
  }
  if (current?.userType === "super_admin") return isSuperAdminReady();
  return false;
}
