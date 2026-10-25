# Zenex registration backend

NestJS/TypeScript, Prisma/PostgreSQL, Cognito access-token authentication, and private S3 documents. All backend source, migration, tests and deployment examples live here. The frontend keeps its existing design and uses server-side adapters when `BACKEND_API_URL` is set.

Read [the local startup commands and connected scope](docs/local-development.md) to run the application. Registration review decisions and Admin credential management are implemented; end-user master creation and activation remain separate from approval.

## Local setup

Requires Node 24 and PostgreSQL 16+ (or Docker for the supplied Compose database). From `backend/`:

```powershell
npm ci
Copy-Item .env.example .env
```

Set `DATABASE_URL`, `IDEMPOTENCY_SECRET` (random, at least 32 characters), `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, and optionally `COGNITO_CLIENT_SECRET`. Set `S3_REGION=ap-south-1` and `S3_BUCKET=zenex-international-mrpob-files`. `AWS_REGION` continues to configure Cognito and SQS; change it only when those services have also moved. The fixed bucket is `zenex-international-mrpob-files` in `ap-south-1`. Use the AWS SDK default credential chain: a local AWS profile for development, an IAM task role on ECS. Do not commit `.env` or copy AWS credentials to frontend variables.

For the new AWS account, authenticate the local profile against account `703235209354` and grant the backend role the permissions in `infra/task-role-policy.json`. Run `node scripts/verify-storage.cjs` from `backend/` using an operator identity with bucket-configuration read permissions to check privacy, versioning, encryption and ownership. The screenshots confirm the bucket name, region and prefixes only; these security settings require live verification. Policy files are deployment examples and are not applied automatically. Existing document records retain their object keys and version IDs; files from the previous bucket must be migrated and version references reconciled before those records can be downloaded from the new bucket. Cognito pool/client IDs and any enabled SQS queue URLs must be verified separately if those services also move to the new account.

The PostgreSQL URL includes `connection_limit=10&pool_timeout=10`; size the limit against the RDS connection budget divided by maximum ECS tasks, leaving headroom for migrations and operations. In production require certificate-verified TLS and use RDS Proxy when justified by connection demand.

```powershell
npm run prisma:generate
npm run migrate:deploy
npm run build
npm start
```

Default API port is 3001. Swagger is at `/api/docs` when enabled. `/api/health/live` checks process liveness; `/api/health/ready` checks dependencies. Do not apply `prisma db push` to production. Apply the provided SQL migration with `migrate deploy` using a migration identity; the runtime identity only needs application table read/write access.

For Compose, set a private URL-safe `POSTGRES_PASSWORD` in ignored `.env` and use the same password in `DATABASE_URL`. Start `postgres`, apply migrations with the database URL from the host or the migration image, then start `backend`. The database binds to `127.0.0.1:15432` on Windows; host-run Prisma and Nest use `postgresql://zenex:REPLACE_WITH_LOCAL_PASSWORD@localhost:15432/zenex?schema=public&connection_limit=10&pool_timeout=10`. Containers still connect to `postgres:5432`. The host port avoids Windows reservations that can prevent binding port 5432. Compose is development-only and requires its password through local configuration. Changing `.env` does not rotate a password in an existing PostgreSQL volume; use that volume's existing password or explicitly rotate it through PostgreSQL.

For subsequent days, start Docker Desktop first, then run `docker compose -p zenex-erp-dev up -d --wait postgres` before `npm start`. The PostgreSQL service uses `restart: unless-stopped`, so Docker restarts it when the engine starts unless it was explicitly stopped. Existing data remains in the named volume; migrations and administrator provisioning do not need to be repeated for an unchanged schema. AWS browser/CLI sessions are temporary: renew the `zenex-dev` profile with `aws login --profile zenex-dev` when it expires. An AWS account suspension must be resolved with its owner or AWS Support before cloud-dependent integration can be verified.

