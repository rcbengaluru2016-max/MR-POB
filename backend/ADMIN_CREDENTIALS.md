# Admin credential creation

The Super Admin form again requires Name, Email / username, Role (ADMIN), Initial account status and Initial password. The password is forwarded server-to-server to Nest and Cognito, never saved in PostgreSQL, returned, audited, or logged. Existing database-only Admin rows have a **Set initial password** action. Reset password uses the same protected backend workflow. Inactive accounts remain inactive after a password reset; use Unlock separately.

The two dashboard routes/layouts and sidebar sections are preserved. Admin login now lands at `/admin/dashboard`. Users & Accounts remains exclusively under `/super-admin/users`; Nest independently requires an active database SUPER_ADMIN for create/list/detail/password/state APIs. The production backend continues supporting creation of ADMIN accounts only; forged SUPER_ADMIN roles are rejected. The existing prototype Super Admin creation/security setup workflow is unchanged.

## Configuration and persistence

Use the existing `DATABASE_URL`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, optional `COGNITO_CLIENT_SECRET`, AWS SDK credential chain, and frontend `BACKEND_API_URL`. No new environment variables, schema changes or migrations are needed for this update; existing migrations must already be deployed. Do not create a second database or pool.

The backend AWS principal requires the pool-scoped actions in `infra/cognito-accounts-policy.json`. Replace both ARN placeholders with the existing account/pool identifiers before attaching the policy to the actual backend role/profile. This file is a template and has not been applied to AWS. The existing S3 policy remains unchanged. The app client must allow USER_PASSWORD_AUTH. Required pool attributes must be supported by the form (name/email); pools requiring additional attributes need configuration review. Required authenticator MFA is supported at first sign-in through AssociateSoftwareToken, VerifySoftwareToken and MFA_SETUP; existing SMS/TOTP challenges remain supported. This does not weaken the pool's MFA policy.

AdminCreateUser suppresses invitation messages; AdminSetUserPassword uses Permanent=true so the configured initial password is usable without an unsupported forced-password-change challenge. Share credentials securely. The standard Cognito `profile` attribute contains a nonsecret ERP account ownership marker. No custom pool schema is needed. Do not remove that marker from identities awaiting recovery.

## Failure handling

Creation reserves a case-insensitively unique ERP account as INACTIVE before calling AWS. A PostgreSQL advisory lock serializes password/state operations across instances. Independent committed writes make the inactive gate visible before remote calls; keep at least two PostgreSQL connections available per running backend. Each provisioning AWS request has a five-second abort deadline and no automatic retry.

Cognito's subject is linked while access is still inactive. Activation occurs only after password and provider state succeed. Any intermediate failure leaves a durable inactive reservation; do not create a second account. Refresh Users & Accounts, use Set initial password / Reset password, then Unlock if appropriate. A crash or ambiguous create timeout is recoverable using the ERP ownership marker. An unrelated existing Cognito user is never adopted, deleted, or given a replacement password. An operator must reconcile a genuine identity collision.

Lock first commits INACTIVE, denying existing ERP tokens, then disables Cognito. Unlock keeps ERP inactive until Cognito enable succeeds. Provider failures may leave provider and ERP state temporarily different, but ERP access remains denied; explicitly retry the operation. This is a recoverable workflow across two systems, not a distributed atomic transaction. Reserved records and linked subjects intentionally remain for recovery rather than unsafe deletion after uncertain remote outcomes.

## Manual verification (real Cognito)

Keep the frontend on 3000 and one backend process on 3001. If EADDRINUSE occurs, identify the existing listener before starting another backend. Renew the AWS session used by that backend, then restart it. At implementation time, read-only pool/client checks failed with **CredentialsProviderError: Your session has expired. Please reauthenticate.** Real AWS provisioning/sign-in has therefore not been verified.

1. Sign in as Super Admin; open every existing sidebar section, then Users & Accounts. Confirm all five form fields remain visible and password is mandatory.
2. Create a uniquely named Admin using a real email, Active status, and a private 12–128 character password with uppercase/lowercase/digit/symbol and no spaces. Confirm success, one row, and persistence after refresh.
3. Sign out and sign in using that email/password. Complete authenticator enrollment if requested. Confirm `/admin/dashboard`, all existing Admin sections, and no Users & Accounts link. Direct `/super-admin/users` must be denied.
4. Repeat with Inactive status. Login must fail. Super Admin Unlock must enable login; Lock must deny both fresh logins and subsequent authenticated API calls.
5. Duplicate email (including different case), missing password, weak password, unsupported role, and forged identity/creator fields must fail without creating an extra usable account.
6. Existing database-only rows: Set initial password, then Unlock if inactive. Existing bound rows: Reset password; confirm only the replacement password works.
7. Verify shared registrations, counts, decisions and documents still work in both dashboards.

