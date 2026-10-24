# WhatsApp password recovery frontend contract

The Forgot Password page is frontend-only. It does not issue, generate, compare,
store, or log real OTPs. Existing email recovery and token-reset API implementations
and the separate `/reset-password` page are unchanged.

## Connecting the backend

Configure all three public endpoint paths in the frontend environment before
building. These variables contain paths only, never credentials or WhatsApp keys:

- `NEXT_PUBLIC_PASSWORD_RECOVERY_REQUEST_URL`
- `NEXT_PUBLIC_PASSWORD_RECOVERY_VERIFY_URL`
- `NEXT_PUBLIC_PASSWORD_RECOVERY_RESET_URL`

There are intentionally no default paths. The current placeholder endpoint is
not called. Missing configuration produces an integration-unavailable error and
keeps the identification form visible. Paths must be same-origin, beginning with
one `/`; use an approved same-origin proxy if the backend is hosted elsewhere.
No proxy or API implementation is included here.

All requests use JSON POST bodies, `credentials: same-origin` and `cache: no-store`.
The server must also return `Cache-Control: no-store` on recovery responses.

### Request OTP

Request: `{ identifier, mobile }`. `identifier` is the existing username, email
username or Master Code. `mobile` is an international number such as
`+919876543210`; spaces, parentheses and hyphens are removed before submission.

Required success response:

```json
{
  "ok": true,
  "channel": "whatsapp",
  "challengeId": "opaque-server-challenge",
  "expiresAt": "2030-01-01T00:05:00.000Z",
  "resendAfterSeconds": 60
}
```

Use an actual future expiry when implementing the endpoint. The cooldown must be
an integer from 1 to 3600 seconds. Resend calls the same endpoint; the returned
challenge replaces the previous challenge and clears the entered code.

### Verify OTP

Request: `{ challengeId, otp }`. The OTP is a six-digit string, preserving zeros.

Required success response:

```json
{
  "ok": true,
  "verified": true,
  "resetToken": "opaque-single-use-token-of-at-least-32-characters",
  "expiresAt": "2030-01-01T00:10:00.000Z"
}
```

The password fields only become available after a valid, unexpired confirmation.
OTP codes and tokens remain in component memory and are cleared on progression,
restart or unmount. No tokens are placed in URLs, browser storage or logs.

### Reset password

Request: `{ token, password, confirmPassword }`, using the server-issued reset
token. Passwords must be 12-128 characters with uppercase, lowercase, a number
and a symbol, matching the existing reset policy. Whitespace is not trimmed.

Required success response: `{ "ok": true, "passwordReset": true }`.
A generic HTTP 200 or `{ "ok": true }` does not show a success screen. This explicit
contract prevents accidentally treating a placeholder response as completion.
The existing reset API is not changed to provide this contract.

### Errors and backend responsibilities

Use non-2xx responses with `{ code }`: `INVALID_OTP`, `OTP_EXPIRED`,
`TOO_MANY_ATTEMPTS`, `INVALID_CHALLENGE`, `RESET_EXPIRED`, `PASSWORD_REJECTED`, or
`SERVICE_UNAVAILABLE`. The frontend maps these to safe messages and does not echo
arbitrary response details. HTTP 429 may include a `Retry-After` header with seconds
or an HTTP date; the UI respects up to one hour of retry delay.

The backend must verify identifier/registered-number ownership, use non-enumerating
responses, send through the approved WhatsApp service, rate-limit all operations,
enforce expiry and attempt limits, bind verification and tokens to the same
account, consume reset tokens atomically, revoke sessions as required, preserve
MFA and locked-account rules, and audit events without recording secrets. Client
validation, disabled buttons and countdowns are UX guards, not authorization.

## Frontend verification

`npm test` includes mocked-transport tests for validation, missing configuration,
malformed/legacy responses, expired challenges, verification gating, cooldowns,
explicit reset completion, and request payloads. Mocks exist only in the tests;
there is no mock-success path in the application.
