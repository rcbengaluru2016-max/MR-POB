import { MASTER_PREFIX, REGISTRATION_PREFIX } from "@/lib/constants";
import type {
  AccountRecord,
  MasterRecord,
  RegistrationRecord,
} from "@/lib/types";
import { getStore, nextId, persistStore } from "./store";

function addAudit(
  store: Awaited<ReturnType<typeof getStore>>,
  event: Omit<Awaited<ReturnType<typeof getStore>>["audit"][number], "id" | "at">,
) {
  store.audit.unshift({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    ...event,
  });
}

export async function submitRegistration(record: RegistrationRecord) {
  const store = await getStore();
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
  await persistStore(store);
  return record;
}

export async function nextRegistrationId(kind: RegistrationRecord["kind"]) {
  const store = await getStore();
  if (kind === "customer") {
    store.counters.customerReg += 1;
    await persistStore(store);
    return nextId(REGISTRATION_PREFIX.customer, store.counters.customerReg);
  }
  if (kind === "company") {
    store.counters.companyReg += 1;
    await persistStore(store);
    return nextId(REGISTRATION_PREFIX.company, store.counters.companyReg);
  }
  store.counters.patientReg += 1;
  await persistStore(store);
  return nextId(REGISTRATION_PREFIX.patient, store.counters.patientReg);
}

function nextMasterCode(kind: RegistrationRecord["kind"], store: Awaited<ReturnType<typeof getStore>>) {
  if (kind === "customer") {
    store.counters.customerMaster += 1;
    return nextId(MASTER_PREFIX.customer, store.counters.customerMaster);
  }
  if (kind === "company") {
    store.counters.companyMaster += 1;
    return nextId(MASTER_PREFIX.company, store.counters.companyMaster);
  }
  store.counters.patientMaster += 1;
  return nextId(MASTER_PREFIX.patient, store.counters.patientMaster);
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

export async function rejectRegistration(id: string, actor: string, reason: string) {
  const store = await getStore();
  const record = store.registrations.find((item) => item.id === id);
  if (!record) throw new Error("Registration not found");
  if (record.status !== "pending_verification") {
    throw new Error("Only pending registrations can be rejected");
  }
  record.status = "rejected";
  record.rejectionReason = reason;
  record.decidedAt = new Date().toISOString();
  record.decidedBy = actor;
  addAudit(store, {
    actor,
    action: "registration_rejected",
    registrationId: id,
    detail: reason,
  });
  await persistStore(store);
  return record;
}

export async function approveRegistration(id: string, actor: string) {
  const store = await getStore();
  const record = store.registrations.find((item) => item.id === id);
  if (!record) throw new Error("Registration not found");
  if (record.status !== "pending_verification") {
    throw new Error("Only pending registrations can be approved");
  }

  record.status = "approved";
  record.decidedAt = new Date().toISOString();
  record.decidedBy = actor;
  addAudit(store, {
    actor,
    action: "registration_approved",
    registrationId: id,
  });

  const code = nextMasterCode(record.kind, store);
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

  await persistStore(store);
  return { record, master, account };
}
