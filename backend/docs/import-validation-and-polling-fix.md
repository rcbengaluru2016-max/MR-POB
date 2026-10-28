# Import validation and frontend polling (2026-10-28)

The supplied row-error workbook reports six independent failures. The earlier Excel email auto-link fix is working: the workbook now reaches row validation and its five document references are extracted. A validation failure commits no registrations.

Required source corrections:

- Updated Master Code policy: preserve assigned legacy codes such as C01234 exactly. Blank bulk cells request new ZI codes; see import-master-code-policy.md. The old ZI-only import restriction has been removed.
- Enter the correct ten-digit mobile starting with 6–9.
- Use the credit-term dropdown; the 30-day option is `days_30_none`.
- Use the payment dropdown value `UPI`.
- Record explicit consent with boolean TRUE or text `true`; `YES` is not the accepted template value.
- Replace the GST certificate PDF with a clean document without embedded attachments. The existing embedded-file restriction remains enforced.

The original files were not edited and consent was not inferred. See also `excel-email-hyperlinks-fix.md`.

Two separate frontend defects were fixed:

1. Next 16.4.2 automatically validates each page for instant navigation in development. A parent layout opt-out does not opt the redirect-only leaf page out. Both administrator entry pages now explicitly export `instant = false`; their existing authenticated redirects remain intact.
2. Bulk Upload previously polled every three seconds even for failed validation or while waiting for confirmation. This could exceed the backend's 20-per-minute throttle. It now monitors only confirmed jobs, stops at every terminal status (including validation failure), and schedules the next request after the preceding response. Normal requests are five seconds apart; 429 responses back off at least 30 seconds and honor any forwarded Retry-After value. Access/missing-job failures stop monitoring. Late responses after unmount are discarded.

Upload history uses the same scheduler, stops when the visible page has no active jobs, and provides Refresh uploads to discover later changes. Existing pagination, sort, download, reports and delete remain available. No backend limits or security rules were relaxed; no schema changes are needed. Frontend development HMR loads these changes, or refresh the page after it recompiles. A backend restart is not needed for this frontend fix.

## Verification

- 51 frontend tests passed, including throttle backoff, terminal states, cancellation and non-overlapping requests.
- Strict frontend TypeScript and scoped ESLint checks passed.
- Isolated production build passed for all 108 pages, preserving the running development cache.
- Five existing Chrome import journeys passed: patient bulk, patient single, company single, customer XLSX/ZIP and company CSV/ZIP, including approval, document access, safe downloads and history-only deletion.
- Both administrator entry-page redirect browser checks passed without instant-validation errors.
- The focused three-test Chrome rerun passed, including no continued requests after failed validation or settled history, disabled confirmation for invalid rows, and manual history refresh. The test accounts for React Strict Mode's initial effect replay.
- Browser tests use disposable PostgreSQL and mocked AWS services. No real registration was imported by these checks.
