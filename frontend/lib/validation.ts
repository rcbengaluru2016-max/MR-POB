import { z } from "zod";
import {
  ALLOWED_FILE_TYPES,
  CREDIT_DAY_VALUES,
  CUSTOMER_TYPES,
  MAX_FILE_BYTES,
  CUSTOMER_PAYMENT_METHODS,
  PATIENT_PAYMENT_METHODS,
} from "./constants";

const mobile = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number");

const email = z.string().trim().email("Enter a valid email address");

const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Include at least one uppercase letter")
  .regex(/[a-z]/, "Include at least one lowercase letter")
  .regex(/\d/, "Include at least one number");

function requiredFile(label: string) {
  return z
    .custom<FileList>((value) => value instanceof FileList && value.length > 0, {
      message: `${label} is required`,
    })
    .superRefine((files, ctx) => {
      const file = files[0];
      if (!file) return;
      if (file.size > MAX_FILE_BYTES) {
        ctx.addIssue({
          code: "custom",
          message: `${label} must be 5 MB or smaller`,
        });
      }
      if (
        !ALLOWED_FILE_TYPES.includes(
          file.type as (typeof ALLOWED_FILE_TYPES)[number],
        )
      ) {
        ctx.addIssue({
          code: "custom",
          message: `${label} must be JPG, PNG, WEBP, or PDF`,
        });
      }
    });
}

function requiredImage(label: string) {
  return z
    .custom<FileList>((value) => value instanceof FileList && value.length > 0, {
      message: `${label} is required`,
    })
    .superRefine((files, ctx) => {
      const file = files[0];
      if (!file) return;
      if (file.size > MAX_FILE_BYTES) ctx.addIssue({ code: "custom", message: `${label} must be 5 MB or smaller` });
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        ctx.addIssue({ code: "custom", message: `${label} must be JPG, PNG, or WEBP` });
      }
    });
}

function optionalFile(label: string) {
  return z
    .custom<FileList | undefined>(
      (value) => value === undefined || value instanceof FileList,
    )
    .superRefine((files, ctx) => {
      const file = files?.[0];
      if (!file) return;
      if (file.size > MAX_FILE_BYTES) {
        ctx.addIssue({
          code: "custom",
          message: `${label} must be 5 MB or smaller`,
        });
      }
      if (
        !ALLOWED_FILE_TYPES.includes(
          file.type as (typeof ALLOWED_FILE_TYPES)[number],
        )
      ) {
        ctx.addIssue({
          code: "custom",
          message: `${label} must be JPG, PNG, WEBP, or PDF`,
        });
      }
    })
    .optional();
}

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Username / Master Code is required"),
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email,
});

const customerRegistrationFields = {
  customerName: z.string().trim().min(2, "Owner name is required"),
  mobile,
  email: z.string().trim().email("Enter a valid email address").optional().or(z.literal("")),
  businessName: z.string().trim().min(2, "Name is required"),
  customerType: z.enum(CUSTOMER_TYPES),
  addressLine1: z.string().trim().min(3, "Address Line 1 is required"),
  addressLine2: z.string().trim().optional().or(z.literal("")),
  addressLine3: z.string().trim().optional().or(z.literal("")),
  addressLine4: z.string().trim().optional().or(z.literal("")),
  pinCode: z.string().trim().regex(/^\d{6}$/, "Enter a valid 6-digit PIN code"),
  dlNumber1: z.string().trim().min(3, "DL Number 1 is required"),
  dlNumber2: z.string().trim().min(3, "DL Number 2 is required"),
  dlNumber3: z.string().trim().optional().or(z.literal("")),
  fssaiNumber: z.string().trim().optional().or(z.literal("")),
  gstNumber: z.string().trim().min(1, "GST number is required"),
  creditDays: z.enum(CREDIT_DAY_VALUES),
  paymentMethod: z.enum(CUSTOMER_PAYMENT_METHODS),
  termsAccepted: z.boolean().refine((value) => value === true, {
    message: "You must accept the Terms & Conditions",
  }),
};

export const customerRegistrationFieldsSchema = z.object(customerRegistrationFields);

export const customerActivationProfileSchema = z.object({ ...customerRegistrationFields, password, confirmPassword: z.string() }).refine((data) => data.password === data.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

export const customerRegistrationSchema = z
  .object({
    ...customerRegistrationFields,
    dl1: requiredFile("DL 1"),
    dl2: requiredFile("DL 2"),
    dl3: optionalFile("DL 3"),
    gstCertificate: requiredFile("GST certificate"),
    shopOutside: requiredFile("Shop photo — outside"),
    shopInside: requiredFile("Shop photo — inside"),
  });

const companyRegistrationFields = {
  companyName: z.string().trim().min(2, "Company name is required"),
  division: z.string().trim().min(1, "Division is required"),
  headquarter: z.string().trim().min(2, "Headquarter is required"),
  adminFullName: z.string().trim().min(2, "Admin full name is required"),
  adminEmail: email,
  adminMobile: mobile,
  password,
  confirmPassword: z.string(),
  termsAccepted: z.boolean().refine((value) => value === true, {
    message: "You must accept the Terms & Conditions",
  }),
};

export const companyRegistrationFieldsSchema = z
  .object(companyRegistrationFields)
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const companyRegistrationSchema = z
  .object({ ...companyRegistrationFields, companyLogo: requiredImage("Company logo"), adminPhoto: requiredImage("Admin photo") })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

const patientRegistrationFields = {
  patientName: z.string().trim().min(2, "Patient name is required"),
  mobile,
  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .optional()
    .or(z.literal("")),
  gender: z.enum(["Female", "Male", "Other", "Prefer not to say"]).optional().or(z.literal("")),
  address: z.string().trim().min(8, "Address is required"),
  paymentMethod: z.enum(PATIENT_PAYMENT_METHODS),
  termsAccepted: z.boolean().refine((value) => value === true, {
    message: "You must accept the terms and conditions",
  }),
};

export const patientRegistrationFieldsSchema = z.object(patientRegistrationFields);

export const patientRegistrationSchema = z
  .object({
    ...patientRegistrationFields,
    idProof: optionalFile("ID proof"),
  });

export const rejectSchema = z.object({
  reason: z.string().trim().min(8, "Rejection reason is required"),
});
