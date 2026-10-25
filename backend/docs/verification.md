# Registration backend delivery and verification

## New AWS bucket configuration â€” 24 October 2026

Updated the existing backend on the `backend` branch for `zenex-international-mrpob-files` in `ap-south-1`, matching the supplied screenshots. S3 now uses `S3_REGION` independently of the existing Cognito/SQS `AWS_REGION`. Updated local ignored `.env`, environment/deployment examples, scoped bucket policy references, the read-only verification script and test fixtures. The registration prefixes, schema, API contracts and frontend were not changed.

Executed successfully: 106 unit tests across eight suites; after adding the signed-download regression, the affected configuration/document suites passed all 16 tests. All 36 PostgreSQL integration tests across three suites passed using disposable Testcontainers databases and mocked S3/Cognito transports. Prisma validation, full backend/test TypeScript checking, production compilation, local compiled configuration validation, infrastructure JSON parsing and `git diff --check` passed. The initial restricted HTTP test run encountered loopback `EACCES`; the successful unit run used an unrestricted runner. An initial broad integration discovery run was interrupted, then rerun successfully with roots limited to `src` and `test` to exclude retained local repositories.

Live AWS verification subsequently passed after the user renewed `zenex-dev` against account `703235209354` (the initial expired-session attempt returned `CredentialsProviderError`). STS confirmed that account, and `HeadBucket` with `ExpectedBucketOwner` confirmed the bucket owner and Mumbai region. `node scripts/verify-storage.cjs` passed all four checks: public-access blocking, versioning, default encryption and enforced bucket ownership.

Using the actual compiled `S3StorageService`, uploaded a tiny generated PNG to a unique temporary key under each of `registration/customer/`, `registration/company/` and `registration/patient/`. All three passed versioned upload, content type/size/SHA256 metadata and AES256 encryption checks, byte-for-byte download through the production 60-second signed URL, anonymous HTTP 403 denial, and production exact-key cleanup. Confirmed that no test object versions or delete markers remained. No existing objects were changed, no data was migrated and no cloud policies were applied. The local smoke harness is retained in ignored `.local/verify-new-storage.cjs`.

Remaining login issue: the configured Cognito pool `ap-southeast-2_ehXjiszHA` returned `ResourceNotFoundException` with the new credentials. Listing user pools in the new account returned none in Mumbai or Sydney. S3 works, but Cognito-backed login/account administration needs a new pool and app client, matching backend configuration, and administrator identity provisioning. No Cognito resources were created or authentication settings changed. These S3 checks used the user's root-backed local session; the scoped runtime IAM role in the deployment examples still requires separate deployment verification. Any old-bucket document references also require migration as described in the README.

## Cognito migration follow-up â€” 24 October 2026

The user created pool `ap-south-1_KE5L9HYBe`, app client `3248fqq19vp1av3hsqflcb3c6f` and Cognito user `administrator`, then completed managed login. Read-only AWS checks confirmed the user is enabled and CONFIRMED, the app client permits `ALLOW_USER_PASSWORD_AUTH`, and the pool requires TOTP MFA. The user-level MFA method list was not populated at verification time; successful ERP MFA completion remains a manual check.

Updated ignored backend `.env` with the Mumbai Cognito region, pool, client and client secret fetched directly from AWS without displaying it. Started the existing stopped `zenex-erp-dev-postgres-1` container. Migrated the existing ACTIVE SUPER_ADMIN record from `zenex.admin` and the old Cognito subject to `administrator` and verified new subject `6123ad3a-8091-7019-f5af-586c80c9c986`, preserving ERP record ID `99610b85-6f09-49d5-83d8-d6e211e94152`, role and relationships. Recorded `ADMIN_COGNITO_IDENTITY_MIGRATED` in the same database transaction. No password was requested, generated or changed by the agent. Updated Cognito region examples and the scoped account-management policy resource; no IAM policies were applied to AWS.

Started the backend with the updated configuration. Live health and dependency readiness returned HTTP 200; unauthenticated `/api/auth/me` and administrator registration reads returned HTTP 401 as expected. Full password/MFA login has not been tested by the agent. The current frontend `app/api/auth/login/route.ts` still authenticates against its local prototype store and does not forward to the Nest Cognito endpoint; `BACKEND_API_URL` alone does not connect this checkout's login. Frontend adapter integration remains outstanding and was not modified during this configuration task.

## Phase 1 â€” inspected architecture and contracts

Reviewed the three React Hook Form/Zod forms, multipart Next route handlers, registration selection/success routes, both administrator layouts, approval list/detail components, local authentication and JSON persistence. The original backend directory was empty. Exact fields, upload requirements, authentication decision, normalized schema and API contracts were documented before implementation in [implementation-plan.md](implementation-plan.md).

## Phase 2 â€” backend foundation

Created `package.json`, lockfile, TypeScript build configuration, `src/app.module.ts`, `src/bootstrap.ts`, `src/main.ts`, configuration/database/auth/common/health modules, `.env.example`, Prisma schema and tracked SQL migration. Global validation rejects unknown fields. Authentication verifies Cognito access tokens and independently checks the PostgreSQL ERP role and active state. Logs and errors exclude credentials and registration bodies. Swagger documents the API when enabled.

Executed: Prisma generation and schema validation, full backend/test TypeScript checking and production compilation passed. Migration `20261022000000_registration_foundation` was applied to a disposable local PostgreSQL 16 database and its applied state was queried successfully. No production database was changed.

## Phase 3 â€” registration and private document storage

