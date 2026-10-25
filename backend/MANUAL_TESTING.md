> Account creation and password instructions in this older guide are superseded by [ADMIN_CREDENTIALS.md](ADMIN_CREDENTIALS.md). Passwords are now required and Cognito provisioning is implemented.

# Manual testing — run one numbered check at a time

These commands use **PowerShell**. Inspect the expected result before continuing. Commands within a block belong to that check; do not paste the entire guide as one script.

The PowerShell blocks were syntax-checked, and the request helpers were exercised in Windows PowerShell against a disposable database: fixture sign-in, role denial, immediate account deactivation/reactivation, multipart registration and Swagger availability passed. The guide itself does not run these checks automatically; you perform and inspect each numbered check below.

The real app uses frontend port 3000 and backend port 3001. Its authenticated checks require working Cognito identities. Since that integration is deferred, this guide first uses the existing **test-only** backend on 3201 and a copied frontend on 3200. They use a fresh PostgreSQL test database, test identities, and in-memory S3 transport. All actual account services, registration services, validation, authorization guards, SQL migrations and frontend adapters run normally. This does not validate real Cognito or S3.

Keep the real frontend at `localhost:3000` and use **127.0.0.1:3200** for this test frontend, so their browser cookies have different hostnames. Browser cookies are not separated by port.

## 1. Start the isolated environment

Use three PowerShell terminals. Open Docker Desktop and wait until its engine is ready.

### Terminal A: test database and test backend

**1.1 — Open the backend folder.**

```powershell
Set-Location 'D:\Personal Projects\MRPOB\backend'
```

**1.2 — Check Docker.**

```powershell
docker info
```

Expected: Docker server information, without a daemon connection error.

**1.3 — Start the existing local PostgreSQL service.**

```powershell
docker compose -p zenex-erp-dev up -d --wait postgres
```

Expected: `zenex-erp-dev-postgres-1` is healthy. Do not use `down -v` or database reset commands.

**1.4 — Create a NEW database for this manual session.**

```powershell
docker exec zenex-erp-dev-postgres-1 createdb -U zenex zenex_test_manual
```

Expected: exit code 0. If it says the database already exists, stop here: it may contain a previous manual session. Use the cleanup section only if you intend to discard that previous test data, then repeat this command. The application database `zenex` is not the manual test database.

**1.5 — Point this terminal's test harness to that database.**

```powershell
$env:TEST_DATABASE_URL = 'postgresql://zenex:REPLACE_WITH_LOCAL_PASSWORD@127.0.0.1:15432/zenex_test_manual?schema=public&connection_limit=10&pool_timeout=10'
```

Replace the placeholder with the URL-encoded `POSTGRES_PASSWORD` configured in ignored `.env`. Do not save the resulting URL in committed files or set it to the application database. The harness clears and seeds its selected test database on startup; restarting it resets this manual session.

**1.6 — Start the test backend. Leave Terminal A running.**

```powershell
node test/e2e/start-harness.cjs
```

Expected: successful migration/startup and a backend listening on **127.0.0.1:3201**. Compilation can take time. An occupied-port error means another test server must be stopped first; do not start a second server on the same port.

### Terminal B: isolated frontend

**1.7 — Open the backend folder.**

```powershell
Set-Location 'D:\Personal Projects\MRPOB\backend'
```

**1.8 — Configure the copied frontend's backend.**

```powershell
$env:BACKEND_API_URL = 'http://127.0.0.1:3201'
```

**1.9 — Set its browser origin.**

```powershell
$env:FRONTEND_ORIGIN = 'http://127.0.0.1:3200'
```

**1.10 — Set its app URL.**

```powershell
$env:NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3200'
```

**1.11 — Start the isolated frontend. Leave Terminal B running.**

```powershell
node test/e2e/start-frontend.cjs
```

Expected: Next is ready on **127.0.0.1:3200**. The script copies the frontend into a temporary project so it does not reuse your normal frontend's development lock. It retries startup once if Next first interrupts with its dependency-upgrade notice. Use the normal Turbopack configuration; the project's styling loader is configured there.

### Terminal C: all commands below

**1.12 — Open the backend folder.**

```powershell
Set-Location 'D:\Personal Projects\MRPOB\backend'
```

**1.13 — Load the request helpers.**

```powershell
. .\scripts\manual-test-tools.ps1
```

The helpers print HTTP status codes and return `{StatusCode, Data}`. They do not throw merely because the API returns an expected 400/401/403/404/409, allowing you to inspect each negative test. They use .NET HTTP APIs to avoid PowerShell/native-curl JSON quoting differences.

**1.14 — Check liveness.**

```powershell
Invoke-ErpApi -Method GET -Path '/api/health/live' | ConvertTo-Json -Depth 10
```

Expected: **200**. An unavailable server is a startup/connectivity problem, not an authorization failure.

## 2. Authentication boundary and test identities

These credentials exist only in the test harness. They do not sign into the real Cognito backend on port 3001.

| Role | Username | Test-only password |
|---|---|---|
| Super Admin | `browser-admin` | `BrowserPass123` |
| Admin | `browser-officer` | `BrowserPass123` |
| Ordinary Patient | `browser-patient` | `BrowserPass123` |

**2.1 — Request a protected resource without a token.**

```powershell
Invoke-ErpApi -Method GET -Path '/api/super-admin/accounts' | ConvertTo-Json -Depth 10
```

Expected: **401**.

**2.2 — Request it with an invalid token.**

```powershell
Invoke-ErpApi -Method GET -Path '/api/super-admin/accounts' -Token 'invalid-test-token' | ConvertTo-Json -Depth 10
```

Expected: **401**.

**2.3 — Sign in as the test Super Admin and save the token in Terminal C.**

