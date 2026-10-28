# Account Information and self-service password changes

## Existing architecture and scope

NestJS validates Cognito access JWTs with `aws-jwt-verify` (signature, pool issuer, app client, token use and expiration). The verified subject selects the existing Prisma `ErpUser` in PostgreSQL. Database state, deletion, role, MFA enrollment gate and `tokensValidAfter` remain authoritative. Super Admin access also requires the existing server-recorded sign-in MFA proof. The existing login completion handler updates `lastLoginAt` only after authentication, including required sign-in MFA, completes.

This implementation reuses `AccountStepUp`, `AuditEvent`, existing JWT/role guards, Cognito authentication and the Next.js backend proxy. No table, field, migration, authentication system, credential store, or dependency is added. Existing lifecycle migrations must already be deployed. No live AWS configuration is changed by this implementation.

## REST contract

All routes have the existing global `/api` prefix. Requests require a Cognito bearer access token. There is no caller-selected profile account ID.

| Method | Path | Body / result |
| --- | --- | --- |
| GET | `/account/me` | Safe database profile, ISO UTC creation/login timestamps, and actual MFA status for Super Admins only |
| GET | `/account/me/security` | Super Admin only; `mfaEnabled`, `mfaMethod`, `mfaStatus` |
| POST | `/account/me/change-password/challenge` | `{currentPassword}` → `{challengeId, challengeName, expiresAt}` |
| POST | `/account/me/change-password/verify` | `{challengeId, code}` → `{stepUpProof}` |
| POST | `/account/me/change-password` | `{currentPassword, password, confirmPassword, stepUpProof}` → `{ok, message}` |

Backend profile fields are `id`, `accountHolder`, `username`, nullable `email`, `role`, `status`, `createdAt`, nullable `lastSuccessfulLogin`, and optional `security`. Ordinary Admin profiles omit `security`; security/password endpoints reject their role. Missing login is `null`, displayed as **Never**. No profile read or password step-up updates creation or login timestamps.

## Cognito MFA and password changes

`AdminGetUser` must return an enabled identity whose subject matches the PostgreSQL account. Only `UserMFASettingList` containing `SOFTWARE_TOKEN_MFA`, together with an enabled software-token pool policy (`OPTIONAL` or `ON`), confirms the badge. SMS alone, the database role, an old login proof, or an enrollment-required account never confirms enrollment. Provider errors fail closed and return a sanitized retry error.

Cognito does not offer arbitrary verification of an existing user's TOTP through `VerifySoftwareToken`; that API is for enrollment. Instead, the existing `USER_PASSWORD_AUTH` step-up asks for the current password and requires Cognito to return `SOFTWARE_TOKEN_MFA`. The provider session is encrypted at rest using the existing step-up encryption key. The current password is not stored server-side; the client retains it in component memory until completion/cancellation, and submits it again for Cognito `ChangePassword`.

The five-minute challenge is bound to the actor, a SHA-256 digest of the current access token, and `SELF_PASSWORD_CHANGE`. Verification permits five attempts, uses Cognito's backend challenge response, verifies the resulting subject, and produces a random proof stored only as a hash. The verified proof expires after two minutes and is consumed once with an atomic database condition. Concurrent or replayed verification cannot replace an already issued proof. Other administrative step-up operations cannot authorize this operation.

Passwords require 12–128 characters, uppercase, lowercase, a digit and a symbol, with no whitespace; confirmation must match and the new password must differ from the supplied current password. Cognito verifies the current password and its own configured password/history policy through [`ChangePassword`](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_ChangePassword.html). Plaintext passwords and MFA codes are never logged or persisted by this implementation.

Challenge initiation is limited to five requests/minute, verification to ten/minute, and password updates to five/minute per the existing throttler. Five failed attempts also exhaust an individual challenge.

## Session revocation and failure semantics

Proof consumption, a local session cutoff, and the started audit event commit before contacting Cognito. An uncertain remote write cannot release an authorization for reuse. `tokensValidAfter` rejects old ERP access JWTs even though offline signature verification alone cannot detect Cognito revocation. `GlobalSignOut` also revokes provider sessions where supported. The cutoff is advanced again after the remote attempt, including failures, to reject sessions issued during the update. Provider sign-out failure is audited; the local cutoff still applies.

On success the Next.js proxy clears authentication cookies, shows exactly “Your password has been changed successfully. Please sign in again using your new password.”, and redirects to login. A provider password failure/timeout also consumes the proof and revokes local sessions; the user must sign in before retrying. An uncertain response may mean the provider accepted the new password, so the error does not falsely assert that no change occurred.

## Audit events

Existing `AuditEvent` rows record actor ID, UTC timestamp and action: `SELF_PASSWORD_CHANGE_CHALLENGE`, `SELF_PASSWORD_CHANGE_CHALLENGE_FAILED`, `SELF_PASSWORD_CHANGE_MFA_VERIFIED`, `SELF_PASSWORD_CHANGE_MFA_FAILED`, `SELF_PASSWORD_CHANGE_STARTED`, `SELF_PASSWORD_CHANGE_FAILED`, `SELF_PASSWORD_CHANGE_REJECTED`, `SELF_PASSWORD_CHANGED`, `SELF_PASSWORD_CHANGE_SESSIONS_REVOKED`, and `SELF_PASSWORD_CHANGE_REMOTE_SIGNOUT_FAILED`. Existing step-up failure events are retained. No event contains passwords, MFA codes, provider sessions or plaintext proofs. Existing global DTO validation rejects malformed bodies before service execution.

