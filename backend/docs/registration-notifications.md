# Registration approval and WhatsApp readiness

## Approval and storage

The backend reuses `Registration` and its existing `CustomerRegistration`, `PatientRegistration`, or `CompanyRegistration` profile. Documents keep their original registration/S3 associations. Approval, the separate sequential Master Code, the approved owner's activation, reviewer/time audit, and the notification outbox insert commit in one PostgreSQL transaction. Approval does not copy profiles into disconnected tables. Repeating a successful approval returns the same saved Master Code without creating another account, audit decision, or notification. Rejection uses structured reasons and 30-day text retention; see [rejection workflow](registration-rejection.md).

The active ADMIN/SUPER_ADMIN decision endpoint accepts `{ "action": "approve" }` or `{ "action": "reject", "reasonCode": "INCOMPLETE_INFORMATION" }`. Actor, recipient, Master Code, and notification status cannot be supplied in that body. Customer/Patient/Company approved dashboard APIs reuse the existing profile; `GET /api/registrations/me` remains scoped to the authenticated approved owner and matching role. Authentication and MFA guards are preserved. Company password and account provisioning details are documented with the registration implementation; no password is passed to the notification service.

## Exact approval templates

| Kind | Template name | Ordered positional variables |
| --- | --- | --- |
| Customer | `customer_registration_approved` | Customer name, Customer Master Code |
| Patient | `patient_registration_approved` | Patient name, Patient Master Code |
| Company Admin | `company_admin_approved` | Admin full name, company name, Admin Master Code |

`approvalMessage()` contains the exact requested message text. The outbox payload includes `registrationId`, `registrationType`, `decision`, ordered `variables`, and rendered `message`. Names/company/Master Code are loaded from the saved database profile inside the decision transaction. Passwords, password hashes, and provider credentials are excluded. Rejection payloads contain only the reviewed external reason, applicant name, and type. The registered ten-digit mobile is normalized to `+91...`; there is no independently supplied job destination. Queue bodies contain only `{notificationId}` and the worker loads the authoritative recipient and payload from PostgreSQL.

Before sending an APPROVED event the processor verifies the saved approval and refreshes its profile variables. This also upgrades unsent legacy PENDING/RETRY events that previously had generic payloads. Missing or inconsistent profiles fail as `APPROVED_PROFILE_INCOMPLETE` without sending. Migration does not create historical notification events, and terminal mock/accepted/delivered rows are never automatically replayed.

## Durable delivery and honest status

`RegistrationNotification` is both a transactional outbox and delivery ledger. Unique `(registrationId,event)` prevents duplicate approval events. Queue/provider work runs after the approval transaction. A queue or provider outage cannot undo approval, change the Master Code, or create another approved profile.

| Status | Meaning |
| --- | --- |
| PENDING | Persisted request waiting for the worker; no message sent |
| PROCESSING | Claimed with a 60-second lease; transport timeout is 15 seconds |
| RETRY | Definite provider non-acceptance; waiting for a safe retry |
| MOCKED | Test adapter simulation; no real message sent |
| ACCEPTED | Reserved for a real provider-confirmed accepted send; not a delivery receipt |
| DELIVERED | Reserved for an authenticated provider delivery receipt |
| BLOCKED | Missing configuration/template approval or disabled rejection notification |
| UNKNOWN | Ambiguous response or worker crash; reconcile before resending |
| FAILED | Permanent error, invalid destination/profile, or exhausted safe attempts |
| EXPIRED | Rejection payload and destination erased after 30 days; never sent again |

The default worker is disabled, so new requests remain PENDING. An explicitly run mock adapter records MOCKED and performs no HTTP call. Neither state means Message Sent. The frontend shows message success only for real ACCEPTED/DELIVERED statuses. No currently implemented adapter can produce either live state.

Existing worker claims use database compare-and-set leases; concurrent consumers and duplicate SQS messages cannot claim the same send. Before transport the ledger stores attempt number and resolved template. Safe provider retries use 30/60/120/240-second backoff before the fifth attempt; a documented retry-after may extend this to one day. The same notification ID is used as the eventual provider idempotency key. Arbitrary errors, timeouts, and crashes after possible acceptance become UNKNOWN and are never automatically resent. `AbortSignal` is passed to the adapter; a real adapter must honor it and disable hidden transport retries.

Publisher failures keep the committed event and retry with bounded backoff. Periodic republication also covers queue retention expiry. FAILED/UNKNOWN IDs are exported to a DLQ; a failed export is retried without resending a WhatsApp message. Configure the source SQS redrive policy for malformed messages and repeated transport/database failures. Do not automatically replay DLQ records. BLOCKED and MOCKED are held terminally; changing an environment flag alone does not release historical work.

