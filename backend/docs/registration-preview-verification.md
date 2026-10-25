# Registration reset and private document previews — 24 October 2026

## Cleanup

Inspected the real local database and matched the two old registrations to the supplied screenshots. Confirmed the old profiles used test documents, had no linked end-user account, and predated the new bucket.

| Removed test registration | Registration ID |
| --- | --- |
| Integration Test Patient | REG-PAT-82394b1f-a485-4505-857c-5c7135a30da6 |
| Lotus Media | REG-COM-88d88fd3-fa35-4add-b6b2-41aaa245f34b |

There were no customer registrations to remove. Backed up the records, document metadata, upload manifests, related audit events and account snapshot under ignored `.local/registration-preview-task/pre-cleanup-backup.json` before cleanup. Removed only those two registrations, their three database document references, and their two upload manifests. Retained their audit events by detaching the removed registration foreign keys and added a cleanup audit event.

Their three exact S3 keys had no object versions or delete markers in the new account's bucket. No S3 objects were deleted, and the bucket and folder markers were preserved. All four ERP accounts, including the active `administrator` Super Admin and three unrelated inactive Admin accounts, were compared against the snapshot and remained byte-for-byte unchanged.

Found the existing `20261023010000_registration_notifications` migration had never been applied to the real local database. Applied that non-destructive migration to create the missing notification tables required by approval actions. No new migration was invented and no authentication configuration was changed.

## Live registration and storage verification

Submitted multipart data through the running frontend's normal public registration API routes, which forwarded it to the real Nest backend and real S3 bucket. These were HTTP form submissions, not automated clicks in the user's browser. Left the following clearly named synthetic registrations pending for review:

| Type | Name | Registration ID | Documents |
| --- | --- | --- | --- |
| Customer | Preview Test Customer | REG-CUS-9a913fa6-c00d-46a9-8962-9fdf2ca40e5e | 5 |
| Company | Preview Test Company | REG-COM-b00d94ce-a504-4c91-923b-ae0bd144e7da | 2 |
| Patient | Preview Test Patient | REG-PAT-035903f7-44bb-4a09-aff0-98126b49d6e5 | 1 |

Each request returned HTTP 201. Verified each PostgreSQL profile, contact fields, PENDING state, document slot, S3 object key prefix, version ID, MIME type, size and SHA256. All eight objects are in the real Mumbai bucket under their matching `registration/{kind}/{registrationId}/` prefixes. Existing unrelated objects and folder markers retained their keys, ETags and sizes.

The production registration list/detail/summary services returned these same IDs, fields and file references. Each category has one pending, zero approved and zero rejected registration. The existing administrator ERP identity was used when invoking the production document authorization service; no credentials, guards or roles were bypassed or modified in the running application.

## Preview and Download behavior

Added an authenticated `GET /api/documents/:id/preview` Nest endpoint. It applies the existing document ownership/administrator policy, permits only PDF/JPEG/PNG/WEBP, and returns a 60-second private presigned URL with `Content-Disposition: inline` and the validated content type. The original Nest download endpoint still returns attachment URLs.

The frontend document hyperlink opens a new tab with `noopener noreferrer`. It uses preview by default; a separate Download link requests the attachment URL. No permanent S3 URL, public ACL, or AWS credential is sent to the frontend.

For every real test file, fetched both signed modes and verified HTTP 200, exact file bytes, correct MIME type, inline preview headers and attachment download headers. Coverage includes three PDFs, two PNGs, two JPEGs and one WEBP. Anonymous S3 access returned HTTP 403; unauthenticated frontend and Nest preview requests returned HTTP 401; an unrelated active patient identity was rejected by the document service with HTTP 403. Bucket public-access blocking, versioning, encryption and bucket-owner enforcement remained enabled.

## Executed checks and limits

- 115 backend unit tests across eight suites passed, including preview MIME restrictions, ownership and signed-response parameters.
- All 36 database integration tests across three suites passed. The strengthened preview-controller case then passed a focused rerun with an authenticated administrator, invalid tokens and an unrelated user.
- Four existing frontend authentication/security tests passed. Backend and frontend type checking, changed-source ESLint, both builds and `git diff --check` passed.
- Cognito administrator remains enabled and CONFIRMED. Working login/MFA code, credentials, pool configuration and session settings were not changed. No new Cognito user was created.

Computer Use stopped because it could not reliably establish the current Chrome URL on Windows. No further browser automation or inspection of the existing browser session was attempted. Consequently, actual clicks in the administrator tab, visual dashboard rendering, and the browser's native PDF/image viewer were not verified during this task. The live API/database/S3 checks and response-header checks above are completed; they must not be represented as a completed browser click-through test. No new browser test run is claimed.

The running frontend remains on port 3000. The backend was rebuilt and restarted on port 3001 to load the new endpoint. The three new pending test registrations and their eight private files are intentionally retained. Detailed local evidence is saved under ignored `.local/registration-preview-task/live-workflow-results.json`.
