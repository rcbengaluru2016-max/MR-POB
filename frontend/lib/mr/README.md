# Medical Representative frontend preview

Open `/mr` or `/mr/dashboard` while the existing Next.js dev server is running.
This is a standalone mock workspace for Manoj Kumar. The current shared
authentication system does not define an MR role; login, route guards, API routes,
server files, and both admin dashboards are unchanged. Orders and drafts persist
across client navigation within this workspace and reset on a full page refresh.

## Design review and reuse

The review covered the frontend route/component inventory, authentication and
registration flows, shared UI primitives, admin shells, both dashboards, company
order/product screens, the order model, global CSS, and project configuration.

- Inherits Geist typography and the existing CSS tokens: background `#f4f7fb`,
  panel `#eef4ff`, primary `#123daa`, foreground `#17243b`, line `#dce3ed`.
- Reuses `CompanyLogo`, `Button`, `Field`, `TextInput`, `SelectInput`,
  `StatusBadge`, and `ConfirmDialog` without changing their implementations.
- Reuses existing `company-*` layout, navigation, panels, KPI cards, table,
  pagination, and order-status styling. The references guide screen structure
  and order information; the existing ERP defines the visual theme.
- Additional styles in `components/mr/mr.css` are nested under `.mr-workspace`.
  No existing CSS or styling configuration was changed. A plain scoped stylesheet
  is used because the configured CSS loader did not expose CSS Module class names
  during the browser preview.
- The MR review wrapper adds keyboard focus containment and scrollable review
  content while retaining the shared confirmation dialog.

## Files added

- `app/mr/`: workspace layout, loading state, entry redirect, Dashboard,
  Create Order, My Orders, and dynamic order-details routes.
- `components/mr/`: workspace shell/provider, dashboard, customer search/details,
  product search, editable cart, order creation/review, orders table, filters,
  pagination, details/history, status badges, and scoped stylesheet.
- `lib/mr/types.ts`: MR, customer, product, draft, order, and line types.
- `lib/mr/mock-data.ts`: deterministic fixtures, including ineligible customers,
  inactive/unassigned/out-of-stock products, and another MR's order.
- `lib/mr/mock-service.ts`: replaceable mock operations and validation.
- `tests/mr-workspace.test.mjs`: MR eligibility, search, isolation, validation,
  snapshot, and currency-total checks.

## Behavior

Dashboard statistics and recent orders are restricted to the mock MR. Customer
search matches name, code, phone, and PIN, but pending/rejected records cannot be
selected. Product search matches brands and hides inactive products and products
outside assigned companies; out-of-stock products remain visible but disabled.

Adding a product already in the cart combines quantities. Quantities must be
whole numbers from 1 to 9,999. Cart edits and removals update totals. Customer
changes retain the current cart. Review shows customer details, product lines,
quantities, and totals. Submission generates a unique `ZX-DEMO-…` reference,
updates the dashboard and order list, and explicitly confirms that no real order
was saved. The submit action prevents duplicate submissions while busy.

My Orders supports all four workflow statuses, search by order reference/customer
name/customer code, six-row pagination, empty results, and order details with
customer information, product prices, totals, and history. Unknown orders or
orders belonging to another MR show an unavailable state.

All mock prices are tax-inclusive pack prices stored as integer paise; the UI
formats INR. These illustrative prices and limits must be replaced by actual
commercial rules during integration.

## Verification

- `npm run lint`: passed before the change and after the completed implementation.
- `npx tsc --noEmit --incremental false`: passed.
- `node --experimental-strip-types tests/mr-workspace.test.mjs`: 5 tests passed.
- `npm run test:security`: all 4 existing tests passed.
- Browser: all four customer search fields; pending/rejected customer buttons;
  brand search; stock restriction; empty cart and invalid quantity errors;
  adding, editing, removing, and keeping cart lines across customer changes;
  correct review total; cancel/Escape and keyboard focus containment;
  simulated submission, new reference, order details, and dashboard count update;
  all status filters; all order search fields; pagination and empty results.
- Responsive inspection: default desktop, 768px tablet, and 390px mobile. Tables
  scroll within their panels; measured page widths stayed within the viewport.
- `npm run build`: not verified. The sandboxed run could not download the
  existing Geist fonts. Network-enabled retries failed when Turbopack's CSS
  worker exited before connecting while processing the existing global
  stylesheet. No shared configuration or font changes were made to bypass this.

## Spring Boot integration work remaining

1. Define authenticated MR identity, permissions, assigned companies, login
   routing, and protected workspace access in the shared auth system.
2. Replace the mock operations with approved backend contracts for dashboard
   statistics, customer search, eligible product search, order creation,
   paginated own-order search, and individual own-order details. No endpoints
   have been invented or implemented here.
3. Agree on mapping between the prototype's combined statuses and the existing
   company order's customer approval, billing status, and overall status fields.
4. Confirm per-company order grouping, pack/quantity limits, inventory checks,
   customer-specific prices/special rates, tax calculations, and monetary units.
5. Enforce MR ownership, company assignment, customer eligibility, product
   access, quantities, inventory, and pricing on the server. The prototype's
   restrictions are UX behavior, not security enforcement.
6. Return canonical references, authoritative totals, and status history; add
   idempotency and real network error/retry handling to order creation.
7. Replace preview-only state with backend persistence and remove demo labels
   only once real requests are in place. Resolve the build-environment issue
   and verify a production build before deployment.
