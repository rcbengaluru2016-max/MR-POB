import { NextResponse } from "next/server";
import { z } from "zod";
import { createSalt, hashPassword, verifyPassword } from "@/lib/crypto";
import { clearAuthFailures, isAuthRateLimited, recordAuthFailure } from "@/lib/server/auth-limits";
import { recordSecurityEvent } from "@/lib/server/security-audit";
import { getSuperAdminAccount } from "@/lib/server/super-admin";
import { persistStore } from "@/lib/server/store";
import { generateTotpSecret, totpProvisioningUri, verifyTotpCounter } from "@/lib/server/totp";
import { decryptMfaSecret, encryptMfaSecret } from "@/lib/server/mfa-secret";

const setupSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({
    action: z.literal("verify"),
    password: z.string().optional(),
    confirmPassword: z.string().optional(),
    code: z.string().regex(/^\d{6}$/),
  }).refine((value) => !value.password || value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  }),
]);

export async function POST(request: Request) {
  const context = await getSuperAdminAccount();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { account, store } = context;
  if (account.mfaEnabled && !account.passwordChangeRequired) {
    return NextResponse.json({ ok: true, redirectTo: "/super-admin/dashboard" });
  }

  const body = await request.json().catch(() => null);
  const parsed = setupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid security setup." }, { status: 400 });
  }

  if (parsed.data.action === "start") {
    if (!account.mfaSecret) {
      account.mfaSecret = encryptMfaSecret(generateTotpSecret());
      await persistStore(store);
    }
    const secret = decryptMfaSecret(account.mfaSecret);
    return NextResponse.json({
      ok: true,
      secret,
      provisioningUri: totpProvisioningUri(secret, account.email ?? account.username),
    });
  }

  if (!account.mfaSecret) {
    return NextResponse.json({ error: "Start authenticator setup before verifying." }, { status: 409 });
  }

  const limitKey = `mfa-setup:${account.username.toLowerCase()}`;
  if (isAuthRateLimited(limitKey)) {
    return NextResponse.json({ error: "Too many unsuccessful verification attempts. Try again in 15 minutes." }, { status: 429 });
  }
  const acceptedCounter = verifyTotpCounter(decryptMfaSecret(account.mfaSecret), parsed.data.code, Date.now(), account.lastMfaCounter);
  if (acceptedCounter === null) {
    recordAuthFailure(limitKey);
    await recordSecurityEvent(account.username, "super_admin_mfa_setup_failed");
    return NextResponse.json({ error: "The authenticator code is invalid. Try again." }, { status: 401 });
  }
  account.lastMfaCounter = acceptedCounter;
  let passwordChanged = false;

  if (account.passwordChangeRequired) {
    const newPassword = parsed.data.password;
    if (!newPassword || newPassword.length < 12 || newPassword.length > 128 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      return NextResponse.json({ error: "Choose a 12-character password with uppercase, lowercase, a number, and a symbol." }, { status: 400 });
    }
    if (await verifyPassword(newPassword, account.passwordSalt, account.passwordHash)) {
      return NextResponse.json({ error: "Choose a new password different from the initial password." }, { status: 400 });
    }
    account.passwordSalt = createSalt();
    account.passwordHash = await hashPassword(newPassword, account.passwordSalt);
    account.passwordChangeRequired = false;
    passwordChanged = true;
  }
  account.mfaEnabled = true;
  await persistStore(store);
  clearAuthFailures(limitKey);
  if (passwordChanged) await recordSecurityEvent(account.username, "super_admin_initial_password_changed");
  await recordSecurityEvent(account.username, "super_admin_mfa_enabled");
  return NextResponse.json({ ok: true, redirectTo: "/super-admin/dashboard" });
}

