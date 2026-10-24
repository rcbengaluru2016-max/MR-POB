import assert from "node:assert/strict";
import test from "node:test";
import { createPasswordRecoveryClient, recoveryIdentitySchema, recoveryOtpSchema, recoveryPasswordSchema } from "../lib/auth/password-recovery.ts";

const endpoints = { requestOtp: "/test/recovery/request", verifyOtp: "/test/recovery/verify", resetPassword: "/test/recovery/reset" };
const identity = { identifier: "TEST-USER", mobile: "+919876543210" };
const challenge = () => ({ ok: true, channel: "whatsapp", challengeId: "test-challenge", expiresAt: new Date(Date.now() + 300000).toISOString(), resendAfterSeconds: 60 });
const grant = () => ({ ok: true, verified: true, resetToken: "test-token-".padEnd(40, "x"), expiresAt: new Date(Date.now() + 300000).toISOString() });
const passwords = { password: "Test-Password-42!", confirmPassword: "Test-Password-42!" };
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", ...headers } });

test("identity requires an identifier and international mobile number, preserving the country code", () => {
  assert.equal(recoveryIdentitySchema.safeParse({ identifier: "", mobile: "123" }).success, false);
  assert.equal(recoveryIdentitySchema.safeParse({ ...identity, mobile: "9876543210" }).success, false);
  assert.deepEqual(recoveryIdentitySchema.parse({ identifier: " TEST-USER ", mobile: "+91 (98765) 43210" }), identity);
  assert.equal(recoveryOtpSchema.safeParse("012345").success, true);
  assert.equal(recoveryOtpSchema.safeParse("12345").success, false);
});

test("passwords require length, complexity, and an exact match", () => {
  assert.equal(recoveryPasswordSchema.safeParse(passwords).success, true);
  for (const password of ["short", "alllowercase12!", "ALLUPPERCASE12!", "NoDigitsHere!", "NoSymbolsHere42", "a".repeat(129)]) {
    assert.equal(recoveryPasswordSchema.safeParse({ password, confirmPassword: password }).success, false);
  }
  assert.equal(recoveryPasswordSchema.safeParse({ ...passwords, confirmPassword: "different" }).success, false);
});

test("missing or cross-origin endpoints never send identity or credentials", async () => {
  let calls = 0;
  const transport = async () => { calls++; throw new Error("Unexpected request"); };
  for (const config of [{}, { ...endpoints, verifyOtp: undefined }, { ...endpoints, resetPassword: "https://other.example/reset" }, { ...endpoints, requestOtp: "//other.example/request" }]) {
    await assert.rejects(createPasswordRecoveryClient(config, transport).requestOtp(identity), /not connected|configuration/);
  }
  assert.equal(calls, 0);
});

test("a legacy recovery message or malformed success cannot advance to OTP", async () => {
  for (const result of [{ message: "Recovery can be configured" }, { ...challenge(), ok: false }, { ...challenge(), channel: "email" }, { ...challenge(), resendAfterSeconds: 0 }]) {
    await assert.rejects(createPasswordRecoveryClient(endpoints, async () => json(result)).requestOtp(identity), /did not confirm/);
  }
});

test("only an explicit successful verification yields a reset grant", async () => {
  for (const result of [{ ok: true }, { ...grant(), verified: false }, { ...grant(), resetToken: "" }]) {
    await assert.rejects(createPasswordRecoveryClient(endpoints, async () => json(result)).verifyOtp(challenge(), "012345"), /did not confirm/);
  }
});

test("expired challenges and grants cannot be used", async () => {
  let calls = 0;
  const client = createPasswordRecoveryClient(endpoints, async () => { calls++; return json({}); });
  const expiresAt = "2000-01-01T00:00:00.000Z";
  await assert.rejects(client.verifyOtp({ ...challenge(), expiresAt }, "012345"), /expired/);
  await assert.rejects(client.resetPassword({ ...grant(), expiresAt }, passwords), /expired/);
  await assert.rejects(client.resetPassword({ ...grant(), verified: false }, passwords), /Verify/);
  assert.equal(calls, 0);
  await assert.rejects(createPasswordRecoveryClient(endpoints, async () => json({ ...challenge(), expiresAt })).requestOtp(identity), /expired/);
  await assert.rejects(createPasswordRecoveryClient(endpoints, async () => json({ ...grant(), expiresAt })).verifyOtp(challenge(), "012345"), /expired/);
});

test("rate limits preserve the server cooldown and avoid exposing server details", async () => {
  const client = createPasswordRecoveryClient(endpoints, async () => json({ code: "TOO_MANY_ATTEMPTS", error: "private account details" }, 429, { "Retry-After": "90" }));
  await assert.rejects(client.requestOtp(identity), (error) => error.retryAfterSeconds === 90 && /Too many attempts/.test(error.message) && !error.message.includes("private"));
  for (const [code, message] of [["INVALID_OTP", /invalid/], ["OTP_EXPIRED", /expired/]]) {
    await assert.rejects(createPasswordRecoveryClient(endpoints, async () => json({ code }, 400)).verifyOtp(challenge(), "012345"), message);
  }
});

test("password reset requires explicit backend completion, not just HTTP success", async () => {
  for (const result of [{ ok: true }, { ok: true, passwordReset: false }]) {
    await assert.rejects(createPasswordRecoveryClient(endpoints, async () => json(result)).resetPassword(grant(), passwords), /did not confirm/);
  }
});

test("confirmed workflow sends challenge and token only in non-cached POST bodies", async () => {
  const calls = [];
  const token = grant();
  const results = [challenge(), token, { ok: true, passwordReset: true }];
  const client = createPasswordRecoveryClient(endpoints, async (url, init) => { calls.push({ url, init }); return json(results.shift()); });
  const sent = await client.requestOtp(identity);
  const verified = await client.verifyOtp(sent, "012345");
  await client.resetPassword(verified, passwords);
  assert.deepEqual(calls.map(({ url }) => url), Object.values(endpoints));
  assert.deepEqual(JSON.parse(calls[1].init.body), { challengeId: sent.challengeId, otp: "012345" });
  assert.deepEqual(JSON.parse(calls[2].init.body), { token: token.resetToken, ...passwords });
  for (const { url, init } of calls) { assert.equal(init.method, "POST"); assert.equal(init.cache, "no-store"); assert.equal(init.credentials, "same-origin"); assert.equal(url.includes("012345"), false); }
});

test("cancelled requests cannot advance the recovery workflow", async () => {
  const controller = new AbortController();
  const client = createPasswordRecoveryClient(endpoints, async () => { controller.abort(); return json(challenge()); });
  await assert.rejects(client.requestOtp(identity, controller.signal), (error) => error.name === "AbortError");
});
