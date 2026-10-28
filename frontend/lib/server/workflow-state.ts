import { validateRejection } from "../rejection-reasons.ts";
import type { AppStore } from "./store";
import type {
  AccountRecord,
  MasterRecord,
  RegistrationRecord,
} from "@/lib/types";

function addAudit(
  store: AppStore,
  event: Omit<AppStore["audit"][number], "id" | "at">,
) {
  store.audit.unshift({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    ...event,
  });
}

export function submitRegistrationState(store: AppStore, record: RegistrationRecord) {
  if (store.registrations.some((item) => item.id === record.id)) throw new Error("Registration ID already exists");
  const duplicate = store.registrations.find((item) => {
    if (item.status === "rejected") return false;
    if (item.mobile === record.mobile) return true;
    if ("email" in item && "email" in record && item.email && record.email) {
      return item.email.toLowerCase() === record.email.toLowerCase();
    }
    return false;
  });
  if (duplicate) {
    throw new Error("A registration already exists for this mobile number or email.");
  }
  store.registrations.unshift(record);
  addAudit(store, {
    actor: record.id,
    action: "registration_submitted",
    registrationId: record.id,
    detail: `${record.kind} submitted`,
  });
  return record;
}

const prefixes = { customer: "REG-CUS", company: "REG-COM", patient: "REG-PAT" } as const;

