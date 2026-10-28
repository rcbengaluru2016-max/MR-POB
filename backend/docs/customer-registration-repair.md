# Customer registration storage repair — 26 October 2026

## Confirmed cause and repair

The running code and generated Prisma client included rejection-retention fields, but the configured local database had only the first four migrations. `20261026100000_registration_rejection_retention` had not been applied. A safe read reproduced P2022 for `Registration.rejectionReasonCode`; `rejectionExpiresAt` and the EXPIRED notification enum value were also missing.

Registration's final insert/return needs those columns, so a validated submission could upload its files and then fail its database transaction. The existing compensation path cleans the failed upload attempt. Independently, the rejection retention worker queried the missing expiry column every minute and reported repeated cleanup failures. The frontend surfaced the backend's sanitized generic service-unavailable error. These symptoms shared the same schema mismatch.

The local development database was backed up to ignored `.local/sequential-tests/zenex-before-registration-repair-20261026.dump`. The existing pending migration was applied with Prisma migrate deploy; no reset, volume deletion or replacement registration records were used. All five migrations now show completed. The three original pending registrations remained; the live verification added one clearly labelled test Customer.

## Prevention

`src/database/schema-readiness.ts` checks generated Prisma models' required columns and enum values against the current PostgreSQL schema, without reading personal records or modifying the database. `PrismaService.onModuleInit` runs this check before the app starts accepting requests. Missing schema produces `DATABASE_SCHEMA_OUTDATED` with the missing identifiers and the actionable `npm run migrate:deploy` instruction. A failed check disconnects the client. `src/main.ts` reports this error distinctly. Runtime credentials never automatically execute migrations.

The local startup guide now explicitly requires migrate deploy after database changes; `npm run build` and `npm start` alone do not apply migrations.

## Real frontend/backend/storage verification

`node scripts/smoke-customer-registration.cjs` uses only the configured local development app/database and creates one clearly labelled pending Customer. It sends a multipart request through the actual frontend `/api/register/customer` adapter to the running Nest backend. It creates minimal synthetic PNG, PDF, JPEG and WEBP fixtures, uploads all five required document slots to the configured private S3 bucket, and checks the actual saved database/profile/address/audit/document/manifest records. The script does not approve an account or send notifications.

Executed successfully:

- Database + S3 readiness returned HTTP 200.
- Submission returned HTTP 201 and saved `REG-CUS-ZI0002`, named `Registration Storage Smoke Test 122f1283`.
- PostgreSQL contains the pending Customer, address, submission audit, completed upload manifest and five document references.
- S3 HEAD requests verified each stored file's content type, size, SHA-256 metadata and version reference.
- Repeating the identical idempotency key returned the same ID and retained one registration with five documents.
- Disconnecting/reconnecting Prisma confirmed persistent storage.
- No Master Code, account owner or notification was generated for this pending submission.
- Aggregate verification showed four PENDING registrations: the three original records and this synthetic test record. All five migrations are complete.

The test record and its five files remain available for review in Customer Registration Approvals. The smoke script intentionally creates a test record per run and refuses production or non-local database targets. Do not run it repeatedly unless additional labelled test records are wanted.

## Automated regressions and completion

- `npm run build` and backend TypeScript `--noEmit`: passed.
- Full backend unit suite: 10 suites, 140 tests passed. Its simulated upload/signing failures are intentional fault-injection cases; the separate live S3 verification above passed.
- Full `test/integration/registration-workflow.spec.ts`: 21 tests passed. This includes all three submission types, shared IDs, mixed uploads, duplicate/idempotency handling, final database failure compensation, approval transactions and permission checks. The added schema regression drops the two missing columns inside a disposable database transaction, verifies the exact `DATABASE_SCHEMA_OUTDATED` result and migration instruction, rolls back the fixture, and confirms readiness is restored.
- Scoped whitespace checks passed with Windows CRLF handling enabled.

Test database fixtures and deliberate missing-column checks used only the separate disposable PostgreSQL cluster, not the user's development records. That cluster and both temporary foreground verification servers were stopped after testing; ports 3000/3001 were verified free. No hidden backend was left running. Start the backend with `npm start` and the frontend with `npm run dev -- --hostname localhost --port 3000` in their normal directories.

Automatic approval review rejected an optional explicit invocation of retention cleanup against the local development database because it could permanently purge expired rejection details. That manual purge was not executed or bypassed. The schema was verified with read-only catalog queries, and the registration/storage regression tests completed without requiring a purge.

Changed repair files: `src/database/schema-readiness.ts`, `src/database/prisma.service.ts`, `src/main.ts`, `test/integration/registration-workflow.spec.ts`, `scripts/smoke-customer-registration.cjs`, `docs/local-development.md`, and this report. The existing rejection-retention migration was applied without changing its SQL. All unrelated edits were preserved.