For API checks in a separate PowerShell terminal (never put permanent credentials in saved scripts):

```powershell
$Base = 'http://localhost:3001/api'
$Headers = @{ Authorization = "Bearer $SuperToken" } # existing verified Super Admin access token
$SecurePassword = Read-Host 'Initial password' -AsSecureString
$Password = [System.Net.NetworkCredential]::new('', $SecurePassword).Password
$Body = @{ name='Manual Admin'; email='REPLACE_WITH_UNIQUE_REAL_EMAIL'; role='ADMIN'; state='INACTIVE'; password=$Password } | ConvertTo-Json
$Created = Invoke-RestMethod "$Base/super-admin/accounts" -Method Post -Headers $Headers -ContentType 'application/json' -Body $Body
$Password = $null; $Body = $null; $SecurePassword = $null
$Created.account
Invoke-RestMethod "$Base/super-admin/accounts" -Headers $Headers
Invoke-RestMethod "$Base/super-admin/accounts/$($Created.account.id)/state" -Method Patch -Headers $Headers -ContentType 'application/json' -Body '{"state":"ACTIVE"}'
```

The password API is `POST /api/super-admin/accounts/:id/password` with `{password}`. Using an Admin token instead of `$SuperToken` on any account endpoint must return 403; no token must return 401. Password values/hashes must never appear in responses or audit rows.

Automated tests use disposable PostgreSQL plus a test-only Cognito transport and JWT-verification replacement; production services still call the real AWS SDK. Those tests do not prove live AWS credentials, IAM, pool settings or delivery services are configured correctly.

## Files changed for this update

- Backend: `src/accounts/accounts.dto.ts`, `accounts.module.ts`, `accounts.service.ts`, new `cognito-accounts.service.ts`; `src/auth/auth.service.ts` and `auth.module.ts`.
- Frontend: `components/super-admin/user-management.tsx`, `components/forms/login-form.tsx`, `app/api/super-admin/accounts/route.ts`, `lib/server/backend.ts`, `lib/server/backend-mode.ts`.
- Tests: `test/accounts.spec.ts`, `auth.spec.ts`, `throttle.spec.ts`, `integration/admin-management.spec.ts`, new `fixtures/cognito.ts`, `e2e/admin-credentials.e2e.ts`, `e2e/backend-harness.ts`, `e2e/registration.e2e.ts`; frontend `tests/backend-adapter.test.mjs`, `backend-http.test.mjs`.
- Configuration/docs: new pool-scoped IAM template and this guide; links/notices in README, ADMIN_MANAGEMENT and MANUAL_TESTING. Dashboard route files, layouts, navigation and database schema were not modified for this credential restoration.

## Verification results (23 October 2026)

- Backend unit/HTTP: 82 tests passed across 5 suites.
- PostgreSQL integration: 18 tests passed across 2 suites using an isolated disposable database.
- Frontend: ESLint and TypeScript checks passed; 4 security tests and 5 backend adapter tests passed; real Next HTTP adapter test passed (1 test).
- Focused Chrome browser test passed (1 test, 43.4 seconds): Super Admin creates credentials through the real UI/API/database services, the new Admin signs in with that password, lands on the separate Admin dashboard without Users & Accounts, receives 403 on the account API and is denied the Super Admin page. Cognito transport/JWT verification are replaced only in the isolated test harness.
- Backend `check` passed. Later builds encountered concurrent notification/SQS changes and inconsistent generated Prisma types. After regenerating the client against the current schema, the full backend build passed. Those unrelated source changes were preserved. The credential change requires no database migration; concurrent notification work has separate setup requirements.
- The broad registration browser regression test did not pass: its latest run timed out opening Registration Details after clicking View. Earlier runs reached successful Admin creation, then failed at logout/login test synchronization (subsequently corrected). Do not treat this broad test as passed.
- AWS pool/client readiness check failed because the local AWS session expired. No real Cognito identity was created as part of these automated tests.
- Next startup also emitted an existing version security-advisory reminder. No framework upgrade was performed as part of this scoped credential change.
