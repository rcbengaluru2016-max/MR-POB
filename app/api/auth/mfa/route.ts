import { NextResponse } from "next/server";
import { clearAuthFailures, isAuthRateLimited, recordAuthFailure } from "@/lib/server/auth-limits";
import { clearMfaChallengeCookie, getMfaChallenge, setSessionCookie } from "@/lib/server/session";
import { refreshStore, persistStore } from "@/lib/server/store";
import { recordSecurityEvent } from "@/lib/server/security-audit";
import { verifyTotpCounter } from "@/lib/server/totp";
import { decryptMfaSecret } from "@/lib/server/mfa-secret";

export async function POST(request: Request) {
  const challenge = await getMfaChallenge();
  if (!challenge || challenge.userType !== "super_admin") {
    return NextResponse.json({ error: "Your sign-in verification expired. Please sign in again." }, { status: 401 });
  }
  const key = `mfa-login:${challenge.username.toLowerCase()}`;
  if (isAuthRateLimited(key)) {
    return NextResponse.json({ error: "Too many unsuccessful attempts. Try again in 15 minutes." }, { status: 429 });
  }
  const body = await request.json().catch(() => null) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code : "";
  const store = await refreshStore();
  const account = store.accounts.find((item) => item.username.toLowerCase() === challenge.username.toLowerCase());
  const acceptedCounter = account?.mfaSecret
    ? verifyTotpCounter(decryptMfaSecret(account.mfaSecret), code, Date.now(), account.lastMfaCounter)
    : null;
  if (
    !account || account.userType !== "super_admin" || (account.status !== "active" && account.status !== "unlocked") ||
    !account.mfaEnabled ||
    account.passwordChangeRequired || acceptedCounter === null
  ) {
    recordAuthFailure(key);
    await recordSecurityEvent(challenge.username, "super_admin_mfa_login_failed");
    return NextResponse.json({ error: "The authenticator code is invalid." }, { status: 401 });
  }
  clearAuthFailures(key);
  account.lastMfaCounter = acceptedCounter;
  account.lastLoginAt = new Date().toISOString();
  await persistStore(store);
  await clearMfaChallengeCookie();
  await setSessionCookie({ username: account.username, userType: account.userType, displayName: account.displayName });
  await recordSecurityEvent(account.username, "super_admin_mfa_login_succeeded");
  return NextResponse.json({ redirectTo: "/super-admin/dashboard" });
}
