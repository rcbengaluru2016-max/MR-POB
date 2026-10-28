# Bulk imports: Excel/CSV and supporting ZIP documents

Updated 27 October 2026. This is the current Bulk Upload contract for both administrator dashboards. It extends the existing Imports module; Single Upload, normal registration, private document access, and existing stored objects remain in place.

## Frontend changes

Both `/admin/registration-imports` and `/super-admin/registration-imports` use the shared Bulk Upload component. Existing layout, tabs, category selection, template button and styling are retained.

- Completed Excel File accepts `.xlsx` and `.csv`.
- Supporting Documents (ZIP) accepts `.zip`; both selected filenames are displayed.
- The dashboard requires both files before validation. Use an empty ZIP for a Patient import without document references.
- Browser checks extension, size, ZIP/XLSX signatures and basic UTF-8 CSV content. Backend parsing remains authoritative.
- Changing category or either file invalidates the previous preview/session and disables confirmation. Inputs are disabled while a request is running.
- Preview shows row, original Master Code, registration name, category, document status and row errors. It also shows summary counts and warnings for unreferenced files.
- Confirmation resends the same two files and polls actual backend processing status.
- Uploads shows spreadsheet filename, ZIP filename, category, actor/time, row counts, progress, failures and warnings. Existing download/delete actions remain; Row report downloads sanitized results and warnings.
- Fixed the account list's incorrectly encoded sort arrows, loading text, empty email placeholder and pagination separator shown in the screenshots. Fixed preview Category/Documents cells to show their corresponding values.

The supplied `customer-import (1).xlsx` is an empty Customer template: Registrations has its 25 headers but no data rows. Its headers match the active schema exactly and were preserved. Its Instructions and empty Attachments sheet are compatible with this upgrade. Populate registration rows before uploading it.

## Templates and schema

No existing registration columns were renamed or removed. Headers derive from the current class-validator registration DTO and category document slots. The Instructions sheet now describes filename references and ZIP uploads; Excel enum dropdowns remain.

| Category | Document reference columns |
| --- | --- |
| Customer | dl1File, dl2File, gstCertificateFile, shopOutsideFile, shopInsideFile required; dl3File optional |
| Company | companyLogoFile, adminPhotoFile required; image files only |
| Patient | idProofFile optional |

Other fields are the existing Customer/Company/Patient fields. Keep the masterCode column. Preserve existing assigned codes exactly, including legacy prefixes such as C01234, letter case and leading zeros. Leave masterCode blank only for NEW users to reserve a ZI code during validation. The preview shows the assigned code; confirmation retries reuse it. Supplied legacy codes do not advance the ZI sequence. Supplied codes in the generated ZI namespace reserve their numeric range against future collisions.

CSV must be comma-delimited UTF-8 (BOM accepted). Use Excel's **CSV UTF-8 (Comma delimited)** export of the Registrations sheet. Quoted commas, escaped double quotes and multiline quoted values are supported. Required headers, exact column counts, 250-record ceiling and 4,096-character cell limit are enforced. CSV values remain text, with no numeric coercion of identifiers. Wrong categories, duplicate headers, malformed quoting, invalid UTF-8 and binary files disguised as CSV are rejected.

## ZIP matching policy

Document cells contain basenames such as `ZI001234_dl1.pdf`, not paths or binary data. Mapping is driven by the selected category's current document slots, rather than a fixed example-only list.

Matching is exact and case-sensitive. A reference to `Proof.pdf` does not match `proof.pdf`. ZIP subfolders are allowed, but all file basenames must be globally unique; duplicates and case-only variations in different folders are rejected. Archive order and spreadsheet order have no role in matching.

For each row, the backend maps every populated document column to its exact filename, validates that file independently using the existing document validator, and associates it with that row's registration and document slot. Missing or invalid references identify the row, Master Code, column and filename in the preview/report. Required empty document cells also produce row errors. Legitimate reuse of one exact filename across explicit references uses the same bytes; every resulting registration/document association is separate and counts toward the referenced-document storage quota.

Unreferenced archive files produce visible warnings and are never attached or uploaded. They still count toward archive expansion limits. Invalid referenced files fail their row; other eligible rows can be imported under the existing partial-success rules. Archive structural/security errors reject the upload before an import job is created.