## Frontend and changed files

- `src/accounts/current-account.service.ts`: current profile, provider MFA lookup, DTOs, self-password workflow and audits.
- `src/accounts/accounts.module.ts`: registers current-account controller/service and five routes.
- `src/accounts/step-up.service.ts`: reusable bound challenge and optional binding restriction during verification.
- `../frontend/lib/server/current-account.ts`: authenticated uncached server profile request.
- `../frontend/lib/server/backend-api.ts`: same-origin, cookie-authenticated proxy routes and success cookie clearing.
- `../frontend/app/super-admin/account/page.tsx` and `error.tsx`: existing layout with real profile/security data and retry UI.
- `../frontend/components/super-admin/change-password.tsx`: current-password, authenticator, new-password, success stages; existing local development mode retained.
- `../frontend/components/account-timestamp.tsx`: browser locale/timezone date formatting.
- `test/current-account.spec.ts`, `test/integration/current-account.spec.ts`, `test/e2e/current-account.e2e.ts`, `test/fixtures/cognito.ts`, `test/e2e/backend-harness.ts`: unit, PostgreSQL and browser coverage with isolated provider fixtures.

The initials navigation already linked to `/super-admin/account` and is preserved. No unrelated page is redesigned.

## Environment and Cognito prerequisites

No new environment variables. Existing configuration is required:

- Backend: `DATABASE_URL`, `AWS_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, optional `COGNITO_CLIENT_SECRET`, `IDEMPOTENCY_SECRET`, `FRONTEND_ORIGIN`, and the existing AWS credential provider/profile configuration.
- Frontend: `BACKEND_API_URL`, `SESSION_SECRET`, and existing app origin configuration (`FRONTEND_ORIGIN` / `NEXT_PUBLIC_APP_URL`).

The existing app client must allow `USER_PASSWORD_AUTH`. User access tokens need `aws.cognito.signin.user.admin` for `ChangePassword` and `GlobalSignOut`. Runtime IAM must allow `cognito-idp:AdminGetUser` and `cognito-idp:GetUserPoolMfaConfig` on the configured pool. The repository's older example policy does not include the latter; grant it through the deployment's existing IAM management. This does not require new administrative password-reset permissions. Enable software-token MFA in the existing pool; with ordinary Admin password-only login, retain the existing `OPTIONAL` pool policy. Configure any stricter password/history requirements in Cognito. Real AWS credentials and configuration are deliberately not changed by tests.

## Run and verify

From `backend`, run `npm run build`, `npm test -- --runTestsByPath test/current-account.spec.ts test/auth.spec.ts test/accounts.spec.ts`, `npm run test:integration -- --runTestsByPath test/integration/current-account.spec.ts`, and `npm run test:e2e -- test/e2e/current-account.e2e.ts`. Docker Desktop must be running for isolated PostgreSQL tests. If using `TEST_DATABASE_URL`, it must point to a disposable database named `zenex_test` or `zenex_test_<suffix>`; never use the development or production database. Browser tests start their own backend and frontend.

From `frontend`, run `npx tsc --noEmit -p tsconfig.build.json`, `npm run lint`, and `npm run build`. Start the existing backend/frontend with the local-development guide, log in with an enrolled Super Admin, click initials, compare stored profile timestamps, complete fresh MFA and password update, confirm cookie removal and redirection, and sign in again with the new password. A final live Cognito smoke test is still required before deployment; automated tests mock only the provider transport and JWT cryptography.

### Verified results, 27 October 2026

| Check | Result |
| --- | --- |
| Backend production TypeScript build | Passed |
| Backend unit regression suite | 12 suites, 185 tests passed |
| Frontend unit suite | 47 tests passed |
| Current-account PostgreSQL integration | 11 tests passed |
| Current-account Chrome end-to-end | 2 tests passed |
| Frontend production TypeScript check | Passed |
| Full frontend ESLint suite | Passed |
| Frontend Turbopack production build | Passed after replacing stale generated build/cache artifacts |

The first integration/browser runs found two overly broad test assertions (the word `TOKEN` in a safe MFA method label, and the Next.js route announcer sharing the alert role). Both were corrected and both suites reran successfully. Docker-backed verification required normal Docker access outside the restricted sandbox. The initial production build repeatedly reported a CSS-worker child-process failure; preserving `.next/build` and `.next/cache` as generated backup directories and rebuilding produced a successful optimized build without source/configuration changes.

## Outstanding broader guard enforcement

Shared `AdminGuard` and `SuperAdminGuard` remain unchanged. They retain the existing database role/state and sign-in MFA enforcement. Every new password-change operation additionally checks live provider enrollment. Extending live Cognito MFA checks to all pre-existing privileged operations was rejected by automatic approval review because a provider outage could cause application-wide lockouts. That broader acceptance criterion requires an approved availability/enforcement design; it is not claimed complete here.
