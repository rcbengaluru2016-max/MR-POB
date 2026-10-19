import { NextResponse } from "next/server";
import { hashPassword, isCurrentPasswordHash, verifyPassword, createSalt } from "@/lib/crypto";
import { clearAuthFailures, isAuthRateLimited, recordAuthFailure } from "@/lib/server/auth-limits";
import { clearMfaChallengeCookie, clearSessionCookie, setMfaChallengeCookie, setSessionCookie } from "@/lib/server/session";
import { refreshStore, persistStore } from "@/lib/server/store";
import { recordSecurityEvent } from "@/lib/server/security-audit";
import { SUPER_ADMIN_EMAIL } from "@/lib/server/super-admin-config";
import { loginSchema } from "@/lib/validation";
import { isUserType } from "@/lib/types";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid login" },
      { status: 400 },
    );
  }

  const loginKey = `login:${parsed.data.username.toLowerCase()}`;
  if (isAuthRateLimited(loginKey)) {
    return NextResponse.json({ error: "Too many unsuccessful attempts. Try again in 15 minutes." }, { status: 429 });
  }
  const store = await refreshStore();
  const account = store.accounts.find(
    (item) => item.username.toLowerCase() === parsed.data.username.toLowerCase(),
  );
  if (!account) {
    recordAuthFailure(loginKey);
    if (parsed.data.username.toLowerCase() === SUPER_ADMIN_EMAIL) {
      await recordSecurityEvent(SUPER_ADMIN_EMAIL, "super_admin_login_failed");
    }
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  const valid = await verifyPassword(
    parsed.data.password,
    account.passwordSalt,
    account.passwordHash,
  );
  if (!valid) {
    recordAuthFailure(loginKey);
    if (account.userType === "super_admin" || account.userType === "admin") {
      await recordSecurityEvent(account.username, account.userType === "super_admin" ? "super_admin_login_failed" : "admin_login_failed");
    }
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  // Accounts persisted with a role that is no longer supported must not receive a
  // session or access a portal. Keep the response generic to avoid role disclosure.
  if (!isUserType(account.userType)) {
    recordAuthFailure(loginKey);
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  if (account.status === "locked") {
    if (account.userType === "super_admin" || account.userType === "admin") {
      await recordSecurityEvent(account.username, "admin_login_blocked_locked_account");
    }
    return NextResponse.json(
      { error: "This account is locked. Contact Zenex support." },
      { status: 403 },
    );
  }
  if (account.status !== "active" && account.status !== "unlocked") {
    if (account.userType === "super_admin" || account.userType === "admin") {
      await recordSecurityEvent(account.username, "admin_login_blocked_inactive_account");
    }
    return NextResponse.json(
      { error: "This account is inactive and cannot log in." },
      { status: 403 },
    );
  }

  clearAuthFailures(loginKey);
  if (!isCurrentPasswordHash(account.passwordHash)) {
    account.passwordSalt = createSalt();
    account.passwordHash = await hashPassword(parsed.data.password, account.passwordSalt);
  }
  if (account.userType !== "super_admin") account.lastLoginAt = new Date().toISOString();
  await persistStore(store);

  const sessionUser = {
    username: account.username,
    userType: account.userType,
    displayName: account.displayName,
  };

  if (account.userType === "super_admin") {
    if (account.mfaEnabled) {
      await clearSessionCookie();
      await setMfaChallengeCookie(sessionUser);
      await recordSecurityEvent(account.username, "super_admin_password_verified_mfa_required");
      return NextResponse.json({
        user: sessionUser,
        requiresMfa: true,
        redirectTo: "/super-admin/dashboard",
      });
    }
    await clearMfaChallengeCookie();
    await setSessionCookie(sessionUser);
    await recordSecurityEvent(account.username, "super_admin_first_factor_verified");
    return NextResponse.json({
      user: sessionUser,
      requiresSecuritySetup: true,
      redirectTo: "/super-admin/security-setup",
    });
  }

  await clearMfaChallengeCookie();
  await setSessionCookie(sessionUser);
  if (account.userType === "admin") await recordSecurityEvent(account.username, "admin_login_succeeded");

  return NextResponse.json({
    user: sessionUser,
    redirectTo:
      account.userType === "admin"
        ? "/admin/dashboard"
        : account.userType === "company"
          ? "/company/dashboard"
          : "/portal",
  });
}
