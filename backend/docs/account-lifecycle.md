# Account lifecycle and dashboard integration

Update, 27 October 2026: see [the Admin account repair report](admin-account-repair-2026-10-27.md). Super Admin-initiated **Admin** password resets now use a direct, session-authorized two-field form and `POST /super-admin/accounts/:id/password-reset`; fresh MFA remains required for **Super Admin** reset links and new Super Admin creation. Provider operations resolve username and verify the immutable subject rather than assuming the subject is a provider username. Earlier reset-link descriptions below document the retained link workflow.

## Architecture and changes

Next.js uses the existing same-origin proxy/adapter and HttpOnly Cognito access cookie. Nest validates the Cognito JWT and resolves the subject against `ErpUser` on every protected request; PostgreSQL remains authoritative for role, active/deleted state and session revocation. Admin and Super Admin continue to use their existing separate page/layout routes and shared registration components. The Admin shell excludes Users & Accounts; `/admin/accounts` redirects to access denied. Both roles use the same guarded registration lists, approved profiles, decisions, analytics and document service. No dashboard redesign was made.

The existing account model, authentication guards, Cognito SDK service and audit table were extended. The additive migration `20261026120000_account_lifecycle` adds login/deletion/session timestamps and a new-Super-Admin enrollment gate to `ErpUser`, plus `AccountStepUp` and `AccountResetToken`. No business table or historical foreign key is deleted. The configured local database was backed up before migration; the backup and preservation baseline are ignored under `backend/.local/account-lifecycle/`.

Admin creation requires the existing active Super Admin session and no fresh MFA. It reserves a unique, inactive account before touching Cognito, binds only an identity carrying its own durable ownership marker, and makes access active only after credential provisioning succeeds. Case-insensitive uniqueness constraints remain authoritative; serializable reservation conflicts receive bounded retries. An uncertain provider/database failure leaves access inactive, with recovery through a fresh-MFA password-reset link. Plaintext credentials are never persisted or logged by the application.

Super Admin creation additionally consumes a single-use, actor/operation/details-bound MFA grant inside the reservation transaction. New Super Admin identities receive temporary passwords, and database authorization remains blocked until Cognito completes the private-password and MFA challenge sequence. The creation endpoint checks that the existing Cognito pool requires MFA and supports software-token enrollment; it fails closed if the policy is unsuitable. It does not change AWS pool settings or existing users' passwords/MFA.

## Fresh MFA and reset security

A sensitive operation first authenticates the initiating Super Admin's current password through a new Cognito `USER_PASSWORD_AUTH` flow. Only a fresh `SOFTWARE_TOKEN_MFA` or `SMS_MFA` challenge is accepted. Password-only success, an enrollment request and an existing MFA flag are not accepted as step-up proof. Cognito verifies the code; the resulting access token is validated and bound back to the initiating database account, then discarded. The application never stores those tokens.

The provider challenge session is encrypted using AES-256-GCM with a domain-separated key derived from the existing server-only `IDEMPOTENCY_SECRET`. Challenges expire after five minutes and permit at most five verification attempts. A verified grant expires after two minutes, is stored only as a hash and is consumed atomically for its bound operation. Endpoint throttles also bound challenge, verification, reset generation and redemption traffic. Account details, including the proposed password, are bound with HMAC rather than being stored in the challenge row.

Reset links contain 32 cryptographically random bytes and expire exactly 30 minutes after creation. PostgreSQL stores only their SHA-256 hashes. Generating another link invalidates earlier unused links. Redemption validates password strength and confirmation, serializes on the target account and commits a one-time claim plus account suspension before contacting Cognito. Success revokes sessions, updates the provider password and consumes the token. The account state is captured at redemption, so a later password reset cannot undo an intervening administrator deactivation. Inactive accounts remain inactive. A provider/database uncertainty leaves the account inactive and the link claimed; an administrator must issue a fresh MFA-protected link and explicitly reactivate the account if appropriate. Claimed links are never automatically released after an ambiguous remote write.

Links use the configured trusted `FRONTEND_ORIGIN` and HTTPS in production (loopback HTTP only in development/tests). The token is in a URL fragment so page access logs never receive it. The reset page captures it in component memory, removes it from the address bar, validates it before displaying password fields, and sends it only in same-origin POST bodies. The page has `no-referrer`, `no-store` and no-index metadata. The one-time link modal has Copy Link and clears its in-memory value when dismissed. No raw reset link is saved in browser storage or audit data.

## Endpoints

All paths below have the existing `/api` prefix on Nest. Account and step-up endpoints require an active Super Admin. Reset validation/completion are public possession-of-token operations with DTO validation and throttling.

