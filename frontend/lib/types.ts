export type UserType = "customer" | "company" | "patient" | "admin" | "super_admin";

export function isUserType(value: string): value is UserType {
  return ["customer", "company", "patient", "admin", "super_admin"].includes(value);
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

export type CompanyRegistrationInput = {
  companyName: string;
  division: string;
  headquarter: string;
  adminFullName: string;
  adminEmail: string;
  adminMobile: string;
  mobile: string;
  email: string;
  password: string;
  confirmPassword: string;
  termsAccepted: boolean;
  companyLogo: FileList;
  adminPhoto: FileList;
};

export type PatientRegistrationInput = {
  patientName: string;
  mobile: string;
  email?: string;
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

export type StoredCompanyRegistration = {
  kind: "company";
  id: string;
  status: RegistrationStatus;
  submittedAt: string;
  companyName: string;
  division: string;
  headquarter: string;
  adminFullName: string;
  mobile: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  files: {
    companyLogo: UploadedFile;
    adminPhoto: UploadedFile;
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
  | StoredCompanyRegistration
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

export type CompanyMaster = {
  kind: "company";
  code: string;
  registrationId: string;
  createdAt: string;
  approvalDate: string;
  approvedBy: string;
  status: MasterStatus;
  companyName: string;
  division: string;
  headquarter: string;
  adminFullName: string;
  mobile: string;
  email: string;
  files: StoredCompanyRegistration["files"];
};

export type CompanyEmployee = {
  id: string;
  companyCode: string;
  /** Kept optional for compatibility with records created by earlier versions. */
  employeeId?: string;
  fullName: string;
  designation: string;
  division?: string;
  reportingManagerId?: string;
  contactNumber: string;
  photo?: UploadedFile;
  status?: "active" | "inactive";
  createdAt: string;
};

export type CompanyProduct = {
  id: string;
  companyCode: string;
  productCode: string;
  brandName: string;
  composition?: string;
  packSize?: string;
  mrp: number;
  ptr: number;
  pts: number;
  gst: number;
  images: {
    front: UploadedFile;
    composition: UploadedFile;
    manufacturer: UploadedFile;
    details: UploadedFile;
  };
  status: "active" | "inactive";
  createdAt: string;
  updatedAt?: string;
};

export type CompanySpecialRate = {
  id: string;
  companyCode: string;
  productId: string;
  productCode: string;
  productName: string;
  mrp: number;
  specialRate: number;
  startDate: string;
  endDate: string;
  enabled: boolean;
  approvalStatus: "approved" | "pending" | "rejected";
  createdAt: string;
  updatedAt?: string;
};

export type CompanyOrder = {
  id: string;
  deliveryInstructions?: string;
  orderNumber?: string;
  companyCode: string;
  orderDate: string;
  mrEmployeeId?: string;
  mrName?: string;
  mrContact?: string;
  customerCode?: string;
  customerName?: string;
  customerPhone?: string;
  customerPin?: string;
  subtotal?: number;
  taxAmount?: number;
  totalAmount?: number;
  customerApproval: "pending" | "approved" | "rejected";
  billingStatus: "pending" | "billed" | "completed";
  status: "pending" | "completed" | "cancelled";
  items?: Array<{
    productId: string;
    productCode: string;
    brandName: string;
    composition?: string;
    packSize?: string;
    mrp: number;
    ptr: number;
    pts: number;
    gst: number;
    quantity: number;
    specialRateId?: string;
    specialRate?: number;
    unitPrice?: number;
    lineTotal?: number;
  }>;
  history?: Array<{ status: string; changedAt: string; changedBy?: string; note?: string }>;
  createdAt: string;
  updatedAt?: string;
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

export type MasterRecord = CustomerMaster | CompanyMaster | PatientMaster;

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
  kind: "customer" | "company" | "patient";
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
