import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createSalt, hashPassword } from "@/lib/crypto";
import type {
  AccountRecord,
  CustomerActivationChallenge,
  CompanyEmployee,
  CompanyOrder,
  CompanyProduct,
  CompanySpecialRate,
  SuperAdminPasswordChangeChallenge,
  AuditEvent,
  EmailLog,
  MasterRecord,
  PasswordResetToken,
  RegistrationUpload,
  RegistrationRecord,
  StoredCustomerRegistration,
  UploadedFile,
} from "@/lib/types";
import { LEGACY_SUPER_ADMIN_EMAILS, SUPER_ADMIN_EMAIL } from "@/lib/server/super-admin-config";
import { encryptMfaSecret, isEncryptedMfaSecret } from "@/lib/server/mfa-secret";

const DATA_DIR = path.resolve(process.cwd(), "..", ".data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

export type AppStore = {
  counters: {
    customerReg: number;
    companyReg: number;
    patientReg: number;
    customerMaster: number;
    companyMaster: number;
    patientMaster: number;
  };
  registrations: RegistrationRecord[];
  masters: MasterRecord[];
  accounts: AccountRecord[];
  companyEmployees: CompanyEmployee[];
  companyProducts: CompanyProduct[];
  companySpecialRates: CompanySpecialRate[];
  companyOrders: CompanyOrder[];
  audit: AuditEvent[];
  emails: EmailLog[];
  passwordResetTokens: PasswordResetToken[];
  registrationUploads: RegistrationUpload[];
  customerActivationChallenges: CustomerActivationChallenge[];
  superAdminPasswordChangeChallenges: SuperAdminPasswordChangeChallenge[];
  legacyMrArchive?: { registrations: unknown[]; masters: unknown[]; uploads: unknown[]; accounts: unknown[] };
};

let memory: AppStore | null = null;
let initialization: Promise<AppStore> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function seedAdmin(store: AppStore) {
  if (store.accounts.some((account) => account.username === "ADMIN")) return;
  const salt = createSalt();
  store.accounts.push({
    username: "ADMIN",
    userType: "admin",
    displayName: "Registration Officer",
    email: "approvals@zenex.local",
    passwordHash: await hashPassword("Demo@1234", salt),
    passwordSalt: salt,
    status: "active",
    createdAt: new Date().toISOString(),
  });
}

async function seedSuperAdmin(store: AppStore) {
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (password && password.length < 16) {
    throw new Error("SUPER_ADMIN_PASSWORD must contain at least 16 characters.");
  }
  const email = SUPER_ADMIN_EMAIL;
  const recognizedEmails = new Set([email, ...LEGACY_SUPER_ADMIN_EMAILS].map((value) => value.toLowerCase()));
  const existing = store.accounts.find((account) =>
    recognizedEmails.has(account.username.toLowerCase()) &&
    (account.userType === "admin" || account.userType === "super_admin"),
  );
  if (existing) {
    existing.email = email;
    existing.username = email;
    existing.userType = "super_admin";
    existing.displayName = "Super Admin";
    existing.passwordChangeRequired ??= true;
    existing.mfaEnabled ??= false;
    if (existing.mfaSecret && !isEncryptedMfaSecret(existing.mfaSecret)) {
      existing.mfaSecret = encryptMfaSecret(existing.mfaSecret);
    }
    return;
  }
  if (!password) return;
  const salt = createSalt();
  store.accounts.push({
    username: email,
    userType: "super_admin",
    displayName: "Super Admin",
    email,
    passwordHash: await hashPassword(password, salt),
    passwordSalt: salt,
    status: "active",
    createdAt: new Date().toISOString(),
    passwordChangeRequired: true,
    mfaEnabled: false,
  });
}

async function seedCustomerActivationFixture(store: AppStore) {
  // This fixture is restricted to local development and can never be written by a production server.
  if (process.env.NODE_ENV !== "development") return;
  const code = "C001ZNX";
  const mobile = "7760430885";
  if (store.masters.some((item) => item.kind === "customer" && item.code === code) || store.registrations.some((item) => item.mobile === mobile)) return;

  const now = new Date().toISOString();
  const registrationId = "REG-CUS-TEST-C001ZNX";
  const salt = createSalt();
  const passwordHash = await hashPassword(crypto.randomUUID(), salt);
  const samplePdf: UploadedFile = {
    name: "Development Test Document.pdf",
    type: "application/pdf",
    size: 18,
    dataUrl: "data:application/pdf;base64,JVBERi0xLjQKJURldiB0ZXN0IGZpeHR1cmUK",
  };
  const files = {
    dl1: samplePdf,
    dl2: { ...samplePdf, name: "Development Test DL2.pdf" },
    gstCertificate: { ...samplePdf, name: "Development Test GST Certificate.pdf" },
    shopOutside: { ...samplePdf, name: "Development Test Shop Outside.pdf" },
    shopInside: { ...samplePdf, name: "Development Test Shop Inside.pdf" },
  };
  const customer: StoredCustomerRegistration = {
    kind: "customer",
    id: registrationId,
    status: "approved",
    submittedAt: now,
    decidedAt: now,
    decidedBy: "DEVELOPMENT_FIXTURE",
    customerName: "Ananya Rao",
    mobile,
    email: "activation-test@example.invalid",
    passwordHash,
    passwordSalt: salt,
    businessName: "Ananya Healthcare",
    customerType: "Retail Pharmacy",
    address: "12 Sample Road, Indiranagar, Bengaluru, Karnataka, 560038",
    addressLine1: "12 Sample Road",
    addressLine2: "Indiranagar",
    addressLine3: "Bengaluru",
    addressLine4: "Karnataka",
    pinCode: "560038",
    dlNumber1: "KA-BLR-DL-TEST-001",
    dlNumber2: "KA-BLR-DL-TEST-002",
    fssaiNumber: "11223344556677",
    gstNumber: "29ABCDE1234F1Z5",
    creditDays: "days_30_none",
    paymentMethod: "UPI",
    files,
  };
  store.registrations.push(customer);
  store.masters.push({
    kind: "customer",
    code,
    registrationId,
    createdAt: now,
    approvalDate: now,
    approvedBy: "DEVELOPMENT_FIXTURE",
    status: "active",
    customerName: customer.customerName,
    mobile,
    email: customer.email,
    businessName: customer.businessName,
    customerType: customer.customerType,
    address: customer.address,
    addressLine1: customer.addressLine1,
    addressLine2: customer.addressLine2,
    addressLine3: customer.addressLine3,
    addressLine4: customer.addressLine4,
    pinCode: customer.pinCode,
    paymentMethod: customer.paymentMethod,
    dlNumber1: customer.dlNumber1,
    dlNumber2: customer.dlNumber2,
    fssaiNumber: customer.fssaiNumber,
    gstNumber: customer.gstNumber,
    creditDays: customer.creditDays,
    files,
  });
  store.accounts.push({
    username: code,
    userType: "customer",
    masterCode: code,
    registrationId,
    email: customer.email,
    passwordHash,
    passwordSalt: salt,
    status: "active",
    createdAt: now,
    displayName: customer.customerName,
  });
}

function emptyStore(): AppStore {
  return {
    counters: {
      customerReg: 1244,
      companyReg: 0,
      patientReg: 3420,
      customerMaster: 1244,
      companyMaster: 0,
      patientMaster: 3420,
    },
    registrations: [],
    masters: [],
    accounts: [],
    companyEmployees: [],
    companyProducts: [],
    companySpecialRates: [],
    companyOrders: [],
    audit: [],
    emails: [],
    passwordResetTokens: [],
    registrationUploads: [],
    customerActivationChallenges: [],
    superAdminPasswordChangeChallenges: [],
  };
}

export async function getStore(): Promise<AppStore> {
  if (memory) return memory;
  if (!initialization) {
    initialization = initializeStore().catch((error: unknown) => {
      memory = null;
      initialization = null;
      throw error;
    });
  }
  const store = await initialization;
  store.passwordResetTokens ??= [];
  store.registrationUploads ??= [];
  store.customerActivationChallenges ??= [];
  store.superAdminPasswordChangeChallenges ??= [];
  store.companyEmployees ??= [];
  store.companyProducts ??= [];
  store.companySpecialRates ??= [];
  store.companyOrders ??= [];
  store.companyEmployees.forEach((employee) => { employee.status ??= "active"; });
  return store;
}

const storeGlobals = globalThis as typeof globalThis & {
  __zenexStoreTransactionQueue?: Promise<void>;
};

export async function transactStore<T>(mutate: (draft: AppStore) => Promise<T> | T): Promise<T> {
  const previous = storeGlobals.__zenexStoreTransactionQueue ?? Promise.resolve();
  let release!: () => void;
  storeGlobals.__zenexStoreTransactionQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    const draft = structuredClone(await refreshStore());
    const result = await mutate(draft);
    await persistStore(draft);
    return result;
  } finally {
    release();
  }
}

