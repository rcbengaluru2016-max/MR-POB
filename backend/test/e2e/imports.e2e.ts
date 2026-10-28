import { test, expect } from '@playwright/test';
import ExcelJS from 'exceljs';
import { documentZip } from '../fixtures/import-zip';
import { customerInput, companyInput } from '../fixtures/registration-inputs';

test('Admin imports a workbook, sees approved accounts, downloads safe results and deletes only history', async ({ page }) => {
  test.setTimeout(360000);
  await page.goto('/login');
  await page.locator('[name="username"]').fill('browser-officer');
  await page.locator('[name="password"]:visible').fill('BrowserPass123');
  await page.getByRole('button', { name: 'LOGIN', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await page.goto('/admin/registration-imports');
  await page.getByLabel('Registration category').selectOption('patient');
  await expect(page.getByRole('button', { name: 'Confirm Import', exact: true })).toBeDisabled();
  const template = await page.request.get('/api/super-admin/registration-imports/bulk?kind=patient');
  expect(template.status()).toBe(200);
  const book = new ExcelJS.Workbook(); await book.xlsx.load(await template.body() as unknown as Parameters<typeof book.xlsx.load>[0]);
  const sheet = book.getWorksheet('Registrations')!;
  const values: Record<string, string> = { masterCode: 'ZI00900001', patientName: 'Browser Imported Patient', mobile: '9876543288', email: 'browser-import@example.test', address: '123 Import Browser Address', gender: 'Female', paymentMethod: 'UPI', termsAccepted: 'true' };
  const headers = (sheet.getRow(1).values as string[]).slice(1);
  sheet.addRow(headers.map(key => values[key] ?? ''));
  await expect(page.getByLabel('Completed Excel File')).toHaveAttribute('accept','.xlsx,.csv');
  await expect(page.getByLabel('Supporting Documents (ZIP)')).toHaveAttribute('accept','.zip');
  await page.getByLabel('Completed Excel File').setInputFiles({ name: 'browser-import.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await book.xlsx.writeBuffer()) });
  await expect(page.getByRole('button',{name:'Upload Excel File & Validate',exact:true})).toBeDisabled();
  await page.getByLabel('Supporting Documents (ZIP)').setInputFiles({ name:'patient-documents.zip',mimeType:'application/zip',buffer:await documentZip() });
  const validation = page.waitForResponse(r => r.url().endsWith('/registration-imports/bulk') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Upload Excel File & Validate', exact: true }).click();
  const preview = await (await validation).json(); expect(preview.ready).toBe(true);
  await expect(page.getByRole('row').filter({ hasText: 'Browser Imported Patient' })).toContainText('Ready');
  await expect(page.getByRole('button', { name: 'Confirm Import', exact: true })).toBeEnabled();
  page.once('dialog', dialog => dialog.accept());
  const confirmed = page.waitForResponse(r => r.url().endsWith(`/${preview.id}/confirm`));
  await page.getByRole('button', { name: 'Confirm Import', exact: true }).click();
  expect((await confirmed).status()).toBe(201);
  await expect(page.getByRole('status')).toContainText('1 imported');
  const accounts = await page.request.get('/api/super-admin/registrations?kind=patient');
  expect(accounts.ok()).toBe(true);
  expect(JSON.stringify(await accounts.json())).toContain('Browser Imported Patient');
  await page.goto('/admin/registration-imports/uploads');
  const history = page.getByRole('row').filter({ hasText: 'browser-import.xlsx' });
  await expect(history).toContainText('patient-documents.zip');
  await expect(history).toContainText('COMPLETED'); await expect(history).toContainText('100%');
  const downloadPromise = page.waitForEvent('download'); await history.getByRole('link', { name: 'Download', exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toContain('sanitised');
  page.once('dialog', dialog => dialog.accept()); await history.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(history).toHaveCount(0);
  const retained = await page.request.get('/api/super-admin/registrations?kind=patient');
  expect(JSON.stringify(await retained.json())).toContain('Browser Imported Patient');
});

test('Super Admin single upload uses the existing patient form and confirms automatic approval', async ({ page }) => {
  test.setTimeout(300000);
  await page.goto('/login'); await page.locator('[name="username"]').fill('browser-admin');
  await page.locator('[name="password"]:visible').fill('BrowserPass123'); await page.getByRole('button', { name: 'LOGIN', exact: true }).click();
  await expect(page).toHaveURL(/\/super-admin\/dashboard$/);
  await page.goto('/super-admin/registration-imports/single');
  await page.getByLabel('Registration category').selectOption('patient');
  await page.getByPlaceholder('Original Master Code, e.g. C01234').fill('ZI00900002');
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create(); pdf.addPage(); const pdfBytes = Buffer.from(await pdf.save());
  await page.locator('[name="idProof"]').setInputFiles({ name: 'proof.pdf', mimeType: 'application/pdf', buffer: pdfBytes });
  await page.locator('[name="patientName"]').fill('Browser Single Import');
  await page.locator('[name="mobile"]').fill('9876543289'); await page.locator('[name="address"]').fill('123 Single Import Address');
  await page.locator('[name="paymentMethod"]').selectOption('UPI');
  await page.getByRole('link', { name: 'Terms & Conditions *', exact: true }).click();
  await page.getByRole('checkbox', { name: 'I Agree *', exact: true }).click();
  const created = page.waitForResponse(r => r.url().endsWith('/api/super-admin/registrations/single') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  const createdResponse = await created; expect(createdResponse.status()).toBe(201);
  const result = await createdResponse.json(); expect(result.masterCode).toBe('ZI00900002');
  await expect(page.getByRole('status')).toContainText('approved and added to accounts');
  await page.route('https://private-s3.example.test/**', route => route.fulfill({ status: 200, contentType: 'application/pdf', body: pdfBytes }));
  await page.goto(`/super-admin/registrations/patient/${result.registrationId}`);
  await page.getByRole('button', { name: 'Show inline preview', exact: true }).click();
  await expect(page.getByTitle('PDF preview: proof.pdf')).toBeVisible();
});

test('Company Single Upload preserves Master Code and exposes complete details with inline images', async ({ page }) => {
  test.setTimeout(300000);
  const sharp = (await import('sharp')).default;
  const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } }).png().toBuffer();
  await page.goto('/login');
  await page.locator('[name="username"]').fill('browser-admin');
  await page.locator('[name="password"]:visible').fill('BrowserPass123');
  await page.getByRole('button', { name: 'LOGIN', exact: true }).click();
  await expect(page).toHaveURL(/\/super-admin\/dashboard$/);
  await page.goto('/super-admin/registration-imports/single');
  await page.getByLabel('Registration category').selectOption('company');
  await page.getByPlaceholder('Original Master Code, e.g. C01234').fill('ZI00900003');
  for (const [key, value] of Object.entries({ companyName: 'Browser Import Company', division: 'Test Division', headquarter: 'Test City', adminFullName: 'Import Company Admin', adminEmail: 'browser-company-import@example.test', adminMobile: '9876543290', password: 'Registration123', confirmPassword: 'Registration123' })) await page.locator(`[name="${key}"]`).fill(value);
  for (const key of ['companyLogo', 'adminPhoto']) await page.locator(`[name="${key}"]`).setInputFiles({ name: `${key}.png`, mimeType: 'image/png', buffer: image });
  await page.getByRole('link', { name: 'Terms & Conditions *', exact: true }).click();
  await page.getByRole('checkbox', { name: 'I Agree *', exact: true }).click();
  const submitted = page.waitForResponse(r => r.url().endsWith('/api/super-admin/registrations/single') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  const response = await submitted;
  expect(response.status()).toBe(201);
  const result = await response.json();
  expect(result.masterCode).toBe('ZI00900003');
  await page.route('https://private-s3.example.test/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: image }));
  await page.goto(`/super-admin/registrations/company/${result.registrationId}`);
  await expect(page.getByText('Single Import', { exact: true })).toBeVisible();
  await expect(page.getByText('Browser Import Company', { exact: true }).first()).toBeVisible();
  await page.locator('div.rounded-xl').filter({ has: page.getByRole('link', { name: 'Download companyLogo.png', exact: true }) }).last().getByRole('button', { name: 'Show inline preview', exact: true }).click();
  await expect(page.locator('img[alt="companyLogo.png"]')).toBeVisible();
});

for (const kind of ['customer','company'] as const) {
  test(`${kind} bulk import matches two spreadsheet rows to ZIP documents and approved details`, async ({ page }) => {
    test.setTimeout(360000);
    const role = kind === 'customer' ? 'admin' : 'super-admin';
    await page.goto('/login');
    await page.locator('[name="username"]').fill(kind === 'customer' ? 'browser-officer' : 'browser-admin');
    await page.locator('[name="password"]:visible').fill('BrowserPass123');
    await page.getByRole('button',{name:'LOGIN',exact:true}).click();
    await expect(page).toHaveURL(new RegExp(`/${role}/dashboard$`));
    await page.goto(`/${role}/registration-imports`);
    await page.getByLabel('Registration category').selectOption(kind);
    await expect(page.getByLabel('Supporting Documents (ZIP)')).toBeVisible();
    const response = await page.request.get(`/api/super-admin/registration-imports/bulk?kind=${kind}`);
    expect(response.ok()).toBe(true);
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await response.body() as never);
    const sheet = book.getWorksheet('Registrations')!;
    const headers = (sheet.getRow(1).values as string[]).slice(1);
    const slots = headers.filter(key=>key.endsWith('File'));
    const sharp = (await import('sharp')).default;
    const image = await sharp({create:{width:2,height:2,channels:3,background:'blue'}}).png().toBuffer();
    const entries: Record<string,Buffer> = {};
    const rows: Record<string,unknown>[] = [];
    for (let index=1;index<=2;index++) {
      const masterCode = index === 1 ? `${kind === 'customer' ? 'C' : 'CO'}01234` : '';
      const values = kind === 'customer' ? customerInput({customerName:`ZIP Customer ${index}`,businessName:`ZIP Pharmacy ${index}`,email:`browser-zip-customer-${index}@example.test`,mobile:`98765437${index}1`,gstNumber:`BROWSER-ZIP-GST-${index}`}) : companyInput({companyName:`ZIP Company ${index}`,adminEmail:`browser-zip-company-${index}@example.test`,adminMobile:`98765438${index}1`});
      const row:Record<string,unknown> = {...values,masterCode};
      for (const slot of slots) { const name=`row-${index}_${slot}.png`;row[slot]=name;entries[`documents/row-${index}/${name}`]=image; }
      rows.push(row); const added = sheet.addRow(headers.map(key=>row[key]??''));
      if(kind === 'customer') added.getCell(headers.indexOf('email')+1).value={text:String(row.email),hyperlink:`mailto:${row.email}`};
    }
    const csv = kind === 'company';
    const bytes = csv ? Buffer.from([headers.join(','),...rows.map(row=>headers.map(key=>`"${String(row[key]??'').replaceAll('"','""')}"`).join(','))].join('\r\n')) : Buffer.from(await book.xlsx.writeBuffer());
    await page.getByLabel('Completed Excel File').setInputFiles({name:`${kind}-zip-import.${csv?'csv':'xlsx'}`,mimeType:csv?'text/csv':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bytes});
    await page.getByLabel('Supporting Documents (ZIP)').setInputFiles({name:`${kind}-documents.zip`,mimeType:'application/zip',buffer:await documentZip(Object.fromEntries(Object.entries(entries).reverse()))});
    const validation = page.waitForResponse(response=>response.url().endsWith('/registration-imports/bulk')&&response.request().method()==='POST');
    await page.getByRole('button',{name:'Upload Excel File & Validate',exact:true}).click();
    const result = await (await validation).json();
    expect(result.ready).toBe(true);expect(result.counts.valid).toBe(2);
    expect(result.rows[0].masterCode).toBe(rows[0].masterCode);
    expect(result.rows[1].masterCode).toMatch(/^ZI[0-9]{4,}$/);
    rows[1].masterCode = result.rows[1].masterCode;
    for(const row of rows) await expect(page.getByRole('row').filter({hasText:String(row.masterCode)})).toContainText('Validated');
    page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'Confirm Import',exact:true}).click();
    await expect(page.getByRole('status')).toContainText('2 imported');
    const approved = await page.request.get(`/api/super-admin/registrations?kind=${kind}`);
    const accounts = (await approved.json()).items;
    for(const row of rows) {
      const account = accounts.find((account:{masterCode:string})=>account.masterCode===row.masterCode);
      expect(account).toBeTruthy();
      const details = await page.request.get(`/api/super-admin/registrations/${account.id}`);
      const registration = (await details.json()).registration;
      expect(registration.registrationSource).toBe('Bulk Import');
      for(const slot of slots) expect(registration.files[slot.slice(0,-4)].name).toBe(row[slot]);
    }
    await page.goto(`/${role}/registration-imports/uploads`);
    await expect(page.getByRole('row').filter({hasText:`${kind}-zip-import.`})).toContainText(`${kind}-documents.zip`);
  });
}

for (const role of [{ username: 'browser-officer', base: '/admin' }, { username: 'browser-admin', base: '/super-admin' }]) {
  test(`${role.base} redirects to dashboard without instant validation errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/login');
    await page.locator('[name="username"]').fill(role.username);
    await page.locator('[name="password"]:visible').fill('BrowserPass123');
    await page.getByRole('button', { name: 'LOGIN', exact: true }).click();
    await expect(page).toHaveURL(`${role.base}/dashboard`);
    await page.goto(role.base);
    await expect(page).toHaveURL(`${role.base}/dashboard`);
    await expect(page.getByRole('region', { name: 'Registration KPIs' })).toBeVisible();
    expect(errors.filter(error => /Could not validate|NEXT_REDIRECT/.test(error))).toEqual([]);
  });
}

test('invalid imports and completed history do not keep polling', async ({ page }) => {
  await page.goto('/login');
  await page.locator('[name="username"]').fill('browser-officer');
  await page.locator('[name="password"]:visible').fill('BrowserPass123');
  await page.getByRole('button', { name: 'LOGIN', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  let progressRequests = 0;
  let historyRequests = 0;
  await page.route('**/registration-imports/rejected-job/progress', route => {
    progressRequests++;
    return route.fulfill({ json: { status: 'VALIDATION_FAILED', progress: 0 } });
  });
  await page.route('**/registration-imports/bulk', route => route.fulfill({ json: {
    id: 'rejected-job', ready: false, rows: [{ rowNumber: 2, masterCode: 'C01234', name: 'Invalid Fixture', category: 'customer', documentStatus: 'Invalid', valid: false, duplicate: false, errors: ['Invalid or missing mobile'] }],
    counts: { total: 1, valid: 0, failed: 1, duplicates: 0, extractedDocuments: 0, readyDocuments: 0, documentFailures: 0 },
  } }));
  await page.goto('/admin/registration-imports');
  const book = new ExcelJS.Workbook(); book.addWorksheet('Registrations').addRow(['masterCode']);
  await page.getByLabel('Completed Excel File').setInputFiles({ name: 'invalid.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await book.xlsx.writeBuffer()) });
  await page.getByLabel('Supporting Documents (ZIP)').setInputFiles({ name: 'empty.zip', mimeType: 'application/zip', buffer: await documentZip() });
  await page.getByRole('button', { name: 'Upload Excel File & Validate', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('1 invalid');
  await expect(page.getByRole('button', { name: 'Confirm Import', exact: true })).toBeDisabled();
  await page.clock.install(); await page.clock.runFor(65000);
  expect(progressRequests).toBe(0);
  await page.route('**/registration-imports/uploads?*', route => {
    historyRequests++;
    return route.fulfill({ json: { items: [], total: 0 } });
  });
  await page.goto('/admin/registration-imports/uploads');
  await expect(page.getByText('No uploaded workbooks yet.')).toBeVisible();
  // Development Strict Mode may start and abort an initial effect twice.
  const initialHistoryRequests = historyRequests;
  await page.clock.runFor(65000); expect(historyRequests).toBe(initialHistoryRequests);
  await page.getByRole('button', { name: 'Refresh uploads', exact: true }).click();
  await expect.poll(() => historyRequests).toBeGreaterThan(initialHistoryRequests);
});
