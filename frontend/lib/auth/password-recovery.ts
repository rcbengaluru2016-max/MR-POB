import { z } from "zod";

export const recoveryIdentitySchema = z.object({
  identifier: z.string().trim().min(1, "Enter your username or Master Code.").max(254, "Use 254 characters or fewer."),
  mobile: z.string().trim().transform((value) => value.replace(/[\s()-]/g, "")).pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, "Include the country code, for example +919876543210.")),
});
export const recoveryOtpSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit WhatsApp OTP.");
export const recoveryPasswordSchema = z.object({
  password: z.string().min(12, "Use at least 12 characters.").max(128, "Use 128 characters or fewer.")
    .regex(/[A-Z]/, "Include an uppercase letter.").regex(/[a-z]/, "Include a lowercase letter.")
    .regex(/\d/, "Include a number.").regex(/[^A-Za-z0-9]/, "Include a symbol."),
  confirmPassword: z.string().min(1, "Confirm your new password."),
}).refine((value) => value.password === value.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match." });

const expiry = z.iso.datetime({ offset: true });
const challengeSchema = z.object({ ok: z.literal(true), channel: z.literal("whatsapp"), challengeId: z.string().min(1).max(512), expiresAt: expiry, resendAfterSeconds: z.number().int().min(1).max(3600) });
const verificationSchema = z.object({ ok: z.literal(true), verified: z.literal(true), resetToken: z.string().min(32).max(2048), expiresAt: expiry });
const resetSchema = z.object({ ok: z.literal(true), passwordReset: z.literal(true) });
export type RecoveryIdentity = z.infer<typeof recoveryIdentitySchema>;
export type RecoveryChallenge = z.infer<typeof challengeSchema>;
export type RecoveryGrant = z.infer<typeof verificationSchema>;
export type RecoveryEndpoints = { requestOtp?: string; verifyOtp?: string; resetPassword?: string };

export class RecoveryError extends Error {
  retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds = 0) { super(message); this.name = "RecoveryError"; this.retryAfterSeconds = retryAfterSeconds; }
}

const errorMessages: Record<string, string> = {
  INVALID_OTP: "The OTP is invalid. Please try again.",
  OTP_EXPIRED: "The OTP has expired. Request another code.",
  TOO_MANY_ATTEMPTS: "Too many attempts. Please wait before trying again.",
  INVALID_CHALLENGE: "This verification request is no longer valid. Start again.",
  RESET_EXPIRED: "Your password reset session has expired. Start again.",
  SERVICE_UNAVAILABLE: "WhatsApp verification is temporarily unavailable. Please try again later.",
  PASSWORD_REJECTED: "This password cannot be used. Choose another strong password.",
};

/** Frontend adapter only. No endpoints are assumed or implemented here. */
export function createPasswordRecoveryClient(endpoints: RecoveryEndpoints, transport: typeof fetch = fetch) {
  async function post<T>(endpoint: string | undefined, payload: unknown, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
    if (!Object.values(endpoints).every(Boolean) || !endpoints.requestOtp || !endpoints.verifyOtp || !endpoints.resetPassword) throw new RecoveryError("WhatsApp password recovery is not connected yet. Please contact your administrator.");
    if (![endpoints.requestOtp, endpoints.verifyOtp, endpoints.resetPassword].every((url) => url.startsWith("/") && !url.startsWith("//") && !url.includes("\\"))) throw new RecoveryError("WhatsApp password recovery configuration is unavailable. Please contact your administrator.");
    const response = await transport(endpoint!, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal });
    const data: unknown = await response.json().catch(() => null);
    if (signal?.aborted) throw new DOMException("Recovery cancelled", "AbortError");
    if (!response.ok) {
      const code = data && typeof data === "object" && "code" in data && typeof data.code === "string" ? data.code : "";
      const retryHeader = response.headers.get("Retry-After");
      const seconds = retryHeader ? (/^\d+$/.test(retryHeader) ? Number(retryHeader) : Math.ceil((Date.parse(retryHeader) - Date.now()) / 1000)) : 0;
      const parsedRetry = Number.isFinite(seconds) ? Math.max(0, Math.min(3600, seconds)) : 0;
      const retry = response.status === 429 ? parsedRetry || 60 : parsedRetry;
      throw new RecoveryError(errorMessages[code] ?? (response.status === 429 ? errorMessages.TOO_MANY_ATTEMPTS : "Unable to complete password recovery. Please try again."), retry);
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new RecoveryError("The recovery service did not confirm this step. Please try again later.");
    return parsed.data;
  }
  function requireFresh(expiresAt: string) {
    if (Date.parse(expiresAt) <= Date.now()) throw new RecoveryError("This recovery session has expired. Request another OTP.");
  }
  return {
    async requestOtp(identity: RecoveryIdentity, signal?: AbortSignal) {
      const challenge = await post(endpoints.requestOtp, recoveryIdentitySchema.parse(identity), challengeSchema, signal);
      requireFresh(challenge.expiresAt);
      return challenge;
    },
    async verifyOtp(challenge: RecoveryChallenge, otp: string, signal?: AbortSignal) {
      requireFresh(challenge.expiresAt);
      const grant = await post(endpoints.verifyOtp, { challengeId: challenge.challengeId, otp: recoveryOtpSchema.parse(otp) }, verificationSchema, signal);
      requireFresh(grant.expiresAt);
      return grant;
    },
    async resetPassword(grant: RecoveryGrant, values: z.infer<typeof recoveryPasswordSchema>, signal?: AbortSignal) {
      // This is a UI guard. The backend must independently verify and consume the token.
      if (grant.verified !== true || grant.ok !== true) throw new RecoveryError("Verify your WhatsApp OTP before resetting your password.");
      requireFresh(grant.expiresAt);
      await post(endpoints.resetPassword, { token: grant.resetToken, ...recoveryPasswordSchema.parse(values) }, resetSchema, signal);
    },
  };
}
