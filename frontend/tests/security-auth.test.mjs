import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { hashPassword, isCurrentPasswordHash, verifyPassword } from "../lib/crypto.ts";
import { clearAuthFailures, isAuthRateLimited, recordAuthFailure } from "../lib/server/auth-limits.ts";
import { readSessionToken, signSession } from "../lib/server/session-token.ts";
import { verifyTotpCounter } from "../lib/server/totp.ts";

test("passwords use PBKDF2 and still verify existing legacy hashes", async () => {
  const salt = "test-salt-unique";
  const modern = await hashPassword("Secure-Test-Password-42!", salt);
  assert.equal(isCurrentPasswordHash(modern), true);
  assert.equal(await verifyPassword("Secure-Test-Password-42!", salt, modern), true);
  assert.equal(await verifyPassword("wrong-password", salt, modern), false);

  const legacy = createHash("sha256").update(`${salt}:Legacy-Password-42`).digest("hex");
  assert.equal(await verifyPassword("Legacy-Password-42", salt, legacy), true);
  assert.equal(await verifyPassword("wrong-password", salt, legacy), false);
});

test("TOTP verifies RFC 6238 codes and rejects replayed counters", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(verifyTotpCounter(secret, "287082", 59_000), 1);
  assert.equal(verifyTotpCounter(secret, "287082", 59_000, 1), null);
  assert.equal(verifyTotpCounter(secret, "000000", 59_000), null);
});

test("authenticator challenges have a valid signature and role", () => {
  const user = { username: "rcbengaluru2016@gmail.com", userType: "super_admin", displayName: "Super Admin" };
  const token = signSession(user);
  assert.deepEqual(readSessionToken(token), user);
  assert.equal(readSessionToken(`${token}x`), null);
});

test("repeated authentication failures trigger temporary throttling", () => {
  const key = `security-test:${randomUUID()}`;
  assert.equal(isAuthRateLimited(key), false);
  for (let i = 0; i < 5; i += 1) recordAuthFailure(key);
  assert.equal(isAuthRateLimited(key), true);
  clearAuthFailures(key);
  assert.equal(isAuthRateLimited(key), false);
});
