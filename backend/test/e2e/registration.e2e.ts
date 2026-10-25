import { test, expect } from '@playwright/test';
import sharp from 'sharp';

test('all registration forms persist through the frontend adapter and appear in the correct administrator tabs', async ({page, context, request}) => {
  test.setTimeout(360_000);
  const png = await sharp({create: {width: 3, height: 3, channels: 3, background: '#1451ab'}}).png().toBuffer();
  const common = {password: 'RegistrationPass123', confirmPassword: 'RegistrationPass123'};
  const forms: {kind: string; name: string; fields: Record<string, string>; selects: Record<string, string>; files: string[]}[] = [
    {kind: 'customer', name: 'Browser Owner', fields: {customerName: 'Browser Owner', mobile: '9876543201', businessName: 'Browser Pharmacy', addressLine1: '123 Browser Road', pinCode: '560001', dlNumber1: 'BROWSER-DL1', dlNumber2: 'BROWSER-DL2', gstNumber: 'BROWSER-GST-001'}, selects: {customerType: 'Retail Pharmacy', creditDays: 'week_2', paymentMethod: 'UPI'}, files: ['dl1', 'dl2', 'gstCertificate', 'shopOutside', 'shopInside']},
    {kind: 'company', name: 'Browser Company', fields: {...common, companyName: 'Browser Company', division: 'Medical', headquarter: 'Bengaluru', adminFullName: 'Browser Company Administrator', adminEmail: 'browser-company@example.test', adminMobile: '9876543202'}, selects: {}, files: ['companyLogo', 'adminPhoto']},
    {kind: 'patient', name: 'Browser Patient', fields: {patientName: 'Browser Patient', mobile: '9876543203', address: '123 Patient Browser Road'}, selects: {gender: 'Female', paymentMethod: 'UPI'}, files: ['idProof']},
  ];
  const registrations: {kind: string; name: string; id: string}[] = [];
  for (const form of forms) {
    await page.goto(`/register/${form.kind}`);
    for (const [field, value] of Object.entries(form.fields)) await page.locator(`[name="${field}"]`).fill(value);
    for (const [field, value] of Object.entries(form.selects)) await page.locator(`[name="${field}"]`).selectOption(value);
    for (const field of form.files) await page.locator(`[name="${field}"]`).setInputFiles({name: 'browser-document.png', mimeType: 'image/png', buffer: png});
    await page.getByRole('link', {name: 'Terms & Conditions *', exact: true}).click();
    // Acceptance closes/unmounts this dialog, so click rather than waiting for a
    // checked state on an input that intentionally disappears.
    await page.getByRole('checkbox', {name: 'I Agree *', exact: true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const responsePromise = page.waitForResponse(response => response.url().endsWith(`/api/register/${form.kind}`) && response.request().method() === 'POST');
    await page.getByRole('button', {name: 'Submit', exact: true}).click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    const result = await response.json();
    registrations.push({kind: form.kind, name: form.name, id: result.registrationId});
    await expect(page).toHaveURL(new RegExp(`/register/success\\?type=${form.kind}`));
    await expect(page.getByText(/^pending verification$/i)).toBeVisible();
  }
  await page.goto('/login');
  await page.locator('[name="username"]').fill('browser-admin');
  await page.locator('[name="password"]').fill('BrowserPass123');
  await page.getByRole('button', {name: 'LOGIN', exact: true}).click();
  await expect(page).toHaveURL(/\/super-admin\/dashboard$/);
  await page.goto('/super-admin/approvals');
  const cookies = await context.cookies();
  expect(cookies.find(cookie => cookie.name === 'zenex_backend_access')?.httpOnly).toBe(true);
  for (const registration of registrations) {
    const label = registration.kind[0].toUpperCase() + registration.kind.slice(1);
    await page.getByRole('tab', {name: label, exact: true}).click();
    const row = page.getByRole('row').filter({hasText: registration.id});
    await expect(row).toContainText(registration.name);
    await expect(row).toContainText('Pending Verification');
    const totals = page.getByRole('region', {name: 'Registration status totals'});
    await expect(totals.getByText('Pending', {exact: true}).locator('..')).toHaveText(/Pending\s*1/);
    await expect(totals.getByText('Approved', {exact: true}).locator('..')).toHaveText(/Approved\s*0/);
    await expect(totals.getByText('Rejected', {exact: true}).locator('..')).toHaveText(/Rejected\s*0/);
    await row.getByRole('link', {name: 'View', exact: true}).click();
    await expect(page.getByRole('heading', {name: 'Registration Details', exact: true})).toBeVisible();
    await expect(page.getByRole('definition').filter({hasText: new RegExp(`^${registration.name}$`)})).toBeVisible();
    await expect(page.getByRole('button', {name: 'Approve Registration', exact: true})).toBeVisible();
    await expect(page.getByRole('button', {name: 'Reject', exact: true})).toBeVisible();
    await page.goto('/super-admin/approvals');
  }
  await page.goto('/super-admin/dashboard');
  await expect(page.getByText('Total Registrations', {exact: true}).locator('..')).toContainText('3');
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  const accountListResponse = page.waitForResponse(response => response.url().endsWith('/api/super-admin/accounts') && response.request().method() === 'GET', {timeout: 180_000});
  await page.goto('/super-admin/users');
  expect((await accountListResponse).status()).toBe(200);
  await expect(page.locator('[name="password"]')).toBeVisible();
  await page.locator('[name="password"]').fill('InitialPass123!');
  await page.locator('[name="name"]').fill('Created Browser Admin');
  await page.locator('[name="email"]').fill('created-browser-admin@example.test');
  const accountCreateResponse = page.waitForResponse(response => response.url().endsWith('/api/super-admin/accounts') && response.request().method() === 'POST', {timeout: 180_000});
  await page.getByRole('button', {name: 'Create Account', exact: true}).click();
  expect((await accountCreateResponse).status()).toBe(201);
  await expect(page.getByRole('status')).toContainText('login credentials created successfully');
  await expect(page.getByRole('row').filter({hasText: 'created-browser-admin@example.test'})).toContainText('Active');
  const logoutResponse = page.waitForResponse(response => response.url().endsWith('/api/auth/logout') && response.request().method() === 'POST', {timeout: 180_000});
  await page.getByRole('button', {name: 'Logout', exact: true}).click();
  expect((await logoutResponse).ok()).toBe(true);
  await page.goto('/login');
  await page.locator('[name="username"]').fill('created-browser-admin@example.test');
  await page.locator('[name="password"]').fill('InitialPass123!');
  await page.getByRole('button', {name: 'LOGIN', exact: true}).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await expect(page.getByRole('link', {name: 'Users & Accounts', exact: true})).toHaveCount(0);
  await page.goto('/admin/dashboard');
  await expect(page.getByText('Total Registrations', {exact: true})).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  await page.goto('/admin/approvals');
  await page.getByRole('tab', {name: 'Patient', exact: true}).click();
  const patientRow = page.getByRole('row').filter({hasText: 'Browser Patient'});
  await expect(patientRow).toContainText('Pending');
  await patientRow.getByRole('link', {name: 'View', exact: true}).click();
  await page.getByRole('button', {name: 'Approve Registration', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Account activation and master creation remain pending');
  const decisionResponse = page.waitForResponse(response => response.url().includes('/api/admin/registrations/') && response.request().method() === 'POST', {timeout: 180_000});
  await dialog.getByRole('button', {name: 'Approve Registration', exact: true}).click();
  expect((await decisionResponse).status()).toBe(201);
  await expect(page.getByRole('status')).toContainText('Registration approved');
  await page.goto('/admin/approvals');
  await page.getByRole('tab', {name: 'Patient', exact: true}).click();
  await expect(page.getByRole('row').filter({hasText: 'Browser Patient'})).toContainText('Approved');
  await page.goto('/admin/registrations/patient');
  await page.getByRole('row').filter({hasText: 'Browser Patient'}).getByRole('link', {name: 'View', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Registration Details', exact: true})).toBeVisible();
  await expect(page.getByText('Registration approved. Master creation and account activation are pending.', {exact: true})).toBeVisible();
  const forbidden = await page.request.post('/api/super-admin/accounts', {headers: {Origin: 'http://127.0.0.1:3200'}, data: {action: 'create', name: 'Unauthorized Admin', email: 'forbidden@example.test', role: 'admin', initialStatus: 'active', password: 'InitialPass123!'}});
  expect(forbidden.status()).toBe(403);
  await page.goto('/super-admin/users');
  await expect(page).toHaveURL(/\/access-denied$/);
  const unauthorized = await request.get('http://127.0.0.1:3201/api/admin/registrations?kind=customer');
  expect(unauthorized.status()).toBe(401);
});
