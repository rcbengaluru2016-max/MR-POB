import { NextResponse } from "next/server";
import { z } from "zod";
import { createSalt, hashPassword, verifyPassword } from "@/lib/crypto";
import { decryptMfaSecret } from "@/lib/server/mfa-secret";
import { clearAuthFailures, isAuthRateLimited, recordAuthFailure } from "@/lib/server/auth-limits";
import { getSession } from "@/lib/server/session";
import { resolveCompanyAdminContext } from "@/lib/server/company-admin";
import { transactStore } from "@/lib/server/store";
import { verifyTotpCounter } from "@/lib/server/totp";

export const instant = false;
const schema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(12).max(128),
  confirmPassword: z.string().min(1).max(128),
  code: z.string().optional(),
}).refine((value) => value.newPassword === value.confirmPassword, { message: "New passwords do not match.", path: ["confirmPassword"] });
const strong = (value: string) => /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.userType !== "company") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const context = await resolveCompanyAdminContext(session.username);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rateKey = `company-password-change:${session.username.toLowerCase()}`;
  if (isAuthRateLimited(rateKey)) return NextResponse.json({ error: "Too many unsuccessful attempts. Try again in 15 minutes." }, { status: 429 });
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Enter valid password details." }, { status: 400 });
  if (!strong(parsed.data.newPassword)) return NextResponse.json({ error: "Use at least 12 characters with uppercase, lowercase, a number, and a symbol." }, { status: 400 });
  if (parsed.data.currentPassword === parsed.data.newPassword) return NextResponse.json({ error: "Choose a new password that differs from your current password." }, { status: 400 });

  const currentAccount = context.account;
  const validCurrentPassword = await verifyPassword(parsed.data.currentPassword, currentAccount.passwordSalt, currentAccount.passwordHash);
  if (!validCurrentPassword) {
    recordAuthFailure(rateKey);
    await transactStore((store) => { store.audit.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), actor: currentAccount.username, action: "company_password_change_failed" }); });
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
  }
  if (currentAccount.mfaEnabled && !/^\d{6}$/.test(parsed.data.code ?? "")) return NextResponse.json({ error: "Enter your 6-digit authenticator code." }, { status: 400 });

  const salt = createSalt();
  const passwordHash = await hashPassword(parsed.data.newPassword, salt);
  const now = new Date().toISOString();
  const outcome = await transactStore((store) => {
    const account = store.accounts.find((item) => item.username.toLowerCase() === session.username.toLowerCase() && item.userType === "company");
    if (!account || (account.status !== "active" && account.status !== "unlocked") || account.passwordHash !== currentAccount.passwordHash || account.passwordSalt !== currentAccount.passwordSalt) return "unauthorized" as const;
    if (account.mfaEnabled) {
      if (!account.mfaSecret) return "unauthorized" as const;
      const counter = verifyTotpCounter(decryptMfaSecret(account.mfaSecret), parsed.data.code!, Date.now(), account.lastMfaCounter);
      if (counter === null) {
        store.audit.unshift({ id: crypto.randomUUID(), at: now, actor: account.username, action: "company_password_change_mfa_failed" });
        return "invalid-mfa" as const;
      }
      account.lastMfaCounter = counter;
    }
    account.passwordHash = passwordHash;
    account.passwordSalt = salt;
    account.passwordChangeRequired = false;
    store.audit.unshift({ id: crypto.randomUUID(), at: now, actor: account.username, action: "company_password_changed", masterCode: account.masterCode, detail: "Company Admin changed their password" });
    return "updated" as const;
  });
  if (outcome === "invalid-mfa") {
    recordAuthFailure(rateKey);
    return NextResponse.json({ error: "Authenticator code is invalid or has already been used." }, { status: 401 });
  }
  if (outcome !== "updated") return NextResponse.json({ error: "Your account could not be verified. Sign in again and retry." }, { status: 401 });
  clearAuthFailures(rateKey);
  return NextResponse.json({ ok: true });
}
