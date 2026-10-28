import 'reflect-metadata';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ErpUser } from '@prisma/client';
import request from 'supertest';
import ExcelJS from 'exceljs';
import sharp from 'sharp';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { PrismaService } from '../../src/database/prisma.service';
import { AuthService } from '../../src/auth/auth.service';
import { S3StorageService } from '../../src/documents/s3-storage.service';
import { ImportsService } from '../../src/imports/imports.service';
import { columns } from '../../src/imports/import-schema';
import { template, XLSX_TYPE } from '../../src/imports/import-workbook';
import { patientInput, companyInput, customerInput } from '../fixtures/registration-inputs';
import { documentZip } from '../fixtures/import-zip';
import { startTestDatabase } from './database';

class MemoryStorage {
  objects = new Map<string, Buffer>();
  fail = false;
  async put(key: string, bytes: Buffer) { this.objects.set(key, Buffer.from(bytes)); if (this.fail) throw new Error('S3 outage'); return { versionId: 'test-version' }; }
  async remove(key: string) { this.objects.delete(key); }
  async signedDownload() { return 'https://private-s3.example.test/?expires=60'; }
}
describe('Administrative imports: real PostgreSQL, mocked S3 and Cognito transport', () => {
  let app: INestApplication, prisma: PrismaService;
  let db: Awaited<ReturnType<typeof startTestDatabase>>;
  let admin: ErpUser, superAdmin: ErpUser, ordinary: ErpUser;
  let image: Buffer;
  const storage = new MemoryStorage();
  let serial = 0, codeSerial = 700000;
  const patient = () => { const { password: _p, confirmPassword: _c, ...values } = patientInput({ mobile: String(9100000000 + ++serial), email: `import-${serial}@example.test` }); return values; };
  const workbook = async (kind: 'customer' | 'company' | 'patient', values: Record<string, unknown>[], embedded = false, attachmentBytes?: Buffer, emailAutoLink = false) => {
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await template(kind) as unknown as Parameters<typeof book.xlsx.load>[0]);
    for (const [index, row] of values.entries()) {
      book.getWorksheet('Registrations')!.addRow(columns(kind).map(key => key === 'masterCode' ? row.masterCode ?? `ZI${++codeSerial}` : row[key] ?? ''));
      if (emailAutoLink) { const emailField = kind === 'company' ? 'adminEmail' : 'email'; const text = String(row[emailField] ?? ''); book.getWorksheet('Registrations')!.getRow(index + 2).getCell(columns(kind).indexOf(emailField) + 1).value = { text, hyperlink: `mailto:${text}` }; }
      if (embedded) for (const key of columns(kind).filter(key => key.endsWith('File') && row[key])) {
        const encoded = (attachmentBytes ?? image).toString('base64');
        book.getWorksheet('Attachments')!.addRow([String(index + 2), key.slice(0, -4), String(row[key]), '1', encoded]);
      }
    }
    return Buffer.from(await book.xlsx.writeBuffer());
  };
  const validate = (kind: string, bytes: Buffer, token = 'admin') => request(app.getHttpServer()).post('/api/imports/bulk/validate').set('Authorization', `Bearer ${token}`).field('kind', kind).attach('file', bytes, { filename: 'import.xlsx', contentType: XLSX_TYPE });
  const confirm = (id: string, bytes: Buffer, archive?: Buffer, filename = 'import.xlsx') => {
    const pending = (async () => {
      const pending = request(app.getHttpServer()).post(`/api/imports/${id}/confirm`).set('Authorization', 'Bearer admin').attach('file', bytes, { filename, contentType: filename.endsWith('.csv') ? 'text/csv' : XLSX_TYPE });
      if (archive) pending.attach('documentsZip', archive, { filename: 'documents.zip', contentType: 'application/zip' });
      const response = await pending;
      if (response.status === 201) {
        for (let attempts = 0; attempts < 6000; attempts++) {
          const job = await prisma.importJob.findUniqueOrThrow({ where: { id } });
          if (['COMPLETED','PARTIALLY_COMPLETED','FAILED'].includes(job.status)) { response.body = { ...response.body, imported: job.importedRecords, status: job.status }; return response; }
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        throw new Error('Import worker did not finish');
      }
      return response;
    })();
    return Object.assign(pending, { expect: async (status: number) => { const response = await pending; expect(response.status).toBe(status); return response; } });
  };
  const validateZip = (kind: string, bytes: Buffer, archive: Buffer, filename = 'import.xlsx') => request(app.getHttpServer()).post('/api/imports/bulk/validate').set('Authorization', 'Bearer admin').field('kind', kind).attach('file', bytes, { filename, contentType: filename.endsWith('.csv') ? 'text/csv' : XLSX_TYPE }).attach('documentsZip', archive, { filename:'documents.zip', contentType:'application/zip' });
  beforeAll(async () => {
    process.env.NODE_ENV = 'test'; process.env.IDEMPOTENCY_SECRET = 'imports-integration-only-32-character-secret';
    process.env.COGNITO_USER_POOL_ID = 'ap-southeast-2_testpool'; process.env.COGNITO_CLIENT_ID = 'testclient';
    process.env.AWS_REGION = 'ap-southeast-2'; process.env.S3_BUCKET = 'zenex-international-mrpob-files';
    db = await startTestDatabase();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerGuard).useValue({ canActivate: () => true })
      .overrideProvider(S3StorageService).useValue(storage)
      .overrideProvider(AuthService).useValue({ authenticate: async (token: string) => {
        if (token === 'admin') return admin;
        if (token === 'super') return superAdmin;
        if (token === 'ordinary') return ordinary;
        throw new UnauthorizedException();
      } }).compile();
    app = module.createNestApplication(); configureApp(app); await app.init();
    prisma = app.get(PrismaService);
    // startTestDatabase permits only explicitly disposable test database names.
    // Reset fixture data so reruns cannot collide with a prior interrupted suite.
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditEvent", "Document", "CustomerAddress", "CustomerRegistration", "CompanyRegistration", "PatientRegistration", "Registration", "UploadObject", "UploadBatch", "ErpUser" CASCADE');
    admin = await prisma.erpUser.create({ data: { username: 'import-admin', displayName: 'Import Admin', role: 'ADMIN', state: 'ACTIVE' } });
    superAdmin = await prisma.erpUser.create({ data: { username: 'import-super', displayName: 'Import Super', role: 'SUPER_ADMIN', state: 'ACTIVE' } });
    ordinary = await prisma.erpUser.create({ data: { username: 'import-ordinary', displayName: 'Import Patient', role: 'PATIENT', state: 'ACTIVE' } });
    image = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } }).png().toBuffer();
  });
  afterAll(async () => { await app?.close(); await db?.stop(); });

  it.each(['customer', 'company', 'patient'])('serves the %s template for Admin and Super Admin', async kind => {
    for (const token of ['admin', 'super']) await request(app.getHttpServer()).get(`/api/imports/templates/${kind}`).set('Authorization', `Bearer ${token}`).expect(200).expect('content-type', /spreadsheetml/);
  });
  it.each(['/api/imports', '/api/imports/templates/patient', '/api/imports/00000000-0000-0000-0000-000000000000/preview', '/api/imports/00000000-0000-0000-0000-000000000000/progress', '/api/imports/00000000-0000-0000-0000-000000000000/download'])('protects %s', async path => {
    await request(app.getHttpServer()).get(path).expect(401);
    await request(app.getHttpServer()).get(path).set('Authorization', 'Bearer ordinary').expect(403);
  });
  it('validates and atomically imports 250 automatically approved patient accounts with replay protection', async () => {
    const baselineApproved = await prisma.registration.count({ where: { kind: 'patient', status: 'APPROVED' } });
    const baselinePending = await prisma.registration.count({ where: { kind: 'patient', status: 'PENDING' } });
    const bytes = await workbook('patient', Array.from({ length: 250 }, patient));
    const preview = await validate('patient', bytes).expect(201);
    expect(preview.body.ready).toBe(true); expect(preview.body.counts.valid).toBe(250);
    const reserved = await prisma.importRecord.findMany({ where: { jobId: preview.body.id } });
    expect(await prisma.registration.count({ where: { id: { in: reserved.map(row => row.registrationId!) } } })).toBe(0);
    const completed = await confirm(preview.body.id, bytes).expect(201);
    expect(completed.body.imported).toBe(250);
    await confirm(preview.body.id, bytes).expect(201);
    const records = await prisma.importRecord.findMany({ where: { jobId: preview.body.id } });
    const accounts = await prisma.registration.findMany({ where: { id: { in: records.map(r => r.registrationId!) } }, include: { owner: true } });
    expect(accounts).toHaveLength(250); expect(new Set(accounts.map(r => r.masterCode)).size).toBe(250);
    expect(accounts.every(r => r.masterCode?.startsWith('ZI7') && r.registrationSource === 'Bulk Import' && r.status === 'APPROVED' && r.owner?.role === 'PATIENT' && r.decidedById === admin.id && r.decidedAt && r.masterCode)).toBe(true);
    const progress = await request(app.getHttpServer()).get(`/api/imports/${preview.body.id}/progress`).set('Authorization', 'Bearer admin').expect(200);
    expect(progress.body).toMatchObject({ progress: 100, status: 'COMPLETED', importedRecords: 250 });
    const approved = await request(app.getHttpServer()).get('/api/admin/registrations/approved?kind=patient&pageSize=100').set('Authorization', 'Bearer admin').expect(200);
    expect(approved.body.total).toBe(baselineApproved + 250);
    const summary = await request(app.getHttpServer()).get('/api/admin/registrations/summary?kind=patient').set('Authorization', 'Bearer admin').expect(200);
    expect(summary.body).toMatchObject({ pending: baselinePending, approved: baselineApproved + 250 });
  });
  it('reports both copies of duplicate identifiers and disables confirmation', async () => {
    const row = patient(); const bytes = await workbook('patient', [row, row]);
    const preview = await validate('patient', bytes).expect(201);
    expect(preview.body.ready).toBe(false); expect(preview.body.counts.duplicates).toBe(2);
    await confirm(preview.body.id, bytes).expect(409);
  });
  it('detects existing database identifiers before confirmation', async () => {
    const row = patient(); const bytes = await workbook('patient', [row]);
    const preview = await validate('patient', bytes).expect(201); await confirm(preview.body.id, bytes).expect(201);
    const again = await validate('patient', bytes).expect(201); expect(again.body.counts.duplicates).toBe(1);
  });
  it('rechecks uniqueness and preserves successful rows when another row conflicts', async () => {
    const first = patient(), conflict = patient();
    const bytes = await workbook('patient', [first, conflict]); const preview = await validate('patient', bytes).expect(201);
    const competingBytes = await workbook('patient', [conflict]); const other = await validate('patient', competingBytes).expect(201); await confirm(other.body.id, competingBytes).expect(201);
    await confirm(preview.body.id, bytes).expect(201);
    expect(await prisma.registration.findFirst({ where: { mobile: first.mobile } })).toMatchObject({ status: 'APPROVED' });
    expect(await prisma.importJob.findUnique({ where: { id: preview.body.id } })).toMatchObject({ status: 'PARTIALLY_COMPLETED', importedRecords: 1, progress: 50 });
  });
  it('binds confirmation to the validated bytes and rejects concurrent confirmation without duplicates', async () => {
    const bytes = await workbook('patient', [patient()]); const preview = await validate('patient', bytes).expect(201);
    await confirm(preview.body.id, await workbook('patient', [patient()])).expect(409);
    const responses = await Promise.all([confirm(preview.body.id, bytes), confirm(preview.body.id, bytes)]);
    expect(responses.some(r => r.status === 201)).toBe(true); expect(responses.every(r => [201, 409].includes(r.status))).toBe(true);
    expect((await prisma.importJob.findUniqueOrThrow({ where: { id: preview.body.id } })).importedRecords).toBe(1);
  });
  it('validates mandatory document references and company password complexity', async () => {
    const bytes = await workbook('company', [{ ...companyInput({ password: 'weak', confirmPassword: 'weak' }), companyLogoFile: 'logo.png', adminPhotoFile: 'admin.png' }]);
    const preview = await validate('company', bytes).expect(201);
    expect(preview.body.counts.missingDocuments).toBe(2); expect(preview.body.ready).toBe(false);
    expect(JSON.stringify(preview.body)).not.toMatch(/weak|passwordHash/);
    expect(preview.body.rows[0].fields).not.toHaveProperty('password');
  });
  it('imports a company with private S3 associations, excludes passwords from every retained result and preserves accounts on deletion', async () => {
    const values = companyInput(); const bytes = await workbook('company', [{ ...values, companyLogoFile: 'logo.png', adminPhotoFile: 'admin.png' }], true);
    const preview = await validate('company', bytes).expect(201);
    expect(preview.body.ready).toBe(true); expect(JSON.stringify(preview.body)).not.toContain(values.password);
    const tracked = await prisma.importRecord.findFirstOrThrow({ where: { jobId: preview.body.id } });
    expect(JSON.stringify(tracked)).not.toContain(values.password); expect(tracked.data).not.toHaveProperty('password');
    await confirm(preview.body.id, bytes).expect(201);
    const registration = await prisma.registration.findUniqueOrThrow({ where: { id: tracked.registrationId! }, include: { documents: true, owner: true } });
    expect(registration.status).toBe('APPROVED'); expect(registration.owner?.role).toBe('COMPANY'); expect(registration.documents).toHaveLength(2);
    expect(registration.documents.every(doc => storage.objects.has(doc.objectKey))).toBe(true);
    expect(registration.passwordHash).toMatch(/^scrypt:/);
    const download = await request(app.getHttpServer()).get(`/api/imports/${preview.body.id}/download`).set('Authorization', 'Bearer admin').buffer(true).parse((res, cb) => { const chunks: Buffer[] = []; res.on('data', c => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); }).expect(200);
    const book = new ExcelJS.Workbook(); await book.xlsx.load(download.body);
    const content = JSON.stringify(book.getWorksheet('Results')!.getSheetValues());
    expect(content).not.toMatch(/password|Registration123/);
    await request(app.getHttpServer()).delete(`/api/imports/${preview.body.id}`).set('Authorization', 'Bearer admin').expect(200);
    expect(await prisma.registration.findUnique({ where: { id: tracked.registrationId! } })).not.toBeNull();
    expect(registration.documents.every(doc => storage.objects.has(doc.objectKey))).toBe(true);
    await request(app.getHttpServer()).get(`/api/imports/${preview.body.id}/download`).set('Authorization', 'Bearer admin').expect(404);
  });
  it('single customer imports reuse registration fields, auto-approval and idempotency', async () => {
    const { password: _p, confirmPassword: _c, ...fields } = customerInput();
    const single = () => { let req = request(app.getHttpServer()).post('/api/imports/single').set('Authorization', 'Bearer super').set('Idempotency-Key', 'single-customer-test-001').field('kind', 'customer').field('masterCode', 'ZI00800001'); for (const [key, value] of Object.entries(fields)) req = req.field(key, String(value)); for (const slot of ['dl1', 'dl2', 'gstCertificate', 'shopOutside', 'shopInside']) req = req.attach(slot, image, { filename: `${slot}.png`, contentType: 'image/png' }); return req; };
    const response = await single().expect(201); expect(response.body.status).toBe('COMPLETED');
    const replay = await single().expect(201); expect(replay.body.id).toBe(response.body.id);
    const registration = await prisma.registration.findUniqueOrThrow({ where: { id: response.body.registrationId }, include: { owner: true } });
    expect(registration).toMatchObject({ status: 'APPROVED', decidedById: superAdmin.id }); expect(registration.owner?.role).toBe('CUSTOMER');
  });
  it('fails safely on S3 upload errors and cleans the durable manifest', async () => {
    storage.fail = true;
    try {
      const bytes = await workbook('patient', [{ ...patient(), idProofFile: 'proof.png' }], true);
      const before = storage.objects.size;
      await validate('patient', bytes).expect(503);
      expect(storage.objects.size).toBe(before);
    } finally { storage.fail = false; }
  });
  it('expires abandoned validation sessions and cleans documents', async () => {
    const bytes = await workbook('patient', [patient()]); const preview = await validate('patient', bytes).expect(201);
    await prisma.importJob.update({ where: { id: preview.body.id }, data: { expiresAt: new Date(0) } });
    await app.get(ImportsService).expire(); await confirm(preview.body.id, bytes).expect(409);
    expect(await prisma.importJob.findUnique({ where: { id: preview.body.id } })).toMatchObject({ status: 'CANCELLED' });
  });
  it('rejects mutation endpoints for public and non-administrator users', async () => {
    const id = '00000000-0000-0000-0000-000000000000';
    for (const path of ['/api/imports/bulk/validate', '/api/imports/single', `/api/imports/${id}/confirm`]) {
      await request(app.getHttpServer()).post(path).expect(401);
      await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer ordinary').expect(403);
    }
    await request(app.getHttpServer()).delete(`/api/imports/${id}`).set('Authorization', 'Bearer ordinary').expect(403);
  });
  it('rejects ambiguous document filenames and malformed document contents before S3 writes', async () => {
    const bytes = await workbook('patient', [{ ...patient(), idProofFile: 'proof.png' }]);
    await validate('patient', bytes).attach('documents', image, { filename: 'proof.png', contentType: 'image/png' }).attach('documents', image, { filename: 'PROOF.png', contentType: 'image/png' }).expect(400);
    const before = storage.objects.size;
    const invalidBytes = await workbook('patient', [{ ...patient(), idProofFile: 'proof.png' }], true, Buffer.from('not an image'));
    const invalid = await validate('patient', invalidBytes).expect(201);
    expect(invalid.body.ready).toBe(false); expect(storage.objects.size).toBe(before);
  });
  it('prevents deletion during processing and reconciles a crashed import without committing accounts', async () => {
    const bytes = await workbook('patient', [patient()]); const preview = await validate('patient', bytes).expect(201);
    await prisma.importJob.update({ where: { id: preview.body.id }, data: { status: 'IMPORTING', confirmedAt: new Date() } });
    await request(app.getHttpServer()).delete(`/api/imports/${preview.body.id}`).set('Authorization', 'Bearer admin').expect(409);
    await prisma.importJob.update({ where: { id: preview.body.id }, data: { expiresAt: new Date(0) } });
    await app.get(ImportsService).expire();
    expect(await prisma.importJob.findUnique({ where: { id: preview.body.id } })).toMatchObject({ status: 'FAILED', importedRecords: 0, progress: 0 });
  });
  it('allocates validation quota without blocking an in-progress approval actor lock', async () => {
    const bytes = await workbook('patient', [patient()]);
    const id = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "ErpUser" WHERE "id" = ${admin.id}::uuid FOR SHARE`;
      const preview = await validate('patient', bytes).expect(201);
      return preview.body.id as string;
    }, { timeout: 15000 });
    await request(app.getHttpServer()).delete(`/api/imports/${id}`).set('Authorization', 'Bearer admin').expect(200);
  });
  it('enforces active-job quotas and releases capacity on soft deletion', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const preview = await validate('patient', await workbook('patient', [patient()])).expect(201); ids.push(preview.body.id);
    }
    await validate('patient', await workbook('patient', [patient()])).expect(429);
    for (const id of ids) await request(app.getHttpServer()).delete(`/api/imports/${id}`).set('Authorization', 'Bearer admin').expect(200);
    const history = await request(app.getHttpServer()).get('/api/imports?page=1&pageSize=2&kind=patient&order=asc').set('Authorization', 'Bearer admin').expect(200);
    expect(history.body.items.length).toBeLessThanOrEqual(2); expect(history.body.items.every((job: { id: string }) => !ids.includes(job.id))).toBe(true);
  });
  it('serializes cross-category email conflicts before account allocation', async () => {
    const values = patient();
    const patientBytes = await workbook('patient', [values]);
    const companyBytes = await workbook('company', [{ ...companyInput({ adminEmail: values.email, adminMobile: String(9100000000 + ++serial) }), companyLogoFile: 'concurrent-logo.png', adminPhotoFile: 'concurrent-admin.png' }], true);
    const patientJob = await validate('patient', patientBytes).expect(201);
    const companyJob = await validate('company', companyBytes).expect(201);
    const responses = await Promise.all([confirm(patientJob.body.id, patientBytes), confirm(companyJob.body.id, companyBytes)]);
    expect(responses.map(r => r.body.status).sort()).toEqual(['COMPLETED', 'FAILED']);
    expect(await prisma.erpUser.count({ where: { email: values.email } })).toBe(1);
  });
  it('preserves a legacy Master Code without consuming ZI numbers, then generates ZI for a new registration', async () => {
    const [before] = await prisma.$queryRaw<{ last_value: bigint; is_called: boolean }[]>`SELECT last_value, is_called FROM approved_master_seq`;
    const bytes = await workbook('patient', [{ ...patient(), masterCode: 'C01234' }]);
    const preview = await validate('patient', bytes).expect(201);
    expect(preview.body.rows[0]).toMatchObject({ masterCode: 'C01234', valid: true });
    await confirm(preview.body.id, bytes).expect(201);
    const saved = await prisma.registration.findUniqueOrThrow({ where: { masterCode: 'C01234' }, include: { owner: true } });
    expect(saved.owner?.username).toBe('C01234');
    const [after] = await prisma.$queryRaw<{ last_value: bigint; is_called: boolean }[]>`SELECT last_value, is_called FROM approved_master_seq`;
    expect(after).toEqual(before);
    const fresh = await request(app.getHttpServer()).post('/api/registrations/patients').field(patient()).expect(201);
    await request(app.getHttpServer()).post(`/api/admin/registrations/${fresh.body.registrationId}/decision`).set('Authorization', 'Bearer admin').send({ action: 'approve' }).expect(201);
    const approved = await prisma.registration.findUniqueOrThrow({ where: { id: fresh.body.registrationId } });
    expect(approved.masterCode).toBe(`ZI${(before.is_called ? before.last_value + 1n : before.last_value).toString().padStart(4, '0')}`);
    const conflicting = await workbook('patient', [{ ...patient(), masterCode: 'C01234' }]);
    const duplicate = await validate('patient', conflicting).expect(201);
    expect(duplicate.body.counts.duplicates).toBe(1);
  });
  it('preserves supplied leading zeros and rejects duplicate Master Codes across categories', async () => {
    const code = 'ZI000000123456';
    const bytes = await workbook('patient', [{ ...patient(), masterCode: code }]);
    const preview = await validate('patient', bytes).expect(201);
    expect(preview.body.rows[0].masterCode).toBe(code);
    await confirm(preview.body.id, bytes).expect(201);
    const record = await prisma.registration.findUniqueOrThrow({ where: { masterCode: code }, include: { owner: true } });
    expect(record.owner?.username).toBe(code);
    expect(record).toMatchObject({ registrationSource: 'Bulk Import', importedById: admin.id, importJobId: preview.body.id });
    const next = await workbook('company', [{ ...companyInput({ adminEmail: 'master-conflict@example.test', adminMobile: String(9100000000 + ++serial) }), masterCode: code }]);
    const conflict = await validate('company', next).expect(201);
    expect(conflict.body.counts.duplicates).toBe(1);
    expect(conflict.body.rows[0].errors.join(' ')).toContain('Master Code');
  });
  it('mixes legacy and new users, reserves around supplied ZI codes and retains generated codes on replay', async () => {
    const [counter] = await prisma.$queryRaw<{ last_value: bigint; is_called: boolean }[]>`SELECT last_value, is_called FROM approved_master_seq`;
    const next = counter.is_called ? counter.last_value + 1n : counter.last_value;
    const suppliedZi = `ZI${next.toString().padStart(4, '0')}`;
    const bytes = await workbook('patient', [
      { ...patient(), masterCode: 'patient-000045', idProofFile: 'legacy.png' },
      { ...patient(), masterCode: '', idProofFile: 'new.png' },
      { ...patient(), masterCode: suppliedZi },
    ]);
    const archive = await documentZip({ 'legacy.png': image, 'new.png': image });
    const preview = await validateZip('patient', bytes, archive).expect(201);
    expect(preview.body.counts.valid).toBe(3);
    const codes = preview.body.rows.map((row: { masterCode: string }) => row.masterCode);
    expect(codes).toEqual(['patient-000045', `ZI${(next + 1n).toString().padStart(4, '0')}`, suppliedZi]);
    const done = await confirm(preview.body.id, bytes, archive).expect(201);
    expect(done.body.imported).toBe(3);
    await confirm(preview.body.id, bytes, archive).expect(201);
    const records = await prisma.registration.findMany({ where: { importJobId: preview.body.id }, include: { owner: true, documents: true } });
    expect(records).toHaveLength(3);
    for (const code of codes) {
      const record = records.find(row => row.masterCode === code)!;
      expect(record.owner?.username).toBe(code);
      for (const document of record.documents) expect(document.objectKey.startsWith(`imports/patient/${code}/`)).toBe(true);
    }
    const reloaded = await request(app.getHttpServer()).get(`/api/imports/${preview.body.id}/preview`).set('Authorization', 'Bearer admin').expect(200);
    expect(reloaded.body.rows.map((row: { masterCode: string }) => row.masterCode)).toEqual(codes);
  });
  it('generates distinct new-user codes for concurrent CSV validation jobs', async () => {
    const csv = async () => {
      const row: Record<string, unknown> = { ...patient(), masterCode: '' };
      return Buffer.from([columns('patient').join(','), columns('patient').map(key => String(row[key] ?? '')).join(',')].join('\r\n'));
    };
    const bytes = await Promise.all([csv(), csv()]);
    const archive = await documentZip();
    const jobs = await Promise.all(bytes.map(file => validateZip('patient', file, archive, 'import.csv').expect(201)));
    const codes = jobs.map(job => job.body.rows[0].masterCode);
    expect(new Set(codes).size).toBe(2);
    expect(codes.every(code => /^ZI[0-9]{4,}$/.test(code))).toBe(true);
    for (let index = 0; index < jobs.length; index++) expect((await confirm(jobs[index].body.id, bytes[index], archive, 'import.csv').expect(201)).body.imported).toBe(1);
  });
  it('assigns blank codes, rejects duplicate supplied codes, and imports only eligible records', async () => {
    const bytes = await workbook('patient', [
      { ...patient(), masterCode: '' },
      { ...patient(), masterCode: 'ZI0000099998' },
      { ...patient(), masterCode: 'ZI0000099998' },
      { ...patient(), masterCode: 'ZI0000099999' },
    ]);
    const preview = await validate('patient', bytes).expect(201);
    expect(preview.body.counts).toMatchObject({ total: 4, valid: 2, failed: 2, duplicates: 2 });
    expect(preview.body.ready).toBe(true);
    const done = await confirm(preview.body.id, bytes).expect(201);
    expect(done.body).toMatchObject({ status: 'PARTIALLY_COMPLETED', imported: 2 });
    const report = await request(app.getHttpServer()).get(`/api/imports/${preview.body.id}/errors`).set('Authorization', 'Bearer admin').expect(200);
    expect(report.headers['content-type']).toMatch(/spreadsheetml/);
  });

  it('stores full original workbook PDF bytes and rejects active PDFs before S3 staging', async () => {
    const { PDFDocument, PDFName } = await import('pdf-lib');
    const pdf = await PDFDocument.create(); pdf.addPage();
    const original = Buffer.from(await pdf.save());
    const bytes = await workbook('patient', [{ ...patient(), idProofFile: 'original.pdf' }], true, original);
    const preview = await validate('patient', bytes).expect(201);
    expect(preview.body.ready).toBe(true);
    expect(preview.body.counts.extractedDocuments).toBe(1);
    await confirm(preview.body.id, bytes).expect(201);
    const tracked = await prisma.importRecord.findFirstOrThrow({ where: { jobId: preview.body.id } });
    const document = await prisma.document.findFirstOrThrow({ where: { registrationId: tracked.registrationId! } });
    expect(document).toMatchObject({ slot: 'idProof', originalName: 'original.pdf', contentType: 'application/pdf' });
    expect(storage.objects.get(document.objectKey)?.equals(original)).toBe(true);
    pdf.catalog.set(PDFName.of('OpenAction'), pdf.context.obj({ S: PDFName.of('Launch') }));
    const unsafe = await workbook('patient', [{ ...patient(), idProofFile: 'unsafe.pdf' }], true, Buffer.from(await pdf.save()));
    const count = storage.objects.size;
    const rejected = await validate('patient', unsafe).expect(201);
    expect(rejected.body.ready).toBe(false);
    expect(rejected.body.counts.documentFailures).toBe(1);
    expect(rejected.body.rows[0].errors.join(' ')).toContain('unsupported active content or embedded files');
    expect(storage.objects.size).toBe(count);
  });

  it.each(['customer', 'company', 'patient'] as const)('imports %s documents from ZIP using exact references and Master Code prefixes', async kind => {
    const baseCode = kind === 'customer' ? 'Cust-008100' : kind === 'company' ? 'COMP_008200' : 'pat008300';
    const entries: Record<string, Buffer> = {};
    const rows: Record<string, unknown>[] = [];
    const slots = columns(kind).filter(key => key.endsWith('File'));
    for (let n=1;n<=2;n++) {
      const code = `${baseCode}${n}`;
      const values = kind === 'customer' ? customerInput({ mobile:String(9200000000 + ++serial), email:`zip-customer-${serial}@example.test`, gstNumber:`ZIP-GST-${serial}` }) : kind === 'company' ? companyInput({ adminMobile:String(9200000000 + ++serial), adminEmail:`zip-company-${serial}@example.test` }) : patient();
      const row: Record<string, unknown> = { ...values, masterCode:code };
      for (const slot of slots) { const name = `${code}_${slot}.png`; row[slot]=name; entries[`folder-${n}/${name}`]=image; }
      rows.push(row);
    }
    entries['unused.png']=image;
    const archive = await documentZip(Object.fromEntries(Object.entries(entries).reverse()));
    const bytes = await workbook(kind, rows, false, undefined, true);
    const preview = await validateZip(kind, bytes, archive).expect(201);
    expect(preview.body).toMatchObject({ ready:true, supportingFileName:'documents.zip' });
    expect(preview.body.warnings).toEqual(['Unreferenced document ignored: unused.png']);
    expect(preview.body.counts.valid).toBe(2);
    expect(JSON.stringify(preview.body.rows)).not.toContain('mailto:');
    await confirm(preview.body.id, bytes, archive).expect(201);
    const imported = await prisma.registration.findMany({ where:{ masterCode:{ in:rows.map(row=>String(row.masterCode)) } }, include:{ documents:true, customer:true, company:true, patient:true } });
    expect(imported).toHaveLength(2);
    for (const record of imported) {
      expect(record.status).toBe('APPROVED');
      expect(record[kind]).not.toBeNull();
      expect(record.documents).toHaveLength(slots.length);
      for (const document of record.documents) {
        expect(document.objectKey.startsWith(`imports/${kind}/${record.masterCode}/`)).toBe(true);
        expect(document.originalName).toBe(`${record.masterCode}_${document.slot}File.png`);
        expect(storage.objects.get(document.objectKey)?.equals(image)).toBe(true);
      }
    }
    expect((await prisma.importJob.findUniqueOrThrow({ where:{id:preview.body.id} })).supportingFileName).toBe('documents.zip');
    const history = await request(app.getHttpServer()).get('/api/imports?pageSize=100').set('Authorization','Bearer admin').expect(200);
    expect(history.body.items.find((job:{id:string})=>job.id===preview.body.id).supportingFileName).toBe('documents.zip');
  });
  it('supports CSV plus ZIP, binds both files to confirmation and rejects changed or missing ZIP data', async () => {
    const row = { ...patient(), masterCode:'ZI00840001', idProofFile:'proof.png' } as Record<string,unknown>;
    const bytes = Buffer.from([columns('patient').join(','), columns('patient').map(key=>`"${String(row[key]??'').replaceAll('"','""')}"`).join(',')].join('\r\n'));
    const archive = await documentZip({'proof.png':image});
    const preview = await validateZip('patient',bytes,archive,'import.csv').expect(201);
    expect(preview.body.ready).toBe(true);
    await confirm(preview.body.id,bytes,undefined,'import.csv').expect(409);
    await confirm(preview.body.id,bytes,await documentZip({'different.png':image}),'import.csv').expect(409);
    await confirm(preview.body.id,Buffer.from(bytes.toString().replace('ZI00840001','ZI00840002')),archive,'import.csv').expect(409);
    const result = await confirm(preview.body.id,bytes,archive,'import.csv').expect(201);
    expect(result.body.imported).toBe(1);
    await confirm(preview.body.id,bytes,archive,'import.csv').expect(201);
    expect(await prisma.registration.count({where:{masterCode:'ZI00840001'}})).toBe(1);
  });
  it('reports missing filenames with the correct row, column and Master Code, including case mismatches', async () => {
    const bytes = await workbook('patient',[{...patient(),masterCode:'ZI00850001',idProofFile:'Proof.png'}]);
    const preview = await validateZip('patient',bytes,await documentZip({'proof.png':image})).expect(201);
    expect(preview.body.ready).toBe(false);
    expect(preview.body.rows[0]).toMatchObject({rowNumber:2,masterCode:'ZI00850001'});
    expect(preview.body.rows[0].errors).toContain('Missing document: idProofFile "Proof.png"');
    expect(preview.body.warnings).toEqual(['Unreferenced document ignored: proof.png']);
  });
  it('names invalid ZIP documents in row errors and refuses unsafe archive structures before storage', async () => {
    const row = {...patient(),masterCode:'ZI00860001',idProofFile:'proof.png'};
    const bytes = await workbook('patient',[row]);
    const before = storage.objects.size;
    const invalid = await validateZip('patient',bytes,await documentZip({'proof.png':Buffer.from('not PNG')})).expect(201);
    expect(invalid.body.ready).toBe(false);
    expect(invalid.body.rows[0].errors.join(' ')).toMatch(/idProofFile.*proof.png/);
    await validateZip('patient',bytes,await documentZip({'../proof.png':image})).expect(400);
    await validateZip('patient',bytes,await documentZip({'a/proof.png':image,'b/PROOF.png':image})).expect(400);
    expect(storage.objects.size).toBe(before);
  });
  it('cleans only newly staged Master Code objects when S3 fails, preserving existing registration objects', async () => {
    const existing = 'registration/customer/existing/keep.png';
    storage.objects.set(existing,Buffer.from(image));
    const bytes = await workbook('patient',[{...patient(),masterCode:'ZI00870001',idProofFile:'proof.png'}]);
    const archive = await documentZip({'proof.png':image});
    const before = storage.objects.size;
    storage.fail=true;
    try { await validateZip('patient',bytes,archive).expect(503); }
    finally { storage.fail=false; }
    expect(storage.objects.size).toBe(before);
    expect(storage.objects.get(existing)?.equals(image)).toBe(true);
    expect(await prisma.registration.findUnique({where:{masterCode:'ZI00870001'}})).toBeNull();
    const failed = await prisma.importJob.findFirstOrThrow({where:{fileName:'import.xlsx',supportingFileName:'documents.zip',status:'FAILED'},orderBy:{uploadedAt:'desc'}});
    expect(failed).toMatchObject({totalRecords:1,importedRecords:0});
    expect((await prisma.importRecord.findFirstOrThrow({where:{jobId:failed.id}})).errors.join(' ')).toContain('staging failed');
  });

});
