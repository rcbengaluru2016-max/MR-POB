# Frontend/backend branch integration — 25 October 2026

## Causes and changes

- The frontend branch tracked compiled backend output but omitted the backend package manifest, sources and migrations. Merged the backend history into the current frontend history, preserving both parents and the latest UI. The backend is Node.js/NestJS, so its npm build/start scripts are correct once the full backend tree is available.
- The frontend replaced the customer activation page with customer modification. Its shared TypeScript include patterns still loaded old development route validators. Added `frontend/tsconfig.build.json` and selected it for production builds through the documented Next `typescript.tsconfigPath` setting. Strict source checks and fresh production route validation remain enabled; stale development validators are excluded. Development keeps its normal type configuration.
- Preserved the new password visibility toggle, customer details/recovery UI, product photo controls, delivery instructions and other frontend changes. Restored the backend API/session adapter, Cognito MFA and enrollment handling, private preview/download links, actual database approval counts and account management contracts. Backend mode keeps account deletion unavailable and does not fall back to prototype writes.
- Reconciled the frontend dependency manifest and lockfile, retained the existing dependency security overrides, and made root `npm run build` use the same Turbopack build as the frontend script.
- Replaced obsolete root prototype setup instructions with the connected folder structure and linked PowerShell run guide. No private environment files were replaced. The Nest sources and Prisma schema remain identical to the pre-integration backend branch.

## Verification

- Frontend production build passed, including the current customer modification route. Rechecked after starting development so development-generated types were also present.
- All 35 frontend tests and frontend ESLint passed.
- All 116 backend tests and all 36 disposable PostgreSQL integration tests passed. The first sandboxed unit run could not connect to temporary localhost servers; the rerun with localhost access passed.
- Three isolated Chrome scenarios passed for Admin credentials, MFA/session security and first-login authenticator enrollment. The registration scenario passed a focused rerun covering three form submissions, administrator tabs, review details, approval and active Admin authorization. The initial run timed out during cold route navigation; added an explicit bounded navigation wait before checking the rendered review page.
- The real PostgreSQL container is healthy; all three migrations are applied. The backend readiness endpoint returned HTTP 200. The live frontend returned HTTP 200 for login, customer modification and recovery pages, HTTP 401 for unauthenticated session/document requests and HTTP 501 for the preserved recovery limitation.
- The AWS profile resolved to account `703235209354`. The configured Mumbai Cognito pool exists, requires MFA, and the existing administrator remains enabled and CONFIRMED. Browser authentication tests use test-only Cognito transports; the real administrator password/TOTP was not requested, changed or entered by the agent.
- Live S3 public-access blocking, versioning, encryption and bucket-owner enforcement passed. A unique temporary object was uploaded, fetched through a signed attachment URL and removed by its exact newly created version ID. Anonymous access was denied.
- All eight existing PDF/JPEG/PNG/WEBP objects passed signed inline and attachment requests with matching SHA256, MIME type, version and private cache headers. Existing S3 inventory, document rows and ERP accounts were compared before/after and remained unchanged. Only normal document-access audit entries were added.

Local branches are synchronized by a merge and fast-forward; remote branches are not pushed by this task. Use [local-development.md](local-development.md) for the service commands. Activation, customer modification, self-service recovery, additional Super Admin provisioning, account deletion and unrelated ERP modules retain their current unavailable behavior.
