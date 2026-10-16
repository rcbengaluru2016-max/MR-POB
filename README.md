# Zenex International ERP frontend

Next.js + React + TypeScript frontend for the Zenex registration → approval → master → account workflow.

## What is already installed in this project

- Node.js (required globally)
- Next.js 16, React 19, TypeScript
- Tailwind CSS 4
- React Hook Form, Zod, Lucide icons

Install Git if it is missing (`winget install Git.Git`), then reopen the terminal.

## Local setup

In PowerShell, run these commands from the project directory:

```powershell
Set-Location D:\MRPOB\mrpob-frontend
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
notepad .env.local
npm install
npm run dev
```

Set `SESSION_SECRET` to a stable random value of at least 32 characters and
`SUPER_ADMIN_PASSWORD` to a unique password of at least 16 characters before
starting the app. Do not commit `.env.local` or share its values. If a Super
Admin account was already provisioned, changing `SUPER_ADMIN_PASSWORD` does
not reset its stored password; use the password that was configured when that
account was first created.

For Existing Customer Account Activation, configure the Twilio `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` values in `.env.local` (or in the
deployment secret manager). The activation flow intentionally refuses to issue
OTP challenges when SMS delivery is not configured. Never put these credentials
in client-side variables or commit them to source control.

Open [http://localhost:3000/login](http://localhost:3000/login) to sign in.
Use [http://localhost:3000/register](http://localhost:3000/register) to start
a Customer, MR, or Patient registration.
Existing customers can begin verified account activation at
[http://localhost:3000/customer-activation](http://localhost:3000/customer-activation).

Bootstrap admin login (local mock only):

- Username: `ADMIN`
- Password: `Demo@1234`

Change `SESSION_SECRET` in `.env.local` before any shared or production use.
Use a random value of at least 32 characters; production authentication rejects a missing or placeholder secret. Keep it stable because it signs sessions and encrypts the Super Admin authenticator secret.

Super Admin access:

- Email / username: `rcbengaluru2016@gmail.com`
- Password: the value of `SUPER_ADMIN_PASSWORD` used when the account was first provisioned. The salted password hash is stored in the server-side store; the password is never included in an API response.
- The Super Admin account is provisioned once when the server initializes its store. The configured password is hashed with PBKDF2-SHA-256 and is not reset on server restart. First login requires a password change and authenticator-based MFA setup. Access to `/super-admin/dashboard` and its analytics APIs is restricted to this account.

After first login, follow the security setup to change the initial password
and enroll an authenticator app. The dashboard then opens at
`/super-admin/dashboard`. Subsequent logins require the authenticator code.

To create and serve a production build, keep the same environment values and
run:

```powershell
npm run build
npm run start
```

The production server uses `http://localhost:3000` by default.

## Product flow

1. User registers as Customer, MR, or Patient.
2. Status becomes Pending Verification and a Registration ID is issued.
3. Admin verifies documents, then approves or rejects (reject reason required).
4. Approval automatically creates the matching Master, generates `ZNX-…` Master Code, creates the user account with that code as username, activates it, and logs the activation email.

## Scripts

- `npm run dev` — development server
- `npm run lint` — ESLint
- `npm run build` — production build
- `npm run start` — serve the production build