/** Existing identifiers stay untouched; imported new-format identifiers advance the high-water mark. */
export function nextRegistrationIdState(store: AppStore, kind: RegistrationRecord["kind"]) {
  const maximum = store.registrations.reduce((max, record) => {
    const match = /^REG-(?:CUS|COM|PAT)-ZI(\d+)$/.exec(record.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, store.counters.registration ?? 0);
  const next = maximum + 1;
  if (!Number.isSafeInteger(next)) throw new Error("Registration sequence exhausted");
  store.counters.registration = next;
  return `${prefixes[kind]}-ZI${String(next).padStart(4, "0")}`;
}

function nextMasterCode(store: AppStore) {
  const values = [...store.masters.map((master) => master.code), ...store.accounts.map((account) => account.username)];
  const maximum = values.reduce((max, code) => {
    const match = /^ZI(\d+)$/i.exec(code);
    return match ? Math.max(max, Number(match[1])) : max;
  }, store.counters.master ?? 0);
  const next = maximum + 1;
  if (!Number.isSafeInteger(next)) throw new Error("Master sequence exhausted");
  store.counters.master = next;
  return `ZI${String(next).padStart(4, "0")}`;
}

function displayName(record: RegistrationRecord) {
  if (record.kind === "customer") return record.customerName;
  if (record.kind === "company") return record.adminFullName;
  return record.patientName;
}

function toMaster(record: RegistrationRecord, code: string, actor: string): MasterRecord {
  const now = new Date().toISOString();
  if (record.kind === "customer") {
    return {
      kind: "customer",
      code,
      registrationId: record.id,
      createdAt: now,
      approvalDate: now,
      approvedBy: actor,
      status: "active",
      customerName: record.customerName,
      mobile: record.mobile,
      email: record.email,
      businessName: record.businessName,
      customerType: record.customerType,
      address: record.address,
      addressLine1: record.addressLine1,
      addressLine2: record.addressLine2,
      addressLine3: record.addressLine3,
      addressLine4: record.addressLine4,
      pinCode: record.pinCode,
      addressType: record.addressType,
      dlNumber1: record.dlNumber1,
      dlNumber2: record.dlNumber2,
      dlNumber3: record.dlNumber3,
      fssaiNumber: record.fssaiNumber,
      gstNumber: record.gstNumber,
      creditDays: record.creditDays,
      paymentMethod: record.paymentMethod,
      files: record.files,
    };
  }
  if (record.kind === "company") {
    return {
      kind: "company",
      code,
      registrationId: record.id,
      createdAt: now,
      approvalDate: now,
      approvedBy: actor,
      status: "active",
      companyName: record.companyName,
      division: record.division,
      headquarter: record.headquarter,
      adminFullName: record.adminFullName,
      mobile: record.mobile,
      email: record.email,
      files: record.files,
    };
  }
  return {
    kind: "patient",
    code,
    registrationId: record.id,
    createdAt: now,
    approvalDate: now,
    approvedBy: actor,
    status: "active",
    patientName: record.patientName,
    mobile: record.mobile,
    email: record.email,
    gender: record.gender,
    address: record.address,
    files: record.files,
    paymentMethod: record.paymentMethod,
  };
}

export function rejectRegistrationState(store: AppStore, id: string, actor: string, input: { reasonCode?: unknown; reason?: unknown; reasonReviewed?: unknown }) {
  const record = store.registrations.find((item) => item.id === id);
  if (!record) throw new Error("Registration not found");
  const { code, reason } = validateRejection(input, record.kind);
  if (record.status === "rejected") { cleanupRejectionsState(store); return record; }
  if (record.status !== "pending_verification") {
    throw new Error("Only pending registrations can be rejected");
  }
  record.status = "rejected";
  record.rejectionReason = reason;
  record.rejectionReasonCode = code;
  record.rejectionExpiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  record.decidedAt = new Date().toISOString();
  record.decidedBy = actor;
  addAudit(store, {
    actor,
    action: "registration_rejected",
    registrationId: id,
    detail: "Registration rejected; reason retained separately for 30 days",
  });
  const now = new Date().toISOString();
  store.registrationNotifications ??= [];
  store.registrationNotifications.push({ id: crypto.randomUUID(), registrationId: id, event: "REJECTED", recipient: `+91${record.mobile}`, templateKey: "registration_rejected", variables: [record.kind === "company" ? record.adminFullName : record.kind === "customer" ? record.customerName : record.patientName, { customer: "Customer", company: "Company Admin", patient: "Patient" }[record.kind], reason], status: "NOT_CONFIGURED", attempts: 0, createdAt: now, updatedAt: now });
  return record;
}

export function cleanupRejectionsState(store: AppStore, now = new Date()) {
  let count = 0;
  for (const record of store.registrations) {
    if (record.status !== "rejected" || (!record.rejectionReason && !record.rejectionReasonCode)) continue;
    const rejectedAt = record.decidedAt ?? store.audit.find(event => event.registrationId === record.id && event.action === "registration_rejected")?.at;
    // Initialize once for malformed legacy records; never use submission time.
    if (!record.rejectionExpiresAt && !rejectedAt) record.rejectionExpiresAt = new Date(now.getTime() + 30 * 86400000).toISOString();
    const expiry = record.rejectionExpiresAt ?? new Date(new Date(rejectedAt!).getTime() + 30 * 86400000).toISOString();
    if (new Date(expiry) > now || (!record.rejectionReason && !record.rejectionReasonCode)) continue;
    delete record.rejectionReason;
    delete record.rejectionReasonCode;
    delete record.rejectionExpiresAt;
    for (const notification of store.registrationNotifications ?? []) if (notification.registrationId === record.id && notification.event === "REJECTED") { notification.variables = []; notification.recipient = ""; notification.status = "EXPIRED"; }
    for (const event of store.audit) if (event.registrationId === record.id && event.action === "registration_rejected") event.detail = "Rejection details expired";
    count++;
  }
  return count;
}

export function approveRegistrationState(store: AppStore, id: string, actor: string) {
  const record = store.registrations.find((item) => item.id === id);
  if (!record) throw new Error("Registration not found");
  if (record.status === "approved") {
    const master = store.masters.find((item) => item.registrationId === id);
    const account = store.accounts.find((item) => item.registrationId === id);
    if (!master || !account) throw new Error("Approved registration requires account reconciliation");
    return { record, master, account, notification: store.registrationNotifications?.find((item) => item.registrationId === id) };
  }
  if (record.status !== "pending_verification") throw new Error("Only pending registrations can be approved");
  if (store.masters.some((item) => item.registrationId === id) || store.accounts.some((item) => item.registrationId === id)) {
    throw new Error("A master account is already linked to this registration");
  }

  record.status = "approved";
  record.decidedAt = new Date().toISOString();
  record.decidedBy = actor;
  addAudit(store, {
    actor,
    action: "registration_approved",
    registrationId: id,
  });

  const code = nextMasterCode(store);
  const master = toMaster(record, code, actor);
  store.masters.unshift(master);
  addAudit(store, {
    actor: "system",
    action: "master_created",
    registrationId: id,
    masterCode: code,
  });

  const account: AccountRecord = {
    username: code,
    userType: record.kind,
    masterCode: code,
    registrationId: record.id,
    email: record.email,
    passwordHash: record.passwordHash,
    passwordSalt: record.passwordSalt,
    status: "active",
    createdAt: new Date().toISOString(),
    displayName: displayName(record),
    passwordChangeRequired: record.kind === "customer" || record.kind === "patient",
  };
  store.accounts.unshift(account);
  addAudit(store, {
    actor: "system",
    action: "account_created",
    registrationId: id,
    masterCode: code,
    detail: "Master Code set as username; account activated",
  });

  const now = new Date().toISOString();
  const notification = {
    id: crypto.randomUUID(), registrationId: record.id, event: "APPROVED" as const,
    recipient: `+91${record.mobile}`,
    templateKey: record.kind === "company" ? "company_admin_approved" as const : record.kind === "customer" ? "customer_registration_approved" as const : "patient_registration_approved" as const,
    variables: record.kind === "company" ? [record.adminFullName, record.companyName, code] : [displayName(record), code],
    status: "NOT_CONFIGURED" as const, attempts: 0, createdAt: now, updatedAt: now,
  };
  store.registrationNotifications ??= [];
  store.registrationNotifications.push(notification);
  return { record, master, account, notification };
}