```powershell
$superLogin = Invoke-ErpApi -Method POST -Path '/api/auth/login' -Body @{ username = 'browser-admin'; password = 'BrowserPass123' }
$SuperToken = $superLogin.Data.accessToken
$superLogin.Data.user
```

Expected: **201**, `userType = super_admin`.

**2.4 — Sign in as the test Admin.**

```powershell
$adminLogin = Invoke-ErpApi -Method POST -Path '/api/auth/login' -Body @{ username = 'browser-officer'; password = 'BrowserPass123' }
$AdminToken = $adminLogin.Data.accessToken
$adminLogin.Data.user
```

Expected: **201**, `userType = admin`.

**2.5 — Sign in as an ordinary test user.**

```powershell
$patientLogin = Invoke-ErpApi -Method POST -Path '/api/auth/login' -Body @{ username = 'browser-patient'; password = 'BrowserPass123' }
$PatientToken = $patientLogin.Data.accessToken
$patientLogin.Data.user
```

Expected: **201**, `userType = patient`.

**2.6 — Verify the Super Admin identity.**

```powershell
Invoke-ErpApi -Method GET -Path '/api/auth/me' -Token $SuperToken | ConvertTo-Json -Depth 10
```

Expected: **200**, the same Super Admin identity.

**2.7 — Verify a wrong password is rejected.**

```powershell
Invoke-ErpApi -Method POST -Path '/api/auth/login' -Body @{ username = 'browser-admin'; password = 'WrongPassword123' } | ConvertTo-Json -Depth 10
```

Expected: **401**. This tests the fixture login contract; real Cognito password/MFA behavior remains a separate AWS check.

## 3. Admin account creation, persistence and restrictions

**3.1 — Create an Admin as Super Admin. Keep the returned identifiers.**

```powershell
$newAdmin = Invoke-ErpApi -Method POST -Path '/api/super-admin/accounts' -Token $SuperToken -Body @{ name = 'Manual Test Admin'; email = 'MANUAL.ADMIN@EXAMPLE.TEST'; state = 'ACTIVE' }
$NewAdminId = $newAdmin.Data.account.id
$SuperAdminId = $newAdmin.Data.account.createdById
$newAdmin | ConvertTo-Json -Depth 10
```

Expected: **201**; role `ADMIN`; username/email `manual.admin@example.test`; state `ACTIVE`; nonempty UUID, timestamps and `createdById`; `provisioningRequired = true`. No password or provider subject is returned.

**3.2 — Retrieve the same Admin.**

```powershell
Invoke-ErpApi -Method GET -Path "/api/super-admin/accounts/$NewAdminId" -Token $SuperToken | ConvertTo-Json -Depth 10
```

Expected: **200**, same ID and account fields.

**3.3 — List Admin accounts.**

```powershell
$accounts = Invoke-ErpApi -Method GET -Path '/api/super-admin/accounts?page=1&pageSize=25' -Token $SuperToken
$OfficerId = ($accounts.Data.items | Where-Object { $_.username -eq 'browser-officer' }).id
$accounts | ConvertTo-Json -Depth 10
```

Expected: **200**; seeded `browser-officer` and your new Admin are present. All listed roles are `ADMIN`; the Super Admin and ordinary Patient are not included.

**3.4 — Verify default inactive status.**

```powershell
Invoke-ErpApi -Method POST -Path '/api/super-admin/accounts' -Token $SuperToken -Body @{ name = 'Manual Inactive Admin'; email = 'manual.inactive@example.test' } | ConvertTo-Json -Depth 10
```

Expected: **201**, state `INACTIVE`, provisioning required. The Admin list now contains three Admins if you followed the guide without additional account creation.

**3.5 — Reject an exact duplicate.**

```powershell
Invoke-ErpApi -Method POST -Path '/api/super-admin/accounts' -Token $SuperToken -Body @{ name = 'Duplicate Admin'; email = 'manual.admin@example.test' } | ConvertTo-Json -Depth 10
```

Expected: **409**; no extra row.

**3.6 — Reject a case-only duplicate.**

```powershell
Invoke-ErpApi -Method POST -Path '/api/super-admin/accounts' -Token $SuperToken -Body @{ name = 'Duplicate Admin'; email = 'Manual.Admin@Example.Test' } | ConvertTo-Json -Depth 10
```

Expected: **409**. Email is also the username in this form, so this exercises the canonical identifier collision. The integration suite separately tests legacy username-only collisions and concurrent creates.

**3.7 — Reject an invalid name.**

```powershell
Invoke-ErpApi -Method POST -Path '/api/super-admin/accounts' -Token $SuperToken -Body @{ name = 'X'; email = 'invalid.name@example.test' } | ConvertTo-Json -Depth 10
```

Expected: **400**.

**3.8 — Reject an invalid email.**

```powershell
Invoke-ErpApi -Method POST -Path '/api/super-admin/accounts' -Token $SuperToken -Body @{ name = 'Invalid Email'; email = 'not-an-email' } | ConvertTo-Json -Depth 10
```

Expected: **400**.

**3.9 — Reject credentials.**

```powershell
Invoke-ErpApi -Method POST -Path '/api/super-admin/accounts' -Token $SuperToken -Body @{ name = 'Credential Test'; email = 'credential@example.test'; password = 'NeverStoreThis123!' } | ConvertTo-Json -Depth 10
```

Expected: **400**, unsupported `password` field.

**3.10 — Reject a role override.**

```powershell
Invoke-ErpApi -Method POST -Path '/api/super-admin/accounts' -Token $SuperToken -Body @{ name = 'Role Override'; email = 'role.override@example.test'; role = 'SUPER_ADMIN' } | ConvertTo-Json -Depth 10
```

Expected: **400**; this endpoint only creates Admins.

**3.11 — Reject a forged provider identity.**

