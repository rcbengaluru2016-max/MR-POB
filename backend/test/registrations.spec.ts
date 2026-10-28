import 'reflect-metadata';
import { ConflictException, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, RegistrationKind } from '@prisma/client';
import request from 'supertest';
import { AdminRegistrationsController, RegistrationsController } from '../src/registrations/registrations.controller';
import { RegistrationsService } from '../src/registrations/registrations.service';
import { AnalyticsService } from '../src/registrations/analytics.service';
import { PrismaService } from '../src/database/prisma.service';
import { DocumentsService } from '../src/documents/documents.service';
import { ConfigService } from '../src/config/config.service';
import { AuthService } from '../src/auth/auth.service';
import { RegistrationInput } from '../src/registrations/registration.dto';
import { companyInput, customerInput, patientInput } from './fixtures/registration-inputs';

describe('registration submission HTTP validation', () => {
  let app: INestApplication;
  const submit = jest.fn().mockResolvedValue({ registrationId: 'REG-PAT-unit', status: 'PENDING' });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [RegistrationsController], providers: [{ provide: RegistrationsService, useValue: { submit } }] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  const send = (type: string, input: Record<string, unknown>) => {
    let call = request(app.getHttpServer()).post(`/api/registrations/${type}`);
    for (const [key, value] of Object.entries(input)) if (value !== undefined) call = call.field(key, String(value));
    return call;
  };

  it.each([
    ['customers', 'customer', customerInput()], ['companies', 'company', companyInput()], ['patients', 'patient', patientInput()],
  ])('accepts valid %s scalar fields and dispatches the correct kind', async (path, kind, input) => {
    await send(String(path), input as unknown as Record<string, unknown>).expect(201).expect({ registrationId: 'REG-PAT-unit', status: 'PENDING' });
    expect(submit).toHaveBeenLastCalledWith(kind, expect.objectContaining({ termsAccepted: true }), [], undefined);
  });

  it.each([
    ['invalid mobile', { mobile: '12345' }], ['missing name', { patientName: '' }],
    ['invalid optional email', { email: 'invalid' }], ['unaccepted terms', { termsAccepted: false }],
    ['weak password', { password: 'short', confirmPassword: 'short' }], ['different confirmation', { confirmPassword: 'Different123' }],
    ['unknown role', { role: 'SUPER_ADMIN' }], ['invalid payment method', { paymentMethod: 'Cash' }],
    ['oversize address', { address: 'x'.repeat(2001) }],
  ])('rejects %s before persistence', async (_label, invalid) => {
    await send('patients', { ...patientInput(), ...invalid }).expect(400);
    expect(submit).not.toHaveBeenCalled();
  });

  it('rejects invalid customer enum and missing drug licence number', async () => {
    await send('customers', { ...customerInput(), customerType: 'Wholesale', dlNumber2: '' }).expect(400);
    expect(submit).not.toHaveBeenCalled();
  });

  it('preserves a supplied idempotency key', async () => {
    const call = send('patients', patientInput() as unknown as Record<string, unknown>);
    await call.set('Idempotency-Key', 'test-idempotency-key-123').expect(201);
    expect(submit).toHaveBeenLastCalledWith('patient', expect.anything(), [], 'test-idempotency-key-123');
  });

  it.each([['patients', patientInput()], ['customers', customerInput()]])('accepts the current password-free %s form', async (path, input) => {
    const { password, confirmPassword, ...fields } = input;
    await send(path, fields).expect(201);
  });

  it('rejects a supplied password without its confirmation', async () => {
    const { confirmPassword, ...fields } = patientInput();
    await send('patients', fields).expect(400);
  });

  it('rejects a file above 5 MiB before dispatching registration storage', async () => {
    await send('patients', patientInput() as unknown as Record<string, unknown>)
      .attach('idProof', Buffer.alloc(5 * 1024 * 1024 + 1), { filename: 'oversize.pdf', contentType: 'application/pdf' })
      .expect(413);
    expect(submit).not.toHaveBeenCalled();
  });
});