The ZIP reader uses yauzl lazy streams with bounded in-memory buffers; nothing is extracted to a filesystem path. Checks cover ZIP signatures/structure, encryption, unsupported compression, traversal, absolute/drive/backslash paths, unsafe segments, symlinks/special file entries, duplicate paths/basenames, declared and actual expanded bytes, document counts, CRC32 and a processing deadline. Original filenames are metadata only, not trusted storage paths.

PDF, PNG, JPG/JPEG and WEBP are supported, subject to existing category rules. Real signatures, MIME/extension agreement and complete image/PDF decoding are checked. Imported PDFs containing active actions/JavaScript, embedded files, rich media or XFA are rejected. Existing authorization and file-security checks remain enabled. No external antivirus service has been introduced or claimed.

## Limits and configuration

| Limit | Default / maximum |
| --- | --- |
| Records | 250 |
| Spreadsheet | 40 MiB |
| Compressed supporting ZIP | 30 MiB |
| Each expanded document | 5 MiB |
| Total expanded/referenced document bytes | 25 MiB |
| ZIP regular files | 1,500 |
| ZIP entries including folders | 4,000 |
| ZIP inspection deadline | 10 seconds |
| Next proxy request buffer | 80 MiB, allowing both file ceilings plus multipart framing |

Existing overrides may lower limits. `IMPORT_ARCHIVE_MAX_BYTES=31457280` is added to backend/.env.example. Existing `IMPORT_WORKBOOK_MAX_BYTES`, `IMPORT_DOCUMENT_MAX_BYTES`, `IMPORT_DOCUMENT_TOTAL_BYTES`, concurrency limits, active-job quota and throttling remain. No private environment file or AWS credential was overwritten.

Reuse the configured bucket/region and AWS default credential chain/IAM role. Local AWS_PROFILE and private backend/frontend settings remain in their existing ignored environment files. The bucket stays private; no public ACL or permission change is required.

## API and processing

Existing Nest controller, services and frontend adapters are reused; no parallel import API was added.

| Method | Backend path | Request/result |
| --- | --- | --- |
| GET | /api/imports/templates/:category | Existing category XLSX template |
| POST | /api/imports/bulk/validate | Multipart kind, file (XLSX/CSV), documentsZip (ZIP) |
| GET | /api/imports/:id/preview | Safe rows, counts, warnings and readiness |
| POST | /api/imports/:id/confirm | Multipart identical file and documentsZip |
| GET | /api/imports/:id/progress | Durable actual status/counts/progress |
| GET | /api/imports | Existing paginated/filterable history, now including supportingFileName and warnings |
| GET | /api/imports/:id/download | Existing sanitized XLSX data/results export |
| GET | /api/imports/:id/errors | Sanitized row-level report, with a Warnings sheet when needed |
| DELETE | /api/imports/:id | Existing audited history-only soft deletion |

Frontend `/api/super-admin/registration-imports/...` adapters serve both authorized administrator roles as before. All import endpoints retain CognitoGuard and AdminGuard. Other authenticated roles receive 403; unauthenticated callers receive 401.

Validation example (multipart):

```text
kind=customer
file=@customer-import.xlsx
documentsZip=@customer-documents.zip
```

```json
{"id":"<job UUID>","status":"READY","supportingFileName":"customer-documents.zip","ready":true,"warnings":["Unreferenced document ignored: unused.png"],"counts":{"total":2,"valid":2,"failed":0,"duplicates":0,"extractedDocuments":10,"readyDocuments":10,"documentFailures":0,"missingDocuments":0},"rows":[{"rowNumber":2,"masterCode":"ZI001234","name":"Imported customer","category":"customer","documentStatus":"Validated","valid":true,"errors":[]}]}
```

Confirmation resends the same `file` and `documentsZip` to `/api/imports/<job UUID>/confirm`. A server HMAC binds category, both filenames and both complete byte hashes to the saved job. Changed, missing or replaced files are rejected with 409. The database READY claim makes repeated/concurrent confirmations idempotent. Credential-bearing original spreadsheets and ZIPs are not retained.

Validation creates a durable job, validates records and files, hashes required credentials with the existing password service, and stages eligible documents privately using existing UploadBatch/UploadObject manifests. No registration is created until confirmation. Documents therefore may exist as temporary private objects before the registration is committed.