```powershell
Invoke-ErpApi -Method POST -Path '/api/super-admin/accounts' -Token $SuperToken -Body @{ name = 'Identity Override'; email = 'identity.override@example.test'; cognitoSub = 'forged-subject' } | ConvertTo-Json -Depth 10
```

Expected: **400**.

**3.12 — Reject a forged creator.**

```powershell
Invoke-ErpApi -Method POST -Path '/api/super-admin/accounts' -Token $SuperToken -Body @{ name = 'Creator Override'; email = 'creator.override@example.test'; createdById = $OfficerId } | ConvertTo-Json -Depth 10
```

Expected: **400**.

**3.13 — Deny account creation without authentication.**

```powershell
Invoke-ErpApi -Method POST -Path '/api/super-admin/accounts' -Body @{ name = 'Unauthorized Admin'; email = 'unauthorized@example.test' } | ConvertTo-Json -Depth 10
```

Expected: **401**.

**3.14 — Deny Admin-created Admin accounts.**

```powershell
Invoke-ErpApi -Method POST -Path '/api/super-admin/accounts' -Token $AdminToken -Body @{ name = 'Forbidden Admin'; email = 'forbidden@example.test' } | ConvertTo-Json -Depth 10
```

Expected: **403**.

**3.15 — Deny Admin access to account lists.**

```powershell
Invoke-ErpApi -Method GET -Path '/api/super-admin/accounts' -Token $AdminToken | ConvertTo-Json -Depth 10
```

Expected: **403**.

**3.16 — Deny Admin access to account details.**

```powershell
Invoke-ErpApi -Method GET -Path "/api/super-admin/accounts/$NewAdminId" -Token $AdminToken | ConvertTo-Json -Depth 10
```

Expected: **403**.

**3.17 — Deny Admin access to account state changes.**

```powershell
Invoke-ErpApi -Method PATCH -Path "/api/super-admin/accounts/$NewAdminId/state" -Token $AdminToken -Body @{ state = 'INACTIVE' } | ConvertTo-Json -Depth 10
```

Expected: **403**; target state remains ACTIVE.

**3.18 — Deny an ordinary user access to account management.**

```powershell
Invoke-ErpApi -Method GET -Path '/api/super-admin/accounts' -Token $PatientToken | ConvertTo-Json -Depth 10
```

Expected: **403**.

**3.19 — Reject invalid pagination.**

```powershell
Invoke-ErpApi -Method GET -Path '/api/super-admin/accounts?pageSize=101' -Token $SuperToken | ConvertTo-Json -Depth 10
```

Expected: **400**. `page=0` also returns 400.

**3.20 — Reject malformed IDs.**

```powershell
Invoke-ErpApi -Method GET -Path '/api/super-admin/accounts/not-a-uuid' -Token $SuperToken | ConvertTo-Json -Depth 10
```

Expected: **400**.

**3.21 — Handle an unknown valid UUID.**

```powershell
$MissingAccountId = [Guid]::NewGuid().ToString()
Invoke-ErpApi -Method GET -Path "/api/super-admin/accounts/$MissingAccountId" -Token $SuperToken | ConvertTo-Json -Depth 10
```

Expected: **404**. PATCH to `/$MissingAccountId/state` also returns 404.

**3.22 — Ensure the Admin-only state endpoint cannot target the Super Admin.**

```powershell
Invoke-ErpApi -Method PATCH -Path "/api/super-admin/accounts/$SuperAdminId/state" -Token $SuperToken -Body @{ state = 'INACTIVE' } | ConvertTo-Json -Depth 10
```

Expected: **404**; the Super Admin remains active.

**3.23 — Reject an unsupported state.**

```powershell
Invoke-ErpApi -Method PATCH -Path "/api/super-admin/accounts/$NewAdminId/state" -Token $SuperToken -Body @{ state = 'LOCKED' } | ConvertTo-Json -Depth 10
```

Expected: **400**. Nest accepts ACTIVE/INACTIVE; the frontend translates Lock/Unlock to those states.

**3.24 — Disable the bound test Admin.**

```powershell
Invoke-ErpApi -Method PATCH -Path "/api/super-admin/accounts/$OfficerId/state" -Token $SuperToken -Body @{ state = 'INACTIVE' } | ConvertTo-Json -Depth 10
```

Expected: **200**, state INACTIVE.

**3.25 — Verify its existing token is denied immediately.**

```powershell
Invoke-ErpApi -Method GET -Path '/api/admin/registrations?kind=patient' -Token $AdminToken | ConvertTo-Json -Depth 10
```

Expected: **403**. The test harness, like production authentication, rereads the database's account state for each authenticated request.

**3.26 — Re-enable it before continuing.**

```powershell
Invoke-ErpApi -Method PATCH -Path "/api/super-admin/accounts/$OfficerId/state" -Token $SuperToken -Body @{ state = 'ACTIVE' } | ConvertTo-Json -Depth 10
```

Expected: **200**. Repeat 3.25: it should now return **200**.

**3.27 — Verify a newly created, unprovisioned Admin cannot sign in.**

```powershell
Invoke-ErpApi -Method POST -Path '/api/auth/login' -Body @{ username = 'manual.admin@example.test'; password = 'AnyPassword123' } | ConvertTo-Json -Depth 10
```

Expected: **401** in this fixture environment. The new account has no Cognito identity or password; ACTIVE does not mean provisioned. The test harness intentionally allows sign-in only for its seeded identities.

## 4. Submit real registration payloads to the test backend

These use actual multipart validation and PostgreSQL persistence with in-memory S3 transport. The helper does not attach any administrator token to public submissions.

**4.1 — Generate one valid test image using the installed Sharp dependency.**