In `frontend/.env.local`, set `BACKEND_API_URL=http://localhost:3001` and `FRONTEND_ORIGIN=http://localhost:3000` (the actual public frontend origin, including its port; use HTTPS in production). Both are server-only. The origin protects cookie-authenticated mutations even when Next runs behind an internal proxy address; `NEXT_PUBLIC_APP_URL` is its fallback. Restart Next.js after changing configuration. With the backend URL set, registration/admin adapters fail closed when the backend is unavailable; they do not silently store registrations in prototype JSON files. With it absent, unrelated prototype behavior remains available for ongoing frontend development.

## Existing Cognito administrators

Create/configure the administrator in the intended Cognito user pool, complete any temporary-password challenge, disable public self-signup, require MFA, and enable the app client's `ALLOW_USER_PASSWORD_AUTH`. Configure Cognito's password and recovery policies there. The login form supports TOTP/SMS challenges and first-login authenticator enrollment. The temporary-password change must be completed through Cognito administration/managed login first.

Verify the immutable Cognito `sub` from the trusted user-pool console/CLI, then provision its ERP role:

```powershell
$env:COGNITO_SUB = 'verified-existing-cognito-user-uuid'
$env:ERP_USERNAME = 'administrator@example.com'
$env:ERP_DISPLAY_NAME = 'Zenex Administrator'
$env:ERP_ROLE = 'SUPER_ADMIN'
node scripts/provision-admin.cjs
```

The script writes an audit event and creates no Cognito account. Only an ACTIVE PostgreSQL ERP user with ADMIN/SUPER_ADMIN role can list/read registrations. Cognito groups and public registration fields never grant that role. The backend verifies access tokens, issuer/app client/expiry and immutable subject, and rechecks ERP state. The Next server stores tokens in HttpOnly, SameSite cookies; it does not expose tokens to client JavaScript. Logout requests Cognito global sign-out and clears cookies. An already issued JWT can remain valid until expiry under offline verification; set short access-token lifetimes and deactivate the ERP user to immediately deny this backend. No refresh-token flow is implemented; expired sessions require sign-in again.

Public registrations do not create Cognito users, ERP accounts or credentials. Password and confirmation are optional legacy registration fields; if either is supplied both are validated, then discarded. Customer/patient forms do not require passwords. Approval records an audited decision only. Future activation must set a new password using Cognito.

## HTTP contracts

All paths below have `/api` prefix. See Swagger for multipart DTOs and validation responses.

| Method/path | Contract |
|---|---|
| POST `/registrations/customers` | Existing customer multipart fields and required DL/GST/shop files |
| POST `/registrations/companies` | Existing company/admin fields, required logo/admin images |
| POST `/registrations/patients` | Existing patient fields, optional ID proof |
| GET `/admin/registrations?kind=patient&page=1&pageSize=25` | Authorized `{items,total,page,pageSize}`; optional uppercase status filter |
| GET `/admin/registrations/summary?kind=patient` | Database `{pending,approved,rejected}` counts independent of pagination |
| GET `/admin/registrations/:id` | Complete `{record}`, safe typed fields, file metadata, `readOnly:false`, `activationPending:true` |
| GET `/documents/:id` | Record-authorized 60-second signed attachment URL, `Cache-Control:no-store` |
| GET `/documents/:id/preview` | Same authorization; 60-second inline PDF/JPEG/PNG/WEBP URL |
| POST `/auth/login` | Existing Cognito username/password; access token/session user or supported MFA challenge |
| POST `/auth/challenge` | Challenge name/session/username/code |
| GET `/auth/me` | Verified ERP session user |

Submission returns `{registrationId,status:"PENDING"}`. The frontend maps PENDING to its existing `pending_verification` presentation. POST `/admin/registrations/:id/decision` records approval/rejection without provisioning credentials, master records or activation emails. Optional `Idempotency-Key` accepts 16–128 alphanumeric/underscore/hyphen characters. Identical normalized request/document bytes replay the same registration; changed payload reuse returns 409. Keys and fingerprints are HMACed. Mobile and nonempty case-insensitive email are unique per registration kind; uppercase-normalized customer GST is unique. These durable duplicate rules include rejected records; future resubmission should be an explicit audited workflow.

