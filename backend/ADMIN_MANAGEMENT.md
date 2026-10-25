> Account creation and password instructions in this older guide are superseded by [ADMIN_CREDENTIALS.md](ADMIN_CREDENTIALS.md). Passwords are now required and Cognito provisioning is implemented.

# Admin management and shared dashboard data

## Architecture and design

The Next frontend's `/admin` and `/super-admin` routes already use the same dashboard, registration approval, category-table and verification components. `components/super-admin-shell.tsx` omits Users & Accounts from the Admin navigation; `/admin/accounts` redirects to access denied. Nest authorization independently protects the APIs.

When `BACKEND_API_URL` is configured, the Next server forwards its HttpOnly Cognito access cookie to Nest. It never falls back to the prototype JSON store. Some previously unadapted shared routes called `isAdminSession()`, which deliberately denies prototype-store access in backend mode; this produced the dashboard's Unauthorized message even for a valid backend session. Analytics, category lists and account management now have backend adapters. Missing or invalid Cognito tokens still receive 401, as required.

Use the existing PostgreSQL database and **extend `ErpUser`**, rather than introducing an independent Admin credential table or database. `ErpUser` already owns roles, account state, registration ownership, decisions and audit events. A second identity table would duplicate those relationships. The account form has name, email/username, role and initial status; email is also the username. No phone, separate username or organization field is added because the existing form does not collect them. Company registration's `adminFullName` is an applicant contact and is not a global ERP Admin account.

The migration adds nullable unique email, case-insensitive unique email/username indexes, a self-referencing `createdById` foreign key, and a role/date index. Existing users retain their IDs, roles and references. Email and creator remain nullable for legacy/operator-created records. `cognitoSub` becomes nullable so ERP accounts can be stored before authentication provisioning. Account creation always assigns ADMIN and takes the creator from the verified request. No password, token, secret or credential hash field is introduced.

An ACTIVE account with no Cognito subject **cannot sign in**: the unchanged authentication service only resolves verified token subjects to active database accounts. `state` represents ERP access policy, not identity provisioning; responses expose `provisioningRequired` separately. Provisioning/linking a trusted Cognito identity is a later phase. Public account creation rejects `cognitoSub`, role overrides, creator overrides and credentials.

## Access policy

| Operation | Active Super Admin | Active Admin | Other/inactive/public |
|---|---|---|---|
| Create/list/read Admin accounts, change Admin state | Allow | Deny | Deny |
| Registration list, detail and private review documents | Allow | Allow | Deny, except existing approved-owner document policy |
| Registration summaries and dashboard analytics | Allow | Allow | Deny |
| Approve/reject pending registration | Allow | Allow | Deny |

Both administrative roles have organization-wide registration access, consistent with the existing AdminGuard and dashboards. No tenant filter or duplicate dataset is introduced. Restrictions use CognitoGuard followed by SuperAdminGuard or AdminGuard. Roles come from PostgreSQL on each authenticated request, not token groups, browser state or request fields. Disabling a bound Admin denies subsequent backend requests.

Decisions update the existing Registration row and write AuditEvent in one transaction. Only PENDING rows may transition, so concurrent reviews produce one success and one 409. Rejection requires 8–2000 trimmed characters. Decisions do not create master records, Cognito credentials, accounts, or activation emails. The UI communicates that provisioning/activation remain pending and stops the progress indicator after approval.

## Nest REST contracts

All endpoints below require `Authorization: Bearer <verified Cognito access token>`. OpenAPI is available at `/api/docs` and `/api/docs-json` when `ENABLE_SWAGGER=true`.