```powershell
New-Item -ItemType Directory -Force '.local/manual-tests' | Out-Null
@'
const sharp = require('sharp');
sharp({ create: { width: 16, height: 16, channels: 3, background: '#1451ab' } })
  .png().toFile('.local/manual-tests/proof.png')
  .catch(error => { console.error(error.message); process.exitCode = 1; });
'@ | node
$Proof = (Resolve-Path '.local/manual-tests/proof.png').Path
```

Expected: a valid PNG exists. Reusing it in different document slots is acceptable for these test fixtures.

**4.2 — Define the Customer form fields.**

```powershell
$customerFields = @{
  customerName = 'Manual Customer'
  mobile = '9876501001'
  email = 'manual.customer@example.test'
  businessName = 'Manual Pharmacy'
  customerType = 'Retail Pharmacy'
  addressLine1 = '12 Manual Test Road'
  pinCode = '560001'
  dlNumber1 = 'MANUAL-DL-001'
  dlNumber2 = 'MANUAL-DL-002'
  gstNumber = 'MANUAL-GST-001'
  creditDays = 'same_day_3'
  paymentMethod = 'UPI'
  password = 'Registration123'
  confirmPassword = 'Registration123'
  termsAccepted = 'true'
}
$customerFiles = @{ dl1 = $Proof; dl2 = $Proof; gstCertificate = $Proof; shopOutside = $Proof; shopInside = $Proof }
```

**4.3 — Submit the Customer.**

```powershell
$customer = Send-ErpRegistration -Kind customer -Fields $customerFields -Files $customerFiles -IdempotencyKey 'manual-customer-key-001'
$CustomerId = $customer.Data.registrationId
$customer | ConvertTo-Json -Depth 10
```

Expected: **201**, generated REG-CUS ID, status PENDING.

**4.4 — Replay the same request and key.**

```powershell
Send-ErpRegistration -Kind customer -Fields $customerFields -Files $customerFiles -IdempotencyKey 'manual-customer-key-001' | ConvertTo-Json -Depth 10
```

Expected: **201**, exactly the same registration ID; one database registration only.

**4.5 — Change data but reuse that key.**

```powershell
$changedCustomer = $customerFields.Clone()
$changedCustomer.customerName = 'Changed Customer Name'
Send-ErpRegistration -Kind customer -Fields $changedCustomer -Files $customerFiles -IdempotencyKey 'manual-customer-key-001' | ConvertTo-Json -Depth 10
```

Expected: **409**; original data remains unchanged.

**4.6 — Reject a duplicate submission without an idempotency key.**

```powershell
Send-ErpRegistration -Kind customer -Fields $customerFields -Files $customerFiles | ConvertTo-Json -Depth 10
```

Expected: **409**.

**4.7 — Define the Company form fields.**

```powershell
$companyFields = @{
  companyName = 'Manual Company'
  division = 'Medical'
  headquarter = 'Bengaluru'
  adminFullName = 'Manual Company Contact'
  adminEmail = 'manual.company@example.test'
  adminMobile = '9876501002'
  password = 'Registration123'
  confirmPassword = 'Registration123'
  termsAccepted = 'true'
}
```

**4.8 — Submit the Company.**

```powershell
$company = Send-ErpRegistration -Kind company -Fields $companyFields -Files @{ companyLogo = $Proof; adminPhoto = $Proof }
$CompanyId = $company.Data.registrationId
$company | ConvertTo-Json -Depth 10
```

Expected: **201**, REG-COM ID, PENDING. This applicant contact does not become a global Admin account.

**4.9 — Define the Patient form fields.**

```powershell
$patientFields = @{
  patientName = 'Manual Patient Approve'
  mobile = '9876501003'
  email = 'manual.patient.approve@example.test'
  gender = 'Female'
  address = '18 Manual Patient Road Bengaluru'
  paymentMethod = 'UPI'
  password = 'Registration123'
  confirmPassword = 'Registration123'
  termsAccepted = 'true'
}
```

**4.10 — Submit a Patient with optional ID proof.**

```powershell
$patient = Send-ErpRegistration -Kind patient -Fields $patientFields -Files @{ idProof = $Proof }
$PatientId = $patient.Data.registrationId
$patient | ConvertTo-Json -Depth 10
```

Expected: **201**, REG-PAT ID, PENDING.

**4.11 — Submit a second Patient, without optional proof, for rejection testing.**

```powershell
$rejectPatientFields = $patientFields.Clone()
$rejectPatientFields.patientName = 'Manual Patient Reject'
$rejectPatientFields.mobile = '9876501004'
$rejectPatientFields.email = 'manual.patient.reject@example.test'
$rejectPatient = Send-ErpRegistration -Kind patient -Fields $rejectPatientFields
$RejectPatientId = $rejectPatient.Data.registrationId
$rejectPatient | ConvertTo-Json -Depth 10
```

Expected: **201**, another ID, PENDING. You now have four registrations: Customer 1, Company 1, Patient 2.

**4.12 — Reject invalid registration input.**

```powershell
$invalidPatient = $patientFields.Clone()
$invalidPatient.mobile = '12345'
Send-ErpRegistration -Kind patient -Fields $invalidPatient | ConvertTo-Json -Depth 10
```

Expected: **400**. Repeat this check with a fresh clone and each of the following changes, one at a time: `termsAccepted = 'false'`, `confirmPassword = 'Different123'`, `patientName = ''`, or `role = 'ADMIN'`. Each must return 400 and create no row.

**4.13 — Reject missing required Company files.**

```powershell
Send-ErpRegistration -Kind company -Fields $companyFields | ConvertTo-Json -Depth 10
```

Expected: **400** before persistence.

**4.14 — Reject fake image bytes.**

```powershell
[IO.File]::WriteAllText((Join-Path (Get-Location) '.local/manual-tests/fake.png'), 'This is not an image')
Send-ErpRegistration -Kind patient -Fields $patientFields -Files @{ idProof = '.local/manual-tests/fake.png' } | ConvertTo-Json -Depth 10
```

