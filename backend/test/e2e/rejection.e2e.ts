import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { customerInput, companyInput, patientInput } from '../fixtures/registration-inputs';

for (const [index, actor, dashboard] of [[0, 'browser-admin', 'super-admin'], [1, 'browser-officer', 'admin']] as const) {
  test(`${dashboard} rejects all three registration types with reviewed reasons`, async ({ page }) => {
    test.setTimeout(360_000);
    page.setDefaultNavigationTimeout(90_000);
    const png = await sharp({ create: { width: 3, height: 3, channels: 3, background: '#1451ab' } }).png().toBuffer();
    await page.goto('/login');
    await page.locator('[name="username"]').fill(actor);
    await page.locator('[name="password"]').fill('BrowserPass123');
    await page.getByRole('button', { name: 'LOGIN', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${dashboard}/dashboard$`), { timeout: 90_000 });
    for (const [kindIndex, kind] of (['customer', 'company', 'patient'] as const).entries()) {
      const mobile = `98765433${index}${kindIndex}`;
      const email = `rejection-${index}-${kind}@example.test`;
      const fields = kind === 'customer' ? customerInput({ mobile, email, gstNumber: `REJECT-GST-${index}` }) : kind === 'patient' ? patientInput({ mobile, email }) : companyInput({ adminMobile: mobile, adminEmail: email });
      const multipart: Record<string, any> = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, String(value)]));
      const slots = kind === 'customer' ? ['dl1', 'dl2', 'gstCertificate', 'shopOutside', 'shopInside'] : kind === 'company' ? ['companyLogo', 'adminPhoto'] : [];
      for (const slot of slots) multipart[slot] = { name: 'proof.png', mimeType: 'image/png', buffer: png };
      const submission = await page.request.post(`/api/register/${kind}`, { headers: { Origin: 'http://127.0.0.1:3200' }, multipart });
      expect(submission.status()).toBe(201);
      const { registrationId } = await submission.json();
      await page.goto(`/${dashboard}/approvals/${kind}/${registrationId}`);
      await page.getByRole('button', { name: 'Reject', exact: true }).click();
      const dialog = page.getByRole('dialog');
      const confirm = dialog.getByRole('button', { name: 'Reject Registration', exact: true });
      await expect(confirm).toBeDisabled();
      let reason = 'Submitted information is incomplete.';
      if (kind === 'company') {
        await dialog.getByLabel('Rejection reason', { exact: true }).selectOption('OTHER');
        reason = 'Please upload a clearer company logo.';
        await dialog.getByLabel('Custom correction instructions (8–500 characters)').fill(reason);
        await expect(confirm).toBeDisabled();
        await dialog.getByRole('checkbox').check();
      } else {
        if (kind === 'patient') await expect(dialog.locator('option[value="MISSING_DOCUMENTS"]')).toHaveCount(0);
        await dialog.getByLabel('Rejection reason', { exact: true }).selectOption('INCOMPLETE_INFORMATION');
      }
      await expect(dialog.locator('p').filter({ hasText: reason })).toBeVisible();
      const response = page.waitForResponse(item => item.url().endsWith(`/api/admin/registrations/${registrationId}`) && item.request().method() === 'POST');
      await page.screenshot({ path: `.local/rejection-tests/${dashboard}-${kind}-dialog.png`, fullPage: true });
      await confirm.click();
      expect((await response).status()).toBe(201);
      await expect(page.getByRole('status')).toContainText('Registration rejected. Message Pending.');
      await expect(page.getByText(reason, { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Reject', exact: true })).toHaveCount(0);
      await page.reload();
      await expect(page.getByText(reason, { exact: true })).toBeVisible();
      await expect(page.getByText('Message Pending', { exact: true })).toBeVisible();
      await page.screenshot({ path: `.local/rejection-tests/${dashboard}-${kind}.png`, fullPage: true });
    }
  });
}