## Configuration and enabling real messaging

1. Apply checked-in Prisma migrations before running updated API/worker, regenerate Prisma, then build. Keep the API worker flag false when a dedicated worker is used.
2. Defaults: `NOTIFICATION_WORKER_ENABLED=false`, `WHATSAPP_PROVIDER=mock`, `WHATSAPP_LIVE_ENABLED=false`, `WHATSAPP_TEMPLATES_APPROVED=false`, `WHATSAPP_REJECTIONS_ENABLED=false`. These send no real WhatsApp messages.
3. A dedicated worker needs `NOTIFICATION_SQS_URL`, `NOTIFICATION_SQS_DLQ_URL`, and `NOTIFICATION_WORKER_ENABLED=true`; start with `npm run start:worker`. Use matching standard/FIFO queues, encryption, visibility timeout of at least 90 seconds, long polling, source retention of 4–14 days, longer DLQ retention, and redrive around five receives. Existing infrastructure examples are not deployed by this change.
4. Scope worker IAM to source SendMessage/ReceiveMessage/DeleteMessage and DLQ SendMessage, with required KMS permissions. Use task IAM roles. Inject database and eventual provider secrets from the production secret manager; local `.env` stays ignored. Never expose provider secrets to the browser.

Configure approved provider template IDs with these new canonical variables:

```
WHATSAPP_TEMPLATE_CUSTOMER_REGISTRATION_APPROVED
WHATSAPP_TEMPLATE_PATIENT_REGISTRATION_APPROVED
WHATSAPP_TEMPLATE_COMPANY_ADMIN_APPROVED
```

For existing deployments, `WHATSAPP_TEMPLATE_REGISTRATION_CUSTOMER_APPROVED`, `WHATSAPP_TEMPLATE_REGISTRATION_PATIENT_APPROVED`, and `WHATSAPP_TEMPLATE_REGISTRATION_COMPANY_APPROVED` remain fallback aliases. The canonical variable takes precedence. Rejections use shared `registration_rejected`, configured by `WHATSAPP_TEMPLATE_REGISTRATION_REJECTED`. The existing per-kind variables remain fallback aliases and rejection delivery remains disabled by default.

`WhatsAppProvider` is the adapter interface. `MockWhatsAppProvider` is the test adapter. `AtoZWhatsAppProvider` deliberately throws `ATOZ_DOCUMENTATION_REQUIRED` without an HTTP call. `ATOZ_API_ENDPOINT`, `ATOZ_API_CREDENTIAL`, and `ATOZ_SENDER_ID` are reserved configuration placeholders; they do not describe a verified vendor API. Setting live flags and placeholder values cannot activate this adapter.

Before real delivery, obtain authoritative provider documentation and sandbox access; endpoint/version/authentication and rotation contract; sender/account details and credentials; all three approved templates, languages, positional parameter rules and provider IDs; rate limits and definite acceptance/error semantics; documented idempotency and retention; lookup/reconciliation API; and delivery receipt authentication, signatures, replay protection and state mapping. Implement the real transport and authenticated receipt/reconciliation handlers, then verify them in the provider sandbox. Confirm that registered numbers are intended WhatsApp destinations and collect required messaging consent. No vendor credentials, IDs, or receipts have been invented here.

## Investigation and recovery

Active ADMIN/SUPER_ADMIN accounts can inspect `GET /api/admin/notifications/registration/:registrationId` and `GET /api/admin/notifications/:id` for destination, template, intended variables, attempts, status, sanitized error code and eventual provider message ID. These authorized reads contain registration data. Structured logs contain event ID/status/attempt/error code, without mobile, names, full messages, credentials, or raw provider responses.

Alert on old PENDING/RETRY rows, expired PROCESSING leases, BLOCKED/UNKNOWN/FAILED counts, queue/DLQ depth, worker health and export lag. An operator may release BLOCKED work using audited maintenance only after verifying no accepted/uncertain send. Never reset UNKNOWN/MOCKED/ACCEPTED/DELIVERED to PENDING as routine recovery. Confirm non-delivery before requeueing ambiguous sends. Define retention according to the business audit policy.

## Verification

Run backend `npm run check`, `npm run build`, `npm test` and `npm run test:integration`. Tests use disposable PostgreSQL, real Prisma transactions/guards/DTOs, and mocked identity/queue/provider transports. They do not contact a WhatsApp provider. See the verification document for actual executed results; historical runs are not evidence that new changes passed.