Expected: **415** before persistence.

**4.15 — Reject oversized uploads.**

```powershell
[IO.File]::WriteAllBytes((Join-Path (Get-Location) '.local/manual-tests/too-large.png'), [byte[]]::new(5242881))
Send-ErpRegistration -Kind patient -Fields $patientFields -Files @{ idProof = '.local/manual-tests/too-large.png' } | ConvertTo-Json -Depth 10
```

Expected: **413**. If repeated public tests return 429, wait 60 seconds before continuing; the existing submission rate limit is active.

## 5. Shared reads, status filters, details and documents

**5.1 — Customer list as Super Admin.**

```powershell
Invoke-ErpApi -Method GET -Path '/api/admin/registrations?kind=customer' -Token $SuperToken | ConvertTo-Json -Depth 10
```

Expected: **200**, total 1 and `$CustomerId`.

**5.2 — Customer list as Admin.**

```powershell
Invoke-ErpApi -Method GET -Path '/api/admin/registrations?kind=customer' -Token $AdminToken | ConvertTo-Json -Depth 10
```

Expected: **200**, the same stored registration.

**5.3 — Company list as Admin.**

```powershell
Invoke-ErpApi -Method GET -Path '/api/admin/registrations?kind=company' -Token $AdminToken | ConvertTo-Json -Depth 10
```

Expected: **200**, total 1 and `$CompanyId`. Repeat with `$SuperToken`; the data should match.

**5.4 — Patient pagination.**

```powershell
Invoke-ErpApi -Method GET -Path '/api/admin/registrations?kind=patient&page=1&pageSize=1' -Token $AdminToken | ConvertTo-Json -Depth 10
```

Expected: **200**, total 2, one item. Repeat with `page=2`: another item, total still 2.

**5.5 — Pending-only Patient records.**

```powershell
Invoke-ErpApi -Method GET -Path '/api/admin/registrations?kind=patient&status=PENDING' -Token $AdminToken | ConvertTo-Json -Depth 10
```

Expected: **200**, total 2 before decisions.

**5.6 — Complete registration details.**

```powershell
$patientDetails = Invoke-ErpApi -Method GET -Path "/api/admin/registrations/$PatientId" -Token $SuperToken
$DocumentId = $patientDetails.Data.record.files.idProof.id
$patientDetails | ConvertTo-Json -Depth 15
```

Expected: **200**, correct Patient/contact/address/status fields, file metadata, `readOnly:false`, `activationPending:true`. No password, S3 object key or credential fields. Repeat using `$CustomerId`, `$CompanyId`, and `$AdminToken` to check every profile type and role.

**5.7 — Get authorized document access metadata.**

```powershell
Invoke-ErpApi -Method GET -Path "/api/documents/$DocumentId" -Token $AdminToken | ConvertTo-Json -Depth 10
```

Expected: **200**, `expiresIn = 60` and a URL. In the test harness that URL uses `private-s3.example.test` and intentionally does not download a real object. Real S3 download and link expiry require the later AWS-connected check.

**5.8 — Deny ordinary-user access to an unrelated document.**

```powershell
Invoke-ErpApi -Method GET -Path "/api/documents/$DocumentId" -Token $PatientToken | ConvertTo-Json -Depth 10
```

Expected: **403**. The seeded test Patient does not own the submitted registration.

**5.9 — Deny ordinary-user registration access.**

```powershell
Invoke-ErpApi -Method GET -Path "/api/admin/registrations/$PatientId" -Token $PatientToken | ConvertTo-Json -Depth 10
```

Expected: **403**. Also repeat for `/api/admin/registrations?kind=patient`, `/api/admin/registrations/summary?kind=patient`, and `/api/admin/registrations/analytics`.

**5.10 — Handle a missing registration.**

```powershell
Invoke-ErpApi -Method GET -Path '/api/admin/registrations/REG-PAT-does-not-exist' -Token $SuperToken | ConvertTo-Json -Depth 10
```

Expected: **404**.

**5.11 — Reject an invalid type or status.**

```powershell
Invoke-ErpApi -Method GET -Path '/api/admin/registrations?kind=unknown' -Token $AdminToken | ConvertTo-Json -Depth 10
```

Expected: **400**. `kind=patient&status=accepted` also returns 400. Direct Nest status filters are uppercase; frontend adapters translate their UI status values.

## 6. Approve, reject and verify updates

**6.1 — Check counts before decisions.**

```powershell
Invoke-ErpApi -Method GET -Path '/api/admin/registrations/summary?kind=patient' -Token $AdminToken | ConvertTo-Json -Depth 10
```

Expected: **200**, `{pending:2, approved:0, rejected:0}`.

**6.2 — Reject decisions without authentication.**

```powershell
Invoke-ErpApi -Method POST -Path "/api/admin/registrations/$PatientId/decision" -Body @{ action = 'approve' } | ConvertTo-Json -Depth 10
```

Expected: **401**. Repeat with `-Token $PatientToken`: **403**.

**6.3 — Reject an invalid decision.**

```powershell
Invoke-ErpApi -Method POST -Path "/api/admin/registrations/$PatientId/decision" -Token $AdminToken -Body @{ action = 'delete' } | ConvertTo-Json -Depth 10
```

Expected: **400**.

**6.4 — Reject an insufficient rejection reason.**

```powershell
Invoke-ErpApi -Method POST -Path "/api/admin/registrations/$RejectPatientId/decision" -Token $AdminToken -Body @{ action = 'reject'; reason = 'short' } | ConvertTo-Json -Depth 10
```

Expected: **400**, record still pending. Omitting `reason` for rejection also returns 400.

**6.5 — Approve the first Patient as Admin.**

