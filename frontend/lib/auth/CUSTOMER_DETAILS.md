# Customer details modification: frontend integration contract

`/customer-activation` now renders the Existing Customer details modification UI.
The Login link keeps its URL and position and reads "Existing Customer? Modify
Your Details". The obsolete activation form component was removed after verifying
it had no other consumers. Existing activation API routes, activation schemas,
registration/authentication flows, and separate password-reset workflows remain
unchanged. The new UI never calls the legacy activation/save endpoints, which
would otherwise change passwords and activation state.

## Configure approved backend endpoints

Set these public same-origin paths in the frontend environment before building:

- `NEXT_PUBLIC_CUSTOMER_DETAILS_REQUEST_URL`
- `NEXT_PUBLIC_CUSTOMER_DETAILS_VERIFY_URL`
- `NEXT_PUBLIC_CUSTOMER_DETAILS_PROFILE_URL`
- `NEXT_PUBLIC_CUSTOMER_DETAILS_SAVE_URL`
- `NEXT_PUBLIC_CUSTOMER_DETAILS_MOBILE_REQUEST_URL`
- `NEXT_PUBLIC_CUSTOMER_DETAILS_MOBILE_VERIFY_URL`

No endpoint paths are assumed. These variables are paths, not credentials.
Missing configuration displays an unavailable message; no step is simulated as
successful. All requests below use JSON POST bodies, same-origin credentials,
and `cache: no-store`. Server responses must also be non-cacheable. Configure
mobile endpoints before enabling number changes; unchanged numbers do not require
a new mobile verification. No environment file or API is modified here.

## Contracts

1. Request OTP: `{ identifier, mobile }`. `identifier` is the existing username or
   Master Code; `mobile` is the registered 10-digit Indian number, consistent with
   customer registration. Match both on the server and send through WhatsApp.
   Respond with `{ ok: true, channel: "whatsapp", challengeId, expiresAt,
   resendAfterSeconds }`. Expiry is a future ISO datetime; cooldown is 1-3600
   seconds. Resends repeat this operation and replace the previous challenge.
   Use generic responses that do not reveal whether an account exists.
2. Verify OTP: `{ challengeId, otp }` with a six-digit string. Return
   `{ ok: true, verified: true, customerCode, verificationToken, expiresAt }`.
   The token must be opaque, at least 32 characters and short lived.
3. Retrieve profile: `{ verificationToken }`. Return `{ ok: true, profile }` only
   after verifying account-scoped permissions. The response customerCode must
   match the verification grant. No customer data is requested or rendered before
   verified access; the profile is hidden when the session expires.
4. Verify a changed number using the independent mobile endpoints:
   - Request: `{ verificationToken, mobile }`; return the same challenge shape.
   - Verify: `{ verificationToken, challengeId, mobile, otp }`; return
     `{ ok: true, verified: true, customerCode, mobile, verificationToken,
     expiresAt }`. This new token is a mobile-change proof, bound to the customer,
     editing session, and exact number. Editing the number invalidates the local
     proof; an expired proof also blocks saving.
5. Save: `{ verificationToken, updates, photos, mobileVerificationToken? }`.
   Only the following updates are ever sent: `addressLine1`, `addressLine2`,
   `addressLine3`, `addressLine4`, `pinCode`, `mobile`. Only replacement
   `shopOutside` and `shopInside` photographs are included. Omitted photos mean
   preserve the originals. Return `{ ok: true, saved: true, customerCode }` with
   the verified customerCode before a success message is displayed.

The frontend profile schema lives in `lib/auth/customer-details.ts`. Supply
customerCode, customerName, businessName, customerType, mobile, email, dlNumber1,
gstNumber, creditDays and paymentMethod. Also return existing address/addressLine1-4,
pinCode, addressType, optional license numbers, and all existing documents. Use
`additionalDetails: [{ label, value }]` for any other non-sensitive registration,
approval, account-status or commercial information that must be displayed.
All these additional details are read-only. Never return password hashes, salts,
OTP secrets, internal authentication tokens or unrelated customer information.

`files` keys: dl1, dl2, dl3, gstCertificate, shopOutside, shopInside. Each existing
file uses `{ name, type, size, dataUrl }`. URLs are validated base64 JPEG, PNG,
WebP or PDF data URLs; documents are download-only. New shop photos accept images
only, up to 5 MB each. Both existing previews and replacements are shown. Undo
replacement restores the original; it does not delete existing files. Backend
file decoding, content validation and secure storage remain required.

## Security and failure handling

Use non-2xx errors with safe codes: INVALID_DETAILS, INVALID_OTP, OTP_EXPIRED,
VERIFICATION_EXPIRED, MOBILE_IN_USE, TOO_MANY_ATTEMPTS. Arbitrary backend error
strings are never shown. HTTP 429 supports Retry-After; if absent, the UI waits
60 seconds. Tokens, OTPs and profile data stay in component memory, never URLs,
browser storage or logs, and are cleared when cancelling/completing/unmounting.

The backend must independently enforce token ownership/expiry, attempt limits,
resend limits, eligibility and company/customer permissions, mobile uniqueness,
new-number verification, field allowlisting, atomic updates, and appropriate audit
records. Preserve all unchanged fields, activation state, passwords, licenses,
business data and documents. Never infer trusted authorization from disabled UI
controls. The frontend does not generate or compare real OTPs.

Tests in `tests/customer-details.test.mjs` use mocked transport only to cover
privacy gates, mismatched customers, immutable-field filtering, image validation,
new-mobile proof binding, rate limits and explicit save confirmation. Actual
WhatsApp delivery, database matching and persistence require backend integration.
