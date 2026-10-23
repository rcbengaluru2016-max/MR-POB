# Registration decisions and WhatsApp preparation

## Inspection and scope

The existing backend already stored each registration in `Registration` with one category-specific profile (`CustomerRegistration`, `CompanyRegistration`, or `PatientRegistration`). Documents reference the same registration and private S3 objects. The shared admin registration list, detail, summary and analytics APIs read PostgreSQL. `CognitoGuard` resolves the token subject to an active ERP account; `AdminGuard` allows ADMIN and SUPER_ADMIN; account management remains protected by `SuperAdminGuard`. There is no category-specific permission table: both administrator roles currently review all three categories.

The existing decision endpoint already used a conditional PENDING update and transactional audit. It did not generate notification events, provision user identities, or populate another master table. There was no SQS module or notification worker in this backend.

Frontend inspection (read only): admin approval adapters call `/api/admin/registrations/:id/decision`; shared lists and counts already call Nest. Operational customer/company/patient workflows and some master views still use the frontend's local store. In particular the Super Admin registrations adapter omits a status filter, so it can display pending/rejected records too. Backend approval cannot update that frontend-local store. **No frontend files were changed.** Wiring those remaining views to the approved backend API needs explicit frontend authorization and is outside this implementation.

## Decision and dashboard contract

`POST /api/admin/registrations/:id/decision` accepts only `{ "action": "approve" }` or `{ "action": "reject", "reason": "...8–2000 characters..." }`. The authenticated actor is never supplied in the body. The transaction locks the active administrator row, conditionally updates PENDING, stores status/time/reviewer/reason, adds an audit event and inserts a unique notification event. Another concurrent or repeated decision returns 409; unknown registrations return 404. An outbox write failure rolls back the whole decision. SQS/provider calls never occur in this transaction.

All lists reuse the original profile and document records. No duplicate masters or accounts are created:

- `GET /api/admin/registrations?kind=customer&status=APPROVED` — existing filtered list.
- `GET /api/admin/registrations/approved?kind=customer` — always approved, with the existing pagination contract; company/patient supported identically.
- `GET /api/admin/registrations/summary?kind=customer` — actual PostgreSQL status totals.
- `GET /api/registrations/me` — all approved profiles owned by the active authenticated ERP user, matching the user's role. Returns 403 without an approved ownership link; clients cannot choose another owner.

Customer/company/patient Cognito authentication now also requires an approved registration with matching `ownerId` and category. Existing document access already required active ownership and approval. Approval by itself **does not create a Cognito login or bind an identity**, and the response continues to return `activationPending:true`. Public submission deliberately discards passwords after validation. A separate verified account activation/provisioning policy is needed before newly approved registrants can sign in. Never link accounts automatically by a client-supplied email/phone alone. The owner endpoint works for securely provisioned/bound existing accounts; this task does not invent that activation flow.

## Durable notification workflow

`RegistrationNotification` is a transactional outbox and delivery ledger. Unique `(registrationId,event)` prevents duplicate events. The stored recipient is `+91` plus the registration's ten-digit mobile (company uses its normalized admin mobile). There is no separate WhatsApp field today; confirm that registered mobiles are WhatsApp destinations and the required messaging consent before enabling live delivery. Queue bodies contain only `{notificationId}`; workers load recipient, kind, event and payload from PostgreSQL, ignoring extra queue properties.

Template keys are `registration.customer.approved`, `registration.company.approved`, `registration.patient.approved`, and the equivalent `.rejected` keys. Payloads currently contain registration ID, category and decision. Rejection reasons and credentials are excluded. Mock template IDs start with `mock:` and are simulation labels, not vendor-approved templates.

The outbox publisher uses database compare-and-set leases and controlled backoff for queue failures. Pending work is periodically republished until processing reaches a durable state, including after SQS retention expiry. The consumer claims one database row, records its attempt and template before calling a provider, and persists its outcome. Parallel consumers and duplicate SQS messages cannot acquire the same delivery claim. A crash after sending but before persisting the response becomes UNKNOWN, never an automatic resend. This deliberately favors avoiding duplicates over silently risking another delivery.