```powershell
Invoke-ErpApi -Method POST -Path "/api/admin/registrations/$PatientId/decision" -Token $AdminToken -Body @{ action = 'approve' } | ConvertTo-Json -Depth 10
```

Expected: **201**, status APPROVED, timestamp, `activationPending:true`. Do not supply an empty rejection reason for approval. No master record, login credentials or activation email is created.

**6.6 — Reject the second Patient as Super Admin.**

```powershell
Invoke-ErpApi -Method POST -Path "/api/admin/registrations/$RejectPatientId/decision" -Token $SuperToken -Body @{ action = 'reject'; reason = 'Documents require correction before approval' } | ConvertTo-Json -Depth 10
```

Expected: **201**, status REJECTED.

**6.7 — Prevent a second decision from overwriting approval.**

```powershell
Invoke-ErpApi -Method POST -Path "/api/admin/registrations/$PatientId/decision" -Token $SuperToken -Body @{ action = 'reject'; reason = 'Attempt to overwrite an existing decision' } | ConvertTo-Json -Depth 10
```

Expected: **409**, the record stays APPROVED.

**6.8 — Recheck status totals as Super Admin.**

```powershell
Invoke-ErpApi -Method GET -Path '/api/admin/registrations/summary?kind=patient' -Token $SuperToken | ConvertTo-Json -Depth 10
```

Expected: `{pending:0, approved:1, rejected:1}`. Repeat with `$AdminToken`: identical counts.

**6.9 — Retrieve approved-only records.**

```powershell
Invoke-ErpApi -Method GET -Path '/api/admin/registrations?kind=patient&status=APPROVED' -Token $AdminToken | ConvertTo-Json -Depth 10
```

Expected: total 1, `$PatientId`. With `status=REJECTED`, expect total 1, `$RejectPatientId`. With `status=PENDING`, expect total 0.

**6.10 — Verify rejection details.**

```powershell
Invoke-ErpApi -Method GET -Path "/api/admin/registrations/$RejectPatientId" -Token $AdminToken | ConvertTo-Json -Depth 10
```

Expected: REJECTED, the supplied reason and a decision timestamp.

## 7. Analytics and shared data consistency

**7.1 — Today's dashboard.**

```powershell
Invoke-ErpApi -Method GET -Path '/api/admin/registrations/analytics?period=daily' -Token $SuperToken | ConvertTo-Json -Depth 15
```

Expected if all registrations were submitted in the same UTC day: total 4; Customer 1, Company 1, Patient 2; Pending 2, Approved 1, Rejected 1. These are registration counts, not ERP login account counts. No duplicate copies are created for the other role.

**7.2 — Weekly range.**

```powershell
Invoke-ErpApi -Method GET -Path '/api/admin/registrations/analytics?period=weekly' -Token $AdminToken | ConvertTo-Json -Depth 15
```

Expected: seven UTC trend points and the same totals for a fresh test session.

**7.3 — Monthly range.**

```powershell
Invoke-ErpApi -Method GET -Path '/api/admin/registrations/analytics?period=monthly' -Token $AdminToken | ConvertTo-Json -Depth 15
```

Expected: thirty UTC trend points. Recent items contain your four registrations.

**7.4 — Valid custom range.**

```powershell
$UtcDay = [DateTime]::UtcNow.ToString('yyyy-MM-dd')
$AnalyticsPath = "/api/admin/registrations/analytics?period=custom&start=$UtcDay&end=$UtcDay"
Invoke-ErpApi -Method GET -Path $AnalyticsPath -Token $SuperToken | ConvertTo-Json -Depth 15
```

Expected: a one-day inclusive UTC range. If your session crosses UTC midnight, use a range covering both submission dates.

**7.5 — Compare both roles' analytics.**

```powershell
$superAnalytics = (Invoke-ErpApi -Method GET -Path $AnalyticsPath -Token $SuperToken).Data
$adminAnalytics = (Invoke-ErpApi -Method GET -Path $AnalyticsPath -Token $AdminToken).Data
($superAnalytics | ConvertTo-Json -Depth 20 -Compress) -eq ($adminAnalytics | ConvertTo-Json -Depth 20 -Compress)
```

Expected: **True**, provided no other action changed records between requests.

**7.6 — Invalid calendar date.**

```powershell
Invoke-ErpApi -Method GET -Path '/api/admin/registrations/analytics?period=custom&start=2026-02-30&end=2026-03-01' -Token $AdminToken | ConvertTo-Json -Depth 10
```

Expected: **400**.

**7.7 — Reversed custom range.**

```powershell
Invoke-ErpApi -Method GET -Path '/api/admin/registrations/analytics?period=custom&start=2026-10-23&end=2026-10-22' -Token $AdminToken | ConvertTo-Json -Depth 10
```

Expected: **400**.

**7.8 — Overlong range.**

```powershell
Invoke-ErpApi -Method GET -Path '/api/admin/registrations/analytics?period=custom&start=2026-01-01&end=2026-12-31' -Token $AdminToken | ConvertTo-Json -Depth 10
```

Expected: **400**, maximum 180 inclusive days. Missing custom dates or `period=yearly` also return 400.

## 8. Verify PostgreSQL directly

These SQL blocks only read the manual test database.

**8.1 — Migrations.**

```powershell
@'
SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY migration_name;
'@ | docker exec -i zenex-erp-dev-postgres-1 psql -U zenex -d zenex_test_manual
```

Expected: both foundation and Admin-account migrations are applied.

**8.2 — Stored Admin fields, provider references and creators.**

```powershell
@'
SELECT u.id, u.username, u.email, u.role, u.state, u."cognitoSub",
       u."createdAt", u."updatedAt", creator.username AS created_by
FROM "ErpUser" u
LEFT JOIN "ErpUser" creator ON creator.id = u."createdById"
ORDER BY u."createdAt", u.id;
'@ | docker exec -i zenex-erp-dev-postgres-1 psql -U zenex -d zenex_test_manual
```