PDF, JPEG/JPG, PNG and WEBP are allowed, at most 5 MiB per file. Company uploads allow images only. Backend decodes file contents and checks MIME/extension agreement. Unexpected fields, file slots and repeated slots are rejected. No binaries or passwords are stored in PostgreSQL. Document keys are server-generated under the existing `registration/{customer|company|patient}/{registrationId}/` prefixes. Owners can retrieve documents only when explicitly linked to the approved registration; active administrators can retrieve them for review.

## Upload recovery and operations

Before S3 writes, an UploadBatch/UploadObject manifest records every intended key. Uploads happen outside database transactions. Short database transactions acknowledge each PUT and serialize against cleanup claims; final registration/details/document/audit writes and manifest completion commit atomically. On failure the backend attempts deletion. Every minute a bounded worker claims expired manifests using a conditional database lease and retries cleanup. Version references permit actual version deletion; uncertain writes require listing versions under the narrowly scoped prefix. Completed manifests age out after seven days. Aborted manifests remain as recovery tombstones: successful cleanup is checked again daily, and failed deletion retries after five minutes. This catches PUTs that finish after an earlier cleanup scan without losing their object keys. Archive aborted tombstones only after verifying objects are absent and all processes that could resume their uploads have been retired. Alert on old incomplete manifests and repeated cleanup errors.

Bucket controls must be applied to the **existing** bucket: enable all four Block Public Access flags, Bucket owner enforced object ownership, versioning, default encryption, and deny non-TLS access. `infra/s3-bucket-policy.json` is a policy fragment; merge it with existing policy after review. `infra/task-role-policy.json` scopes object access and version reconciliation to the three registration prefixes. The app must not receive bucket administration permissions. If using customer-managed KMS encryption, add only the required key permissions and align the storage encryption configuration.

Run `node scripts/verify-storage.cjs` using an operator profile with bucket-configuration read permissions to inspect those settings without changing them. Runtime task IAM intentionally lacks those administrative read permissions. This check does not replace reviewing the complete bucket/access-point policies.

Versioning retains deleted versions unless version IDs are explicitly deleted. Set a lifecycle rule for abandoned multipart uploads; apply noncurrent-version expiration only after agreeing document retention requirements. Do not expire live registration documents merely to reduce cost. S3 versioning is recovery protection, not an independent backup; define protected replication or AWS Backup if required.

RDS: enable automated backups with the agreed retention (typically 7–35 days), point-in-time recovery, deletion protection, encrypted storage and restricted private-subnet security groups. Take a snapshot before schema rollout. Test restoring to an isolated RDS instance and compare registration/document counts and sampled S3 version references before declaring recovery usable. Never overwrite the active database during a recovery drill. Record restore duration and the agreed recovery-point/recovery-time objectives.

Structured request logs omit bodies, tokens and filenames. Send ECS stdout to the CloudWatch log group in the task definition and set retention/access controls. Optional `SENTRY_DSN` enables sanitized server-error reporting. Alert on 5xx rates, readiness failures, RDS connections/storage, upload cleanup age, and rejected authentication bursts. Per-process Nest throttling is supplemental; use ALB/WAF rate rules or a shared edge limit across ECS tasks. Bound inbound request size at the proxy/ALB and allow the multipart total required by six 5 MiB files. Do not trust arbitrary forwarded-IP headers.

The built-in registration/login limit is 10 requests per minute per backend socket source and task. Through the Next server adapter, that source is the BFF server's IP, so this is an aggregate limit for traffic from that BFF rather than a reliable individual-user limit. Before production traffic, configure trusted ingress identity forwarding and edge rate rules, then tune the application aggregate limit for expected BFF traffic. Do not enable blanket proxy trust or accept client-supplied `X-Forwarded-For` as an authority.

## Build and deployment examples

```powershell
docker build --target runtime -t zenex-backend:COMMIT_SHA .
docker build --target migration -t zenex-backend-migration:COMMIT_SHA .
```

Run the migration image once per deployment in the same VPC using the migration database identity. Deploy the runtime image to private ECS Fargate subnets behind an HTTPS ALB, with an immutable image digest, health checks, task IAM role and least-privilege execution role. `infra/ecs-task-definition.example.json` contains placeholders and is not deployed. Resolve every ACCOUNT_ID/image/role/Secrets Manager ARN and create the log group before use. Execution role needs ECR pull, CloudWatch logs and narrowly scoped `secretsmanager:GetSecretValue` (plus KMS decrypt only if required). Runtime task role uses the S3 policy. Inject secret JSON fields from Secrets Manager; never bake them into images. Rotate credentials by redeploying tasks and maintain the idempotency secret consistently for replay continuity.

