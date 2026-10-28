# Master Codes for existing and new users

Bulk imports distinguish users using the spreadsheet's `masterCode` cell:

| Cell | Behavior |
| --- | --- |
| Supplied code, such as `C01234`, `cust-0001` or `ZI000012` | Preserve exactly, including prefix, letter case and leading zeros. Never replace it with a generated code. |
| Blank cell | Treat the row as a new user and reserve a new `ZI` code during validation. The preview displays it. |
| Unsafe or oversized identifier | Return a row error. Codes must be text of 1–128 characters without whitespace, controls or path separators. |

The existing `masterCode` column must remain in the template. Use text cells to preserve leading zeros. A record already present in this application's registrations or account usernames is a duplicate, not an instruction to overwrite or merge that account. Duplicate checks run during validation and again during confirmation.

Generated codes use the same PostgreSQL sequence and advisory lock as ordinary new-registration approvals. Allocation skips supplied codes in the workbook, existing registrations, account usernames and active import reservations. Concurrent jobs reserve distinct numbers. The generated value is persisted in the existing ImportRecord and reused by confirmation retries, including after a worker restart. Cancelling or abandoning a validation can leave a sequence gap; numbers are not recycled. Starting a separate validation creates a separate reservation.

Legacy prefixes do not consume or renumber the ZI series. Supplied codes matching the generated ZI namespace still advance its high-water mark when committed so later generated codes cannot collide. Normal public registrations continue to receive generated ZI codes on approval.

The saved code is used consistently for the approved registration, account username, document storage prefix, preview, row report and approval notification. Single Upload still requires a supplied original code and now accepts legacy prefixes too. Supporting document and other field validation rules remain in force.

The previous ZI-only import restriction existed in row validation, document staging, approval and notification formatting. Those paths now share the legacy-code validator. No database migration is needed; existing Master Codes and stored documents are not rewritten.

## Verification

- 228 backend tests passed, including legacy-code acceptance, unsafe-code rejection, ZI namespace detection and unchanged approval-message identifiers.
- 58 PostgreSQL integration tests passed across import and normal registration workflows, including mixed legacy/new rows, exact usernames and document prefixes, duplicate rejection, concurrent CSV jobs, confirmation replay and ordinary new-user approval.
- 51 frontend tests, strict backend/frontend TypeScript, scoped frontend lint, backend compilation and the isolated 108-page frontend production build passed.
- Record-creation tests used disposable databases and mocked AWS services. The supplied workbook/ZIP check was read-only.
- Chrome: six existing import/redirect/polling checks passed; the two mixed legacy/new-user journeys then passed with the corrected ZIP fixture, covering Customer XLSX and Company CSV, approval, exact codes and document mapping.

## Running locally

The backend source has changed and must be rebuilt before restarting the existing foreground process:

```powershell
cd "D:\Personal Projects\MRPOB\backend"
npm run build
# In the existing backend terminal, stop the old process with Ctrl+C, then:
npm start
```

Refresh the frontend, download the updated template if needed, and validate the original files again. Keep `C01234` unchanged. Other field and PDF checks still apply. A read-only check of the currently supplied workbook and ZIP accepted its Master Code and found only consent and embedded-PDF-file errors; it created no import job, registration or S3 object.