Confirmation persists the queue marker and returns promptly. Existing background polling claims jobs, rechecks administrator authorization and duplicates, and commits each eligible registration/profile/account/document relationship in its own transaction. Successfully committed rows are retained if another row fails. Expired/failed manifests clean only their own newly staged objects. Master Code and account username uniqueness remain enforced by the existing database constraints and approval lock.

Imported records use the existing Registration and CustomerRegistration/CompanyRegistration/PatientRegistration models and approved retrieval APIs. They appear in the existing modules after commit and remain after refresh/re-login. Status/source/audit, existing account-security rules and the existing approval notification outbox behavior are reused; this change adds no separate credential or notification flow.

## S3 object keys

Every newly staged bulk document uses:

```text
imports/customer/<ExactMasterCode>/<uuid>.<validated-extension>
imports/company/<ExactMasterCode>/<uuid>.<validated-extension>
imports/patient/<ExactMasterCode>/<uuid>.<validated-extension>
```

For example, `imports/customer/ZI001234/<uuid>.pdf`. UUID filenames prevent silent overwrites and keep raw filenames out of keys. The original filename, slot, content type, size, checksum, object key and version remain in database metadata. Existing objects at old import prefixes are not moved or renamed. Normal `registration/` upload paths and existing Single Upload storage behavior are unchanged.

Secure preview/download uses the existing authorized document APIs and short-lived S3 URLs. Existing approved-detail pages display the same document metadata and inline previews. Deleting upload history cannot delete committed registrations or their documents; cleanup skips completed manifests.

## Database migration

`prisma/migrations/20261027230000_import_document_zip/migration.sql` adds only:

- ImportJob.supportingFileName: nullable VARCHAR(200).
- ImportJob.warnings: TEXT[] with an empty-array default for existing jobs.

No existing registration table is recreated, no records are deleted, and no S3 objects are moved. Original schema, Master Code uniqueness, account relationships and previous import/audit metadata remain.

## Compatibility

The existing workbook-only API remains supported for previously generated embedded-attachment XLSX workbooks and outstanding sessions. CSV requires a ZIP. An XLSX with external references but no ZIP fails row-level missing-file checks. Sending both embedded workbook attachments and a ZIP is rejected as ambiguous. The new dashboard's primary workflow requires two files; legacy API compatibility does not weaken ZIP validation.

Original source files are transient; history downloads remain sanitized generated XLSX reports, rather than originals containing passwords. Company logo/admin photo remain images. This upgrade does not add a new password-free customer/patient login setup flow or replace existing MFA/authentication requirements.

## Local commands

Stop the existing backend with Ctrl+C before Prisma generation on Windows, because a running backend can lock its engine DLL. Use the existing configured local database; do not reset it.

```powershell
Set-Location 'D:\Personal Projects\MRPOB\backend'
npm run prisma:generate
npm run migrate:deploy
npm run build
npm start
```

In another terminal:

```powershell
Set-Location 'D:\Personal Projects\MRPOB\frontend'
npm run dev -- --hostname localhost --port 3000
```

Open the existing Admin/Super Admin Imports page. If the existing AWS profile needs renewal, run the project's existing AWS login procedure before starting the backend. No AWS keys belong in the browser or template.

Automated checks from backend:

```powershell
npm run check
npm test -- --testTimeout=30000
npm run test:integration -- --runTestsByPath test/integration/imports.spec.ts
npm run test:e2e -- test/e2e/imports.e2e.ts
```

Optional live AWS transport check from backend: `node scripts/verify-import-zip-storage.cjs`. It extracts a generated test ZIP, writes only temporary non-sensitive objects under each category/Master Code prefix, checks exact bytes, signed/private access and cleanup, and creates no registration.

From frontend: `npm test`, `npx tsc --noEmit`, and `npm run build`. Browser/integration tests use disposable PostgreSQL with mocked AWS transports; they never reset the application database or register real users. The 30-second unit-test allowance accommodates cold Windows native-library loading; the earlier 5-second image test timed out once under concurrent checks.

## Files changed for this upgrade

