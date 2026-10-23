import 'reflect-metadata';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { ErpUser } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { PrismaService } from '../../src/database/prisma.service';
import { AuthService } from '../../src/auth/auth.service';
import { DocumentsService } from '../../src/documents/documents.service';
import { S3StorageService } from '../../src/documents/s3-storage.service';
import { startTestDatabase } from './database';

class MemoryS3 {
  objects = new Map<string, {buffer: Buffer; contentType: string; sha256: string; versionId: string}>();
  puts = 0;
  failPutAt = 0;
  failRemove = false;
  async put(key: string, buffer: Buffer, contentType: string, sha256: string) {
    this.puts++;
    const versionId = `version-${this.puts}`;
    // An uncertain network failure can happen after S3 accepted the bytes.
    this.objects.set(key, {buffer, contentType, sha256, versionId});
    if (this.failPutAt === this.puts) throw new Error('Simulated uncertain S3 write');
    return {versionId};
  }
  async remove(key: string) {if (this.failRemove) throw new Error('Simulated S3 delete outage'); this.objects.delete(key);}
  async signedDownload(key: string) {return `https://private-s3.example.test/${encodeURIComponent(key)}?temporary=60`;}
  async healthy() {return true;}
  reset() {this.objects.clear(); this.puts = 0; this.failPutAt = 0; this.failRemove = false;}
}

