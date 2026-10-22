import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSalt, hashPassword } from "@/lib/crypto";
import { transactStore } from "@/lib/server/store";

export const instant = false;
const schema = z.object({ token: z.string().min(32).max(128), password: z.string().min(12).max(128), confirmPassword: z.string() }).refine((data) => data.password === data.confirmPassword, { message: "Passwords do not match.", path: ["confirmPassword"] });
const strong = (value: string) => /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Choose a valid password." }, { status: 400 });
  if (!strong(parsed.data.password)) return NextResponse.json({ error: "Use at least 12 characters, including uppercase, lowercase, a number, and a symbol." }, { status: 400 });
  try {
    await transactStore(async (store) => {
      const digest = createHash("sha256").update(parsed.data.token).digest("hex");
      const reset = store.passwordResetTokens.find((item) => item.tokenHash === digest && !item.usedAt && Date.parse(item.expiresAt) > Date.now());
      if (!reset) throw new Error("This reset link is invalid, expired, or has already been used. Request a new link.");
      const account = store.accounts.find((item) => item.username.toLowerCase() === reset.username.toLowerCase());
      if (!account || account.status === "inactive") throw new Error("This account cannot reset its password. Contact the administrator.");
      const salt = createSalt();
      account.passwordSalt = salt;
      account.passwordHash = await hashPassword(parsed.data.password, salt);
      reset.usedAt = new Date().toISOString();
      store.audit.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), actor: account.username, action: "account_password_reset_completed" });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to reset password." }, { status: 400 });
  }
}
