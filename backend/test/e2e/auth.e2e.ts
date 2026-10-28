import { test, expect } from '@playwright/test';

test('dashboard recovers after an analytics error by retrying or changing the date range', async ({ page }) => {
  let failRequests = true;
  await page.route('**/api/super-admin/analytics?*', async route => {
    if (failRequests) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary dashboard database failure' }) });
    } else {
      await route.continue();
    }
  });
  await page.goto('/login');
  await page.locator('[name="username"]').fill('browser-admin');
  await page.locator('[name="password"]').fill('BrowserPass123');
  await page.getByRole('button', { name: 'LOGIN', exact: true }).click();
  await expect(page).toHaveURL(/\/super-admin\/dashboard$/);
  await page.goto('/super-admin/dashboard');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Temporary dashboard database failure');
  failRequests = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Registration KPIs' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  failRequests = true;
  await page.getByRole('combobox').selectOption('weekly');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Temporary dashboard database failure');
  failRequests = false;
  await page.getByRole('combobox').selectOption('daily');
  await expect(page.getByRole('region', { name: 'Registration KPIs' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  await page.getByRole('combobox').selectOption('custom');
  await expect(page.getByRole('status')).toContainText('Choose a start and end date');
  await expect(page.getByText('Loading registration analytics…')).toHaveCount(0);
  await page.getByRole('combobox').selectOption('monthly');
  await expect(page.getByRole('region', { name: 'Registration KPIs' })).toBeVisible();
  await page.screenshot({ path: '.local/sequential-tests/dashboard-recovered.png', fullPage: true });
});

test('MFA sessions stay private and legacy cookies and cross-origin mutations are rejected', async ({ page, context }) => {
  await page.goto('/login');
  await page.locator('[name="username"]').fill('browser-mfa');
  await page.locator('[name="password"]').fill('BrowserPass123');
  const loginResponse = page.waitForResponse(r => r.url().endsWith('/api/auth/login'));
  await page.getByRole('button', { name: 'LOGIN', exact: true }).click();
  const body = await (await loginResponse).json();
  expect(body.requiresMfa).toBe(true);
  expect(body.session).toBeUndefined();
  expect(body.accessToken).toBeUndefined();
  const pending = (await context.cookies()).find(cookie => cookie.name === 'zenex_backend_challenge');
  expect(pending?.httpOnly).toBe(true);
  expect(pending?.value).not.toContain('mfa-session');
  expect((await page.request.get('/api/auth/me')).status()).toBe(401);
  await page.getByLabel('Authenticator code').fill('000000');
  await page.getByRole('button', { name: 'VERIFY CODE', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Invalid or expired authentication challenge' })).toBeVisible();
  await page.getByLabel('Authenticator code').fill('123456');
  await page.getByRole('button', { name: 'VERIFY CODE', exact: true }).click();
  await expect(page).toHaveURL(/\/super-admin\/dashboard$/);
  expect((await context.cookies()).find(cookie => cookie.name === 'zenex_backend_access')?.httpOnly).toBe(true);
  const rejected = await page.request.post('/api/auth/logout', { headers: { Origin: 'https://untrusted.example' } });
  expect(rejected.status()).toBe(403);
  expect((await page.request.get('/api/auth/me')).status()).toBe(200);
  expect((await page.request.post('/api/auth/logout', { headers: { Origin: 'http://127.0.0.1:3200' } })).status()).toBe(200);
  await context.addCookies([{ name: 'zenex_session', value: 'legacy-session', url: 'http://127.0.0.1:3200' }]);
  expect((await page.request.get('/api/auth/me')).status()).toBe(401);
  expect((await page.request.get('/api/super-admin/approvals')).status()).toBe(401);
  await page.goto('/super-admin/dashboard');
  await expect(page).toHaveURL(/\/login$/);
});

test('first-login authenticator enrollment completes through the existing login form', async ({ page }) => {
  await page.goto('/login');
  await page.locator('[name="username"]').fill('browser-setup');
  await page.locator('[name="password"]').fill('BrowserPass123');
  await page.getByRole('button', { name: 'LOGIN', exact: true }).click();
  await expect(page.getByText('JBSWY3DPEHPK3PXP', { exact: true })).toBeVisible();
  await page.getByLabel('Authenticator code').fill('123456');
  await page.getByRole('button', { name: 'VERIFY CODE', exact: true }).click();
  await expect(page).toHaveURL(/\/super-admin\/dashboard$/);
  const unsupported = await page.request.post('/api/customer-activation/request-otp', { headers: { Origin: 'http://127.0.0.1:3200' }, data: {} });
  expect(unsupported.status()).toBe(501);
});
