export type UserType = "customer" | "mr" | "patient" | "admin" | "super_admin";

export function isUserType(value: string): value is UserType {
  return ["customer", "mr", "patient", "admin", "super_admin"].includes(value);
}

export type RegistrationStatus =
  | "draft"
  | "submitted"
  | "pending_verification"
  | "approved"
  | "rejected";

export type MasterStatus = "created" | "active" | "inactive";
export type AccountStatus = "active" | "locked" | "unlocked" | "inactive";

export type UploadedFile = {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
};

export type CustomerRegistrationInput = {
  customerName: string;
  mobile: string;
  email?: string;
  password: string;
  confirmPassword: string;
  businessName: string;
  customerType: string;
  address?: string;
  addressLine1: string;
  addressLine2?: string;
  addressLine3?: string;
  addressLine4?: string;
  pinCode: string;
  addressType?: string;
  dlNumber1: string;
  dlNumber2: string;
  dlNumber3?: string;
  fssaiNumber?: string;
  gstNumber: string;
  creditDays: string;
  paymentMethod: string;
  termsAccepted: boolean;
  dl1: FileList;
  dl2: FileList;
  dl3?: FileList;
  gstCertificate: FileList;
  shopOutside: FileList;
  shopInside: FileList;
};

export type MrRegistrationInput = {
  mrName: string;
  mobile: string;
  email: string;
  password: string;
  confirmPassword: string;
  companyName: string;
  position: string;
  division: string;
  termsAccepted: boolean;
  mrPhoto: FileList;
  visitingCard: FileList;
};

export type PatientRegistrationInput = {
  patientName: string;
  mobile: string;
  email?: string;
  password: string;
  confirmPassword: string;
  gender: string;
  address: string;
  termsAccepted: boolean;
  paymentMethod: string;
  idProof?: FileList;
};

export type StoredCustomerRegistration = {
  kind: "customer";
  id: string;
  status: RegistrationStatus;
  submittedAt: string;
  customerName: string;
  mobile: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  businessName: string;
  customerType: string;
  address: string;
  addressLine1?: string;
  addressLine2?: string;
  addressLine3?: string;
  addressLine4?: string;
  pinCode?: string;
  addressType?: string;
  dlNumber1: string;
  dlNumber2?: string;
  dlNumber3?: string;
  fssaiNumber?: string;
  gstNumber: string;
  creditDays: string;
  paymentMethod: string;
  files: {
    dl1: UploadedFile;
    dl2?: UploadedFile;
    dl3?: UploadedFile;
    gstCertificate?: UploadedFile;
    shopOutside: UploadedFile;
    shopInside: UploadedFile;
  };
  rejectionReason?: string;
  decidedAt?: string;
  decidedBy?: string;
};

export type StoredMrRegistration = {
  kind: "mr";
  id: string;
  status: RegistrationStatus;
  submittedAt: string;
  mrName: string;
  mobile: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  companyName: string;
  position: string;
  division: string;
  files: {
    mrPhoto: UploadedFile;
    visitingCard: UploadedFile;
  };
  rejectionReason?: string;
  decidedAt?: string;
  decidedBy?: string;
};

export type StoredPatientRegistration = {
  kind: "patient";
  id: string;
  status: RegistrationStatus;
  submittedAt: string;
  patientName: string;
  mobile: string;
  email?: string;
  passwordHash: string;
  passwordSalt: string;
  gender: string;
  address: string;
  paymentMethod: string;
  files?: {
    idProof: UploadedFile;
  };
  rejectionReason?: string;
  decidedAt?: string;
  decidedBy?: string;
};

export type RegistrationRecord =
  | StoredCustomerRegistration
  | StoredMrRegistration
  | StoredPatientRegistration;

export type CustomerMaster = {
  kind: "customer";
  code: string;
  registrationId: string;
  createdAt: string;
  approvalDate: string;
  approvedBy: string;
  status: MasterStatus;
  customerName: string;
  mobile: string;
  email: string;
  businessName: string;
  customerType: string;
  address: string;
  addressLine1?: string;
  addressLine2?: string;
  addressLine3?: string;
  addressLine4?: string;
  pinCode?: string;
  paymentMethod: string;
  addressType?: string;
  dlNumber1: string;
  dlNumber2?: string;
  dlNumber3?: string;
  fssaiNumber?: string;
  gstNumber: string;
  creditDays: string;
  files: StoredCustomerRegistration["files"];
  salesRepresentative?: string;
  discountPercent?: number | null;
  creditPeriod?: string;
  creditLimit?: number | null;
  paymentMode?: string;
};

export type MrMaster = {
  kind: "mr";
  code: string;
  registrationId: string;
  createdAt: string;
  approvalDate: string;
  approvedBy: string;
  status: MasterStatus;
  mrName: string;
  mobile: string;
  email: string;
  companyName: string;
  position: string;
  division: string;
  files: StoredMrRegistration["files"];
  assignedManager?: string;
  territory?: string;
  region?: string;
  monthlyTarget?: number | null;
  commissionPercent?: number | null;
};

export type PatientMaster = {
  kind: "patient";
  code: string;
  registrationId: string;
  createdAt: string;
  approvalDate: string;
  approvedBy: string;
  status: MasterStatus;
  patientName: string;
  mobile: string;
  email?: string;
  gender: string;
  address: string;
  paymentMethod: string;
  files?: StoredPatientRegistration["files"];
  linkedPharmacy?: string;
  discountPercent?: number | null;
  refillCycle?: string;
  paymentMode?: string;
};

export type MasterRecord = CustomerMaster | MrMaster | PatientMaster;

export type AccountRecord = {
  username: string;
  // Persisted stores may contain older role values. Keep them readable for compatibility,
  // but only UserType values are accepted by authentication and account-management flows.
  userType: string;
  masterCode?: string;
  registrationId?: string;
  email?: string;
  passwordHash: string;
  passwordSalt: string;
  status: AccountStatus;
  createdAt: string;
  displayName: string;
  passwordChangeRequired?: boolean;
  mfaEnabled?: boolean;
  mfaSecret?: string;
  lastMfaCounter?: number;
  lastLoginAt?: string;
};

export type AuditEvent = {
  id: string;
  at: string;
  actor: string;
  action: string;
  registrationId?: string;
  masterCode?: string;
  detail?: string;
};

export type EmailLog = {
  id: string;
  at: string;
  to: string;
  subject: string;
  body: string;
  status: "queued" | "sent" | "failed";
};

export type PasswordResetToken = {
  tokenHash: string;
  username: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
};

export type CustomerActivationChallenge = {
  id: string;
  registrationId?: string;
  accountUsername?: string;
  otpHash: string;
  createdAt: string;
  expiresAt: string;
  attempts: number;
  sends: number;
  lastSentAt: string;
  verifiedAt?: string;
  activationTokenHash?: string;
  activationTokenExpiresAt?: string;
};

export type SuperAdminPasswordChangeChallenge = {
  tokenHash: string;
  username: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
};

export type RegistrationUpload = {
  id: string;
  fileName: string;
  kind: "customer" | "mr" | "patient";
  uploadedBy: string;
  uploadedAt: string;
  totalRecords: number;
  successfulRecords: number;
  failedRecords: number;
  progress: number;
  status: "queued" | "processing" | "completed" | "partially_completed" | "failed";
  errorSummary?: string;
  rowErrors?: Array<{ rowNumber: number; errors: string[] }>;
  originalFile: { iv: string; tag: string; ciphertext: string };
};

export type SessionUser = {
  username: string;
  userType: UserType;
  displayName: string;
};
