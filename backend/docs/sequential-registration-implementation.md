# Sequential registration and approval implementation — 26 October 2026

## Identifiers and storage

New submissions use `REG-CUS-ZI0001`, `REG-PAT-ZI0002`, `REG-COM-ZI0003` from the shared PostgreSQL BIGINT `registration_submission_seq`. Existing registration primary keys, profile foreign keys, document/S3 keys and audit references remain unchanged. The migration inspects both saved registrations and upload manifests to initialize the next available serial. `padStart(4)` sets a minimum width and never truncates values above 9999. Sequence allocation occurs before uploads to preserve the existing S3 manifest architecture. Rolled-back submissions can leave gaps; identifiers are never reused or duplicated.

Approval uses a separate `approved_master_seq` for `ZI####` codes. A row lock serializes decisions on one registration; a transaction-scoped advisory lock serializes allocations through commit. The unique `Registration.masterCode` index protects all three account types. Status, code, owner account, decision actor/time, audit and notification outbox commit together. Repeated approval returns the existing code without adding another owner, profile, audit or event. Rejection keeps its existing validation and behavior. Pending/rejected registrations do not get a code through these APIs.

Existing CustomerRegistration, PatientRegistration and CompanyRegistration rows remain the master profiles. Approved-list APIs filter the same Registration records and expose their code and account state. Details retain their original document references. `registrations/me` scopes profiles to the verified active owner and role. Frontend adapters show the saved code in approval lists/details, approved sections and user dashboards without creating another backend master copy.

The migration assigns historical approvals codes in recorded decision order and creates an owner only when missing; existing owners, usernames and account state remain intact. Existing `ZI` usernames are reserved case-insensitively. Historical approval notifications are not invented. Legacy approval data missing a code or owner is rejected by the repeat-approval API for reconciliation rather than reporting an incomplete success.

## Registration password and login

New Company Admin registrations require the password and matching confirmation. The backend saves a salted scrypt verifier in `Registration.passwordHash`, and binds idempotency to a keyed credential fingerprint. Responses and notification payloads exclude passwords, verifiers and internal request hashes. Customer/Patient password-free forms retain their existing behavior.

Approval creates the ERP account with its Master Code username and matching company/profile. On the first approved login, the backend verifies the entered original password, then provisions the existing Cognito identity using its strict ownership marker and a database lock. Only the user's entered password is sent to Cognito. Successful provisioning removes the temporary verifier. Authentication then follows the existing Cognito access-token/MFA flow. Legacy owners can also log in using their new Master Code alias while retaining their existing username. The Cognito pool must support username logins and the configured app client must allow USER_PASSWORD_AUTH; existing account-provisioning IAM permissions are required.

Earlier backend versions discarded registration passwords. Those passwords cannot be recovered by migration. Historical accounts without a linked Cognito identity or saved verifier require operator-assisted credential setup. Existing linked identities and MFA continue to work.

## WhatsApp readiness

The existing transactional outbox and SQS worker select the exact requested `customer_registration_approved`, `patient_registration_approved`, and `company_admin_approved` templates. Ordered variables come from the saved profile and Master Code; the registered Indian mobile is the destination. No password is included.

With the worker disabled, requests stay PENDING. Explicit mock processing records MOCKED, and missing live configuration records BLOCKED. These never display as sent. Only provider-confirmed ACCEPTED/DELIVERED statuses indicate a real send/delivery. Provider failures occur after the approval transaction and cannot undo it. Existing attempt ledgers, leases, retry backoff, timeouts and duplicate prevention remain in place. Ambiguous sends are quarantined UNKNOWN rather than blindly retried.

The provider interface and test adapter are implemented. Real transport and authenticated delivery receipts still require the provider's actual documentation, credentials, sender/account configuration, approved template IDs/languages, acceptance/error/idempotency contract, and reconciliation API. See [registration-notifications.md](registration-notifications.md) and the blank canonical template variables in `.env.example`. Set SQS source/DLQ configuration and worker IAM before enabling the worker. No real WhatsApp message was sent during this work.

## Local development storage mode

The frontend's existing JSON mode also allocates shared registration/master counters on the server, scans saved IDs/usernames for the high-water mark, and preserves legacy IDs/codes. Registration and approval writes use a process queue, filesystem directory lock, fresh snapshot and atomic file replacement; failed mutations do not persist partial approval. A durable local notification ledger stays NOT_CONFIGURED. Production messaging/retries run through the PostgreSQL backend. `ZENEX_DATA_DIR` can isolate development/test data. After a process crash, remove a remaining `registration-transaction.lock` directory only after confirming that no local registration writer is active.

