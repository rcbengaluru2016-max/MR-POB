# Admin login policy and inactive accounts — 27 October 2026

The shared Cognito pool previously required MFA for every identity. AWS does not allow a per-user exemption while the pool requires MFA. The user explicitly selected OPTIONAL pool MFA, Admin-only MFA disabling, and server-enforced Super Admin MFA.

## Implemented behavior

- Active Admin login checks PostgreSQL status, resolves and verifies its Cognito identity, disables only that Admin's software/SMS MFA preferences, validates the password through Cognito, validates Cognito's access JWT, establishes the existing HttpOnly session and redirects to the Admin dashboard. No competing token issuer was added.
- Inactive Admin login stops before provider authentication, returns HTTP 403 with the safe `ACCOUNT_INACTIVE` code, clears browser authentication cookies and navigates to `/account-inactive`.
- The dedicated page displays exactly: “Your account is currently inactive. Please contact the Super Admin to activate your account.” Back to Login clears the old session.
- Every protected backend request still validates JWT signature/expiry, database role, deletion/status and revocation cutoff. An Admin deactivated after login cannot use the old JWT. Protected page requests detect the backend's inactive-account code, clear stale cookies and redirect to the dedicated page. Protected APIs deny access independently.
- Super Admin login still requires MFA. The backend records only a SHA-256 hash of an MFA-verified access JWT in the existing immutable audit table. A Super Admin JWT without that server-recorded verification is rejected, even if provider MFA preferences are disabled or a caller directly obtains a password-only Cognito token.
- Optional-pool Super Admin enrollment remains supported: pending Cognito tokens and setup sessions are encrypted in a five-minute server-held AccountStepUp record, with a five-attempt limit and one-time consumption. Only an opaque setup ID and required setup secret reach the existing enrollment UI; no usable ERP access cookie is issued before verification. Existing enrolled Super Admin preferences and passwords are not modified.
- Old Super Admin sessions must complete one fresh login after deploying this backend because they do not have the new MFA-verification audit record.

## Files changed for this request

Backend: `src/auth/auth.service.ts`, `src/accounts/cognito-accounts.service.ts`, `src/common/http-error.filter.ts`, and relevant unit/integration/browser fixtures and tests. Frontend: `app/account-inactive/page.tsx`, `components/forms/login-form.tsx`, `lib/server/backend-api.ts`, `lib/server/backend-client.ts`, `proxy.ts`.

No new database migration or password change is required. Existing AccountStepUp and AuditEvent tables provide the enrollment and verification records. Audit data stores token hashes, never plaintext tokens or passwords. Existing dashboard designs and Users & Accounts authorization remain unchanged.

## Applied configuration

The approved pool change was applied with SetUserPoolMfaConfig (OPTIONAL, software-token support retained). Admin preferences were disabled only after verifying the stored subject. A read-back confirmed all existing Super Admin enabled/MFA/preferred-method settings were identical before and after. The private pre-change snapshot is ignored under `.local/account-lifecycle/before-role-mfa-policy.json`.

Backend IAM now also requires `cognito-idp:AdminSetUserMFAPreference` for Admin login. A provider/configuration failure denies login; the application never fabricates a JWT or skips a provider challenge.

## Run locally

Stop older frontend and backend instances with Ctrl+C, then use two PowerShell terminals:

Backend:

```powershell
Set-Location 'D:\Personal Projects\MRPOB\backend'
docker start zenex-erp-dev-postgres-1
aws sts get-caller-identity --profile zenex-dev
# If the AWS profile has expired: aws login --profile zenex-dev
npm run migrate:deploy
npm run build
npm start
```

Frontend:

```powershell
Set-Location 'D:\Personal Projects\MRPOB\frontend'
npm run dev -- --hostname localhost --port 3000
```

Open http://localhost:3000/login. Test the existing Admin with its unchanged password. Toggle Active/Inactive through the Super Admin account, and repeat login. Also deactivate an Admin that is already signed in and reload its dashboard to verify the inactive redirect and API denial. Super Admins must still complete their authenticator prompt.

## Executed verification

- Backend production build passed.
- Backend unit suite: 175 passed in 11 suites, including password-only Super Admin JWT denial and server-held enrollment without issuing ERP access.
- Account lifecycle/shared registration PostgreSQL integration: 30 passed in 2 suites, using a fresh disposable database removed after the run. An earlier attempt caught a concurrently incomplete account-profile/step-up edit; the complete sources compiled and the rerun passed.
- Frontend production build passed with 108 prerendered pages, including `/account-inactive`.
- Frontend regression suite: 47 passed. Focused lint passed.
- Real Cognito/PostgreSQL service checks passed with an explicit failure assertion if Admin login returned any MFA challenge. Covered Active/Inactive creation, activation, direct JWT login, deactivation, old-token rejection, password reset and new-password login. Temporary Admin identities were removed; historical database rows were soft-deleted and audits retained. Existing Super Admin database metadata and registration checksums matched before/after.
- Real configuration read-back confirmed OPTIONAL pool MFA, one existing Admin preference updated, and every existing Super Admin MFA preference unchanged.
- Chrome creation/direct Admin login, direct password reset, and Super Admin password/MFA enrollment workflows passed. The combined inactive journey initially encountered an access-denied screen in the test setup; the separate browser context was given an explicit base URL and repeated-IP throttling disabled only in the test harness (production throttling remains tested and unchanged). The focused rerun passed in Chrome, including the exact inactive message, successful login after activation, no authenticator prompt, and redirection/API denial after deactivating an existing session. Four browser workflows passed across the main run and focused rerun.

Live service verification uses the existing account/auth services with temporary identities; browser/HTTP authorization tests use a real disposable PostgreSQL database and test-only Cognito/JWT transport. The existing Super Admin's real password, authenticator or login session was not accessed or changed.

Final backend readiness returned HTTP 200 after database and private S3 checks succeeded. The task-owned verification backend was stopped afterward; restart the updated applications in your own terminals.

## Super Admin first-time MFA setup correction

A subsequent login screenshot exposed an access-token enrollment response without a Cognito Session. The backend previously required both SecretCode and Session, preventing the setup key from reaching the UI. It now requires the setup key and verifies with either the returned provider Session or, when absent, the encrypted server-held access token. MFA verification, one-time consumption, active/role checks and JWT verification audit requirements remain in force. Admin password-only login and provider policies were not changed by this correction.

Verification: backend production build and all 16 authentication tests passed, including complete enrollment with and without a provider Session. A read-only Cognito check showed administrator is Enabled/CONFIRMED, with no registered or preferred MFA method; fresh enrollment is required, with no existing factor to reset.

To enroll: restart the updated backend; open a private browser window at http://localhost:3000/login; sign in as administrator; manually add the displayed setup key to Google Authenticator or Microsoft Authenticator as a time-based account named MRPOB Super Admin; enter the current six-digit code on the login screen and click VERIFY CODE. Finish within five minutes. Confirm the Super Admin dashboard appears, then log out and test a new login with a fresh code from the app. If setup expires, start a fresh login and use only its newest setup key.

For invalid codes, enable automatic time on the phone/computer and wait for a fresh code. For a genuinely lost existing factor, use verified AWS administrator recovery for only the administrator identity and re-enroll; never disable backend Super Admin MFA enforcement or change the shared pool to Required/Off as a workaround.

AWS reference: https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_VerifySoftwareToken.html