| Method | Path | Purpose |
|---|---|---|
| POST | `/super-admin/accounts` | Create Admin or MFA-authorized Super Admin |
| GET | `/super-admin/accounts` | Server-side search, role/state filters, sort and pagination |
| GET | `/super-admin/accounts/:id` | Safe account detail |
| PATCH | `/super-admin/accounts/:id/state` | Synchronize database/Cognito state and revoke sessions |
| DELETE | `/super-admin/accounts/:id` | Delete Admin authentication identity and soft-delete metadata |
| POST | `/super-admin/accounts/:id/password-reset-link` | Consume MFA grant and return reset link once |
| POST | `/auth/step-up/challenge` | Start fresh, operation-bound Cognito MFA |
| POST | `/auth/step-up/verify` | Verify code and return a short-lived grant once |
| POST | `/auth/password-reset/validate` | Validate an unused/unexpired token |
| POST | `/auth/password-reset/complete` | Claim token, update password and revoke sessions |
| POST | `/auth/login`, `/auth/challenge` | Existing login, now also supporting `NEW_PASSWORD_REQUIRED` |

Example Admin creation body (replace placeholders in a trusted client):

```json
{"name":"Admin Name","email":"admin@example.test","role":"ADMIN","state":"ACTIVE","password":"<private initial password>"}
```

List example: `GET /api/super-admin/accounts?search=admin&role=ADMIN&state=ACTIVE&page=1&pageSize=10&sort=createdAt&direction=desc`. Response: `{ "items": ["safe account objects"], "total": 1, "page": 1, "pageSize": 10, "pageCount": 1 }`. Sorting fields are allowlisted; page size is bounded at 100; ties use the stable UUID. Timestamps are ISO UTC and last login comes only from successful backend authentication.

Reset challenge body: `{ "operation": "PASSWORD_RESET", "targetId": "<account UUID>", "password": "<initiating Super Admin password>" }`. Super Admin creation challenge replaces `targetId` with `account` containing the full intended creation body and uses `operation: "CREATE_SUPER_ADMIN"`. Verify with `{ "challengeId": "<challenge UUID>", "code": "<fresh MFA code>" }`; send the returned `stepUpProof` with the bound create request or to the target's reset-link endpoint. Reset completion body: `{ "token": "<private token>", "password": "<new password>", "confirmPassword": "<same password>" }`.

The former direct `/super-admin/accounts/:id/password` endpoint was removed; it cannot bypass fresh MFA. Super Admin deletion is rejected at the API. Self-deactivation and deactivation of the last active Super Admin are blocked. Disabling/deleting/resetting advances a database session cutoff, so old JWTs remain rejected after reactivation even if their cryptographic expiry has not passed. Deletion checks immutable subject/ownership before disabling, globally signing out and deleting Cognito identities; unrelated identities are never adopted or removed. Soft-deleted usernames remain reserved to preserve historical identity and prevent accidental reuse.

## Configuration and operations

Reuse the existing `DATABASE_URL`, `AWS_PROFILE`/runtime IAM role, `AWS_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, optional `COGNITO_CLIENT_SECRET`, `IDEMPOTENCY_SECRET`, `FRONTEND_ORIGIN`, and `NODE_ENV`. Next.js continues to use `BACKEND_API_URL`, `SESSION_SECRET`, and `NEXT_PUBLIC_APP_URL`/`FRONTEND_ORIGIN`. No secret values belong in source. Do not rotate `IDEMPOTENCY_SECRET` while MFA challenges are in flight unless their invalidation is intended.

The backend IAM role needs the existing identity/password/status permissions plus `cognito-idp:AdminUserGlobalSignOut`, `cognito-idp:AdminDeleteUser` and `cognito-idp:GetUserPoolMfaConfig`, restricted to the configured pool. Fresh step-up uses the existing app-client `USER_PASSWORD_AUTH` flow and secret-hash handling. Pool MFA settings are read only. An initiating Super Admin must finish their own existing Cognito MFA enrollment by signing in before a fresh sensitive-operation challenge can succeed.

```powershell
# backend/
npm ci
npm run prisma:generate
npm run migrate:deploy
npm run check
npm test
npm run test:integration
npm run test:e2e
npm run build
npm start

# frontend/
npm ci
npm test
npm run lint
npm run build
npm run dev
```

On Windows, stop only the application's running backend before Prisma generation if its native query-engine DLL is locked, then restart it after migration/build. Never use migrate reset on the application database. Integration tests must use a disposable database named `zenex_test` or `zenex_test_<suffix>`; the helper validates this boundary. Browser tests run isolated Next/Nest services, PostgreSQL and Chrome with test-only Cognito/S3 transports. They do not prove real AWS password/MFA login.

Existing unrelated ERP features that already returned 501 in connected mode (for example order/catalogue/master-editing operations without a Nest implementation) remain outside this account-management change. Both dashboards retain that same supported/unsupported backend behavior; no fallback to prototype writes was introduced. Administrative Imports now has its separate implementation and runbook in `administrative-imports.md`.

Actual execution results and cleanup evidence are recorded in `account-lifecycle-verification.md`.
