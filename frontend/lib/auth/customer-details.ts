import { z } from "zod";
import { recoveryIdentitySchema, recoveryOtpSchema } from "./password-recovery.ts";

export const customerMobileSchema = z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number.");
export const customerIdentitySchema = z.object({ identifier: recoveryIdentitySchema.shape.identifier, mobile: customerMobileSchema });
export const customerOtpSchema = recoveryOtpSchema;
export const customerChangesSchema = z.object({
  addressLine1: z.string().trim().min(3, "Address Line 1 is required.").max(250),
  addressLine2: z.string().trim().max(250), addressLine3: z.string().trim().max(250), addressLine4: z.string().trim().max(250),
  pinCode: z.string().regex(/^\d{6}$/, "Enter a valid 6-digit PIN code."), mobile: customerMobileSchema,
});
const imageTypes = ["image/jpeg", "image/png", "image/webp"];
export function validateShopPhoto(file: Pick<File, "type" | "size">) {
  return !imageTypes.includes(file.type) || file.size <= 0 || file.size > 5 * 1024 * 1024 ? "Use a JPEG, PNG, or WebP image no larger than 5 MB." : null;
}
const fileSchema = z.object({ name: z.string(), type: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]), size: z.number().nonnegative(), dataUrl: z.string().regex(/^data:(image\/(jpeg|png|webp)|application\/pdf);base64,[A-Za-z0-9+/=\r\n]+$/) });
const photoSchema = fileSchema.refine((file) => !validateShopPhoto(file), "Invalid shop photograph.");
export type CustomerShopPhoto = z.infer<typeof photoSchema>;
export function parseShopPhoto(value: unknown): CustomerShopPhoto { return photoSchema.parse(value); }
export const customerProfileSchema = z.object({
  customerCode: z.string().min(1), customerName: z.string(), businessName: z.string(), customerType: z.string(), mobile: customerMobileSchema,
  email: z.string(), address: z.string().default(""), addressLine1: z.string().default(""), addressLine2: z.string().default(""), addressLine3: z.string().default(""), addressLine4: z.string().default(""), pinCode: z.string().default(""), addressType: z.string().default(""),
  dlNumber1: z.string(), dlNumber2: z.string().default(""), dlNumber3: z.string().default(""), fssaiNumber: z.string().default(""), gstNumber: z.string(), creditDays: z.string(), paymentMethod: z.string(),
  additionalDetails: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
  files: z.object({ dl1: fileSchema.optional(), dl2: fileSchema.optional(), dl3: fileSchema.optional(), gstCertificate: fileSchema.optional(), shopOutside: fileSchema.optional(), shopInside: fileSchema.optional() }).default({}),
});
const challengeSchema = z.object({ ok: z.literal(true), channel: z.literal("whatsapp"), challengeId: z.string().min(1), expiresAt: z.iso.datetime({ offset: true }), resendAfterSeconds: z.number().int().min(1).max(3600) });
const grantSchema = z.object({ ok: z.literal(true), verified: z.literal(true), customerCode: z.string().min(1), verificationToken: z.string().min(32), expiresAt: z.iso.datetime({ offset: true }) });
const mobileGrantSchema = z.object({ ok: z.literal(true), verified: z.literal(true), customerCode: z.string().min(1), mobile: customerMobileSchema, verificationToken: z.string().min(32), expiresAt: z.iso.datetime({ offset: true }) });
export type CustomerProfile = z.infer<typeof customerProfileSchema>;
export type CustomerChanges = z.infer<typeof customerChangesSchema>;
export type CustomerChallenge = z.infer<typeof challengeSchema>;
export type CustomerGrant = z.infer<typeof grantSchema>;
export type MobileGrant = z.infer<typeof mobileGrantSchema>;
export type CustomerEndpoints = Partial<Record<"requestOtp" | "verifyOtp" | "profile" | "save" | "requestMobileOtp" | "verifyMobileOtp", string>>;
export class CustomerDetailsError extends Error {
  retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds = 0) { super(message); this.name = "CustomerDetailsError"; this.retryAfterSeconds = retryAfterSeconds; }
}
export function createCustomerDetailsClient(endpoints: CustomerEndpoints, transport: typeof fetch = fetch) {
  function fresh(expiresAt: string) { if (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) throw new CustomerDetailsError("Verification has expired. Start again to request a new OTP."); }
  function grant(value: CustomerGrant) { const result = grantSchema.safeParse(value); if (!result.success) throw new CustomerDetailsError("Verify your WhatsApp OTP before accessing customer details."); fresh(value.expiresAt); }
  async function post<T>(key: keyof CustomerEndpoints, body: unknown, schema: z.ZodType<T>, signal?: AbortSignal) {
    const url = endpoints[key];
    if (!url) throw new CustomerDetailsError("Customer details modification is not connected yet. Please contact your administrator.");
    if (!url.startsWith("/") || url.startsWith("//") || url.includes("\\")) throw new CustomerDetailsError("Customer verification configuration is unavailable.");
    const response = await transport(url, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
    const data: unknown = await response.json().catch(() => null);
    if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
    if (!response.ok) {
      const code = data && typeof data === "object" && "code" in data ? String(data.code) : "";
      const messages: Record<string, string> = { INVALID_DETAILS: "Unable to verify those details. Check your information and try again.", INVALID_OTP: "The OTP is invalid. Try again.", OTP_EXPIRED: "The OTP has expired. Resend OTP to continue.", VERIFICATION_EXPIRED: "Verification has expired. Start again.", MOBILE_IN_USE: "This mobile number cannot be used. Please contact your administrator.", TOO_MANY_ATTEMPTS: "Too many attempts. Please wait before trying again." };
      const retryHeader = response.headers.get("Retry-After");
      const retry = retryHeader ? (/^\d+$/.test(retryHeader) ? Number(retryHeader) : Math.ceil((Date.parse(retryHeader) - Date.now()) / 1000)) : 0;
      const delay = Number.isFinite(retry) ? Math.min(3600, Math.max(0, retry)) : 0;
      throw new CustomerDetailsError(messages[code] ?? "Unable to complete this request. Please try again later.", response.status === 429 ? delay || 60 : delay);
    }
    const result = schema.safeParse(data);
    if (!result.success) throw new CustomerDetailsError("The service did not confirm this step. No changes have been confirmed.");
    return result.data;
  }
  return {
    async requestOtp(identity: z.infer<typeof customerIdentitySchema>, signal?: AbortSignal) {
      const result = await post("requestOtp", customerIdentitySchema.parse(identity), challengeSchema, signal); fresh(result.expiresAt); return result;
    },
    async verifyOtp(challenge: CustomerChallenge, otp: string, signal?: AbortSignal) {
      fresh(challenge.expiresAt); const result = await post("verifyOtp", { challengeId: challenge.challengeId, otp: customerOtpSchema.parse(otp) }, grantSchema, signal); fresh(result.expiresAt); return result;
    },
    async profile(verified: CustomerGrant, signal?: AbortSignal) {
      grant(verified); const result = await post("profile", { verificationToken: verified.verificationToken }, z.object({ ok: z.literal(true), profile: customerProfileSchema }), signal);
      if (result.profile.customerCode !== verified.customerCode) throw new CustomerDetailsError("The customer details do not match this verification. Start again.");
      return result.profile;
    },
    async requestMobileOtp(verified: CustomerGrant, mobile: string, signal?: AbortSignal) {
      grant(verified); const result = await post("requestMobileOtp", { verificationToken: verified.verificationToken, mobile: customerMobileSchema.parse(mobile) }, challengeSchema, signal); fresh(result.expiresAt); return result;
    },
    async verifyMobileOtp(verified: CustomerGrant, challenge: CustomerChallenge, mobile: string, otp: string, signal?: AbortSignal) {
      grant(verified); fresh(challenge.expiresAt);
      const result = await post("verifyMobileOtp", { verificationToken: verified.verificationToken, challengeId: challenge.challengeId, mobile: customerMobileSchema.parse(mobile), otp: customerOtpSchema.parse(otp) }, mobileGrantSchema, signal);
      fresh(result.expiresAt); if (result.customerCode !== verified.customerCode || result.mobile !== mobile.trim()) throw new CustomerDetailsError("The verified mobile number does not match. Verify the new number again."); return result;
    },
    async save(verified: CustomerGrant, original: CustomerProfile, changes: CustomerChanges, photos: Partial<Record<"shopOutside" | "shopInside", z.infer<typeof fileSchema>>>, mobileVerification?: MobileGrant, signal?: AbortSignal) {
      grant(verified);
      if (original.customerCode !== verified.customerCode) throw new CustomerDetailsError("The customer details do not match this verification.");
      const updates = customerChangesSchema.parse(changes);
      let mobileVerificationToken: string | undefined;
      if (updates.mobile !== original.mobile) {
        const checked = mobileGrantSchema.safeParse(mobileVerification);
        if (!checked.success || checked.data.customerCode !== verified.customerCode || checked.data.mobile !== updates.mobile) throw new CustomerDetailsError("Verify the new mobile number before saving.");
        fresh(checked.data.expiresAt); mobileVerificationToken = checked.data.verificationToken;
      }
      // Explicit allowlist: never submit read-only customer fields or arbitrary uploads.
      const files: Partial<Record<"shopOutside" | "shopInside", z.infer<typeof fileSchema>>> = {};
      for (const key of ["shopOutside", "shopInside"] as const) if (photos[key]) files[key] = photoSchema.parse(photos[key]);
      await post("save", { verificationToken: verified.verificationToken, updates, photos: files, mobileVerificationToken }, z.object({ ok: z.literal(true), saved: z.literal(true), customerCode: z.literal(verified.customerCode) }), signal);
    },
  };
}
