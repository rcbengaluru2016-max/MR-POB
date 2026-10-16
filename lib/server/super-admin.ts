import { getSession } from "@/lib/server/session";
import { getStore, refreshStore } from "@/lib/server/store";
import type { SessionUser } from "@/lib/types";

export { SUPER_ADMIN_EMAIL } from "@/lib/server/super-admin-config";

export async function getSuperAdminAccount() {
  const session = await getSession();
  if (!session || session.userType !== "super_admin") return null;
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
    const store = await getStore();
    const account = store.accounts.find(
      (item) => item.username.toLowerCase() === current.username.toLowerCase(),
    );
    return account?.userType === "admin" && (account.status === "active" || account.status === "unlocked");
  }
  if (current?.userType === "super_admin") return isSuperAdminReady();
  return false;
}