/** Read the latest persisted snapshot for request paths that must not rely on a
 * process-local cache (Next can load server modules in separate bundles). */
export async function refreshStore(): Promise<AppStore> {
  await getStore();
  await writeQueue;
  const raw = await readFile(STORE_PATH, "utf8");
  const store = migrateLegacyMrData(JSON.parse(raw) as Record<string, unknown>);
  store.passwordResetTokens ??= [];
  store.registrationUploads ??= [];
  store.customerActivationChallenges ??= [];
  store.superAdminPasswordChangeChallenges ??= [];
  store.companyEmployees ??= [];
  store.companyProducts ??= [];
  store.companySpecialRates ??= [];
  store.companyOrders ??= [];
  store.companyEmployees.forEach((employee) => { employee.status ??= "active"; });
  memory = store;
  initialization = Promise.resolve(store);
  return store;
}

async function initializeStore() {
  await mkdir(DATA_DIR, { recursive: true });
  let store: AppStore;
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    store = migrateLegacyMrData(JSON.parse(raw) as Record<string, unknown>);
    store.passwordResetTokens ??= [];
    store.registrationUploads ??= [];
    store.customerActivationChallenges ??= [];
    store.superAdminPasswordChangeChallenges ??= [];
    store.companyEmployees ??= [];
    store.companyProducts ??= [];
    store.companySpecialRates ??= [];
    store.companyOrders ??= [];
    store.companyEmployees.forEach((employee) => { employee.status ??= "active"; });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    store = emptyStore();
  }
  await seedAdmin(store);
  await seedSuperAdmin(store);
  await seedCustomerActivationFixture(store);
  await persistStore(store);
  return store;
}

