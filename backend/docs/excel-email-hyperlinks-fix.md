# Excel email auto-link import fix

Excel desktop automatically saved an email cell as a `mailto:` hyperlink. The XLSX archive inspector rejected that external relationship before row validation. This was the cause of the "Unsafe or unsupported XLSX structure" response; the successful frontend GET/compile logs and slow-filesystem warning were unrelated to that rejection.

The fix parses decoded relationship XML with Saxes. Only worksheet email auto-links whose targets match the displayed text in `email`/`adminEmail` are accepted. They become plain email strings before existing DTO validation and persistence. No hyperlink is followed or retained as a registration field. Encoded XML attributes are inspected after decoding, and web/file links, workbook external references, OLE objects, formulas, macros, DTD/entities and archive limits remain protected.

Files changed: `src/imports/import-relationships.ts` (new), `import-workbook.ts`, the document-error formatting in `imports.service.ts`, existing test/imports.spec.ts, integration/imports.spec.ts, e2e/imports.e2e.ts, and package manifests declaring the already installed Saxes 5.0.1 as a direct runtime dependency. No database migration or frontend redesign is required.

## Supplied files

The actual XLSX now parses and all five ZIP document references match. A read-only check against the local database found no duplicate record. Normal validation still rejects the row for separate input/security reasons:

| Field | Required correction |
| --- | --- |
| masterCode | Updated: preserve the original supplied code, including C01234. Blank bulk cells request new ZI codes. See import-master-code-policy.md. |
| mobile | Use exactly ten digits beginning 6–9, with no country prefix or separators. |
| creditDays | Select the intended template dropdown value; the 30-day option is `days_30_none`, rather than numeric `30`. |
| paymentMethod | Use the template value `UPI`, rather than lowercase `upi`. |
| termsAccepted | Explicit acceptance must be Excel boolean TRUE or the text `true`, rather than `YES`. |
| gstCertificateFile | The referenced PDF decodes but contains an embedded file. Supply a clean PDF without embedded attachments; that existing security restriction remains enforced. |

The original workbook/ZIP were not modified. The diagnostic did not create an import job, registration, account or S3 object. File-validation errors now retain a safe, actionable validator reason so PDF restrictions are visible at the affected row/column.

## Loading the fix

The backend was rebuilt. In the existing foreground backend terminal, press Ctrl+C, then run:

```powershell
npm start
```

Revalidate the workbook/ZIP after correcting the row data. An additional background server is not needed. Existing templates, CSV/ZIP mapping, Single Upload and authenticated document access remain intact.


## Verified results

- Actual workbook and ZIP: parsed successfully; one row and five matching documents, checked read-only against the local database. Remaining input/PDF issues are listed above.
- 224 backend tests passed across 13 suites, including 63 workbook/ZIP/hyperlink tests.
- All 34 import API/PostgreSQL integration tests passed, including generated Excel-style auto-links for Customer, Company and Patient.
- The Customer XLSX + ZIP Chrome journey passed, including validation, confirmation, approved-list retrieval and correct document metadata for two rows with email auto-links.
- Prisma schema validation, strict backend TypeScript checks, compilation and whitespace checks passed.

All automated record-creation tests used disposable databases with mocked AWS transport. No schema migration, AWS configuration change or production-data import was required for this fix.
