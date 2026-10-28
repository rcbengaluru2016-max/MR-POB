import test from "node:test";
import assert from "node:assert/strict";
import { rejectRegistrationState, cleanupRejectionsState } from "../lib/server/workflow-state.ts";
import { validateRejection } from "../lib/rejection-reasons.ts";
for (const kind of ["customer", "company", "patient"]) test(`${kind} rejection is durable, idempotent and expires without removing profiles or documents`, () => {
  const row = { id: kind, kind, status: "pending_verification", mobile: "9876543210", customerName: "Customer", adminFullName: "Admin", patientName: "Patient", files: { proof: "original" } };
  const store = { registrations: [row], masters: [], accounts: [], audit: [] };
  const input = { reasonCode: "INCOMPLETE_INFORMATION" };
  rejectRegistrationState(store, kind, "admin", input);
  const expiry = row.rejectionExpiresAt;
  rejectRegistrationState(store, kind, "other-admin", input);
  assert.equal(row.rejectionExpiresAt, expiry);
  assert.equal(store.registrationNotifications.length, 1);
  assert.equal(store.registrationNotifications[0].status, "NOT_CONFIGURED");
  assert.equal(store.audit.length, 1);
  assert.equal(cleanupRejectionsState(store, new Date(new Date(expiry).getTime() - 1)), 0);
  assert.equal(cleanupRejectionsState(store, new Date(expiry)), 1);
  assert.equal(cleanupRejectionsState(store, new Date(expiry)), 0);
  assert.equal(row.rejectionReason, undefined);
  assert.equal(row.status, "rejected");
  assert.deepEqual(row.files, { proof: "original" });
  assert.equal(store.registrationNotifications[0].status, "EXPIRED");
  assert.deepEqual(store.registrationNotifications[0].variables, []);
});
test("custom review and sensitive information checks also protect the local endpoint", () => {
  assert.throws(() => validateRejection({ reasonCode: "OTHER", reason: "Please correct address" }));
  assert.throws(() => validateRejection({ reasonCode: "OTHER", reasonReviewed: true, reason: "Contact test@example.test" }));
  assert.throws(() => validateRejection({ reasonCode: "MISSING_DOCUMENTS" }, "patient"));
});

test("legacy rejection with no timestamp receives one conservative deadline without restarting it", () => {
  const row = { id: "legacy", kind: "patient", status: "rejected", rejectionReason: "Please correct the address." };
  const store = { registrations: [row], audit: [] };
  const now = new Date("2026-10-26T00:00:00Z");
  assert.equal(cleanupRejectionsState(store, now), 0);
  const deadline = row.rejectionExpiresAt;
  assert.equal(deadline, "2026-11-25T00:00:00.000Z");
  assert.equal(cleanupRejectionsState(store, new Date(now.getTime() + 1000)), 0);
  assert.equal(row.rejectionExpiresAt, deadline);
  assert.equal(cleanupRejectionsState(store, new Date(deadline)), 1);
  assert.equal(cleanupRejectionsState(store, new Date(deadline)), 0);
  assert.equal(row.rejectionExpiresAt, undefined);
});
