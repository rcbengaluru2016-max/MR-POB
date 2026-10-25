import { test, expect } from '@playwright/test';

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
