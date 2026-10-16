import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSalt, hashPassword } from "@/lib/crypto";
import { clearAuthFailures, isAuthRateLimited, recordAuthFailure } from "@/lib/server/auth-limits";
import { decryptMfaSecret } from "@/lib/server/mfa-secret";
import { getSession } from "@/lib/server/session";
import { isSuperAdminReady } from "@/lib/server/super-admin";
import { transactStore } from "@/lib/server/store";
import { verifyTotpCounter } from "@/lib/server/totp";

export const instant = false;
const COOKIE = "zenex_super_admin_password_change";
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("verify"), code: z.string().regex(/^\d{6}$/, "Enter your 6-digit authenticator code.") }),
  z.object({ action: z.literal("update"), password: z.string().min(12).max(128), confirmPassword: z.string() }).refine((value) => value.password === value.confirmPassword, { message: "Passwords do not match.", path: ["confirmPassword"] }),
]);
const strong = (value: string) => /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
const matchesHash = (leftHex: string, rightHex: string) => {
  const left = Buffer.from(leftHex, "hex");
  const right = Buffer.from(rightHex, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
};

export async function POST(request: Request) {
  if (!(await isSuperAdminReady())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = await getSession();
  if (!session || session.userType !== "super_admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = `super-admin-password-change:${session.username.toLowerCase()}`;
  if (isAuthRateLimited(key)) return NextResponse.json({ error: "Too many unsuccessful attempts. Try again in 15 minutes." }, { status: 429 });
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });

  if (parsed.data.action === "verify") {
    const verificationCode = parsed.data.code;
    const token = randomBytes(32).toString("base64url");
    const outcome = await transactStore((store) => {
      const account = store.accounts.find((item) => item.username.toLowerCase() === session.username.toLowerCase() && item.userType === "super_admin");
      if (!account || account.status === "locked" || account.status === "inactive" || !account.mfaEnabled || !account.mfaSecret || account.passwordChangeRequired) return "unauthorized" as const;
      const counter = verifyTotpCounter(decryptMfaSecret(account.mfaSecret), verificationCode, Date.now(), account.lastMfaCounter);
      if (counter === null) {
        store.audit.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), actor: account.username, action: "super_admin_password_change_mfa_failed" });
        return "invalid" as const;
      }
      account.lastMfaCounter = counter;
      const now = new Date().toISOString();
      store.superAdminPasswordChangeChallenges = store.superAdminPasswordChangeChallenges.filter((challenge) => !challenge.usedAt && Date.parse(challenge.expiresAt) > Date.now());
      for (const challenge of store.superAdminPasswordChangeChallenges) if (challenge.username.toLowerCase() === account.username.toLowerCase()) challenge.usedAt = now;
      store.superAdminPasswordChangeChallenges.push({ tokenHash: tokenHash(token), username: account.username, createdAt: now, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() });
      store.audit.unshift({ id: crypto.randomUUID(), at: now, actor: account.username, action: "super_admin_password_change_mfa_verified" });
      return "verified" as const;
    });
    if (outcome === "invalid") {
      recordAuthFailure(key);
      return NextResponse.json({ error: "Authenticator code is invalid or has already been used." }, { status: 401 });
    }
    if (outcome !== "verified") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    clearAuthFailures(key);
    const response = NextResponse.json({ verified: true });
    response.cookies.set(COOKIE, token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 5 * 60 });
    return response;
  }

  if (!strong(parsed.data.password)) return NextResponse.json({ error: "Use at least 12 characters with uppercase, lowercase, a number, and a symbol." }, { status: 400 });
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Verify your authenticator code before changing your password." }, { status: 401 });
  const now = new Date().toISOString();
  const salt = createSalt();
  const passwordHash = await hashPassword(parsed.data.password, salt);
  const updated = await transactStore((store) => {
    const account = store.accounts.find((item) => item.username.toLowerCase() === session.username.toLowerCase() && item.userType === "super_admin");
    const challenge = store.superAdminPasswordChangeChallenges.find((item) => item.username.toLowerCase() === session.username.toLowerCase() && !item.usedAt && Date.parse(item.expiresAt) > Date.now() && matchesHash(item.tokenHash, tokenHash(token)));
    if (!account || account.status === "locked" || account.status === "inactive" || !account.mfaEnabled || !challenge) return false;
    account.passwordHash = passwordHash;
    account.passwordSalt = salt;
    account.passwordChangeRequired = false;
    challenge.usedAt = now;
    store.audit.unshift({ id: crypto.randomUUID(), at: now, actor: account.username, action: "super_admin_password_changed" });
    return true;
  });
  if (!updated) return NextResponse.json({ error: "Password change verification expired. Verify your authenticator again." }, { status: 401 });
  clearAuthFailures(key);
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(COOKIE);
  return response;
}
