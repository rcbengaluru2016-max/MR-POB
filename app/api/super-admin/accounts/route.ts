import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSalt, hashPassword } from "@/lib/crypto";
import { clearAuthFailures, isAuthRateLimited, recordAuthFailure } from "@/lib/server/auth-limits";
import { decryptMfaSecret } from "@/lib/server/mfa-secret";
import { getSession } from "@/lib/server/session";
import { isSuperAdminReady } from "@/lib/server/super-admin";
import { getStore, refreshStore, transactStore } from "@/lib/server/store";
import { verifyTotpCounter } from "@/lib/server/totp";

export const instant = false;
const accountSchema = z.object({
  action: z.enum(["create", "status", "reset"]),
  reauthCode: z.string().regex(/^\d{6}$/).optional(),
  name: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().email().max(254).optional(),
  role: z.enum(["admin", "super_admin"]).optional(),
  initialStatus: z.enum(["active", "locked"]).optional(),
  password: z.string().min(12).max(128).optional(),
  status: z.enum(["locked", "unlocked"]).optional(),
  username: z.string().trim().min(1).max(254).optional(),
});
const strong = (password: string) => /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);

export async function GET() {
  if (!(await isSuperAdminReady())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = await getSession();
  const store = await getStore();
  const items = store.accounts.filter((account) => ["admin", "super_admin"].includes(account.userType)).map((account) => ({
    username: account.username, email: account.email ?? account.username, name: account.displayName, role: account.userType,
    status: account.status, createdAt: account.createdAt, lastLoginAt: account.lastLoginAt ?? null,
    isCurrentUser: account.username.toLowerCase() === session?.username.toLowerCase(),
  }));
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  if (!(await isSuperAdminReady())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = `super-admin-action:${session.username.toLowerCase()}`;
  const body = await request.json().catch(() => null);
  const parsed = accountSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid account action." }, { status: 400 });
  const data = parsed.data;
  const requiresMfa = data.action === "reset" || (data.action === "create" && data.role === "super_admin");
  if (data.action !== "status" && isAuthRateLimited(key)) return NextResponse.json({ error: "Too many unsuccessful attempts. Try again in 15 minutes." }, { status: 429 });
  if (data.action === "create" && (!data.name || !data.email || !data.role || !data.password || !strong(data.password))) return NextResponse.json({ error: "Enter a name, valid email, role, and a 12-character password with uppercase, lowercase, number, and symbol." }, { status: 400 });
  if (requiresMfa && !data.reauthCode) return NextResponse.json({ error: "Enter your 6-digit authenticator code to continue." }, { status: 400 });
  if (data.action === "status" && (!data.username || !data.status)) return NextResponse.json({ error: "Choose an account and status." }, { status: 400 });
  if (data.action === "reset" && !data.username) return NextResponse.json({ error: "Choose an account." }, { status: 400 });
  try {
    const result = await transactStore(async (store) => {
      const actor = store.accounts.find((item) => item.username.toLowerCase() === session.username.toLowerCase());
      if (!actor || actor.userType !== "super_admin" || actor.status === "locked" || !actor.mfaEnabled || actor.passwordChangeRequired || !actor.mfaSecret) throw new Error("Unauthorized");
      const statusTarget = data.action === "status"
        ? store.accounts.find((item) => item.username.toLowerCase() === data.username!.toLowerCase())
        : null;
      if (data.action === "status" && (!statusTarget || !["customer", "company", "patient", "admin", "super_admin"].includes(statusTarget.userType))) throw new Error("Account not found.");
      if (requiresMfa) {
        if (!data.reauthCode) throw new Error("MFA_REQUIRED");
        const counter = verifyTotpCounter(decryptMfaSecret(actor.mfaSecret), data.reauthCode, Date.now(), actor.lastMfaCounter);
        if (counter === null) throw new Error("INVALID_MFA");
        actor.lastMfaCounter = counter;
      }
      const now = new Date().toISOString();
      let response: Record<string, unknown> = { ok: true };
      let auditAction = "";
      let detail = "";
      if (data.action === "create") {
        const username = data.email!.trim().toLowerCase();
        if (store.accounts.some((item) => item.username.toLowerCase() === username || item.email?.toLowerCase() === username)) throw new Error("An account already uses this email address.");
        const salt = createSalt();
        store.accounts.unshift({ username, email: username, displayName: data.name!.trim(), userType: data.role!, passwordSalt: salt, passwordHash: await hashPassword(data.password!, salt), status: data.initialStatus ?? "active", createdAt: now, passwordChangeRequired: data.role === "super_admin", mfaEnabled: data.role === "super_admin" ? false : undefined });
        auditAction = data.role === "super_admin" ? "super_admin_account_created" : "account_created_by_super_admin";
        detail = `${data.role}: ${username}`;
      } else if (data.action === "status") {
        const target = store.accounts.find((item) => item.username.toLowerCase() === data.username!.toLowerCase());
        if (!target || !["customer", "company", "patient", "admin", "super_admin"].includes(target.userType)) throw new Error("Account not found.");
        if (target.username.toLowerCase() === actor.username.toLowerCase()) throw new Error("You cannot change your own account status.");
        target.status = data.status!;
        auditAction = data.status === "locked" ? "account_locked_by_super_admin" : "account_unlocked_by_super_admin";
        detail = target.username;
      } else {
        const target = store.accounts.find((item) => item.username.toLowerCase() === data.username!.toLowerCase());
        if (!target || !["admin", "super_admin"].includes(target.userType)) throw new Error("Account not found.");
        const token = randomBytes(32).toString("base64url");
        for (const reset of store.passwordResetTokens) if (reset.username.toLowerCase() === target.username.toLowerCase() && !reset.usedAt) reset.usedAt = now;
        store.passwordResetTokens.push({ tokenHash: createHash("sha256").update(token).digest("hex"), username: target.username, createdAt: now, expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() });
        response = { ok: true, resetUrl: `${new URL(request.url).origin}/reset-password?token=${encodeURIComponent(token)}`, expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() };
        auditAction = "account_password_reset_link_created";
        detail = target.username;
      }
      store.audit.unshift({ id: crypto.randomUUID(), at: now, actor: actor.username, action: auditAction, detail });
      return response;
    });
    clearAuthFailures(key);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_MFA") {
      recordAuthFailure(key);
      const store = await refreshStore();
      store.audit.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), actor: session.username, action: "super_admin_sensitive_action_mfa_failed" });
      const { persistStore } = await import("@/lib/server/store");
      await persistStore(store);
      return NextResponse.json({ error: "Authenticator code is invalid or has already been used." }, { status: 401 });
    }
    if (error instanceof Error && error.message === "MFA_REQUIRED") {
      return NextResponse.json({ error: "Enter your 6-digit authenticator code to continue." }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to complete account action." }, { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 400 });
  }
}
