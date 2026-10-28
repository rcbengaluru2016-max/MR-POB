# Local startup and account-management verification

For the 27 October Admin creation/status/password-reset repair and latest verification, see [admin-account-repair-2026-10-27.md](admin-account-repair-2026-10-27.md). The results below are the earlier 26 October verification history.

Verified on 26 October 2026. Implementation details, API examples, MFA/reset security and IAM requirements are in [account-lifecycle.md](account-lifecycle.md).

## Completed changes

- Removed all three screenshot Admins from active use: `mohan@test.com`, `nn23abu@herts.ac.uk`, and `nanjegowdanitin@gmail.com`. Their records are soft-deleted and inactive; no matching Cognito identities existed. Three deletion audits were recorded. No visible Admin remains, ready for manual creation of a fresh account.
- Verified that the existing `administrator` Super Admin database record and Cognito identity settings were unchanged. The four original registrations and document database records matched the pre-cleanup preservation baseline. Historical account relationships and audit records were retained.
- Connected Admin creation to Cognito credentials and PostgreSQL metadata, with fail-closed provisioning and safe recovery. Admin creation does not request fresh MFA from the initiating Super Admin.
- Added Super Admin creation with a fresh Cognito password/MFA challenge, single-use operation-bound authorization, temporary initial credentials and mandatory first-login private-password/MFA setup.
- Added backend search, independent/combinable role/status filters, stable sorting, pagination and trusted successful-login timestamps. Account profile pages now receive safe email/creation/login metadata from the backend.
- Enabled confirmed Admin deletion, blocked Super Admin deletion and self-deactivation, protected the last active Super Admin, synchronized provider status and enforced database session-revocation cutoffs.
- Replaced direct password setting with fresh-MFA, one-time 30-minute reset links. Tokens are hashed, atomically claimed and never stored as raw links. Reset links cannot undo later account deactivation. Successful reset clears the browser session and returns to Login with a success message.
- Preserved the dashboard layouts and shared registration/analytics/document backend. The Admin navigation has no Users & Accounts entry; direct account-management requests are independently rejected by the backend.
- Completed the Imports dependency/runtime setup requested during verification: ExcelJS 4.4.0, yauzl 3.4.0, its type declarations, and the additive Imports schema migration. Repaired one invalid Windows-1252 middle-dot byte in the upload-history component without changing its behavior.

## Actual verification

| Check | Result |
|---|---|
| Backend unit suite | 173 passed across 11 suites; focused authentication rerun: 13 passed |
| PostgreSQL integration suite | 100 passed across 7 suites |
| Frontend regression tests | 47 passed |
| Full Chrome workflow run | 9 passed; no skipped or flaky cases |
| Saved Imports Chrome verification | 2 passed: Admin bulk import/history/download and Super Admin single upload/automatic approval |
| Final reset redirect workflow | 1 focused Chrome scenario passed after adding automatic return to Login |
| Backend TypeScript build | Passed |
| Frontend production build | Passed with Next.js 16.4.2, including TypeScript and prerendering |
| Full frontend lint and final standalone TypeScript check | Passed |
| Local backend liveness/readiness | Both returned HTTP 200 with `status: ok` |
| Local frontend login/reset pages | HTTP 200; reset headers `Referrer-Policy: no-referrer` and `Cache-Control: no-store` |
| Preservation and cleanup | All three Admins inactive/deleted, zero visible Admins, Super Admin unchanged, four registrations retained, three deletion audits |

The integration cases include Admin creation/login, Super Admin MFA/onboarding, invalid/expired/reused/actor-mismatched MFA, bound grant replay rejection, case-insensitive/concurrent duplicate detection, password validation, combined filters, pagination/sorting, account-state transitions, concurrent Super Admin deactivation, reset expiry/single-use/older-link invalidation, provider and database partial failures, audit retention, and role enforcement. Browser scenarios also cover existing registration forms, approval/rejection by both dashboard roles and shared dashboard data.

PostgreSQL and Chrome were real. Cognito/S3 transports were replaced only inside isolated test processes. Tests created disposable `zenex_test_*` databases, not application registrations. Actual AWS checks were read-only configuration/identity/storage checks; no real new Admin was created, preserving your plan to create it manually. No real Super Admin password or authenticator code was requested or changed.

Initial failed checks were corrected and rerun: the old direct-password/OpenAPI expectations, URL/selectors affected by server pagination and retained page DOM, the test JWT transport/origin, a controlled/uncontrolled MFA input warning, a development-cache compression allocation failure, missing Imports dependencies/schema, and the invalid source byte. The browser harness disables persistent dev caching only for disposable test copies. Generated production-check copies are excluded from lint/TypeScript to avoid races when those temporary folders are deleted; application and test source remain checked. Resource-sensitive migration attempts were retried after checking the existing healthy database; no database reset was used.