- Backend import controller/service, import-workbook.ts, import-upload.ts and import-limits.ts.
- New import-document-zip.ts and import-spreadsheet.ts.
- Existing documents.service.ts (per-file validation and bulk Master Code prefixes).
- Prisma schema and the additive migration above; backend/.env.example.
- backend/package.json/package-lock.json declare the already installed JSZip 3.10.2 directly for test fixtures; runtime extraction uses existing yauzl.
- Frontend shared bulk-upload.tsx and uploads.tsx; new lib/import-files.ts and tests/import-files.test.mjs.
- Frontend registration-table.tsx encoding fixes and next.config.ts proxy buffer.
- Backend test/import-zip.spec.ts, test/fixtures/import-zip.ts, integration/imports.spec.ts and e2e/imports.e2e.ts.
- scripts/verify-import-zip-storage.cjs: optional non-destructive live S3 transport check for all three Master Code prefixes.
- This guide and the administrative-imports overview.

The workspace already contains substantial unrelated uncommitted work; this list describes the current upgrade only.

## Verification results

Verified for this upgrade:

- Backend: all 214 unit tests passed across 13 suites (`npm test -- --testTimeout=30000`), including ZIP/CSV validation, archive traversal/symlink/CRC/expansion checks, legacy workbook compatibility, authentication and document rules.
- Frontend: all 48 tests passed. Strict TypeScript checks and lint on changed files passed.
- Integration: all 34 import tests passed initially on disposable container PostgreSQL. The final complete regression run passed all 55 tests across import and normal registration workflow suites on a separately created disposable local database; that test database was dropped afterward. This includes exact two-row mapping for every category, CSV + ZIP fingerprint binding, Master Code S3 keys, failure counts/reports, preservation of existing registration objects, database-backed approved lists and existing normal registration behavior.
- Chrome: all 5 journeys passed, covering Admin/Super Admin fields, Patient ZIP import/history, Customer XLSX + ZIP, Company CSV + ZIP, retained Single Upload behavior, complete approved details, and authorized image/PDF previews.
- Production: isolated frontend build passed, with strict TypeScript checks and all 108 generated pages. The developer's active frontend build/cache was preserved. Backend compilation passed.
- Live S3: the optional ZIP transport smoke test passed for customer/company/patient Master Code prefixes, exact original bytes, authorized signed downloads, rejection of unsigned public access, and complete object/version cleanup. It created no registration/account and retained no temporary S3 object.
- Deployment: Prisma generation completed successfully after stopping the old local backend; the additive `20261027230000_import_document_zip` migration was applied to the verified local `127.0.0.1:15432/zenex` development database. The upgraded backend was restarted; liveness/readiness returned 200 and unauthenticated Imports access returned 401. The existing frontend login page also returned 200 after its development compiler warmed up.

The first cold native-image unit test exceeded Jest's five-second default under concurrent Windows checks; the complete 30-second-allowance rerun passed. One repeat container setup stalled and was stopped; the final 55-test regression was rerun successfully in a safely named, newly created disposable database on local PostgreSQL. Negative storage tests emit deliberate 500/503/recovery logs; their assertions passed.

The supplied workbook was inspected without modifying it. All test record creation occurred in disposable databases; no actual customer/company/patient registration was imported from the empty supplied template.


## Excel desktop email auto-link fix (28 October 2026)

A normal Excel save can convert the email cell into a `mailto:` hyperlink and create a worksheet external relationship. The earlier blanket external-relationship rejection blocked that valid workbook before row validation, producing "Unsafe or unsupported XLSX structure". The affected local workbook was confirmed to contain one such email auto-link.

Relationships are now parsed with the existing Saxes XML parser (declared directly as a runtime dependency). XML character references are decoded before checking targets, so encoded external links cannot bypass the checks. Only worksheet hyperlink relationships with a simple mailto address are permitted. The cell must belong to email/adminEmail and its displayed text must match the address. Only plain email text reaches registration validation/persistence; hyperlink targets are discarded and never fetched.

Web/file links, external workbook/OLE relationships, mailto headers/recipient lists, mismatched targets, formulas, DTD/entities, macros, unsafe archive parts and size limits remain protected. Synthetic regression tests cover all three registration categories and encoded-attribute bypass attempts. Existing source workbooks and ZIPs are not modified. Restart the existing foreground backend after rebuilding; do not start a second background backend on port 3001.
