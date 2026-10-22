import { createHash, createHmac, randomInt, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isAuthRateLimited, recordAuthFailure } from "@/lib/server/auth-limits";
import { isSmsConfigured, sendCustomerActivationCode } from "@/lib/server/sms";
import { getSessionSecret } from "@/lib/server/session-token";
import { transactStore } from "@/lib/server/store";

const generic = { message: "If the details match an eligible customer account, a verification code will be sent." };
const digest = (value: string) => createHmac("sha256", getSessionSecret()).update(value).digest("hex");

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateKey = `customer-activation-request:${createHash("sha256").update(ip).digest("hex")}`;
  if (isAuthRateLimited(rateKey)) return NextResponse.json(generic);
  let body: { customerCode?: string; mobile?: string; challengeId?: string };
  try { body = await request.json(); } catch { recordAuthFailure(rateKey); return NextResponse.json(generic); }
  if (body.challengeId) {
    const state = await transactStore((store) => {
      const challenge = store.customerActivationChallenges.find((item) => item.id === body.challengeId);
      if (!challenge || !challenge.registrationId || !challenge.accountUsername || challenge.verifiedAt || Date.parse(challenge.expiresAt) <= Date.now() || challenge.sends >= 3 || Date.now() - Date.parse(challenge.lastSentAt) < 60_000) return null;
      const registration = store.registrations.find((item) => item.kind === "customer" && item.id === challenge.registrationId && item.status === "approved");
      const master = store.masters.find((item) => item.kind === "customer" && item.registrationId === challenge.registrationId);
      const account = store.accounts.find((item) => item.username === challenge.accountUsername && item.userType === "customer" && item.status !== "locked" && item.status !== "inactive");
      if (!registration || registration.kind !== "customer" || !master || !account) return null;
      return { id: challenge.id, mobile: registration.mobile, registrationId: registration.id, username: account.username };
    });
    if (state) {
      const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const sent = await sendCustomerActivationCode(state.mobile, otp);
      if (sent) await transactStore((store) => {
        const challenge = store.customerActivationChallenges.find((item) => item.id === state.id);
        if (!challenge) return;
        challenge.otpHash = digest(`${state.id}:${otp}`);
        challenge.expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
        challenge.sends += 1;
        challenge.attempts = 0;
        challenge.lastSentAt = new Date().toISOString();
      });
    }
    return NextResponse.json(generic);
  }
  const code = body.customerCode?.trim().toUpperCase() ?? "";
  const mobile = body.mobile?.replace(/\D/g, "") ?? "";
  if (!code || !/^[6-9]\d{9}$/.test(mobile)) {
    recordAuthFailure(rateKey);
    return NextResponse.json(generic);
  }
  if (!isSmsConfigured()) return NextResponse.json({ error: "SMS delivery is not configured. Please contact support." }, { status: 503 });

  const eligible = await transactStore((store) => {
    const master = store.masters.find((item) => item.kind === "customer" && item.code.toUpperCase() === code);
    const registration = master && store.registrations.find((item) => item.kind === "customer" && item.id === master.registrationId && item.status === "approved");
    const account = master && store.accounts.find((item) => item.userType === "customer" && item.masterCode === master.code && item.status !== "locked" && item.status !== "inactive");
    return registration?.kind === "customer" && account && registration.mobile === mobile && master?.mobile === mobile
      ? { registrationId: registration.id, username: account.username }
      : null;
  });

  const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const id = randomUUID();
  const sent = eligible ? await sendCustomerActivationCode(mobile, otp) : false;
  await transactStore((store) => {
    store.customerActivationChallenges = store.customerActivationChallenges.filter((item) => Date.now() - Date.parse(item.createdAt) < 30 * 60_000);
    store.customerActivationChallenges.unshift({
      id,
      registrationId: sent ? eligible?.registrationId : undefined,
      accountUsername: sent ? eligible?.username : undefined,
      otpHash: digest(`${id}:${otp}`),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      attempts: 0,
      sends: 1,
      lastSentAt: new Date().toISOString(),
    });
  });
  recordAuthFailure(rateKey);
  return NextResponse.json({ ...generic, challengeId: id });
}
