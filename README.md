# Zenex International ERP

The connected application uses Next.js/React/TypeScript for the frontend and a **Node.js NestJS/TypeScript backend**, with Prisma/PostgreSQL, Amazon Cognito and private S3 document storage.

See the [PowerShell startup guide](backend/docs/local-development.md) for commands and environment configuration. Both local `frontend` and `backend` branches contain the integrated application. Select a branch before starting either service: a branch switch changes the entire checkout, including both folders.

```text
MRPOB/
  backend/
    package.json              # NestJS build, start, migration and test scripts
    src/                      # API, Cognito authentication and private documents
    prisma/                   # Database schema and migrations
    test/                     # Unit, database and browser integration tests
    docs/local-development.md
    .env                      # Private local configuration; ignored by Git
  frontend/
    package.json              # Next.js build, dev and test scripts
    app/                      # Routes, including customer-modification
    components/               # Current UI and forms
    lib/server/backend-api.ts # Same-origin API adapter to Nest
    proxy.ts                  # Backend session validation and API dispatch
    tsconfig.build.json       # Production types, excluding development cache
    .env.local                # Private local configuration; ignored by Git
```

The backend runs at `http://localhost:3001`; the frontend runs at `http://localhost:3000`. Sign in at `/login` as `administrator` with the permanent Cognito password and authenticator code. No prototype password is used in connected mode.

Registration, approvals, Admin account management and private document previews use the backend. Customer modification, activation, self-service recovery and unrelated ERP modules retain their current unavailable behavior until their backend workflows are implemented. Approval alone does not create a master or activate an end-user account.

The latest frontend UI, including customer details, recovery pages, password visibility, product image controls and delivery instructions, is preserved. The old `/customer-activation` page was replaced by `/customer-modification` in the frontend history. Production builds validate current routes without loading stale `.next/dev/types` from a previous checkout.

Root `npm run dev`, `npm run build` and `npm start` target the frontend. Run backend commands from `backend/`, where its package manifest and sources now exist on both integrated local branches.