The CI template at `.github/workflows/backend-ci.yml` runs build/type checks/Jest/Testcontainers/Docker build. GitHub discovers workflows only at a Git repository's root `.github/workflows`; when adopting this directory into a monorepo, activate the template there and keep its `working-directory: backend`. If `backend/` becomes its own repository, change the paths and working directory accordingly. Deployment should follow passed checks using GitHub OIDC to a restricted AWS role, push the immutable image to ECR, run migrations, register the task definition, update ECS and wait for stable readiness. No AWS resources or GitHub deployment settings were changed by this task.

## Verification

```powershell
npm run check
npm run build
npm test
npm run test:integration
npm run test:e2e
```

Integration tests default to a disposable PostgreSQL 16 Testcontainer and use real migrations and Prisma queries. If Docker is unavailable, set `TEST_DATABASE_URL` to an **isolated disposable** database named `zenex_test` or `zenex_test_<suffix>`. Tests truncate that database's application tables. On Windows with PostgreSQL 16 installed, `scripts/local-test-db.ps1` can create a loopback-only disposable cluster under ignored `.local/pg` on port 55439. Stop it using the same script's `-Action stop`.

Integration tests replace only Cognito verification and S3 transport. They execute registration endpoints, actual guards and record policies, real database constraints/transactions, status counts, document manifests, uncertain-upload failures, recovery and an induced SQL write failure. These tests do not prove live AWS credentials or connectivity.

Playwright launches an isolated compiled Nest test harness backed by the same disposable database and starts Next.js on 3200. It fills all three real forms, submits documents, logs in, checks HttpOnly cookies, tabs and details, and confirms approval controls are absent. The test-only harness is outside production `src/` and Docker output. It uses installed Google Chrome; install Chrome or adjust the project to installed Playwright Chromium. Live Cognito/S3 calls remain mocked in this browser suite.

The k6 read-only liveness smoke script is `test/load/registrations.k6.js`; run only against an explicitly authorized endpoint. It is not a throughput benchmark for document submissions.

### Phase delivery record

1. Inspection/contract: `docs/implementation-plan.md` records exact form fields, existing local persistence/auth, proposed normalized schema and endpoints before implementation.
2. Foundation: Nest/config/Prisma migration, global validation/safe errors, guards, health and Swagger.
3. Registration/storage: distinct profile tables, duplicate constraints, idempotent multipart submission, validated private S3 documents, durable recovery manifests and audit events.
4. Integration: same-origin Next adapters, Cognito session cookies, database counts/pagination and read-only details within the existing design.
5. Verification: see the final verification report for executed commands and actual results. Pending configuration remains RDS URL/secrets, existing-bucket policies/versioning/IAM, Cognito pool/client/admin mapping, and ECS/CI activation. Live AWS verification and deployment require those values and were not claimed complete.

## Admin management and shared dashboards

Registration decisions now persist a transactional WhatsApp notification outbox. See [registration-notifications.md](docs/registration-notifications.md) for the approved-record/owner APIs, SQS worker, mock-only safety controls, production setup and required AtoZ documentation. Live messaging remains blocked; existing public registration does not automatically provision or activate a Cognito identity.

See [ADMIN_MANAGEMENT.md](ADMIN_MANAGEMENT.md) for the identity-table design, Super Admin account endpoints, shared analytics and decision APIs, frontend contracts, migration rollout, test coverage and deferred Cognito configuration.

For one-at-a-time PowerShell checks with expected HTTP results, see [MANUAL_TESTING.md](MANUAL_TESTING.md). It uses the isolated test harness, three test identities, a dedicated manual test database and `scripts/manual-test-tools.ps1`; real Cognito and S3 checks are identified separately.

Admin credential creation, AWS permissions, recovery and manual checks: [ADMIN_CREDENTIALS.md](ADMIN_CREDENTIALS.md).