| Method and path | Request | Response |
|---|---|---|
| POST `/api/super-admin/accounts` | `{ "name":"New Admin", "email":"admin@example.com", "state":"ACTIVE" }` | 201 `{account}`; role fixed to ADMIN; state defaults to INACTIVE |
| GET `/api/super-admin/accounts?page=1&pageSize=25` | page >=1, size 1–100 | 200 `{items,total,page,pageSize}` containing Admin accounts only |
| GET `/api/super-admin/accounts/:uuid` | Admin ID | 200 `{account}` or 404 |
| PATCH `/api/super-admin/accounts/:uuid/state` | `{ "state":"INACTIVE" }` | 200 `{account}`; only Admin targets |
| GET `/api/admin/registrations?kind=customer&status=PENDING&page=1&pageSize=25` | kind customer/company/patient; status optional PENDING/APPROVED/REJECTED | 200 `{items,total,page,pageSize}` |
| GET `/api/admin/registrations/summary?kind=customer` | kind | 200 `{pending,approved,rejected}` across all records of that kind |
| GET `/api/admin/registrations/analytics?period=monthly` | daily/weekly/monthly/custom; custom requires start/end YYYY-MM-DD | 200 `{period,range,kpis,byKind,categoryShare,statusShare,trend,recent}` |
| GET `/api/admin/registrations/:id` | registration ID | 200 `{record}` with shared fields, profile, private document metadata, `readOnly:false`, `activationPending:true` |
| POST `/api/admin/registrations/:id/decision` | `{ "action":"approve" }` or `{ "action":"reject", "reason":"Documents require correction" }` | 201 `{ok:true,status,decidedAt,activationPending:true}` |

`account` contains `id,username,email,name,role,state,createdById,createdAt,updatedAt,provisioningRequired`. Provider subjects and credentials are omitted. Duplicate username/email returns 409, invalid/unknown fields 400, missing/invalid authentication 401, insufficient role/inactive account 403, missing targets 404, repeat decisions 409. All backend responses use no-store caching.

Registration list items include `id,kind,status,submittedAt,mobile,email,name,businessType,accountStatus`. Account status is separate from registration status. Customer, Company and Patient category tabs display all stored registrations and their verification statuses in backend mode; the prototype retains its previous approved-account behavior. Approval tables retain server pagination and whole-category status counts. Existing category/account client tables filter and sort locally, so their server adapters collect backend pages of 100; very large datasets should eventually move those filters to server queries.

Analytics use repeatable-read transactions over the same registration rows: grouped current and prior counts, daily aggregate SQL and eight recent records. Dates are UTC inclusive calendar days; daily=1 day, weekly=7 days, monthly=30 days, custom=1–180 days. Comparison uses the immediately preceding equally sized range. Zero previous count gives 0% when current is zero, otherwise 100%. Status keys follow the frontend contract (`pending_verification`, `approved`, `rejected`); Nest registration read endpoints retain uppercase database statuses and Next maps them for display.

Next `/api/super-admin/accounts` preserves the existing action envelope. Create accepts `action:create,name,email,role:admin,initialStatus:active|locked` and forwards only name/email/state. State changes accept `action:status,id,status:locked|unlocked`. Backend-mode Super Admin creation and reset-password actions are unavailable, and the form does not collect a password. Cookie-authenticated mutations require the configured frontend Origin and bounded JSON bodies. Direct Nest endpoints remain protected independently.

## Rollout and remaining configuration

1. Review and back up the target database. Check legacy case-only collisions before migration:

   ```sql
   SELECT lower("username"), count(*) FROM "ErpUser"
   GROUP BY lower("username") HAVING count(*) > 1;
   ```

   Resolve any collisions explicitly before deployment. Do not delete or merge identities automatically. The migration is transactional.
2. Stop processes that load Prisma's Windows engine DLL before regenerating the client. From `backend`, run `npm run prisma:generate`, `npm run migrate:deploy`, `npm run build`, then restart the backend. Migration deployment must use the intended DATABASE_URL; never substitute production for a test URL.
3. Keep the existing Cognito pool/app client/AWS configuration and verified active Super Admin identity mapping. Set frontend server-only `BACKEND_API_URL` and `FRONTEND_ORIGIN` as described in README. Restart Next if configuration changed.
4. Cognito login remains unresolved and unchanged. Account creation can be tested with verified existing Super Admin credentials once that integration is operational. Newly created accounts await trusted provider provisioning and subject linkage. No temporary authentication endpoint, role header, local bypass, or production test token exists.