describe('administrative registration routes', () => {
  let app: INestApplication;
  const registrations = { list: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 }), summary: jest.fn().mockResolvedValue({ pending: 3, approved: 2, rejected: 1 }), detail: jest.fn().mockResolvedValue({ record: { id: 'REG-PAT-example', readOnly: false } }) };
  const authenticate = jest.fn();
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [AdminRegistrationsController], providers: [{ provide: RegistrationsService, useValue: registrations }, { provide: AnalyticsService, useValue: { dashboard: jest.fn() } }, { provide: AuthService, useValue: { authenticate } }] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  beforeEach(() => { authenticate.mockResolvedValue({ id: 'admin', role: 'ADMIN', state: 'ACTIVE' }); });
  afterAll(async () => { await app.close(); });

  it.each(['/api/admin/registrations?kind=customer', '/api/admin/registrations/summary?kind=customer', '/api/admin/registrations/REG-PAT-example'])('rejects public reads of %s', async path => {
    await request(app.getHttpServer()).get(path).expect(401);
  });

  it('rejects invalid tokens and an authenticated public ERP role', async () => {
    authenticate.mockRejectedValueOnce(new UnauthorizedException('Invalid token'));
    await request(app.getHttpServer()).get('/api/admin/registrations?kind=customer').set('Authorization', 'Bearer invalid').expect(401);
    authenticate.mockResolvedValueOnce({ id: 'patient', role: 'PATIENT', state: 'ACTIVE' });
    await request(app.getHttpServer()).get('/api/admin/registrations?kind=customer').set('Authorization', 'Bearer patient-token').expect(403);
  });

  it.each(['kind=unknown', 'kind=customer&status=accepted', 'kind=customer&page=0', 'kind=customer&pageSize=101', 'kind=customer&unexpected=x', 'status=PENDING'])('rejects invalid query %s', async query => {
    await request(app.getHttpServer()).get(`/api/admin/registrations?${query}`).set('Authorization', 'Bearer admin-token').expect(400);
    expect(registrations.list).not.toHaveBeenCalled();
  });

  it('passes normalized pagination and status to the database service', async () => {
    await request(app.getHttpServer()).get('/api/admin/registrations?kind=company&status=PENDING&page=2&pageSize=10').set('Authorization', 'Bearer admin-token').expect(200);
    expect(registrations.list).toHaveBeenCalledWith(expect.objectContaining({ kind: 'company', status: 'PENDING', page: 2, pageSize: 10 }));
  });

  it('routes summary before dynamic registration IDs', async () => {
    await request(app.getHttpServer()).get('/api/admin/registrations/summary?kind=patient').set('Authorization', 'Bearer admin-token').expect(200).expect({ pending: 3, approved: 2, rejected: 1 });
    expect(registrations.summary).toHaveBeenCalledWith('patient');
    expect(registrations.detail).not.toHaveBeenCalled();
  });

  it('provides details and rejects the unsupported direct POST path', async () => {
    await request(app.getHttpServer()).get('/api/admin/registrations/REG-PAT-example').set('Authorization', 'Bearer admin-token').expect(200).expect({ record: { id: 'REG-PAT-example', readOnly: false } });
    await request(app.getHttpServer()).post('/api/admin/registrations/REG-PAT-example').set('Authorization', 'Bearer admin-token').send({ action: 'approve' }).expect(404);
  });
});

