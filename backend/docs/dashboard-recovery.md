# Dashboard recovery — 26 October 2026

The servers started correctly, but the analytics endpoint failed with Prisma P2028: `Unable to start a transaction in the given time.` Eight concurrent read-only dashboard calls against the configured development database reproduced seven failures at about 2015 ms. The original interactive transaction used Prisma's default two-second connection acquisition deadline.

`AnalyticsService.dashboard` now executes its four fixed read queries in a batched RepeatableRead transaction. It preserves a consistent snapshot and computes the response after the database transaction finishes. Requests can use the configured database pool wait instead of failing at the interactive transaction deadline. The same eight concurrent development-database calls then all passed, including connections taking more than two seconds.

The local database URL also used `localhost`, which added about two seconds to connection acquisition on this Windows/Docker setup. Comparing the same requests using `127.0.0.1` reduced the observed times to about 100–250 ms. Only that hostname was changed in the ignored local `.env`; database, port and credentials were preserved. The example configuration now uses explicit IPv4 loopback too. No development registration records were changed by these diagnostics.

The frontend previously retained its error string after a later successful date-range request, leaving the dashboard hidden. It now associates loading, data and errors with the current request key, ignores aborted responses, clears stale failures when requests change, and offers Retry. Incomplete custom date ranges show a prompt without an indefinite loading indicator.

Verification executed:

- Backend build and TypeScript checks passed.
- Frontend dashboard ESLint and TypeScript checks passed.
- Eight concurrent analytics reads against the configured development database passed.
- Two targeted PostgreSQL integration tests passed, including four dashboard requests queued behind a three-second blocker on a single-connection pool. Five unrelated tests were intentionally excluded by the name filter.
- Focused Chrome browser regression passed: forced analytics failures recover through Retry and date-range changes, incomplete custom ranges show their prompt, and the KPI cards/charts render. An initial test setup consumed its one-shot failure during navigation; the final test uses a persistent controlled failure and a full dashboard navigation. A transient harness compilation failure was resolved by rerunning compilation before the successful browser run.
- Test screenshot: `backend/.local/sequential-tests/dashboard-recovered.png` (isolated empty test database, not the user's registration counts).

Direct inspection of the user's Chrome tab was blocked because the desktop runtime could not confidently verify its current URL. No further desktop input was issued; verification used the isolated automated browser instead.

To load the compiled backend fix in the manually running Terminal 1, press Ctrl+C, run `npm run build`, then `npm start`. Keep that terminal open. Refresh `http://localhost:3000/super-admin/dashboard`; the existing frontend development server reloads the component change automatically. No extra background backend was started for this fix. The separate disposable test database was stopped after verification.