Delivery statuses:

| Status | Meaning / operator action |
| --- | --- |
| PENDING | Committed event waiting for publication or consumption |
| PROCESSING | Claimed with a 60-second lease; provider timeout is 15 seconds |
| RETRY | Confirmed non-acceptance; scheduled retry |
| MOCKED | Intended recipient/template/payload recorded; no real delivery |
| ACCEPTED | Future provider accepted the message; does not mean delivered |
| DELIVERED | Reserved for verified provider delivery receipts |
| BLOCKED | Missing approvals/configuration or disabled rejection messages |
| UNKNOWN | Uncertain response/process crash; reconcile before any resend |
| FAILED | Permanent rejection, invalid stored mobile, or five exhausted safe attempts |

Safe provider retries use 30/60/120/240-second backoff before the fifth failed attempt; publishing backoff is capped at one hour. Confirmed rate limits can impose a longer retry-after (bounded at one day). Arbitrary exceptions, HTTP responses with undocumented acceptance semantics, and timeouts must never be classified as safe retries. The adapter must honor AbortSignal, use no hidden HTTP retries and keep a stable notification ID as the eventual provider idempotency key if that capability exists.

FAILED and UNKNOWN IDs are exported to the configured DLQ; the database remains authoritative if DLQ export fails. Export acknowledgment failure can duplicate a DLQ ID but never sends a WhatsApp message. Configure the source SQS redrive policy too, so malformed messages and repeated transport/DB errors reach the DLQ. Do not automatically consume/replay the DLQ. BLOCKED is held for operator review; no automatic resends occur after merely changing configuration. MOCKED is terminal and must never automatically become live work.

There is no public webhook or fake delivery receipt implementation: the provider's receipt authentication, status transitions and reconciliation API are unknown. ACCEPTED/DELIVERED and provider message IDs provide schema support for that future work. The current AtoZ adapter always throws `ATOZ_DOCUMENTATION_REQUIRED` and performs no HTTP requests, even when live flags and placeholder configuration are supplied.

## Local and AWS configuration

1. Run `npm ci`, `npm run prisma:generate`, `npm run migrate:deploy`, then `npm run build`. Apply the new migration before running the updated API/worker. Existing decided registrations are deliberately not backfilled, to avoid unexpected historical notifications.
2. Default `WHATSAPP_PROVIDER=mock`, `WHATSAPP_LIVE_ENABLED=false`, `WHATSAPP_TEMPLATES_APPROVED=false`, `WHATSAPP_REJECTIONS_ENABLED=false`. With the worker disabled, new events stay PENDING. Tests call the processor with a mock provider/queue and a real disposable PostgreSQL database.
3. Supply `NOTIFICATION_SQS_URL` and `NOTIFICATION_SQS_DLQ_URL`; enable `NOTIFICATION_WORKER_ENABLED=true` in a dedicated worker task and start `npm run start:worker` (or `node dist/notification-worker.js` in the existing runtime image). Keep the API task's worker flag false if running a separate worker. Multiple workers are supported. The standalone worker validates the same database/AWS/Cognito environment as the API.
4. Use standard or FIFO queues, encrypted at rest, visibility timeout at least 90 seconds, long polling, source retention 4–14 days, longer DLQ retention and redrive `maxReceiveCount` around 5. Match the two queue types. The code supplies FIFO group/deduplication IDs when queue URLs end in `.fifo`. Database deduplication remains necessary beyond FIFO's five-minute deduplication interval. See [AWS visibility documentation](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html) and [AWS outage recovery](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/designing-for-outage-recovery-scenarios.html).
5. The worker task role needs SendMessage/ReceiveMessage/DeleteMessage on its source queue and SendMessage on its DLQ. Scope KMS permissions to queue keys if required. Use TLS and private VPC SQS endpoints or approved outbound connectivity; the API needs no SQS permissions when its worker is disabled. `infra/notification-queues.example.yaml` and `infra/notification-worker-policy.example.json` are undeployed templates.
6. Inject RDS credentials and eventual provider secrets from AWS Secrets Manager via the ECS execution role, following the existing `infra/ecs-task-definition.example.json` secret injection pattern. Locally use ignored `.env`; never put secrets in frontend settings. `ATOZ_API_ENDPOINT`, `ATOZ_API_CREDENTIAL` and `ATOZ_SENDER_ID` are **reserved placeholders**, not a claim about the vendor's actual auth fields. Revise these names/shape after receiving its documentation. No static AWS credentials are required; use task IAM roles.

