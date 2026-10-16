export const APP_NAME = "Zenex International";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const CUSTOMER_TYPES = [
  "Retail Pharmacy",
  "Hospital",
  "Clinic",
] as const;

export const ADDRESS_TYPES = [
  "Business",
  "Registered Office",
  "Billing",
  "Shipping",
] as const;

export const CREDIT_DAY_VALUES = [
  "same_day_3",
  "week_2",
  "days_30_none",
  "days_60_special",
] as const;

export const CREDIT_DAY_OPTIONS = [
  { value: "same_day_3", label: "Same day payment — 3% discount" },
  { value: "week_2", label: "1 week — 2% discount" },
  { value: "days_30_none", label: "30 days — no discount" },
  { value: "days_60_special", label: "60 days — requires special approval" },
] as const;

export const MR_POSITIONS = [
  "Medical representative",
  "Area manager",
  "Regional sales manager",
  "Zonal sales manager",
  "Sales manager",
] as const;

export const CUSTOMER_PAYMENT_METHODS = [
  "Cash on Delivery (COD)",
  "UPI",
  "Debit Card",
  "Credit Card",
  "Net Banking",
  "Bank Transfer",
  "Wallet",
  "Cheque",
  "Other",
] as const;

export const PATIENT_PAYMENT_METHODS = [
  "Cash on Delivery",
  "UPI",
  "Debit Card",
  "Credit Card",
  "Net Banking",
  "Bank Transfer",
  "Wallet",
  "Cheque",
  "Other",
] as const;

export const PAYMENT_MODES = ["Cash", "Cheque", "NEFT"] as const;

export const REGISTRATION_PREFIX = {
  customer: "REG-CUS",
  mr: "REG-MR",
  patient: "REG-PAT",
} as const;

export const MASTER_PREFIX = {
  customer: "ZNX-CUS",
  mr: "ZNX-MR",
  patient: "ZNX-PAT",
} as const;
