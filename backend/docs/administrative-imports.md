# Administrative registration imports

The existing Imports module supports Admin and Super Admin users through the shared Bulk Upload, Single Upload and Uploads pages.

Bulk Upload now supports XLSX/UTF-8 CSV together with a Supporting Documents ZIP. See [Bulk imports: Excel/CSV and supporting ZIP documents](bulk-imports-excel-zip.md) for the current API contract, schema, matching rules, S3 layout, migration, commands, tests and compatibility notes. That guide supersedes the earlier workbook-only bulk workflow.

Single Upload continues to use the existing category forms and document controls, requires the original Master Code, applies existing field/file/password rules, and creates an approved registration through the existing approval/account service. Its actor-scoped Idempotency-Key remains bound to submitted fields and document hashes. Credentials are never returned in previews or exports.

Imported records reuse the existing Registration, category profiles, accounts, document metadata and notification outbox. They appear in the existing approved lists with their original Master Codes, complete details, source/audit information and authorized document previews/downloads. Public registrations still enter the existing normal workflow. Existing customer/patient password-free credential setup limitations are unchanged; importing an approved account does not bypass authentication or MFA.

Import history remains database-backed and permission-protected. Downloads are sanitized generated reports. Deletion is audited and affects history only; completed registrations and referenced documents are preserved. S3 stays private and uses short-lived authorized URLs.

Existing migrations `20261026140000_administrative_imports` and `20261027100000_import_master_codes` remain unchanged. The ZIP upgrade adds `20261027230000_import_document_zip` without recreating registration tables or moving existing S3 objects. See the current guide for deployment and verification details.
