import assert from "node:assert/strict";
import test from "node:test";
import { createCustomerDetailsClient, customerChangesSchema, customerIdentitySchema, validateShopPhoto } from "../lib/auth/customer-details.ts";
const endpoints = { requestOtp: "/test/customer/request", verifyOtp: "/test/customer/verify", profile: "/test/customer/profile", save: "/test/customer/save", requestMobileOtp: "/test/customer/mobile/request", verifyMobileOtp: "/test/customer/mobile/verify" };
const future = () => new Date(Date.now() + 300000).toISOString();
const challenge = () => ({ ok: true, channel: "whatsapp", challengeId: "test-challenge", expiresAt: future(), resendAfterSeconds: 60 });
const grant = () => ({ ok: true, verified: true, customerCode: "TEST-CUSTOMER", verificationToken: "test-session-token".padEnd(40, "x"), expiresAt: future() });
const profile = () => ({ customerCode: "TEST-CUSTOMER", customerName: "Test Customer", businessName: "Test Pharmacy", customerType: "Retail Pharmacy", mobile: "9876543210", email: "test@example.invalid", addressLine1: "Test Address", pinCode: "560001", dlNumber1: "DL-1", gstNumber: "TEST-GST", creditDays: "same_day_3", paymentMethod: "Cash" });
const updates = () => ({ addressLine1: "New Test Address", addressLine2: "", addressLine3: "", addressLine4: "", pinCode: "560002", mobile: "9876543210" });
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });

test("customer identity, address, phone, and shop photo validation", () => {
  assert.equal(customerIdentitySchema.safeParse({ identifier: "", mobile: "123" }).success, false);
  assert.equal(customerIdentitySchema.safeParse({ identifier: "TEST-CUSTOMER", mobile: "9876543210" }).success, true);
  assert.equal(customerChangesSchema.safeParse(updates()).success, true);
  assert.equal(customerChangesSchema.safeParse({ ...updates(), pinCode: "abc" }).success, false);
  assert.equal(validateShopPhoto({ type: "image/png", size: 100 }), null);
  assert.match(validateShopPhoto({ type: "application/pdf", size: 100 }), /JPEG/);
  assert.match(validateShopPhoto({ type: "image/jpeg", size: 6 * 1024 * 1024 }), /5 MB/);
});

test("missing configuration does not send requests or simulate OTP delivery", async () => {
  let calls = 0;
  const client = createCustomerDetailsClient({}, async () => { calls++; return json({}); });
  await assert.rejects(client.requestOtp({ identifier: "TEST-CUSTOMER", mobile: "9876543210" }), /not connected/);
  assert.equal(calls, 0);
  await assert.rejects(createCustomerDetailsClient({ ...endpoints, requestOtp: "https://other.example" }).requestOtp({ identifier: "TEST-CUSTOMER", mobile: "9876543210" }), /configuration/);
});

test("unverified and expired sessions cannot retrieve customer data", async () => {
  let calls = 0;
  const client = createCustomerDetailsClient(endpoints, async () => { calls++; return json({}); });
  await assert.rejects(client.profile({ ...grant(), verified: false }), /Verify/);
  await assert.rejects(client.profile({ ...grant(), expiresAt: "2000-01-01T00:00:00.000Z" }), /expired/);
  assert.equal(calls, 0);
});

test("OTP verification requires a fresh explicit confirmation, not a generic success", async () => {
  for (const body of [{ ok: true }, { ...grant(), verified: false }, { ...grant(), expiresAt: "2000-01-01T00:00:00.000Z" }]) {
    await assert.rejects(createCustomerDetailsClient(endpoints, async () => json(body)).verifyOtp(challenge(), "012345"), /confirm|expired/);
  }
});

test("a profile from another customer cannot be displayed", async () => {
  const client = createCustomerDetailsClient(endpoints, async () => json({ ok: true, profile: { ...profile(), customerCode: "OTHER" } }));
  await assert.rejects(client.profile(grant()), /do not match/);
});

test("a changed mobile needs fresh matching verification before saving", async () => {
  let calls = 0;
  const client = createCustomerDetailsClient(endpoints, async () => { calls++; return json({}); });
  const changed = { ...updates(), mobile: "9876543211" };
  await assert.rejects(client.save(grant(), profile(), changed, {}), /Verify the new/);
  await assert.rejects(client.save(grant(), profile(), changed, {}, { ...grant(), mobile: "9876543212" }), /Verify the new/);
  await assert.rejects(client.save(grant(), profile(), changed, {}, { ...grant(), mobile: changed.mobile, expiresAt: "2000-01-01T00:00:00.000Z" }), /expired/);
  await assert.rejects(client.save(grant(), profile(), changed, {}, { ...grant(), customerCode: "OTHER", mobile: changed.mobile }), /Verify the new/);
  assert.equal(calls, 0);
});

test("save strips forbidden customer fields and excludes unchanged photos", async () => {
  let payload;
  const client = createCustomerDetailsClient(endpoints, async (_url, init) => { payload = JSON.parse(init.body); return json({ ok: true, saved: true, customerCode: "TEST-CUSTOMER" }); });
  await client.save(grant(), profile(), { ...updates(), customerCode: "FORGED", businessName: "FORGED", password: "FORGED", email: "forged@example.invalid" }, { dl1: { name: "FORGED" } });
  assert.deepEqual(Object.keys(payload.updates).sort(), Object.keys(updates()).sort());
  assert.deepEqual(payload.photos, {});
  assert.equal(JSON.stringify(payload).includes("FORGED"), false);
});

test("HTTP 200 alone never confirms a save or a mobile verification", async () => {
  await assert.rejects(createCustomerDetailsClient(endpoints, async () => json({ ok: true })).save(grant(), profile(), updates(), {}), /did not confirm/);
  await assert.rejects(createCustomerDetailsClient(endpoints, async () => json({ ok: true, saved: true, customerCode: "OTHER" })).save(grant(), profile(), updates(), {}), /did not confirm/);
  await assert.rejects(createCustomerDetailsClient(endpoints, async () => json({ ...grant(), mobile: "9876543212" })).verifyMobileOtp(grant(), challenge(), "9876543211", "012345"), /does not match/);
});

test("safe errors preserve server cooldown without leaking private details", async () => {
  const client = createCustomerDetailsClient(endpoints, async () => json({ code: "TOO_MANY_ATTEMPTS", error: "private account data" }, 429, { "Retry-After": "90" }));
  await assert.rejects(client.requestOtp({ identifier: "TEST", mobile: "9876543210" }), (error) => error.retryAfterSeconds === 90 && !error.message.includes("private"));
});

test("verified mobile proof is sent only in a non-cached save body", async () => {
  let payload;
  const client = createCustomerDetailsClient(endpoints, async (url, init) => { assert.equal(url, endpoints.save); assert.equal(init.method, "POST"); assert.equal(init.cache, "no-store"); assert.equal(init.credentials, "same-origin"); payload = JSON.parse(init.body); return json({ ok: true, saved: true, customerCode: "TEST-CUSTOMER" }); });
  const mobileProof = { ...grant(), mobile: "9876543211" };
  await client.save(grant(), profile(), { ...updates(), mobile: mobileProof.mobile }, {}, mobileProof);
  assert.equal(payload.mobileVerificationToken, mobileProof.verificationToken);
});
