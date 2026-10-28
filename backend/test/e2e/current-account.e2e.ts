import { test, expect } from '@playwright/test';

test('initials navigation, backend profile, fresh MFA, password update and forced sign-in', async ({ page, context }) => {
  await page.goto('/login');
  await page.locator('[name="username"]').fill('browser-password');
  await page.locator('[name="password"]').fill('BrowserCurrent123!');
  await page.getByRole('button', { name: 'LOGIN', exact: true }).click();
  await page.getByLabel('Authenticator code').fill('123456');
  await page.getByRole('button', { name: 'VERIFY CODE', exact: true }).click();
  await expect(page).toHaveURL(/\/super-admin\/dashboard$/);
  await page.getByRole('link', { name: /account information/i }).click();
  await expect(page).toHaveURL(/\/super-admin\/account$/);
  await expect(page.getByRole('heading', { name: 'Password Test Administrator' })).toBeVisible();
  await expect(page.getByText('MFA Verified', { exact: true })).toBeVisible();
  await expect(page.getByText('Authenticator verification is enabled for Super Admin sign-in. Your security credentials are never displayed here.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Change Password', exact: true }).click();
  await page.getByLabel('Current password', { exact: true }).fill('BrowserCurrent123!');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Authenticator code').fill('000000');
  await page.getByRole('button', { name: 'Verify and continue', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Invalid or expired MFA challenge');
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
  await page.getByLabel('Authenticator code').fill('123456');
  await page.getByRole('button', { name: 'Verify and continue', exact: true }).click();
  await page.getByLabel('New password', { exact: true }).fill('BrowserReplacement456!');
  await page.getByLabel('Confirm new password', { exact: true }).fill('DoesNotMatch456!');
  await page.getByRole('button', { name: 'Update Password', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Passwords do not match');
  await page.getByLabel('Confirm new password', { exact: true }).fill('BrowserReplacement456!');
  await page.getByRole('button', { name: 'Update Password', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Your password has been changed successfully. Please sign in again using your new password.');
  expect((await context.cookies()).find(cookie => cookie.name === 'zenex_backend_access')).toBeUndefined();
  await expect(page).toHaveURL(/\/login$/);
});

test('MFA badge and password action disappear when backend reports setup required', async ({ page }) => {
  await page.context().addCookies([{ name: 'zenex_backend_access', value: 'browser-admin-sub', url: 'http://127.0.0.1:3200' }]);
  await page.goto('/super-admin/account');
  await expect(page.getByText('Authenticator setup or recovery is required.', { exact: true })).toBeVisible();
  await expect(page.getByText('MFA Verified', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Change Password', exact: true })).toHaveCount(0);
});
