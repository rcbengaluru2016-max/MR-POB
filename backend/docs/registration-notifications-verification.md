# Registration and notification verification

Executed on 23 October 2026. All changes are inside `backend/`; frontend files were inspected without edits.

| Final check | Actual result |
| --- | --- |
| `npm run check` | Passed: Prisma validation and TypeScript |
| `npm run build` | Passed: API and standalone worker compiled |
| `npm test` | Passed: 7 suites, 100 tests |
| `npm run test:integration` | Passed: 3 suites, 36 tests |
| Targeted SQS tests after FIFO retry correction | Passed: 4 tests, also included in final full Jest run |
| Prisma migration diff from migrated disposable PostgreSQL to checked-in schema | Exit 0: `No difference detected.` |

The integration harness applied actual migrations to disposable `zenex_test` on local PostgreSQL 16, port 55439. No migration was applied to development/production databases or RDS. No AWS resources were deployed and no WhatsApp message was sent. Frontend Playwright tests and live Cognito/S3/SQS/AtoZ tests were not run for this backend-only change.

The test-only cluster is under ignored `backend/.local/pg`. It contained only `postgres`, `zenex_test`, and `zenex_test_browser`. Disk synchronization was temporarily disabled there to avoid slow Windows table-reset synchronization, then restored and verified as `fsync=on`. Tests validate application SQL/constraints/transactions, not power-loss durability.

Coverage includes all three submissions/profiles/document associations; decisions by both administrator roles; reviewer/timestamp/reason/audit; actual counts and approved-record queries; concurrent/repeated decisions; owner-scoped profiles for all three roles; approval-gated authentication; and SQL-trigger-induced outbox rollback.

Notification tests verify correct stored recipients and category/event templates; disabled live/rejection settings; blocked undocumented AtoZ transport; durable events during queue outages; bounded backoff and five-attempt exhaustion; concurrent/repeated jobs; successful processing followed by failed SQS deletion; real 15-second provider timeout and aborted signal; uncertain sends and expired leases without resend; DLQ export failure/recovery; and admin-only investigation APIs. SDK contract tests verify ID-only queue bodies, polling, visibility timeout, explicit delete and FIFO publication deduplication.

PostgreSQL/Prisma/Nest controllers, validation, authorization guards and transactions are real in integration tests. Relevant Cognito verification, Cognito/S3/SQS transport and WhatsApp transport are mocked. Delivery receipts are schema preparation only; no provider-specific callback/authentication contract is available.

Initial sandboxed HTTP tests failed because localhost access was denied; final HTTP/database runs succeeded with local networking access. Normal Prisma generation initially failed because another process held its native engine DLL. Generation succeeded in an ignored temporary output directory; its code and runtime were copied alongside the existing same-version engine without stopping user services. An incomplete first runtime copy caused test startup failures and was corrected. The production Prisma generator configuration is unchanged; fresh installs use normal `npm run prisma:generate`.

An earlier PostgreSQL run passed 35 tests and failed one DLQ test while worker backoff was being refined. A fresh complete run passed all 36. Expected simulated-error logs from failure tests do not indicate live incidents.

Remaining work is documented in [registration-notifications.md](registration-notifications.md): obtain AtoZ's authoritative API/auth/template/idempotency/receipt details and production queue/secrets configuration. Live flags remain false and the placeholder AtoZ adapter cannot send even if flags are set. Operational dashboards still reading the frontend-local store need separately authorized frontend integration; public registration still requires a designed, verified Cognito activation/ownership-binding flow before new registrants can sign in.
