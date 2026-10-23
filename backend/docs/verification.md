# Registration backend delivery and verification

## Phase 1 — inspected architecture and contracts

Reviewed the three React Hook Form/Zod forms, multipart Next route handlers, registration selection/success routes, both administrator layouts, approval list/detail components, local authentication and JSON persistence. The original backend directory was empty. Exact fields, upload requirements, authentication decision, normalized schema and API contracts were documented before implementation in [implementation-plan.md](implementation-plan.md).

## Phase 2 — backend foundation

Created `package.json`, lockfile, TypeScript build configuration, `src/app.module.ts`, `src/bootstrap.ts`, `src/main.ts`, configuration/database/auth/common/health modules, `.env.example`, Prisma schema and tracked SQL migration. Global validation rejects unknown fields. Authentication verifies Cognito access tokens and independently checks the PostgreSQL ERP role and active state. Logs and errors exclude credentials and registration bodies. Swagger documents the API when enabled.

Executed: Prisma generation and schema validation, full backend/test TypeScript checking and production compilation passed. Migration `20261022000000_registration_foundation` was applied to a disposable local PostgreSQL 16 database and its applied state was queried successfully. No production database was changed.

## Phase 3 — registration and private document storage

Created `src/registrations/*` and `src/documents/*`. All three multipart forms persist to separate profile tables with shared registration metadata, `PENDING` status, database duplicate constraints, audit events and document references. Optional idempotency keys support safe replay. Files are decoded and checked against type/extension/size rules; keys use the existing bucket prefixes and generated identifiers. S3 writes occur outside database transactions. Conditional parent-row updates serialize upload acknowledgements/finalization with cleanup. Aborted manifests remain recovery tombstones so late or uncertain writes remain traceable.

Executed: **61 backend Jest/Supertest tests passed across four suites**, including scalar validation, all registration contracts, duplicate/idempotency handling, token/role guards, content decoding, ownership rules, uncertain uploads, cleanup failure, late-upload claims, exact-key S3 version cleanup, the actual production HTTP rate limit and runtime OpenAPI multipart/bearer contract generation. AWS transport and JWT verification are mocked where appropriate; these results do not establish live AWS connectivity.

## Phase 4 — existing frontend integration

Modified the public registration route adapters, Cognito login/MFA/logout/session handling, administrator layouts/proxy checks, approval table, summary/detail adapters and secure document redirects. Added server-only `BACKEND_API_URL` mode, pagination and PostgreSQL summary counts while keeping the existing presentation. Backend-mode approval mutations and unrelated legacy account/activation paths are unavailable. Legacy HMAC cookies and local account names cannot confer backend authority. The existing user changes to `frontend/next-env.d.ts` were preserved.

Executed: frontend TypeScript checking, targeted ESLint, four existing authentication security tests and five adapter tests passed. The real Next HTTP adapter smoke also passed, checking HttpOnly login/MFA cookies, CSRF, legacy-session rejection, multipart forwarding, protected records/document redirects, unavailable legacy activation/reset paths and fail-closed outages. It uses a mock backend contract. Public-origin configuration was added after this test exposed Next's internal request URL normalization behind a proxy. `git diff --check` passed. Initial isolated Next HTTP smoke attempts timed out before assertions; the final physical-source-copy run completed successfully.

## Phase 5 — integration and operational verification

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
* Runtime IAM role or local AWS profile for `zenex-international-mrpob` in `ap-southeast-2`; verify existing bucket privacy, ownership, encryption and versioning using the operator script.
* A random persistent idempotency secret, frontend `BACKEND_API_URL`, and production secret injection.
* ECS/CloudWatch/Sentry settings, trusted ingress/edge rate limits, backup/restore policies and CI activation at the eventual repository root.

Registration submission never activates an ERP account. Form passwords are validated and discarded; future approved-account activation must set a Cognito password. Approval/rejection actions, master-code creation, account activation, WhatsApp and unrelated ERP modules remain outside this task.