## Migration and deployment

Migration: `prisma/migrations/20261026000000_sequential_registration_master_codes/migration.sql`. Schema adds only nullable `masterCode`/`passwordHash` columns and the unique Master Code index; the migration adds and initializes the two sequences and reconciles historical approvals. It does not delete records.

Stop API/worker writers from older releases, back up the database, run `npm run migrate:deploy`, run `npm run prisma:generate`, build, then restart updated API/worker processes. Do not run old approval writers after the migration. In Windows development a running backend can lock Prisma's engine DLL: stop that backend before regenerating; do not replace/delete a loaded engine. Do not run Prisma migrate reset or db push against existing records.

## Validation and changed files

Executed on 26 October 2026:

| Check | Actual result |
| --- | --- |
| Backend `npx --no-install tsc --noEmit` | Passed, including the added workflow and migration tests. |
| Backend `npm run test:integration -- --json --outputFile=.local/sequential-tests/final-integration-results.json` | Passed: 4 suites, 46 tests, 130.555 seconds. |
| Isolated local-store multiprocess assertions via `tsx` | Passed: two cold allocation processes, six mixed-kind submissions in concurrent pairs, repeated and distinct concurrent approvals, durable reload, failed-mutation rollback, and six NOT_CONFIGURED notification records. |

The final integration run used PostgreSQL 16 in a separate disposable `zenex_test_sequential` database on port 55440. Its compatibility fixture applied the actual earlier migrations, seeded legacy registration keys, profiles, documents, an audit, an existing owner named `zi10001`, a readable registration `REG-PAT-ZI10010`, and an upload manifest `REG-COM-ZI10020`, then applied the new migration. All references and the existing username remained intact. Historical approvals received separate codes; pending registrations remained without a code; the next registration/master serials were 10021/10004. Additional tests verify shared numbering, concurrent submissions and approvals, database uniqueness, approval idempotency, rejection behavior, transactional rollback, safe profile responses, dashboard visibility and provider-failure independence.

The local multiprocess test used an isolated `ZENEX_DATA_DIR` under `backend/.local/sequential-tests`; existing `.data` was untouched. It exposed an initialization race, which was fixed by serializing initialization and transaction writes with the same filesystem lock. The final assertions passed after that fix. An earlier six-process attempt reached the Windows memory commitment limit; the final two-process run completed successfully. The first complete PostgreSQL run also passed (44 tests); the final 46-test run includes the subsequently added parallel master-allocation and legacy migration tests.

Tests replace Cognito verification, S3 transport, SQS transport and WhatsApp transport with test adapters as appropriate. They exercise actual PostgreSQL migrations, constraints and transactions. Live AWS login/MFA, S3 access, SQS delivery, provider acceptance and WhatsApp delivery were not verified by these integration tests, and no real WhatsApp message was sent. Crash/power-loss durability was not tested; disk synchronization was disabled only in the task-created disposable cluster to speed Windows fixture resets. After all tests completed, that cluster was stopped; its files, JSON results and backups were retained.

Added or updated backend verification sources: `test/registrations.spec.ts`, `test/integration/registration-workflow.spec.ts`, `test/integration/admin-management.spec.ts`, and `test/integration/sequential-migration.spec.ts`. Notification-specific tests and the remaining implementation/build results are listed with the complete change inventory below.

| Additional check | Actual result |
| --- | --- |
| Backend `npm test -- --runInBand` | Passed: 9 suites, 130 tests. The first sandbox run blocked loopback connections; the rerun with local loopback access passed. |
| Backend `npm run prisma:generate` | Passed after briefly stopping the local backend that held the Windows engine DLL. |
| Backend `npm run check` and `npm run build` | Both passed on the final source. |
| Frontend `npm test` | Passed: all 42 tests, including auth/MFA/password recovery and the new identifier/template/projection tests. |
| Frontend `npm run lint` | Passed; final targeted ESLint rerun on all 22 changed/new frontend source files also passed. |
| Frontend TypeScript `--noEmit` | Passed on final source. |
| Frontend `npm run build` | Passed: Next.js 16.4.2 production compilation, TypeScript, and all 106 generated pages. |
| Backend `npm run test:e2e` | Passed: all 4 Chrome browser tests, 10.6 minutes, against an isolated Next application and disposable PostgreSQL database. |
| Final `git diff --check` | Passed. |

