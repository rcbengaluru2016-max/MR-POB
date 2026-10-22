import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { clearAuthFailures, isAuthRateLimited, recordAuthFailure } from "@/lib/server/auth-limits";
import { getSessionSecret } from "@/lib/server/session-token";
import { transactStore } from "@/lib/server/store";

const digest = (value: string) => createHmac("sha256", getSessionSecret()).update(value).digest("hex");
const same = (a: string, b: string) => {
  const left = Buffer.from(a, "hex"); const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
};

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = `customer-activation-verify:${createHash("sha256").update(ip).digest("hex")}`;
  if (isAuthRateLimited(key)) return NextResponse.json({ error: "Verification failed. Request a new code or try again later." }, { status: 429 });
  let body: { challengeId?: string; code?: string };
  try { body = await request.json(); } catch { recordAuthFailure(key); return NextResponse.json({ error: "Invalid verification code." }, { status: 400 }); }
  const id = body.challengeId ?? ""; const code = body.code ?? "";
  const token = randomBytes(32).toString("base64url");
  const result = await transactStore((store) => {
    const challenge = store.customerActivationChallenges.find((item) => item.id === id);
    if (!challenge || !/^\d{6}$/.test(code) || !challenge.registrationId || !challenge.accountUsername || challenge.verifiedAt || challenge.attempts >= 5 || Date.parse(challenge.expiresAt) <= Date.now() || !same(challenge.otpHash, digest(`${id}:${code}`))) {
      if (challenge && challenge.attempts < 5) challenge.attempts += 1;
      return false;
    }
    const registration = store.registrations.find((item) => item.kind === "customer" && item.id === challenge.registrationId && item.status === "approved");
    const master = store.masters.find((item) => item.kind === "customer" && item.registrationId === challenge.registrationId);
    const account = store.accounts.find((item) => item.username === challenge.accountUsername && item.userType === "customer" && item.status !== "locked" && item.status !== "inactive");
    if (!registration || !master || !account) return false;
    challenge.verifiedAt = new Date().toISOString();
    challenge.activationTokenHash = digest(token);
    challenge.activationTokenExpiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    return true;
  });
  if (!result) {
    recordAuthFailure(key);
    return NextResponse.json({ error: "Invalid or expired verification code." }, { status: 400 });
  }
  clearAuthFailures(key);
  const response = NextResponse.json({ verified: true });
  response.cookies.set("zenex_customer_activation", token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 15 * 60 });
  return response;
}