Expected: new manual Admin rows have the correct fields, role ADMIN, null Cognito subject, and creator `browser-admin`. Seeded fixtures have test-only subjects and no creator. Failed create requests added no accounts.

**8.3 — No credential-storage columns.**

```powershell
@'
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('ErpUser', 'Registration', 'CustomerRegistration', 'CompanyRegistration', 'PatientRegistration')
  AND column_name ~* '(password|secret|token|credential)';
'@ | docker exec -i zenex-erp-dev-postgres-1 psql -U zenex -d zenex_test_manual
```

Expected: **0 rows**. `cognitoSub` is an identity reference, not a password/token.

**8.4 — Actual registration status counts.**

```powershell
@'
SELECT kind, status, count(*) FROM "Registration" GROUP BY kind, status ORDER BY kind, status;
SELECT count(*) AS all_registrations FROM "Registration";
SELECT (SELECT count(*) FROM "CustomerRegistration") AS customers,
       (SELECT count(*) FROM "CompanyRegistration") AS companies,
       (SELECT count(*) FROM "PatientRegistration") AS patients;
'@ | docker exec -i zenex-erp-dev-postgres-1 psql -U zenex -d zenex_test_manual
```

Expected: four total registrations; profile tables 1/1/2; Customer pending 1, Company pending 1, Patient approved 1 and rejected 1. Compare with API summaries and charts. The idempotent replay did not add records.

**8.5 — Decision actors and audit trail.**

```powershell
@'
SELECT r.id, r.status, r."decidedAt", u.username AS decided_by, r."rejectionReason"
FROM "Registration" r LEFT JOIN "ErpUser" u ON u.id = r."decidedById"
ORDER BY r.id;
SELECT a.action, u.username AS actor, a."registrationId", a.detail
FROM "AuditEvent" a LEFT JOIN "ErpUser" u ON u.id = a."actorId"
ORDER BY a."createdAt", a.id;
'@ | docker exec -i zenex-erp-dev-postgres-1 psql -U zenex -d zenex_test_manual
```

Expected: approval attributed to `browser-officer`; rejection to `browser-admin`; account-creation and state-change events attributed to the Super Admin. No new decision audit event should exist for the failed overwrite request.

**8.6 — Database uniqueness constraints.**

```powershell
@'
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'ErpUser' ORDER BY indexname;
'@ | docker exec -i zenex-erp-dev-postgres-1 psql -U zenex -d zenex_test_manual
```

Expected: unique indexes for username/email, including `lower(username)` and `lower(email)` expressions.

## 9. Check both dashboards in the browser

Open **http://127.0.0.1:3200/login**. Use the test credentials from section 2.

1. Sign in as `browser-admin` in a normal window. Open `/super-admin/dashboard`: charts and totals should match section 7; date filters should work.
2. Open Users & Accounts: both manually created Admins should appear with correct Active/Inactive states and provisioning notices. Backend account creation has no password field, only the Admin creation role, and no functional reset-password action.
3. Open Customer, Company and Patient tabs: verify the four CLI-created records appear in their correct categories. View each record and its fields. The two Patients should show Approved and Rejected respectively.
4. Open Registrations: verify Patient counts 0/1/1 and the correct rejection reason/details. Approval progress must not claim that a master, login account or activation email was created.
5. In an Incognito window, sign in as `browser-officer`. Open `/admin/dashboard`, `/admin/approvals`, and the three category tabs. Compare with the Super Admin window.
6. Admin navigation must omit Users & Accounts. Enter `/super-admin/users` directly as Admin: access denied. `/admin/accounts` also redirects to access denied.
7. Refresh the two windows after any status change; both should display the same data.
8. To test the actual UI Approve/Reject buttons, use the still-pending Customer/Company records or submit fresh registrations with different contacts. This intentionally changes the counts from earlier sections; compare with fresh API/SQL results afterward.

The identity `browser-patient` may authenticate in the test harness but must not enter either administrative dashboard.

## 10. Check the Next server adapter and mutation Origin policy

These commands still run in Terminal C and target the isolated frontend explicitly. Browser cookies use the tokens captured in section 2.

**10.1 — List accounts through the frontend adapter as Super Admin.**

```powershell
$superCookieHeaders = @{ Cookie = "zenex_access_token=$SuperToken" }
Invoke-ErpApi -Method GET -BaseUrl 'http://127.0.0.1:3200' -Path '/api/super-admin/accounts' -Headers $superCookieHeaders | ConvertTo-Json -Depth 15
```

Expected: **200**, frontend role/status names and no provider subjects.

**10.2 — Deny Admin access through the same adapter.**

```powershell
Invoke-ErpApi -Method GET -BaseUrl 'http://127.0.0.1:3200' -Path '/api/super-admin/accounts' -Headers @{ Cookie = "zenex_access_token=$AdminToken" } | ConvertTo-Json -Depth 10
```

Expected: **403**.

**10.3 — Deny a cross-origin mutation even with a Super Admin cookie.**

```powershell
Invoke-ErpApi -Method POST -BaseUrl 'http://127.0.0.1:3200' -Path '/api/super-admin/accounts' -Headers @{ Cookie = "zenex_access_token=$SuperToken"; Origin = 'https://attacker.invalid' } -Body @{ action = 'status'; id = $NewAdminId; status = 'locked' } | ConvertTo-Json -Depth 10
```

Expected: **403**, no state change. Omitting Origin also returns 403.

**10.4 — Accept a same-origin authorized state change.**