The browser suite submits all three forms and their uploads, checks the shared registration sequence, reviews each dashboard tab, approves all three profiles, checks separate approval-order codes, revisits/reloads approved views, and signs a Company Admin in using its Master Code and original registration password. Existing Admin creation/login, permission restrictions, MFA and first-login authenticator enrollment also pass. Its identity and S3 transports are test adapters; it does not prove live AWS credentials. A Company dashboard screenshot was saved at `backend/.local/sequential-tests/company-approved.png` and visually checked for the saved code. The Company operational store is isolated by backend authority to prevent local/backend code collisions.

The configured development database was inspected as local `localhost:15432/zenex`, backed up to ignored `backend/.local/sequential-tests/zenex-before-sequential-20261026.dump`, and migrated using Prisma migrate deploy. All four migrations are complete, and all three original PENDING registrations remain. No test registration or approval was written to that database. The local backend was rebuilt/restarted with the updated code; `/api/health/live` returned 200 and an unauthenticated admin-list request returned 401. The first migration attempt failed during Windows memory pressure; the serial retry completed successfully. No production database was accessed.

## Complete changed-file inventory

Manual startup follow-up: a background verification backend occupied port 3001 and caused a second `npm start` to fail with EADDRINUSE. That background process was stopped. `src/main.ts` now closes failed startup resources, reports the specific occupied-port cause, and prints the listening URL on success. The normal `npm start` command was verified with backend health HTTP 200 and frontend `/login` HTTP 200. The verification instance was then stopped so port 3001 remains available for the user's foreground terminal. Keep that terminal open while testing, and use Ctrl+C there before starting another backend.

Backend implementation and configuration:

- `backend/.env.example`
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20261026000000_sequential_registration_master_codes/migration.sql`
- `backend/src/registrations/registrations.service.ts`
- `backend/src/registrations/registrations.controller.ts`
- `backend/src/registrations/registration.dto.ts`
- `backend/src/auth/auth.service.ts`
- `backend/src/auth/auth.module.ts`
- `backend/src/auth/registration-password.ts`
- `backend/src/accounts/cognito-accounts.service.ts`
- `backend/src/main.ts`
- `backend/src/notifications/notifications.service.ts`

Frontend implementation:

- `frontend/lib/types.ts`
- `frontend/lib/notification-status.ts`
- `frontend/lib/server/store.ts`
- `frontend/lib/server/workflow.ts`
- `frontend/lib/server/workflow-state.ts`
- `frontend/lib/server/backend-api.ts`
- `frontend/lib/server/backend-profile.ts`
- `frontend/lib/server/company-admin.ts`
- `frontend/app/api/admin/registrations/route.ts`
- `frontend/app/api/admin/registrations/[id]/route.ts`
- `frontend/app/api/auth/me/route.ts`
- `frontend/app/api/super-admin/approvals/route.ts`
- `frontend/app/api/super-admin/registrations/route.ts`
- `frontend/app/api/super-admin/registrations/[id]/route.ts`
- `frontend/app/api/super-admin/registration-imports/bulk/route.ts`
- `frontend/app/company/layout.tsx`
- `frontend/app/portal/page.tsx`
- `frontend/components/admin/verification-page.tsx`
- `frontend/components/super-admin/approved-registration-details.tsx`
- `frontend/components/super-admin/registration-table.tsx`
- `frontend/components/company-admin-shell.tsx`

Tests and documentation:

- `backend/test/registrations.spec.ts`
- `backend/test/auth.spec.ts`
- `backend/test/registration-password.spec.ts`
- `backend/test/whatsapp.spec.ts`
- `backend/test/integration/admin-management.spec.ts`
- `backend/test/integration/registration-workflow.spec.ts`
- `backend/test/integration/registration-notifications.spec.ts`
- `backend/test/integration/sequential-migration.spec.ts`
- `backend/test/e2e/registration.e2e.ts`
- `frontend/tests/workflow-ids.test.mjs`
- `backend/docs/registration-notifications.md`
- `backend/docs/registration-notifications-verification.md`
- `backend/docs/sequential-registration-implementation.md`

Generated Prisma/build artifacts, disposable database files, backup, screenshot and test-result JSON remain ignored. No secrets were committed or invented. The existing local JSON store's unrelated direct persistence paths remain outside the new registration transaction lock; production concurrency guarantees use PostgreSQL. Broad concurrent administrative/operational writes in JSON mode should continue to be treated as development-only.