Machine-readable results and database backups are retained locally under ignored `backend/.local/account-lifecycle/`. The original database backup and the fresh pre-Imports backup are separate files.

## Run locally in your terminals

Dependencies are installed and both migrations are applied. Start Docker Desktop first. Use `localhost` consistently so cookies and origin checks match the configured application URLs. Keep the two terminals open.

The agent-started backend was stopped after readiness verification, and ports 3000/3001 were checked for terminal handoff. The PostgreSQL container is left running. If you subsequently start another copy, stop it with Ctrl+C before restarting on those same ports.

### Terminal 1: backend

```powershell
Set-Location 'D:\Personal Projects\MRPOB\backend'
docker start zenex-erp-dev-postgres-1
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop, then retry.' }

aws sts get-caller-identity --profile zenex-dev
if ($LASTEXITCODE -ne 0) {
    aws login --profile zenex-dev
    if ($LASTEXITCODE -ne 0) { throw 'AWS sign-in did not complete.' }
}

npm run migrate:deploy
if ($LASTEXITCODE -ne 0) { throw 'Database migration failed.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Backend build failed.' }
npm start
```

Wait for the backend-ready message on port **3001**. In another terminal, `Invoke-RestMethod 'http://localhost:3001/api/health/ready'` should return `status: ok`.

### Terminal 2: frontend

```powershell
Set-Location 'D:\Personal Projects\MRPOB\frontend'
npm run dev -- --hostname localhost --port 3000
```

Open [the local login page](http://localhost:3000/login). The frontend uses `BACKEND_API_URL=http://localhost:3001`; both trusted frontend-origin settings use `http://localhost:3000`. Existing private `.env` and `.env.local` files are retained. Never replace their secret values with examples.

For a fresh checkout or dependency change, stop all application/test processes before running `npm ci` in each directory and `npm run prisma:generate` in `backend`. A running Prisma process can lock its native engine DLL on Windows. Ordinary startup above does not need to reinstall dependencies or regenerate that DLL. Do not use `prisma migrate reset` on the application database.

## Manual acceptance check

1. Sign in with the existing `administrator` credentials. Complete Cognito authenticator setup if requested. Cognito currently requires software-token MFA and returned no enrolled MFA method for the existing Super Admin during inspection; the application has not changed that setting.
2. Open **Users & Accounts** and create an **Admin**, supplying a name, a **new unique email**, Active status and a password of at least 12 characters with uppercase, lowercase, number and symbol. Deleted usernames remain reserved for audit/history, so do not reuse the three deleted test logins.
3. Confirm the new account is Active, log out, and sign in using its credentials. Complete its Cognito MFA enrollment/challenge if requested. The destination must be `/admin/dashboard`.
4. Review the shared registrations, analytics and documents. Confirm Users & Accounts is absent. Opening `/super-admin/users` as that Admin must give access denied; account-management APIs must reject it.
5. Return to the Super Admin to test filtering, state changes or confirmed deletion. Reset Password and creating another Super Admin require the initiating Super Admin's current password and a fresh MFA code. A new Super Admin must complete private-password and authenticator setup before access.

## Remaining configuration limits

- Your real AWS-backed creation/login remains the planned manual acceptance step. Automated Cognito/S3 transports do not establish live write-IAM permissions. The runtime AWS identity must have the scoped Cognito provisioning/password/status/global-sign-out/delete/MFA-policy permissions and the existing private S3 permissions described in the implementation runbooks.
- An expired AWS profile must be renewed with `aws login --profile zenex-dev`. A browser AWS-console login alone does not renew the local SDK profile.
- Customer/Patient password-free self-service activation remains an existing limitation documented in the Imports runbook.
- Existing connected-mode features without an implemented backend remain explicitly unavailable; this account change does not silently write to the prototype JSON store. Administrative Imports now has its own implementation and [runbook](administrative-imports.md).

## Files relevant to this account change

- Backend: `prisma/schema.prisma`, the `20261026120000_account_lifecycle` migration, `src/accounts/` DTO/controller/service/provider/step-up files, and `src/auth/auth.module.ts` / `auth.service.ts`.
- Frontend: the Users & Accounts, login and reset forms; `lib/server/backend-api.ts`, `backend-client.ts`, `super-admin.ts`; `lib/types.ts`; reset-page privacy metadata/headers; and the new step-up/reset-validation route files.
- Verification: account/auth/Swagger tests, Cognito test transport, account lifecycle PostgreSQL tests, browser credential scenarios, and browser harness/origin/port isolation.
- Runtime setup: backend dependency manifests, the additive `20261026140000_administrative_imports` migration, and the single-character UTF-8 repair in the Imports upload-history page.

Unrelated existing workspace changes were retained.
