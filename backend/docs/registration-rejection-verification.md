# Registration rejection verification

Executed on 26 October 2026. Implementation details, schema changes, validation rules, retention behavior, provider configuration and modified files are documented in [registration-rejection.md](registration-rejection.md).

## Actual results

| Check | Result |
| --- | --- |
| Prisma client generation and schema validation | Passed |
| Backend build | Passed |
| Backend TypeScript check, including tests | Passed |
| Frontend TypeScript check | Passed |
| ESLint on changed frontend workflow/dialog/route/retention files | Passed |
| Backend unit regression tests | 140 passed across 10 suites |
| Frontend regression tests | 47 passed |
| PostgreSQL integration tests on a freshly migrated disposable database | 60 passed across 5 suites |
| Final deterministic legacy-migration timestamp assertion | Passed again individually |
| Browser tests | All 7 distinct tests verified across the main run and a focused rerun; details below |
| Diff whitespace check | Passed |

The main browser run passed four existing registration/authentication/MFA/dashboard tests. Its first account-management case exceeded the development route compilation timeout, despite the trace confirming a successful login response. The two new rejection cases stopped at a strict locator ambiguity between a selected option and the message preview. The preview locator was narrowed to its paragraph. A focused rerun with a 90-second cold-navigation expectation passed all three cases: account management, all three rejection types as Super Admin, and all three rejection types as Admin. No production authentication change was needed for those test failures.

The seven verified browser cases cover account creation and separate dashboards; dashboard error recovery; MFA/session/origin restrictions; authenticator enrollment; registration submissions, approval and Master Codes; and the two administrator rejection flows. Each rejection flow exercises Customer, Company Admin and Patient, standard reasons, custom review confirmation, reason preview, persisted status after reload, and the displayed notification state. Patient missing-document rejection is excluded because ID proof is optional.

Twelve screenshots were captured (dialog and result for each of six administrator/type combinations). The custom-reason dialog was visually inspected. Example: [Company Admin custom-reason dialog](../.local/rejection-tests/super-admin-company-dialog.png).

## Retention, privacy and integrity coverage

Integration tests verify row-locked concurrent rejections produce one decision audit and one notification; repeated rejection preserves its timestamp; all three recipient-name/type/template mappings; mandatory and invalid reason rejection; explicit custom review and whitespace normalization; representative sensitive content rejection; provider failure without decision rollback; safe retries/timeouts/duplicate claims; and no false sent/delivered status.

Controlled timestamps verify preservation one millisecond before expiry, removal at expiry and repeat cleanup returning zero. They verify the rejected registration, account counts, newer rejection and document references survive, while reason text/code and notification payload/destination/provider identifiers are erased. A scheduler unit test verifies automatic startup, periodic execution and shutdown. Local-store tests include legacy records without timestamps and confirm their conservative deadline is initialized once and does not restart. A migration fixture verifies original decision timestamps, rejection-audit fallback, conservative fallback when neither exists, removal of legacy audit reason copies and preservation of approved records.

Testing exposed and fixed two timing defects: a raw SQL comparison could expire UTC timestamps early on a PostgreSQL server using a non-UTC timezone, and rounded database defaults could leave an immediately queued notification momentarily in the future. The cleanup query now compares explicitly in UTC; new outbox jobs receive an application timestamp at millisecond precision.

## Test environment and reproducibility

Tests used isolated local PostgreSQL databases with names accepted by the disposable-database guard. Migrations were applied to test databases only. The final integration run used a fresh database. No application database migration was deployed by this task.

Initial verification runs hit loopback sandbox restrictions and local resource exhaustion, including disposable PostgreSQL recovery. Those runs are not counted as successful. After recovery, verification ran sequentially with reduced worker concurrency. Disposable test-cluster disk durability was disabled to avoid slow test-only writes; no application database settings changed. The final backend suites used an ignored local Jest configuration with isolated ts-jest transpilation to reduce memory; full TypeScript checking ran separately and passed. The checked-in test configuration remains unchanged.

Normal commands are backend `npm run prisma:generate`, `npm run check`, `npm run build`, `npm test`, `npm run test:integration`, `npm run test:e2e`; frontend `npm test`, TypeScript `--noEmit` and ESLint. This workspace also retains the ignored low-memory test configurations under backend `.local/` used during verification. Browser retries used the existing harness and a local timeout override, with bounded Node memory and reduced worker threads. The isolated PostgreSQL cluster was stopped after verification.

## Remaining deployment/integration work

Apply checked-in migrations to the intended application database before restarting the updated backend: `npm run migrate:deploy`, regenerate Prisma and build. Keep the API or dedicated worker running for automatic retention; cleanup is independent of SQS enablement. Restart the frontend to activate its development-store instrumentation when applicable.

Live WhatsApp is not connected and no real WhatsApp message was sent. The current AtoZ adapter remains deliberately blocked pending authoritative API/authentication, approved template and idempotency/delivery receipt documentation. Supply and implement that integration, configure the approved shared `registration_rejected` template and provider credentials in environment/secret management, and enable the existing SQS worker/live flags only when ready. Mock/blocked/pending statuses never count as sent or delivered.

Integration and browser tests mock Cognito identity, S3 transport and WhatsApp/queue services where applicable. Real AWS document access, live Cognito authentication/MFA, production SQS, provider delivery receipts and a production deployment were not exercised. Existing user accounts, uploaded S3 files and unrelated data were not deleted.