After disposable-database validation, the additive migration was also deployed to the verified local development database at `localhost:15432/zenex`. A preflight found zero case-insensitive username collisions. No remote database was changed. Integration tests use disposable `zenex_test*` databases. Orders, imports, master-data editing and activation/password recovery are outside this change and retain their existing behavior.

## Implementation phases and files

| Phase | Files | Result and validation |
|---|---|---|
| 1: inspection | Existing frontend dashboard/layout/API/session files, backend auth/registration modules and Prisma schema | Established shared components, mixed prototype/backend APIs and existing identity/registration relationships; no files modified in this phase |
| 2: database | `prisma/schema.prisma`, `prisma/migrations/20261023000000_admin_accounts/migration.sql` | Extended existing identity model; migration executed in integration databases; also deployed to the verified local development database after collision preflight |
| 3: account management | `src/accounts/accounts.dto.ts`, `accounts.service.ts`, `accounts.module.ts`, `src/app.module.ts` | Validated Admin create/list/detail/state APIs; normalized unique identifiers, creator audit and credential rejection |
| 4: authorization | `src/auth/auth.guard.ts`, `auth.module.ts` | Added active Super Admin guard; retained verified identity flow and existing Admin guard; login service unchanged |
| 5: shared registrations | `src/registrations/analytics.service.ts`, `management.dto.ts`, registration service/controller/module | Shared aggregates, list metadata, audited conditional decisions; no copied registrations |
| 6: integration | Frontend backend adapter; account/analytics/category/approval/detail APIs; users page and account/registration/verification components; both category detail pages; tests | Existing layouts retained, correct status display, credentials removed from backend account form, decision-only approval messaging |

Automated coverage: backend Jest/Supertest tests (`test/accounts.spec.ts`, existing auth/registration/throttle tests); PostgreSQL tests (`test/integration/admin-management.spec.ts` and registration workflow); real Next route tests (`frontend/tests/backend-http.test.mjs`); isolated Chrome workflow (`test/e2e/registration.e2e.ts`, test-only authentication harness). Test-only Cognito replacements are excluded from production dist. See the final execution results below for actual run status; AWS/Cognito behavior is not validated by these mocks.

## Execution results — 23 October 2026

| Check | Actual result |
|---|---|
| Prisma client generation | Passed (v6.19.3); earlier Windows DLL replacement failures cleared on retry after test processes stopped |
| Prisma schema validation, backend type checking and build | Passed |
| Backend Jest and Supertest | 5 suites, 80 tests passed |
| PostgreSQL integration | 2 suites, 17 tests passed, including final transactional migration |
| Local application migration | Applied successfully to localhost:15432/zenex; column metadata and both applied migrations verified |
| Local backend runtime | Started at port 3001; liveness 200, protected account/analytics endpoints 401 without a token |
| Frontend TypeScript and ESLint | Passed |
| Existing frontend security tests | 4 passed |
| Frontend backend-adapter tests | 5 passed |
| Real Next route HTTP test | 1 passed; covers accounts, registration data, analytics, mutation Origin checks and role denial |
| Chrome workflow | Passed: 1 complete styled Chrome workflow (45.4 seconds; 1.3 minutes including server startup). Verified all three public forms, Super Admin Admin-account creation, both dashboards, shared records, approval updates and Admin account-management denial |

Initial sandboxed Supertest calls could not reach their temporary localhost ports; the suite passed after running with localhost access. The browser harness now retries Next startup once in the same temporary project because creating another project reissues Next's first-run upgrade interruption. Next emitted a dependency security-upgrade notice; no dependency upgrade was made as part of this task. Real Cognito login, AWS credentials and provider provisioning remain untested and deferred as requested.

The final Chrome run used the normal Turbopack configuration and a fresh disposable `zenex_test_browser*` database on the local PostgreSQL server; the runner removed that database afterward. Earlier attempts hit Docker startup delays, cold route compilation, and transient memory exhaustion. An unstyled Webpack experiment was removed. The browser test found an actual approval payload mismatch (an empty rejection reason on approval); the client now sends a reason only for rejection. Final frontend lint/type checks passed after that fix.
