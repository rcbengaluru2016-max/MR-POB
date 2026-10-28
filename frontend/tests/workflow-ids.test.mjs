import assert from "node:assert/strict";
import test from "node:test";
import { approveRegistrationState, nextRegistrationIdState, rejectRegistrationState, submitRegistrationState } from "../lib/server/workflow-state.ts";
import { notificationLabel, notificationWasSent } from "../lib/notification-status.ts";
import { approvedBackendProfile } from "../lib/server/backend-profile.ts";

const store = () => ({ counters: {}, registrations: [], masters: [], accounts: [], audit: [] });
const registration = (kind, id, extra = {}) => ({
  kind, id, status: "pending_verification", submittedAt: "2026-10-26T00:00:00.000Z",
  mobile: kind === "customer" ? "9876543210" : kind === "patient" ? "9876543211" : "9876543212",
  email: `${kind}@example.invalid`, passwordHash: "saved-password-hash", passwordSalt: "saved-salt",
  customerName: "Customer Owner", businessName: "Pharmacy", patientName: "Patient Name", adminFullName: "Company Admin", companyName: "Company Name",
  files: { proof: { name: "proof.pdf", dataUrl: "/proof.pdf" } }, ...extra,
});

test("registration submissions share one sequence and retain legacy IDs", () => {
  const data = store();
  data.registrations.push(registration("customer", "REG-CUS-existing-uuid"));
  const ids = ["customer", "patient", "company"].map((kind) => nextRegistrationIdState(data, kind));
  assert.deepEqual(ids, ["REG-CUS-ZI0001", "REG-PAT-ZI0002", "REG-COM-ZI0003"]);
  assert.equal(data.registrations[0].id, "REG-CUS-existing-uuid");
  data.registrations.push(registration("patient", "REG-PAT-ZI9999"));
  assert.equal(nextRegistrationIdState(data, "company"), "REG-COM-ZI10000");
});

test("duplicate submissions and rejected or pending records never gain a Master Code", () => {
  const data = store();
  const row = registration("customer", nextRegistrationIdState(data, "customer"));
  submitRegistrationState(data, row);
  assert.throws(() => submitRegistrationState(data, { ...row }), /ID already exists/);
  assert.throws(() => submitRegistrationState(data, { ...row, id: nextRegistrationIdState(data, "customer") }), /already exists/);
  assert.equal(data.masters.length, 0);
  rejectRegistrationState(data, row.id, "admin", { reasonCode: "UNREADABLE_DOCUMENTS" });
  assert.throws(() => approveRegistrationState(data, row.id, "admin"), /Only pending/);
  assert.equal(data.accounts.length, 0);
  assert.equal(data.registrationNotifications.length, 1);
  assert.equal(data.registrationNotifications[0].event, "REJECTED");
});

test("approval order has an independent shared sequence and preserves each profile, password and audit", () => {
  const data = store();
  for (const kind of ["patient", "company", "customer"]) submitRegistrationState(data, registration(kind, nextRegistrationIdState(data, kind)));
  const rows = [...data.registrations];
  const outputs = ["customer", "company", "patient"].map((kind) => approveRegistrationState(data, rows.find((row) => row.kind === kind).id, "reviewer"));
  assert.deepEqual(outputs.map((output) => output.master.code), ["ZI0001", "ZI0002", "ZI0003"]);
  for (const { record, master, account } of outputs) {
    assert.equal(record.status, "approved");
    assert.equal(record.decidedBy, "reviewer");
    assert.ok(record.decidedAt);
    assert.equal(master.registrationId, record.id);
    assert.deepEqual(master.files, record.files);
    assert.equal(account.username, master.code);
    assert.equal(account.passwordHash, "saved-password-hash");
    assert.equal(account.passwordSalt, "saved-salt");
    assert.equal(account.status, "active");
  }
  const replay = approveRegistrationState(data, outputs[0].record.id, "different reviewer");
  assert.equal(replay.master.code, "ZI0001");
  assert.equal(replay.record.decidedBy, "reviewer");
  assert.equal(data.masters.length, 3);
  assert.equal(data.accounts.length, 3);
  assert.equal(data.registrationNotifications.length, 3);
  assert.equal(data.audit.filter((event) => event.action === "registration_approved").length, 3);
});

test("approved notification templates use names, Master Codes, company and registered WhatsApp destination", () => {
  const data = store();
  for (const kind of ["customer", "patient", "company"]) {
    const row = registration(kind, nextRegistrationIdState(data, kind));
    submitRegistrationState(data, row);
    approveRegistrationState(data, row.id, "reviewer");
  }
  assert.deepEqual(data.registrationNotifications.map((event) => [event.templateKey, event.variables, event.recipient]), [
    ["customer_registration_approved", ["Customer Owner", "ZI0001"], "+919876543210"],
    ["patient_registration_approved", ["Patient Name", "ZI0002"], "+919876543211"],
    ["company_admin_approved", ["Company Admin", "Company Name", "ZI0003"], "+919876543212"],
  ]);
  assert.ok(data.registrationNotifications.every((event) => event.status === "NOT_CONFIGURED" && event.attempts === 0));
  assert.equal(JSON.stringify(data.registrationNotifications).includes("password"), false);
  assert.equal(data.masters.length, 3);
});

test("imported Master Codes and usernames advance the sequence beyond 9999", () => {
  const data = store();
  data.accounts.push({ username: "zi9999" });
  const row = registration("company", nextRegistrationIdState(data, "company"));
  submitRegistrationState(data, row);
  assert.equal(approveRegistrationState(data, row.id, "reviewer").master.code, "ZI10000");
});

test("only provider-confirmed success can complete the Message Sent workflow", () => {
  for (const status of [undefined, "NOT_CONFIGURED", "PENDING", "RETRY", "PROCESSING", "MOCKED", "BLOCKED", "UNKNOWN", "FAILED"]) {
    assert.equal(notificationWasSent(status), false, String(status));
    assert.notEqual(notificationLabel(status), "Message Sent");
  }
  assert.equal(notificationWasSent("ACCEPTED"), true);
  assert.equal(notificationWasSent("DELIVERED"), true);
  assert.equal(notificationLabel("MOCKED"), "Test Only — Not Sent");
});

test("backend approved sections reuse the authoritative Master Code and retained legacy username", () => {
  const source = {
    id: "REG-COM-existing-uuid", kind: "company", status: "APPROVED", masterCode: "ZI0042",
    accountUsername: "legacy-company-login", accountStatus: "active", adminFullName: "Company Admin", companyName: "Company Name",
    email: "company@example.invalid", decidedAt: "2026-10-26T10:00:00.000Z", decidedById: "reviewer-id",
  };
  const { master, account } = approvedBackendProfile(source);
  assert.equal(master.code, "ZI0042");
  assert.equal(master.registrationId, source.id);
  assert.equal(master.approvedBy, "reviewer-id");
  assert.equal(account.username, "legacy-company-login");
  assert.equal(account.masterCode, "ZI0042");
  assert.equal(account.registrationId, master.registrationId);
  assert.equal(account.displayName, "Company Admin");
  assert.equal(account.status, "active");
  assert.equal(source.status, "APPROVED");
});
