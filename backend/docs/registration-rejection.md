# Registration rejection workflow

Implemented for Customer, Company Admin and Patient in both Admin and Super Admin review pages. Existing authentication, MFA, role guards, profiles, approval/master-code allocation, S3 document handling and dashboard separation are reused.

## Decision contract and validation

POST `/api/admin/registrations/:id/decision` accepts `{ "action": "reject", "reasonCode": "INCOMPLETE_INFORMATION" }`. Codes: MISSING_DOCUMENTS, UNREADABLE_DOCUMENTS, INCOMPLETE_INFORMATION, UNVERIFIABLE_INFORMATION, REGISTRATION_CRITERIA, OTHER. Patient ID proof is optional, so MISSING_DOCUMENTS is disallowed for Patients on both client and server.

OTHER requires `reason` and `reasonReviewed: true`. The administrator sees a preview and explicitly approves external communication; editing resets that confirmation. Backend validation collapses whitespace and requires 8–500 normalized characters (raw input is bounded at 2000). It rejects control characters, markup, links, email, long numeric identifiers and common sensitive-information terms. These checks are defense in depth: arbitrary natural language cannot be reliably classified by a regular expression. Human review is mandatory; custom text must only describe what to correct, without medical, identity, financial or authentication details, confidential verification findings or internal notes. Standard text is selected by the server, ignoring caller-supplied reason text.

Database authorization rechecks an active ADMIN/SUPER_ADMIN inside the transaction. Registration row locks serialize decisions. Only PENDING can change; repeated rejection returns the existing result without updating the reason, actor, timestamp, expiry or outbox. Approval/rejection conflicts return 409. The unique registration/event constraint prevents duplicate notification events. The decision, reason, reviewer reference, audit event and outbox commit together. Notification delivery is outside that transaction.

## Schema and retention

Migration `20261026100000_registration_rejection_retention` adds `Registration.rejectionReasonCode`, `Registration.rejectionExpiresAt`, an expiry index, and NotificationStatus.EXPIRED. Existing `rejectionReason`, `decidedAt`, `decidedById`, `kind`, `status`, audit relations and notification/attempt tables are reused. Existing rejected rows receive an expiry from their original decidedAt or earliest rejection audit timestamp. If both are missing, migration initializes one conservative deadline 30 days later; submission time cannot prematurely expire rejection details. Legacy audit reason copies are removed while retaining their actor, action, registration link and timestamp. Legacy unreviewed rejection outbox rows cannot be sent.

Expiry is fixed at decision time + 30 × 24 hours. It never restarts on retries or updates. `RejectionRetentionService` runs at API and dedicated worker startup and every minute, independent of SQS enablement. Each transaction locks up to 100 expired rejected registrations with SKIP LOCKED. UTC is explicit in raw SQL to avoid premature expiry on non-UTC PostgreSQL servers. Failed runs are logged and retried; duplicate workers and repeated runs are safe. Run at least one long-lived API or worker; after downtime it catches up automatically. Large backlogs drain in batches.

Cleanup nulls reason text/code/expiry, erases notification payload, destination, provider template/message identifiers, marks it EXPIRED and invalidates claims. Audit reason copies are replaced with an expiry marker. It retains the rejected registration/status, original decision timestamp/reviewer reference, notification IDs and attempt outcomes for audit/deduplication. It never deletes accounts, profiles, unrelated registrations, documents or S3 objects. Registration details hide expired reason text immediately; scheduled physical erasure occurs on the next cleanup tick. Database backups and provider-side retention must follow the deployment's existing retention policies independently.

The file-backed development mode mirrors validation, idempotency, retained metadata and a NOT_CONFIGURED notification record. Next instrumentation starts its minute-based cleanup loop when BACKEND_API_URL is absent. Its store transaction/file lock coordinates mutations across requests. Production continues to use PostgreSQL; local development does not send WhatsApp or emulate successful delivery.

## WhatsApp integration

The shared `registration_rejected` payload uses exactly three ordered variables: applicant name, Customer/Patient/Company Admin, and reviewed reason. Company name is not substituted for the Company Admin's name. Recipient comes from the saved registered mobile, normalized to +91; no request-supplied destination is accepted. Names/reasons are loaded from persisted data in the same transaction. No credentials or internal notes are included. SQS carries notification ID only.

Reuse the existing durable outbox/SQS dispatcher, compare-and-set claim leases, bounded timeout, safe retry/backoff, attempt ledger and DLQ. Uncertain acceptance/timeout stays UNKNOWN instead of being blindly retried. Provider failures never undo rejection. PENDING means queued, MOCKED means test only, BLOCKED means configuration/review required, ACCEPTED and DELIVERED require actual provider evidence. EXPIRED rows never dispatch. The UI displays these actual states and shows the saved reason and decision time.

Live WhatsApp is unavailable: the existing AtoZ adapter is deliberately blocked until its API contract is supplied. Mock sends perform no HTTP request. To test delivery simulations, configure the existing SQS worker and `WHATSAPP_REJECTIONS_ENABLED=true` with mock provider/live disabled. To enable production, obtain approved `registration_rejected` template ID/language, documented provider auth/API/idempotency/rate-limit semantics, sender credentials and authenticated receipt/reconciliation contract, implement that adapter, and configure `WHATSAPP_TEMPLATE_REGISTRATION_REJECTED`, approved-template and live flags. Existing per-kind template environment variables remain fallback aliases. Credentials belong in the secret manager/environment, never frontend code. Merely setting flags does not implement a real provider.

Apply migrations and regenerate Prisma before deploying updated API/worker. Frontend and backend reason catalogs must be kept aligned; each server independently validates requests. See [verification](registration-rejection-verification.md) for actual test results.

## Files for this change

Backend: `prisma/schema.prisma`, the rejection-retention migration, `src/registrations/{rejection-reasons.ts,rejection-retention.service.ts,management.dto.ts,registrations.service.ts,registrations.controller.ts,registrations.module.ts}`, `src/notifications/notifications.service.ts`, `src/notification-worker.ts`, `.env.example`, notification documentation and rejection/notification/integration/browser tests.

Frontend: `components/admin/verification-page.tsx` (shared by both dashboards), `components/confirm-dialog.tsx`, `lib/rejection-reasons.ts`, `lib/notification-status.ts`, `lib/types.ts`, `lib/server/{workflow.ts,workflow-state.ts,rejection-retention.ts}`, `app/api/admin/registrations/[id]/route.ts`, `instrumentation.ts`, and workflow/rejection tests. Existing uncommitted changes were preserved.