describe('RegistrationsService persistence and reliability', () => {
  let service: RegistrationsService;
  let prisma: any;
  let documents: any;
  let tx: any;
  const submittedAt = new Date('2026-10-22T00:00:00Z');
  beforeEach(() => {
    tx = { registration: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...data, submittedAt })) }, uploadBatch: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    prisma = {
      registration: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null), groupBy: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      customerRegistration: { findUnique: jest.fn().mockResolvedValue(null) },
      $queryRaw: jest.fn().mockResolvedValue([{ serial: 1n }]),
      $transaction: jest.fn().mockImplementation((callback: any) => typeof callback === 'function' ? callback(tx) : Promise.all(callback)),
    };
    documents = {
      validateFiles: jest.fn().mockResolvedValue([]),
      stageUploads: jest.fn().mockResolvedValue({ batchId: 'batch-123', documents: [] }),
      cleanupBatch: jest.fn().mockResolvedValue(undefined),
    };
    service = new RegistrationsService(prisma as PrismaService, documents as DocumentsService, { get: () => 'unit-only-idempotency-secret-123456789' } as unknown as ConfigService);
  });

  it.each<[RegistrationKind, RegistrationInput, string]>([
    ['customer', customerInput(), 'customer'], ['company', companyInput(), 'company'], ['patient', patientInput(), 'patient'],
  ])('stores %s details in the matching separate table with PENDING status', async (kind, input, relation) => {
    const result = await service.submit(kind as RegistrationKind, input, []);
    expect(result.status).toBe('PENDING');
    const data = tx.registration.create.mock.calls[0][0].data;
    expect(data[relation]).toEqual({ create: expect.any(Object) });
    for (const other of ['customer', 'company', 'patient'].filter(value => value !== relation)) expect(data[other]).toBeUndefined();
    expect(data.audits.create.action).toBe('REGISTRATION_SUBMITTED');
    expect(JSON.stringify(data)).not.toContain('Registration123');
    expect(data.password).toBeUndefined();
    expect(data.confirmPassword).toBeUndefined();
    expect(tx.uploadBatch.updateMany).toHaveBeenCalledWith({ where: { id: 'batch-123', completedAt: null, cleanupStartedAt: null }, data: { completedAt: expect.any(Date) } });
  });

  it('normalizes contacts and customer GST before uniqueness and writes', async () => {
    await service.submit('customer', customerInput({ email: 'OWNER@Example.Test', gstNumber: 'gst-example' }), []);
    const data = tx.registration.create.mock.calls[0][0].data;
    expect(data.email).toBe('owner@example.test');
    expect(data.customer.create.gstNumber).toBe('GST-EXAMPLE');
    expect(data.customer.create.address.create.pinCode).toBe('560001');
  });

  it.each<[RegistrationKind, RegistrationInput, string]>([
    ['customer', customerInput(), 'REG-CUS-ZI0001'],
    ['company', companyInput(), 'REG-COM-ZI0001'],
    ['patient', patientInput(), 'REG-PAT-ZI0001'],
  ])('allocates the database serial with the correct %s registration prefix', async (kind, input, expected) => {
    const result = await service.submit(kind, input, []);
    expect(result.registrationId).toBe(expected);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.registration.create.mock.calls[0][0].data.id).toBe(expected);
    expect(documents.stageUploads).toHaveBeenCalledWith(kind, expected, expect.any(Array));
  });

  it('does not truncate registration serials after 9999', async () => {
    prisma.$queryRaw.mockResolvedValue([{ serial: 10000n }]);
    expect((await service.submit('patient', patientInput(), [])).registrationId).toBe('REG-PAT-ZI10000');
  });

  it('stores only document metadata returned by the storage layer', async () => {
    const metadata = { id: 'doc', slot: 'idProof', originalName: 'proof.pdf', objectKey: 'registration/patient/id/doc.pdf', contentType: 'application/pdf', size: 100, sha256: 'a'.repeat(64), versionId: 'version' };
    documents.stageUploads.mockResolvedValue({ batchId: 'batch-123', documents: [metadata] });
    await service.submit('patient', patientInput(), []);
    expect(tx.registration.create.mock.calls[0][0].data.documents.create).toEqual([metadata]);
  });

  it('does not upload a known duplicate contact or GST', async () => {
    prisma.registration.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(service.submit('patient', patientInput(), [])).rejects.toBeInstanceOf(ConflictException);
    expect(documents.stageUploads).not.toHaveBeenCalled();
    prisma.registration.findFirst.mockResolvedValue(null);
    prisma.customerRegistration.findUnique.mockResolvedValue({ registrationId: 'existing' });
    await expect(service.submit('customer', customerInput(), [])).rejects.toBeInstanceOf(ConflictException);
    expect(documents.stageUploads).not.toHaveBeenCalled();
  });

  it('replays a matching idempotency key without uploading again', async () => {
    const first = await service.submit('patient', patientInput(), [], 'request-key-12345678');
    const stored = tx.registration.create.mock.calls[0][0].data;
    prisma.registration.findUnique.mockResolvedValue(stored);
    const second = await service.submit('patient', patientInput(), [], 'request-key-12345678');
    expect(second).toEqual(first);
    expect(documents.stageUploads).toHaveBeenCalledTimes(1);
  });

  it('rejects idempotency key reuse for different data', async () => {
    await service.submit('patient', patientInput(), [], 'request-key-12345678');
    const stored = tx.registration.create.mock.calls[0][0].data;
    prisma.registration.findUnique.mockResolvedValue(stored);
    await expect(service.submit('patient', patientInput({ patientName: 'Changed Name' }), [], 'request-key-12345678')).rejects.toBeInstanceOf(ConflictException);
    expect(documents.stageUploads).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed idempotency keys before document work', async () => {
    await expect(service.submit('patient', patientInput(), [], 'short')).rejects.toThrow('Idempotency-Key');
    expect(documents.validateFiles).not.toHaveBeenCalled();
  });

  it('compensates uploaded files for a database transaction failure', async () => {
    const failure = new Error('database disconnected');
    prisma.$transaction.mockRejectedValue(failure);
    await expect(service.submit('patient', patientInput(), [])).rejects.toBe(failure);
    expect(documents.cleanupBatch).toHaveBeenCalledWith('batch-123');
  });

  it('does not create registration records after the cleanup worker has claimed the upload', async () => {
    tx.uploadBatch.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.submit('patient', patientInput(), [])).rejects.toThrow('Upload attempt expired');
    expect(tx.registration.create).not.toHaveBeenCalled();
    expect(documents.cleanupBatch).toHaveBeenCalledWith('batch-123');
  });

  it('preserves database failure even when immediate compensation needs worker retry', async () => {
    prisma.$transaction.mockRejectedValue(new Error('database disconnected'));
    documents.cleanupBatch.mockRejectedValue(new Error('S3 unavailable'));
    await expect(service.submit('patient', patientInput(), [])).rejects.toThrow('database disconnected');
  });

  it('maps concurrent uniqueness constraint failures to conflict and cleans up', async () => {
    prisma.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('unique conflict', { code: 'P2002', clientVersion: '6.19' }));
    await expect(service.submit('patient', patientInput(), [])).rejects.toBeInstanceOf(ConflictException);
    expect(documents.cleanupBatch).toHaveBeenCalledWith('batch-123');
  });

  it('does not attempt database persistence if uploads fail', async () => {
    documents.stageUploads.mockRejectedValue(new Error('S3 upload failed'));
    await expect(service.submit('patient', patientInput(), [])).rejects.toThrow('S3 upload failed');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns actual group counts and zeros absent statuses', async () => {
    prisma.registration.groupBy.mockResolvedValue([{ status: 'PENDING', _count: { _all: 4 } }, { status: 'APPROVED', _count: { _all: 2 } }]);
    expect(await service.summary('company')).toEqual({ pending: 4, approved: 2, rejected: 0 });
    expect(prisma.registration.groupBy).toHaveBeenCalledWith({ by: ['status'], where: { kind: 'company' }, _count: { _all: true } });
  });

  it('scopes paginated lists by type/status and returns dashboard columns', async () => {
    prisma.registration.findMany.mockResolvedValue([{ id: 'REG-COM-1', kind: 'company', status: 'PENDING', submittedAt, mobile: '9876543211', company: { companyName: 'Example Pharma' }, notifications: [] }]);
    prisma.registration.count.mockResolvedValue(30);
    const response = await service.list({ kind: 'company', status: 'PENDING', page: 2, pageSize: 25 });
    expect(response.total).toBe(30);
    expect(response.items[0]).toMatchObject({ name: 'Example Pharma', businessType: 'Example Pharma' });
    expect(prisma.registration.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { kind: 'company', status: 'PENDING' }, skip: 25, take: 25 }));
  });

  it('returns typed details and safe file metadata without internal security fields', async () => {
    prisma.registration.findUnique.mockResolvedValue({ id: 'REG-PAT-1', kind: 'patient', status: 'PENDING', submittedAt, mobile: '9876543212', email: 'patient@example.test', requestHash: 'secret-hash', idempotencyKey: 'secret-key', passwordHash: 'secret-password-hash', ownerId: 'owner', notifications: [], patient: { registrationId: 'REG-PAT-1', patientName: 'Patient Example', address: 'Example address', paymentMethod: 'UPI' }, documents: [{ id: 'doc', slot: 'idProof', originalName: 'proof.pdf', contentType: 'application/pdf', size: 100, objectKey: 'private-key', sha256: 'sha' }] });
    const result = await service.detail('REG-PAT-1');
    expect(result.record).toMatchObject({ patientName: 'Patient Example', readOnly: false, files: { idProof: { id: 'doc', name: 'proof.pdf', accessPath: '/api/documents/doc' } } });
    expect(JSON.stringify(result)).not.toMatch(/secret-hash|secret-key|private-key|ownerId|secret-password-hash/);
  });

  it('returns 404 for an absent registration', async () => { await expect(service.detail('missing')).rejects.toThrow('Registration not found'); });
});
