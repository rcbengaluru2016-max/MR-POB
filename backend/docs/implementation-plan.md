# Registration backend: inspected architecture and implementation contract

## Phase 1: inspection (2026-10-22)

The backend directory was empty. The Next.js 16 App Router frontend contains client React Hook Form/Zod forms, multipart Next route handlers, JSON persistence in `.data/store.json`, salted local password hashes, HMAC session cookies, and base64 document data URLs. Both `/admin/approvals` and `/super-admin/approvals` use `RegistrationApprovals`; details use `VerificationPage`. Existing approval mutations also create masters/accounts. That legacy workflow is outside this task and must not run against the new backend.

### Source-of-truth form inventory

All forms require a password of at least eight characters with uppercase, lowercase and a digit, matching confirmation, accepted terms, and an Indian mobile matching `[6-9][0-9]{9}`. Optional emails must be valid when supplied.

* Customer: customerName (min 2), mobile, optional email, businessName (min 2), customerType (Retail Pharmacy/Hospital/Clinic), addressLine1 (min 3), optional addressLine2/3/4, six-digit pinCode, dlNumber1/2 (min 3), optional dlNumber3/fssaiNumber, required gstNumber, creditDays (same_day_3/week_2/days_30_none/days_60_special), paymentMethod (Cash on Delivery (COD)/UPI/Debit Card/Credit Card/Net Banking/Bank Transfer/Wallet/Cheque/Other). Required files: dl1, dl2, gstCertificate, shopOutside, shopInside; optional dl3.
* Company: companyName (min 2), division (min 1), headquarter (min 2), adminFullName (min 2), adminEmail (required), adminMobile. Required image files: companyLogo, adminPhoto.
* Patient: patientName (min 2), mobile, optional email/gender (Female/Male/Other/Prefer not to say), address (min 8), paymentMethod (same as customer except Cash on Delivery without COD suffix). Optional idProof.

General files allow PDF/JPEG/PNG/WEBP, maximum 5 MiB each, including customer shop photos as the current form permits. Company files allow images only. Backend checks decoded content as well as MIME/extension. No addressType field is submitted by the current forms.

## Chosen authentication behavior, before implementation

Public submission creates a registration request only, never a Cognito user or active ERP account. Password/confirmation are validated then discarded; no registration password or hash is stored. Future approved-account activation must set a new password through Cognito. Success messaging must reflect this. Existing administrator accounts must be provisioned in Cognito and explicitly bound by immutable Cognito `sub` to an ACTIVE database ErpUser with ADMIN or SUPER_ADMIN role. Tokens alone, Cognito group names, public registration fields and legacy cookies cannot grant backend authority.

Cognito password login with optional TOTP/SMS challenge is exposed for the existing login form. Short-lived access tokens are kept in HttpOnly frontend cookies. All administrative requests verify issuer, signature, expiry, token_use and app client and re-read database role/activity. Legacy auth remains only when BACKEND_API_URL is absent, for unrelated prototype functionality.

## Proposed normalized schema

One PostgreSQL database: Registration contains immutable id, kind, PENDING/APPROVED/REJECTED status, mobile/email, timestamps, accepted-terms metadata and future decision/owner references. CustomerRegistration, CompanyRegistration and PatientRegistration are separate one-to-one detail tables. CustomerAddress is a dependent table. Document stores safe S3 key, version, MIME, byte size, SHA256 and slot; no binaries. ErpUser binds Cognito sub to ERP role and state. AuditEvent records important writes and document access. UploadBatch and UploadObject form a durable recovery manifest for compensation after partial S3/DB failures, including process crashes.

Uniqueness: mobile and nonempty normalized email per registration kind; customer GST normalized to uppercase unique. These constraints cover concurrent submissions. Optional Idempotency-Key replay uses a server-HMAC request fingerprint and a database unique key; differing payload reuse returns 409. Database transactions only cover final inserts, never network uploads.

## API contract to implement

* POST /api/registrations/customers|companies|patients: multipart exact form names above, optional Idempotency-Key; 201 `{registrationId,status:"PENDING"}`. Valid replay returns the same result. 400 validation, 409 duplicate/reused key, 413 oversize, 415 unsupported content, 503 storage unavailable.
* GET /api/admin/registrations?kind=customer|company|patient&status=PENDING|APPROVED|REJECTED&page=1&pageSize=25: authorized paginated `{items,total,page,pageSize}` with dashboard columns; no file data or credentials.
* GET /api/admin/registrations/summary?kind=...: `{pending,approved,rejected}` from PostgreSQL group counts.
* GET /api/admin/registrations/:id: `{record}` including typed details and document metadata/access endpoint references, never secrets or permanent URLs.
* GET /api/documents/:id: authenticated record-level policy; short-lived signed GET, attachment disposition and no-store response. Administrators may access registrations; future owners only when explicitly linked and approved.
* POST /api/auth/login: `{username,password}`; returns Cognito accessToken/expiresIn/user or supported MFA challenge; POST /api/auth/challenge completes challenge. GET /api/auth/me verifies token and returns mapped session user. No signup/approval/activation endpoints.
* GET /api/health/live and /ready; Swagger /api/docs.

Frontend route adapters preserve existing multipart URLs and lowercase pending_verification display. Dashboard queries by tab, uses server counts and pagination. View reads backend details; secure same-origin document links obtain authorization on every click. Approval/rejection controls are hidden and mutation routes reject in backend mode.

## Reliability and deployment

S3 bucket `zenex-international-mrpob`, region `ap-southeast-2`, prefixes `registration/customer|company|patient/{registrationId}/{uuid}.{ext}`. Private bucket, role-based SDK v3, explicit encryption, SHA256 and version tracking. Cleanup uses durable manifests and a bounded periodic Nest worker, with conditional leasing in PostgreSQL, retries and object-version deletes. No Redis or SQS justified for this synchronous task. ECS deployments need WAF/shared edge throttling in addition to per-process rate limits. Infrastructure examples, migration, health checks, structured redacted logs, optional Sentry, CI, and backup runbook live inside backend.

## Verification plan

Jest/Supertest cover all forms, validation, duplicates, auth, document isolation, storage and database failures. PostgreSQL integration uses a disposable database; Testcontainers entrypoint when Docker available. Playwright covers form-to-dashboard integration. Report only executed checks as passed. No AWS credentials or Cognito/RDS identifiers were supplied; live AWS verification depends on deployment configuration.