Approved template variables (currently empty in `.env.example`):

```
WHATSAPP_TEMPLATE_REGISTRATION_CUSTOMER_APPROVED
WHATSAPP_TEMPLATE_REGISTRATION_COMPANY_APPROVED
WHATSAPP_TEMPLATE_REGISTRATION_PATIENT_APPROVED
WHATSAPP_TEMPLATE_REGISTRATION_CUSTOMER_REJECTED
WHATSAPP_TEMPLATE_REGISTRATION_COMPANY_REJECTED
WHATSAPP_TEMPLATE_REGISTRATION_PATIENT_REJECTED
```

## Required from AtoZ Services before activation

Obtain the provider's authoritative documentation URL/specification and sandbox account; exact endpoint/version and authentication/rotation requirements; sender/account identifiers; six approved template IDs, languages, named or positional parameters, permitted registration fields, optional rejection reason policy, and message consent requirements; timeout/rate-limit/error semantics and retry-after rules; idempotency key support and retention window; message lookup API for uncertain sends; delivery receipt formats, signature validation, replay protection, and supported states.

Then implement/test the real adapter against its documented sandbox, add authenticated receipt/reconciliation handling, prove uncertain-response behavior, configure Secrets Manager/approved IDs, decide how to release BLOCKED historical work, and obtain authorization to enable live delivery. Environment flags alone cannot activate the placeholder adapter. No API documentation was supplied, and a public search for the provider name did not identify an authoritative API contract. No template IDs were invented.

## Investigation and recovery

`GET /api/admin/notifications/registration/:registrationId` and `GET /api/admin/notifications/:id` are restricted to active ADMIN/SUPER_ADMIN accounts. They expose intended recipient/template/payload, attempt history, provider message ID, status and sanitized error code for authorized investigation. No provider secrets or raw response bodies are stored. These reads include PII; use existing private API controls and retention policy. Structured stdout logs contain event ID/status/attempt/error code, not mobile, message payload or credentials.

Alert on old PENDING/RETRY rows, expired PROCESSING leases, BLOCKED/UNKNOWN/FAILED counts, source/DLQ depth, publisher errors, worker heartbeat/exit and DLQ export lag. Query the ledger for delivery failures; registration counts remain registration status counts, independent of notification outcomes.

There is intentionally no unauthenticated retry/replay endpoint. After config changes, an operator may release a BLOCKED event through an audited database maintenance transaction only after checking `NotificationAttempt` shows no accepted/uncertain send. Do not reset UNKNOWN/MOCKED/ACCEPTED/DELIVERED statuses to PENDING as routine recovery. Confirm acceptance with the provider first; only known non-delivery may be requeued. Redact provider responses and avoid storing excess message content. Define ledger retention with business audit requirements before adding deletion jobs.

## Verification

Run `npm run check`, `npm run build`, `npm test` and `npm run test:integration`. The new integration suite uses Supertest, the actual Nest guards/DTOs, real Prisma transactions and PostgreSQL constraints, and mock Cognito verification/SQS/WhatsApp. It induces outbox, queue and provider failures and tests concurrent decisions/jobs. It does not contact AtoZ or send WhatsApp messages. See `docs/registration-notifications-verification.md` for the actual execution results from this change.
