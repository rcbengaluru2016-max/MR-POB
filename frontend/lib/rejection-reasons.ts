export const rejectionReasons = {
  MISSING_DOCUMENTS: 'Required documents are missing.',
  UNREADABLE_DOCUMENTS: 'Uploaded documents are unreadable or incomplete.',
  INCOMPLETE_INFORMATION: 'Submitted information is incomplete.',
  UNVERIFIABLE_INFORMATION: 'Submitted information could not be verified.',
  REGISTRATION_CRITERIA: 'The submitted information does not match the required registration criteria.',
  OTHER: 'Other — provide a reviewed custom reason.',
} as const;
export type RejectionCode = keyof typeof rejectionReasons;
export function validateRejection(input: { reasonCode?: unknown; reason?: unknown; reasonReviewed?: unknown }, kind?: string) {
  if (typeof input.reasonCode !== 'string' || !Object.hasOwn(rejectionReasons, input.reasonCode)) throw new Error('Select a standard rejection reason or Other.');
  const code = input.reasonCode as RejectionCode;
  // Patient ID proof is optional; its absence cannot justify rejection.
  if (kind === 'patient' && code === 'MISSING_DOCUMENTS') throw new Error('Patient ID proof is optional. Select an applicable reason.');
  if (code !== 'OTHER') return { code, reason: rejectionReasons[code] };
  if (input.reasonReviewed !== true) throw new Error('Review and approve the custom reason for external communication.');
  if (typeof input.reason !== 'string' || input.reason.length > 2000) throw new Error('Custom reason must contain 8–500 characters.');
  const reason = input.reason.replace(/\s+/g, ' ').trim();
  if (reason.length < 8 || reason.length > 500 || !/[a-zA-Z]/.test(reason)) throw new Error('Custom reason must contain 8–500 characters.');
  // Defense in depth, not a substitute for administrator review. Keep this
  // channel limited to correction instructions, never case-specific secrets.
  if (/[<>\x00-\x08\x0e-\x1f]/.test(reason) || /(?:\d[\s-]*){6,}|https?:|www\.|[\w.+-]+@[\w.-]+|\b(password|otp|token|secret|aadhaar|aadhar|pan|passport|diagnosis|diagnosed|hiv|cancer|bank|account number|card number|confidential|internal note)\b/i.test(reason)) throw new Error('Remove sensitive information, contact details, links and internal notes from the custom reason.');
  return { code, reason };
}