describe('PostgreSQL registration workflow (S3 transport and Cognito verification mocked)', () => {
  let database: Awaited<ReturnType<typeof startTestDatabase>>;
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: ErpUser;
  let ordinary: ErpUser;
  let pdf: Buffer;
  let png: Buffer;
  const storage = new MemoryS3();
  const password = 'SecurePass123';
  const patient = (mobile = '9876543210') => ({patientName: 'Integration Patient', mobile, email: '', password, confirmPassword: password, gender: 'Female', address: 'Bengaluru test address', paymentMethod: 'UPI', termsAccepted: 'true'});
  const company = () => ({companyName: 'Integration Company', division: 'Medical', headquarter: 'Bengaluru', adminFullName: 'Company Administrator', adminEmail: 'ADMIN@EXAMPLE.TEST', adminMobile: '9876543211', password, confirmPassword: password, termsAccepted: 'true'});
  const customer = () => ({customerName: 'Integration Owner', mobile: '9876543212', email: 'owner@example.test', businessName: 'Integration Pharmacy', customerType: 'Retail Pharmacy', addressLine1: '123 Test Road', pinCode: '560001', dlNumber1: 'DL-ONE', dlNumber2: 'DL-TWO', gstNumber: 'gst-test-001', creditDays: 'week_2', paymentMethod: 'UPI', password, confirmPassword: password, termsAccepted: 'true'});
  const submit = (path: string, fields: Record<string, string>, fileSlots: string[] = [], image = false, key?: string) => {
    let req = request(app.getHttpServer()).post(`/api/registrations/${path}`);
    if (key) req = req.set('Idempotency-Key', key);
    for (const [name, value] of Object.entries(fields)) req = req.field(name, value);
    for (const name of fileSlots) req = req.attach(name, image ? png : pdf, {filename: image ? 'photo.png' : 'document.pdf', contentType: image ? 'image/png' : 'application/pdf'});
    return req;
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.IDEMPOTENCY_SECRET = 'integration-only-secret-with-at-least-32-characters';
    process.env.COGNITO_USER_POOL_ID = 'ap-southeast-2_testpool';
    process.env.COGNITO_CLIENT_ID = 'testclient';
    process.env.AWS_REGION = 'ap-southeast-2';
    process.env.S3_BUCKET = 'zenex-international-mrpob';
    database = await startTestDatabase();
    const module = await Test.createTestingModule({imports: [AppModule]})
      .overrideProvider(ThrottlerGuard).useValue({canActivate: () => true})
      .overrideProvider(S3StorageService).useValue(storage)
      .overrideProvider(AuthService).useValue({authenticate: async (token: string) => {
        if (token === 'integration-admin') return admin;
        if (token === 'integration-user') return ordinary;
        throw new UnauthorizedException('Invalid token');
      }})
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const document = await PDFDocument.create();
    document.addPage();
    pdf = Buffer.from(await document.save());
    png = await sharp({create: {width: 2, height: 2, channels: 3, background: '#1451ab'}}).png().toBuffer();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditEvent", "Document", "CustomerAddress", "CustomerRegistration", "CompanyRegistration", "PatientRegistration", "Registration", "UploadObject", "UploadBatch", "ErpUser" CASCADE');
    storage.reset();
    admin = await prisma.erpUser.create({data: {cognitoSub: 'test-admin-sub', username: 'test-admin', displayName: 'Test Admin', role: 'SUPER_ADMIN', state: 'ACTIVE'}});
    ordinary = await prisma.erpUser.create({data: {cognitoSub: 'test-user-sub', username: 'test-user', displayName: 'Test User', role: 'PATIENT', state: 'ACTIVE'}});
  });

  afterAll(async () => {await app?.close(); await database?.stop();});

  it('stores each form in its own tables with private-prefix document metadata and audit events', async () => {
    const customerResult = await submit('customers', customer(), ['dl1', 'dl2', 'gstCertificate', 'shopOutside', 'shopInside']).expect(201);
    const companyResult = await submit('companies', company(), ['companyLogo', 'adminPhoto'], true).expect(201);
    const patientResult = await submit('patients', patient(), ['idProof']).expect(201);
    for (const result of [customerResult, companyResult, patientResult]) expect(result.body.status).toBe('PENDING');
    expect(await prisma.customerRegistration.count()).toBe(1);
    expect(await prisma.companyRegistration.count()).toBe(1);
    expect(await prisma.patientRegistration.count()).toBe(1);
    expect(await prisma.customerAddress.findUnique({where: {registrationId: customerResult.body.registrationId}})).toMatchObject({addressLine1: '123 Test Road', pinCode: '560001'});
    expect(await prisma.registration.findUnique({where: {id: companyResult.body.registrationId}})).toMatchObject({email: 'admin@example.test', mobile: '9876543211'});
    const docs = await prisma.document.findMany({include: {registration: true}});
    expect(docs).toHaveLength(8);
    for (const doc of docs) {
      expect(doc.objectKey).toMatch(new RegExp(`^registration/${doc.registration.kind}/${doc.registrationId}/[a-f0-9-]+\\.(pdf|png)$`));
      expect(doc.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(doc.size).toBe(storage.objects.get(doc.objectKey)?.buffer.length);
      expect(doc.contentType).toBe(storage.objects.get(doc.objectKey)?.contentType);
      expect(doc.versionId).toMatch(/^version-/);
    }
    expect(await prisma.auditEvent.count({where: {action: 'REGISTRATION_SUBMITTED'}})).toBe(3);
    expect(await prisma.uploadBatch.count({where: {completedAt: null}})).toBe(0);
    expect(JSON.stringify(await prisma.registration.findMany())).not.toContain(password);
  });

  it('rejects missing fields, unsupported contents, wrong file slots, required company images and unknown scalar fields before persistence', async () => {
    await submit('patients', {...patient(), patientName: ''}).expect(400);
    await submit('patients', {...patient(), termsAccepted: 'false'}).expect(400);
    await submit('patients', {...patient(), role: 'SUPER_ADMIN'}).expect(400);
    await submit('customers', customer()).expect(400);
    await submit('companies', company(), ['companyLogo', 'adminPhoto']).expect(415);
    await submit('patients', patient(), ['dl1']).expect(400);
    await submit('patients', patient()).attach('idProof', Buffer.from('executable pretending to be PDF'), {filename: 'fake.pdf', contentType: 'application/pdf'}).expect(415);
    await submit('patients', patient()).attach('idProof', Buffer.alloc(5 * 1024 * 1024 + 1), {filename: 'large.pdf', contentType: 'application/pdf'}).expect(413);
    expect(await prisma.registration.count()).toBe(0);
    expect(storage.puts).toBe(0);
  });

  it('prevents duplicate contacts and concurrent registrations using PostgreSQL constraints', async () => {
    const responses = await Promise.all([submit('patients', patient(), ['idProof']), submit('patients', patient(), ['idProof'])]);
    expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.registration.count()).toBe(1);
    expect(await prisma.patientRegistration.count()).toBe(1);
    expect(await prisma.document.count()).toBe(1);
    expect(storage.objects.size).toBe(1);
    await submit('patients', {...patient('9876543219'), email: 'person@example.test'}).expect(201);
    await submit('patients', {...patient('9876543218'), email: 'PERSON@EXAMPLE.TEST'}).expect(409);
  });

  it('replays identical idempotency keys and rejects changed payloads without new uploads', async () => {
    const key = 'integration-replay-key-001';
    const first = await submit('patients', patient(), ['idProof'], false, key).expect(201);
    const replay = await submit('patients', patient(), ['idProof'], false, key).expect(201);
    expect(replay.body).toEqual(first.body);
    await submit('patients', {...patient(), patientName: 'Changed Name'}, ['idProof'], false, key).expect(409);
    expect(await prisma.registration.count()).toBe(1);
    expect(storage.puts).toBe(1);
  });

  it('serializes concurrent same-key submissions into one registration and one document', async () => {
    const responses = await Promise.all([
      submit('patients', patient(), ['idProof'], false, 'integration-concurrent-key-001'),
      submit('patients', patient(), ['idProof'], false, 'integration-concurrent-key-001'),
    ]);
    expect(responses.map(response => response.status)).toEqual([201, 201]);
    expect(responses[0].body).toEqual(responses[1].body);
    expect(await prisma.registration.count()).toBe(1);
    expect(await prisma.document.count()).toBe(1);
    expect(storage.objects.size).toBe(1);
  });

  it('enforces normalized GST uniqueness independently of customer contact details', async () => {
    const files = ['dl1', 'dl2', 'gstCertificate', 'shopOutside', 'shopInside'];
    await submit('customers', customer(), files).expect(201);
    await submit('customers', {...customer(), mobile: '9876543219', email: 'another-owner@example.test', gstNumber: 'GST-TEST-001'}, files).expect(409);
    expect(await prisma.customerRegistration.count()).toBe(1);
    expect(storage.objects.size).toBe(5);
  });

  it('serves database-backed list, pagination, type-specific totals and complete safe details', async () => {
    const pending = await submit('patients', patient(), ['idProof']).expect(201);
    await submit('patients', patient('9876543219')).expect(201);
    const approved = await submit('patients', patient('9876543218')).expect(201);
    await prisma.registration.update({where: {id: approved.body.registrationId}, data: {status: 'APPROVED', decidedAt: new Date(), decidedById: admin.id}});
    const rejected = await submit('patients', patient('9876543217')).expect(201);
    await prisma.registration.update({where: {id: rejected.body.registrationId}, data: {status: 'REJECTED', rejectionReason: 'Test rejection record'}});
    await submit('companies', company(), ['companyLogo', 'adminPhoto'], true).expect(201);
    const summary = await request(app.getHttpServer()).get('/api/admin/registrations/summary?kind=patient').set('Authorization', 'Bearer integration-admin').expect(200);
    expect(summary.body).toEqual({pending: 2, approved: 1, rejected: 1});
    const list = await request(app.getHttpServer()).get('/api/admin/registrations?kind=patient&pageSize=2&page=1').set('Authorization', 'Bearer integration-admin').expect(200);
    expect(list.body.total).toBe(4);
    expect(list.body.items).toHaveLength(2);
    expect(list.body.items.every((item: {kind: string}) => item.kind === 'patient')).toBe(true);
    const detail = await request(app.getHttpServer()).get(`/api/admin/registrations/${pending.body.registrationId}`).set('Authorization', 'Bearer integration-admin').expect(200);
    expect(detail.body.record).toMatchObject({patientName: 'Integration Patient', gender: 'Female', address: 'Bengaluru test address', readOnly: false, status: 'PENDING'});
    expect(detail.body.record.files.idProof).toMatchObject({name: 'document.pdf', type: 'application/pdf'});
    expect(JSON.stringify(detail.body)).not.toMatch(/password|objectKey|private-s3/);
  });

  it('enforces actual administrative guards and document record ownership', async () => {
    const created = await submit('patients', patient(), ['idProof']).expect(201);
    const doc = await prisma.document.findFirstOrThrow();
    for (const endpoint of ['/api/admin/registrations?kind=patient', '/api/admin/registrations/summary?kind=patient', `/api/admin/registrations/${created.body.registrationId}`, `/api/documents/${doc.id}`]) {
      await request(app.getHttpServer()).get(endpoint).expect(401);
      await request(app.getHttpServer()).get(endpoint).set('Authorization', 'Bearer invalid').expect(401);
    }
    await request(app.getHttpServer()).get('/api/admin/registrations?kind=patient').set('Authorization', 'Bearer integration-user').expect(403);
    await request(app.getHttpServer()).get(`/api/documents/${doc.id}`).set('Authorization', 'Bearer integration-user').expect(403);
    await prisma.registration.update({where: {id: created.body.registrationId}, data: {ownerId: ordinary.id}});
    await request(app.getHttpServer()).get(`/api/documents/${doc.id}`).set('Authorization', 'Bearer integration-user').expect(403);
    await prisma.registration.update({where: {id: created.body.registrationId}, data: {status: 'APPROVED'}});
    const allowed = await request(app.getHttpServer()).get(`/api/documents/${doc.id}`).set('Authorization', 'Bearer integration-user').expect(200);
    expect(allowed.body.expiresIn).toBe(60);
    expect(allowed.headers['cache-control']).toContain('no-store');
    expect(await prisma.auditEvent.count({where: {action: 'DOCUMENT_ACCESS', actorId: ordinary.id}})).toBe(1);
    await request(app.getHttpServer()).post(`/api/admin/registrations/${created.body.registrationId}`).set('Authorization', 'Bearer integration-admin').send({action: 'approve'}).expect(404);
  });

  it('compensates uncertain S3 writes and retains a durable cleanup manifest while deletion is unavailable', async () => {
    storage.failPutAt = 2;
    storage.failRemove = true;
    await submit('companies', company(), ['companyLogo', 'adminPhoto'], true).expect(503);
    expect(await prisma.registration.count()).toBe(0);
    expect(await prisma.document.count()).toBe(0);
    expect(await prisma.uploadBatch.count({where: {completedAt: null}})).toBe(1);
    expect(storage.objects.size).toBe(2);
    storage.failRemove = false;
    await prisma.uploadBatch.updateMany({data: {cleanupAfter: new Date(0)}});
    await app.get(DocumentsService).reconcile();
    expect(storage.objects.size).toBe(0);
    expect(await prisma.uploadBatch.count({where: {completedAt: null, cleanupStartedAt: {not: null}}})).toBe(1);
  });

  it('rolls back PostgreSQL inserts and removes uploaded objects when final database write fails', async () => {
    await prisma.$executeRawUnsafe('CREATE OR REPLACE FUNCTION integration_reject_registration() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION \'forced registration write failure\'; END; $$');
    await prisma.$executeRawUnsafe('CREATE TRIGGER integration_reject_registration BEFORE INSERT ON "Registration" FOR EACH ROW EXECUTE FUNCTION integration_reject_registration()');
    try {
      const result = await submit('patients', patient(), ['idProof']);
      expect(result.status).toBeGreaterThanOrEqual(500);
      expect(await prisma.registration.count()).toBe(0);
      expect(await prisma.patientRegistration.count()).toBe(0);
      expect(await prisma.document.count()).toBe(0);
      expect(await prisma.uploadBatch.count({where: {completedAt: null, cleanupStartedAt: {not: null}}})).toBe(1);
      expect(storage.objects.size).toBe(0);
      expect(JSON.stringify(result.body)).not.toContain('forced registration');
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER integration_reject_registration ON "Registration"');
      await prisma.$executeRawUnsafe('DROP FUNCTION integration_reject_registration()');
    }
  });

  it('cannot finalize a registration after its expired upload manifest has been reconciled', async () => {
    const documents = app.get(DocumentsService);
    const stageUploads = documents.stageUploads.bind(documents);
    const stage = jest.spyOn(documents, 'stageUploads').mockImplementationOnce(async (...args) => {
      const staged = await stageUploads(...args);
      await prisma.uploadBatch.update({where: {id: staged.batchId}, data: {cleanupAfter: new Date(0)}});
      await documents.reconcile();
      return staged;
    });
    try {
      await submit('patients', patient(), ['idProof']).expect(503);
      expect(await prisma.registration.count()).toBe(0);
      expect(await prisma.document.count()).toBe(0);
      expect(storage.objects.size).toBe(0);
    } finally {stage.mockRestore();}
  });

  it('compensates a late PUT completing after the cleanup scan without losing its durable intent', async () => {
    const documents = app.get(DocumentsService);
    const originalPut = storage.put.bind(storage);
    const put = jest.spyOn(storage, 'put').mockImplementationOnce(async (...args) => {
      await prisma.uploadBatch.updateMany({data: {cleanupAfter: new Date(0)}});
      await documents.reconcile();
      return originalPut(...args);
    });
    try {
      await submit('patients', patient(), ['idProof']).expect(503);
      expect(await prisma.registration.count()).toBe(0);
      expect(await prisma.document.count()).toBe(0);
      expect(storage.objects.size).toBe(0);
      expect(await prisma.uploadBatch.count({where: {completedAt: null, cleanupStartedAt: {not: null}}})).toBe(1);
    } finally {put.mockRestore();}
  });
});