function migrateLegacyMrData(raw: Record<string, unknown>): AppStore {
  const store = raw as unknown as AppStore;
  const archive = store.legacyMrArchive ?? { registrations: [], masters: [], uploads: [], accounts: [] };
  archive.registrations ??= []; archive.masters ??= []; archive.uploads ??= []; archive.accounts ??= [];
  const isRecord = (item: unknown): item is Record<string, unknown> => typeof item === "object" && item !== null;
  const archiveRows = (source: unknown[], predicate: (item: unknown) => boolean, destination: unknown[]) => {
    const active: unknown[] = [];
    for (const item of source ?? []) (predicate(item) ? destination : active).push(item);
    return active;
  };
  store.registrations = archiveRows(store.registrations ?? [], (item) => isRecord(item) && item.kind === "mr", archive.registrations) as AppStore["registrations"];
  store.masters = archiveRows(store.masters ?? [], (item) => isRecord(item) && item.kind === "mr", archive.masters) as AppStore["masters"];
  store.registrationUploads = archiveRows(store.registrationUploads ?? [], (item) => isRecord(item) && item.kind === "mr", archive.uploads) as AppStore["registrationUploads"];
  store.accounts = archiveRows(store.accounts ?? [], (item) => isRecord(item) && item.userType === "mr", archive.accounts) as AccountRecord[];
  store.counters ??= { customerReg: 1244, companyReg: 0, patientReg: 3420, customerMaster: 1244, companyMaster: 0, patientMaster: 3420 };
  const sequence = (value: unknown, prefix: string) => {
    const match = typeof value === "string" ? value.match(new RegExp(`^${prefix}-(\\d+)$`)) : null;
    return match ? Number(match[1]) : 0;
  };
  store.counters.companyReg = Math.max(store.counters.companyReg ?? 0, ...store.registrations.filter((item) => item.kind === "company").map((item) => sequence(item.id, "REG-COM")));
  store.counters.companyMaster = Math.max(store.counters.companyMaster ?? 0, ...store.masters.filter((item) => item.kind === "company").map((item) => sequence(item.code, "ZNX-COM")));
  store.counters.customerReg ??= 0; store.counters.patientReg ??= 0;
  store.counters.customerMaster ??= 0; store.counters.patientMaster ??= 0;
  const legacyCounters = store.counters as AppStore["counters"] & { mrReg?: number; mrMaster?: number };
  delete legacyCounters.mrReg;
  delete legacyCounters.mrMaster;
  store.legacyMrArchive = archive;
  return store;
}

export async function persistStore(store: AppStore) {
  memory = store;
  const write = writeQueue.then(async () => {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
  });
  writeQueue = write.catch(() => undefined);
  await write;
}

export function nextId(prefix: string, value: number) {
  return `${prefix}-${String(value).padStart(6, "0")}`;
}