```powershell
Invoke-ErpApi -Method POST -BaseUrl 'http://127.0.0.1:3200' -Path '/api/super-admin/accounts' -Headers @{ Cookie = "zenex_access_token=$SuperToken"; Origin = 'http://127.0.0.1:3200' } -Body @{ action = 'status'; id = $NewAdminId; status = 'locked' } | ConvertTo-Json -Depth 10
```

Expected: **200**, account INACTIVE. Repeat with `status = 'unlocked'`: 200 and ACTIVE. The newly created Admin still has no provisioned identity.

**10.5 — Deny Super Admin creation through the adapter.**

```powershell
Invoke-ErpApi -Method POST -BaseUrl 'http://127.0.0.1:3200' -Path '/api/super-admin/accounts' -Headers @{ Cookie = "zenex_access_token=$SuperToken"; Origin = 'http://127.0.0.1:3200' } -Body @{ action = 'create'; name = 'Not Allowed'; email = 'super.override@example.test'; role = 'super_admin'; initialStatus = 'active' } | ConvertTo-Json -Depth 10
```

Expected: **400**. Adding a `password` to a backend-mode creation payload or sending `action = 'reset'` also returns 400; those workflows are deferred.

## 11. Swagger/OpenAPI

Open **http://127.0.0.1:3201/api/docs**. The test harness enables Swagger. Use Authorize with the test Super Admin token from `$SuperToken` (paste the token itself, not a second `Bearer` prefix).

Verify the account and registration contracts, response codes, required fields, rejected credential/role overrides, summary/analytics queries, and decision requests. Repeat protected operations with the Admin token and verify account-management denial. The JSON specification is at `/api/docs-json`.

## 12. Repeat the automated checks individually

Stop Terminal B and Terminal A with Ctrl+C first. Run these commands **one at a time**, waiting for each to finish. Tests using ports 3200/3201 cannot run while the manual harness occupies those ports.

From the backend folder:

```powershell
npm run check
```

Expected: valid Prisma schema and no TypeScript errors.

```powershell
npm run build
```

Expected: successful backend compilation.

```powershell
npm test -- --runTestsByPath test/accounts.spec.ts
```

Expected: account HTTP authorization/input tests and UTC-range tests pass.

```powershell
npm test -- --runTestsByPath test/auth.spec.ts
```

Expected: Cognito verification contract and database-role authority tests pass using mocks.

```powershell
npm test -- --runTestsByPath test/registrations.spec.ts
```

Expected: submission validation and registration-service/HTTP tests pass.

```powershell
npm test -- --runTestsByPath test/documents.spec.ts
```

Expected: document validation/storage authorization tests pass.

```powershell
npm test -- --runTestsByPath test/throttle.spec.ts
```

Expected: rate-limit and OpenAPI contract tests pass.

Before database integration or browser automation, remove the manual database override from the terminal where you run them:

```powershell
Remove-Item Env:TEST_DATABASE_URL -ErrorAction SilentlyContinue
```

This makes the tests request their own disposable Testcontainers databases, rather than clearing the manual test data. Docker Desktop must be available.

```powershell
npm run test:integration -- --runTestsByPath test/integration/admin-management.spec.ts
```

Expected: account persistence, collision, role, shared-data, analytics and decision tests pass.

```powershell
npm run test:integration -- --runTestsByPath test/integration/registration-workflow.spec.ts
```

Expected: registration persistence, uploads and recovery workflows pass with mocked S3 transport.

```powershell
npm run test:e2e
```

Expected: the styled Chrome workflow passes. This launches its own frontend/backend. Do not run it concurrently with other heavy compiler/browser checks. If Docker test-container startup stalls, use a separate fresh `zenex_test_*` database via TEST_DATABASE_URL, not the manual session database you want to keep.

From the frontend folder:

```powershell
Set-Location 'D:\Personal Projects\MRPOB\frontend'
```

```powershell
npx tsc --noEmit --incremental false
```

```powershell
npm run lint
```

```powershell
npm run test:security
```

```powershell
npm run test:backend-adapter
```

```powershell
npm run test:backend-http
```

Expected: each succeeds. These checks do not prove that real AWS credentials, Cognito login or S3 downloads work.

## 13. Real-app checks after Cognito is operational

The isolated credentials/tokens above must not work against port 3001. Do not modify the real guards or database roles to make test identities work there.

You can check the real backend's liveness and unauthenticated boundary now:

```powershell
Invoke-ErpApi -Method GET -BaseUrl 'http://127.0.0.1:3001' -Path '/api/health/live' | ConvertTo-Json -Depth 10
```

Expected when the real backend is running: **200**.

```powershell
Invoke-ErpApi -Method GET -BaseUrl 'http://127.0.0.1:3001' -Path '/api/super-admin/accounts' | ConvertTo-Json -Depth 10
```

Expected: **401**.

```powershell
Invoke-ErpApi -Method GET -BaseUrl 'http://127.0.0.1:3001' -Path '/api/super-admin/accounts' -Token $SuperToken | ConvertTo-Json -Depth 10
```

Expected: **401** for the test-only token. This confirms that the fixture authentication is isolated from the real application.

Once real Cognito login works, repeat protected account/registration tests against port 3001 using **real access tokens**, not ID tokens, from verified ACTIVE ERP Super Admin and Admin identities. Use separate test contacts and records. Verify real password/MFA/expiry behavior, provider linkage for new Admins, S3 object uploads, actual document downloads and signed-URL expiry, AWS readiness and activation workflows when implemented. Those checks cannot be declared successful using this local harness.

## 14. Optional cleanup of this manual session

Stop both manual servers with Ctrl+C. This command deletes **only the manual test database and its fixtures**; do not substitute the application database name.

```powershell
docker exec zenex-erp-dev-postgres-1 dropdb -U zenex zenex_test_manual
```

Expected: exit code 0. The existing application database and PostgreSQL volume remain in place. A database-in-use error means a manual server or database client still needs to be closed.