Created `src/registrations/*` and `src/documents/*`. All three multipart forms persist to separate profile tables with shared registration metadata, `PENDING` status, database duplicate constraints, audit events and document references. Optional idempotency keys support safe replay. Files are decoded and checked against type/extension/size rules; keys use the existing bucket prefixes and generated identifiers. S3 writes occur outside database transactions. Conditional parent-row updates serialize upload acknowledgements/finalization with cleanup. Aborted manifests remain recovery tombstones so late or uncertain writes remain traceable.

Executed: **61 backend Jest/Supertest tests passed across four suites**, including scalar validation, all registration contracts, duplicate/idempotency handling, token/role guards, content decoding, ownership rules, uncertain uploads, cleanup failure, late-upload claims, exact-key S3 version cleanup, the actual production HTTP rate limit and runtime OpenAPI multipart/bearer contract generation. AWS transport and JWT verification are mocked where appropriate; these results do not establish live AWS connectivity.

## Phase 4 â€” existing frontend integration

Modified the public registration route adapters, Cognito login/MFA/logout/session handling, administrator layouts/proxy checks, approval table, summary/detail adapters and secure document redirects. Added server-only `BACKEND_API_URL` mode, pagination and PostgreSQL summary counts while keeping the existing presentation. Backend-mode approval mutations and unrelated legacy account/activation paths are unavailable. Legacy HMAC cookies and local account names cannot confer backend authority. The existing user changes to `frontend/next-env.d.ts` were preserved.

Executed: frontend TypeScript checking, targeted ESLint, four existing authentication security tests and five adapter tests passed. The real Next HTTP adapter smoke also passed, checking HttpOnly login/MFA cookies, CSRF, legacy-session rejection, multipart forwarding, protected records/document redirects, unavailable legacy activation/reset paths and fail-closed outages. It uses a mock backend contract. Public-origin configuration was added after this test exposed Next's internal request URL normalization behind a proxy. `git diff --check` passed. Initial isolated Next HTTP smoke attempts timed out before assertions; the final physical-source-copy run completed successfully.

## Phase 5 â€” integration and operational verification

The real PostgreSQL integration suite and Playwright suite are included in `test/integration/` and `test/e2e/`. Database tests use Testcontainers by default, with an explicit disposable native PostgreSQL fallback when Docker is unavailable. Test-only Cognito/S3 replacements are outside production source and Docker output.

Executed: **all 12 PostgreSQL integration tests passed** against disposable PostgreSQL 16 at loopback port 55439. They applied the tracked migration, exercised actual Prisma transactions/constraints and HTTP guards, verified all three profile tables/prefixes/metadata, duplicate races, idempotent replay, details/pagination/counts, owner access, uncertain S3 writes, retained recovery tombstones, an induced SQL insert failure, expired finalization and a PUT completing after cleanup. Cognito verification and S3 transport were replaced; database persistence was real. An initial setup timeout and a test-only rate-limit override issue were corrected before this successful final run.

Executed: **the complete Chrome Playwright workflow passed** (one end-to-end scenario covering all three forms). It filled real inputs, accepted terms, uploaded documents, asserted 201 responses and pending success pages, signed in through the Cognito adapter, checked the HttpOnly access cookie, verified each type's dashboard tab and Pending/Approved/Rejected cards, opened every detail page, confirmed approval controls were absent, and rejected unauthenticated direct admin access. A separate native PostgreSQL database, `zenex_test_browser`, held exactly one `PENDING` customer, company and patient after the run. Cognito/S3 were mocked; the forms, Next adapters, Nest controllers, database and browser were real. The final run passed in 48.8 seconds including isolated service startup.

Earlier browser attempts exposed test-harness issues that were corrected: Webpack bypassed the project's Tailwind/Turbopack loader, the terms checkbox intentionally unmounts after clicking, status capitalization is CSS-based, and cached pages require detail-specific selectors. No production UI redesign or forced-click bypass was introduced. Final browser startup uses physical source copies and the original Turbopack configuration, preserving the existing development checkout/server.

Final documented `npm run check` passed; production TypeScript compilation passed. The successful Jest JSON reports and Playwright JSON report are stored under ignored `.local/` for local inspection. Expected failure-injection cases emit sanitized error logs while their assertions pass.

The production dependency audit (`npm audit --omit=dev --json`) passed with **zero known vulnerabilities** after upgrading Sharp and applying scoped patched transitive dependencies. See [security-dependencies.md](security-dependencies.md).

Created Docker runtime/migration targets, development Compose configuration, GitHub Actions template, scoped S3 IAM/policy examples, ECS task/Secrets Manager examples, administrator provisioning and read-only bucket verification scripts, k6 smoke script and the [setup/operations runbook](../README.md). Infrastructure JSON and standalone script syntax checks passed. Docker Desktop's engine was unavailable; no Docker image build, ECS deployment, GitHub workflow activation, k6 load run or live AWS test is claimed.

## Configuration still required

* RDS PostgreSQL connection URL, TLS/pooling settings and migration/runtime database identities.
* Cognito pool/client configuration, required administrator MFA and verified Cognito-sub-to-ERP-role provisioning.
* Runtime IAM role or local AWS profile for `zenex-international-mrpob-files` in `ap-south-1`; verify existing bucket privacy, ownership, encryption and versioning using the operator script.
* A random persistent idempotency secret, frontend `BACKEND_API_URL`, and production secret injection.
* ECS/CloudWatch/Sentry settings, trusted ingress/edge rate limits, backup/restore policies and CI activation at the eventual repository root.

Registration submission never activates an ERP account. Form passwords are validated and discarded; future approved-account activation must set a Cognito password. Approval/rejection actions, master-code creation, account activation, WhatsApp and unrelated ERP modules remain outside this task.
