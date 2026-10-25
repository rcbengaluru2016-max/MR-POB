# Run the connected application locally

Use two PowerShell terminals. Docker Desktop must be running. If an older copy of either application is already running, stop it with Ctrl+C in its terminal first. These commands use the existing local PostgreSQL container and its existing data; they do not recreate the database.

The backend is a Node.js NestJS application. Its `package.json`, TypeScript sources and Prisma migrations are present on both integrated local branches. Both `frontend` and `backend` include the same tested application snapshot after synchronization. Pick either branch before starting the services; do not switch branches between starting Terminal 1 and Terminal 2, because Git switches the whole checkout. Local synchronization does not publish to the remote branches.

Authenticate before starting the services:

```powershell
aws login --profile zenex-dev
aws sts get-caller-identity --profile zenex-dev
```

Select account `703235209354` and complete the browser authentication yourself. If the existing session is already valid, the identity check confirms it. Never paste credentials into source files.

## Terminal 1 — backend

```powershell
Set-Location 'D:\Personal Projects\MRPOB\backend'
docker start zenex-erp-dev-postgres-1
aws sts get-caller-identity --profile zenex-dev
npm run migrate:deploy
npm run build
npm start
```

The Nest API listens on `http://localhost:3001`. Check `http://localhost:3001/api/health/ready`; a successful response is `{"status":"ok"}`. Swagger is at `http://localhost:3001/api/docs` when enabled.

If the local AWS session has expired, renew it in another terminal:

```powershell
aws login --profile zenex-dev
```

Select account `703235209354`. Browser console sign-in alone does not renew this CLI/SDK profile.

Do the identity check before starting the backend each day. If it reports an expired session, run the login command and repeat the check. Temporary AWS login sessions expire independently of the ERP login and Docker database. The dashboard can still display saved registration details while document signing fails. Existing S3 files do not need to be uploaded again, and changing bucket permissions or increasing the 60-second URL lifetime does not fix expired signing credentials. Each Preview/Download click requests a fresh URL. After renewing the session, retry from the registration page; restart the backend if its running process does not pick up the renewed session. Credential-provider failures are reported as HTTP 503 with an `AWS_CREDENTIALS_UNAVAILABLE` server log code.

## Terminal 2 — frontend

```powershell
Set-Location 'D:\Personal Projects\MRPOB\frontend'
npm run dev -- --hostname localhost --port 3000
```

Open `http://localhost:3000/login`. Sign in as `administrator` with the permanent password you set in Cognito. Complete the authenticator prompt. If Cognito requests authenticator enrollment, the login screen displays the setup key and accepts the six-digit code. No demo password is used for this account.

## Configuration

The ignored `backend/.env` contains the working local database connection, `AWS_PROFILE=zenex-dev`, `AWS_REGION=ap-south-1`, the new Cognito pool/client and private client secret, and `S3_REGION=ap-south-1` / `S3_BUCKET=zenex-international-mrpob-files`.

The ignored `frontend/.env.local` has `BACKEND_API_URL=http://localhost:3001`, `FRONTEND_ORIGIN=http://localhost:3000`, `NEXT_PUBLIC_APP_URL=http://localhost:3000` and a private session secret. Use the localhost hostname consistently. The browser calls the frontend's same-origin `/api` routes; its server communicates with Nest. No browser CORS change or public AWS credential is needed.

Dependencies are already installed. On a fresh checkout run `npm ci` in each application directory, then `npm run prisma:generate` and `npm run migrate:deploy` in `backend/`, after configuring the private environment files. Do not overwrite existing environment files or delete the PostgreSQL volume.

## Production build check

From `D:\Personal Projects\MRPOB\frontend`, run `npm run build`. The build uses `tsconfig.build.json`, which retains strict source checks and current `.next/types` route validation while excluding `.next/dev` generated files. This avoids the removed `/customer-activation` route left in development caches by branch switches. Keep the current `/customer-modification` UI; do not recreate the deleted route merely to satisfy an old generated validator. Stop and restart `next dev` after a branch switch to regenerate development route types. Root `npm run build` uses the same Turbopack build as the frontend directory.

## Connected scope and limits

Login, MFA/enrollment, logout, validated sessions, all three public registration forms, registration lists/details/counts, analytics, secure document access, registration approval/rejection, and Admin account creation/state/password management use the Nest backend. Approval records a decision; it does not create an end-user master, activate an account or send WhatsApp messages.

With `BACKEND_API_URL` set, prototype session cookies are ignored and unsupported API operations return an explicit unavailable response. Unimplemented order/catalogue/import/master editing, public account activation, self-service password recovery, and creating additional Super Admins do not silently write to the legacy JSON store. Existing legacy-only behavior remains available only in an explicitly separate configuration without `BACKEND_API_URL`.

Browser tests use disposable PostgreSQL databases and test-only Cognito/S3 transports. Real bucket upload/download/privacy/cleanup checks were separately executed successfully. The real administrator's complete password/MFA login cannot be automated without their private credentials; they are entered only by the user in the login screen.
