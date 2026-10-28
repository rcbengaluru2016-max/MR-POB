# Admin account repair — 27 October 2026

## Confirmed root cause

Read-only calls against the configured Cognito pool showed that `AdminGetUser` succeeded with each account's username but returned `UserNotFoundException` for the same account's `sub`. Creation had already created the identity, saved its subject and set the password, then failed on the status operation because that operation used the subject as the provider username. The database correctly stayed inactive on failure, causing the selected Active status to appear broken. Activation, deletion and password recovery shared the same incorrect lookup assumption. The fixture transport accepted subjects as usernames and masked the defect.

The provider now resolves the stored login username and checks the returned immutable subject before modifying credentials or status. Operations use the returned canonical username. Existing accounts require no subject rewrite, migration, pool recreation or password change. A mismatched subject is still rejected.

## Changes

- `src/accounts/cognito-accounts.service.ts`: use username lookup and verify subject for credential, enable/disable and removal operations.
- `src/accounts/accounts.service.ts`: pass username plus subject to provider status operations; protect concurrent creation retries from overwriting a completed login; add direct Admin-only password reset with existing session authorization, previous-status preservation, session revocation, reset-link invalidation and audit events. Remote uncertainty leaves ERP access inactive.
- `src/accounts/accounts.dto.ts`, `accounts.module.ts`: validated, throttled `POST /api/super-admin/accounts/:id/password-reset`, guarded by the existing verified Cognito JWT and Super Admin role guards. The body is `{ password, confirmPassword }`; passwords are write-only and never stored by ERP, logged or returned.
- `frontend/lib/server/backend-api.ts`: same-origin authenticated proxy action `reset-password`.
- `frontend/components/super-admin/user-management.tsx`: Admin reset modal has only New Password and Confirm Password; no additional password, MFA or OTP prompt. Super Admin targets retain the existing fresh-MFA reset-link flow. Both dashboards retain their design and separation.
- `test/fixtures/cognito.ts`: reject subject-as-username lookups, matching the actual pool.
- `test/integration/account-lifecycle.spec.ts`, `test/e2e/admin-credentials.e2e.ts`: status synchronization, direct reset, input/permission failures, subject mismatch, provider failure, actual password login through the test transport and dashboard redirection checks.

No database migrations or authentication/MFA configuration changes are required. Normal Cognito login and MFA remain enabled according to the existing pool policy.

## Local run

Stop the old backend/frontend with Ctrl+C in their terminals before starting the updated versions. Docker Desktop must be running.

Backend, PowerShell terminal 1:

```powershell
Set-Location 'D:\Personal Projects\MRPOB\backend'
docker start zenex-erp-dev-postgres-1
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL could not start.' }
aws sts get-caller-identity --profile zenex-dev
if ($LASTEXITCODE -ne 0) {
    aws login --profile zenex-dev
    if ($LASTEXITCODE -ne 0) { throw 'AWS sign-in failed.' }
    aws sts get-caller-identity --profile zenex-dev
    if ($LASTEXITCODE -ne 0) { throw 'AWS credentials are unavailable.' }
}
npm run migrate:deploy
if ($LASTEXITCODE -ne 0) { throw 'Migration deployment failed.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Backend build failed.' }
npm start
```

Frontend, PowerShell terminal 2:

```powershell
Set-Location 'D:\Personal Projects\MRPOB\frontend'
npm run dev -- --hostname localhost --port 3000
```

Open http://localhost:3000/login. Verify Active and Inactive creation, activation/deactivation after refresh, two-field Admin password reset, old-password rejection, new-password login with any normal provider MFA, Admin dashboard redirect, and denial of Users & Accounts to Admin users. A password reset preserves the account's previous status; resetting an Inactive account does not activate it.

## Verification status

- Backend production TypeScript build: passed.
- Backend unit tests: 173 passed in 11 suites (rerun with loopback access after the sandbox blocked HTTP fixtures).
- Account lifecycle and shared Admin dashboard PostgreSQL integration tests: 30 passed in 2 suites. Includes new direct-reset, inactive-creation, subject-mismatch and concurrency cases. Each run used a newly created disposable database that was dropped afterward; the real database was not truncated or reset.
- Frontend production build: passed, including Next TypeScript checking and 107 prerendered pages. The sandbox initially blocked Turbopack worker startup; the normal-host build succeeded.
- Frontend regression suite: 47 passed. Focused frontend lint passed. Chrome account workflows: 3 passed on the final rerun (creation/Admin dashboard access; two-field Admin reset and old/new credential checks; fresh-MFA Super Admin creation and first-login password/MFA setup). The first browser run caught the reset field accessible label including its help text; the input label was corrected and the complete file rerun passed.
- Real backend HTTP readiness returned 200 with `{ "status": "ok" }`. The verification launch was stopped afterward. A separate npm-start backend belonging to the existing terminal was identified and left untouched; stop existing app instances with Ctrl+C before following the startup commands.
- Live read-only Cognito/database diagnosis: passed; confirmed username succeeds and subject fails for the same two existing users.
- After explicit user approval, all 20 real Cognito/PostgreSQL service verification checks passed for Active and Inactive creation, provider identity linking, activation/deactivation, real software-token MFA and JWT verification, old-token rejection, direct password reset, old-password rejection and new-password login. Only temporary accounts generated for verification were removed through the audited lifecycle; their database audit/history rows remain soft-deleted. The first attempt reused a TOTP time window and Cognito rejected the replay; verification was rerun successfully using fresh codes.
- Existing screenshot account `nnanjegowda69@gmail.com` is now ACTIVE; its password was not changed. Super Admin database metadata was unchanged, and the registration checksum matched before/after. No Super Admin password or MFA settings were modified.
- Live verification invokes the real account/authentication services with the existing Super Admin actor ID; browser and HTTP authorization tests use a disposable database and test-only provider/JWT transport. The real Super Admin browser session/password was not used or bypassed in the running application.

Final read-back confirmed the screenshot Admin is ACTIVE, Cognito Enabled is true, and its subject matches the database. There are zero visible temporary verification accounts. Use the originally selected password for this existing Admin; the repair did not reset it. If needed, use the new two-field Admin reset form after restarting the updated application.
