import 'reflect-metadata';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { TestCognito } from '../fixtures/cognito';
import { ForbiddenException, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ErpUser } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { AuthService } from '../../src/auth/auth.service';
import { PrismaService } from '../../src/database/prisma.service';
import { startTestDatabase } from './database';

describe('Admin management and shared registrations in PostgreSQL (Cognito transport and JWT verifier replaced only in tests)', () => {
  const cognito = new TestCognito();
  let database: Awaited<ReturnType<typeof startTestDatabase>>;
  let app: INestApplication;
  let prisma: PrismaService;
  let superAdmin: ErpUser, admin: ErpUser, patient: ErpUser;
  const headers = (user: ErpUser) => ({ Authorization: `Bearer ${user.cognitoSub}` });
  const create = (email = 'new-admin@example.test') => request(app.getHttpServer()).post('/api/super-admin/accounts').set(headers(superAdmin)).send({ name: 'New Administrator', email, state: 'ACTIVE', role: 'ADMIN', password: 'InitialPass123!' });
  beforeAll(async () => {
    jest.spyOn(CognitoIdentityProviderClient.prototype, 'send').mockImplementation(cognito.send);
    process.env.NODE_ENV = 'test';
    process.env.IDEMPOTENCY_SECRET = 'integration-only-secret-with-at-least-32-characters';
    process.env.COGNITO_USER_POOL_ID = 'ap-southeast-2_testpool';
    process.env.COGNITO_CLIENT_ID = 'testclient';
    database = await startTestDatabase();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerGuard).useValue({ canActivate: () => true })
      .overrideProvider(AuthService).useValue({ authenticate: async (token: string) => {
        const user = await prisma.erpUser.findUnique({ where: { cognitoSub: token } });
        if (!user) throw new UnauthorizedException();
        if (user.state !== 'ACTIVE') throw new ForbiddenException();
        return user;
      } }).compile();
    app = module.createNestApplication(); configureApp(app); await app.init(); prisma = app.get(PrismaService);
  });
  beforeEach(async () => {
    cognito.users.clear();
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "ErpUser", "Registration", "UploadBatch" CASCADE');
    superAdmin = await prisma.erpUser.create({ data: { username: 'super@example.test', displayName: 'Super Admin', cognitoSub: 'super-sub', role: 'SUPER_ADMIN', state: 'ACTIVE' } });
    admin = await prisma.erpUser.create({ data: { username: 'admin@example.test', displayName: 'Admin', cognitoSub: 'admin-sub', role: 'ADMIN', state: 'ACTIVE' } });
    patient = await prisma.erpUser.create({ data: { username: 'patient@example.test', displayName: 'Patient', cognitoSub: 'patient-sub', role: 'PATIENT', state: 'ACTIVE' } });
  });
  afterAll(async () => { await app?.close(); await database?.stop(); jest.restoreAllMocks(); });

  it('persists an ADMIN with creator, timestamps, no stored credentials and a linked identity reference', async () => {
    const result = await create('NEW-ADMIN@EXAMPLE.TEST').expect(201);
    const saved = await prisma.erpUser.findUniqueOrThrow({ where: { id: result.body.account.id } });
    expect(saved).toMatchObject({ username: 'new-admin@example.test', email: 'new-admin@example.test', displayName: 'New Administrator', role: 'ADMIN', state: 'ACTIVE', createdById: superAdmin.id, cognitoSub: expect.any(String) });
    expect(saved.createdAt).toBeInstanceOf(Date); expect(saved.updatedAt).toBeInstanceOf(Date);
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_name = 'ErpUser'`;
    expect(columns.map(row => row.column_name).join(' ')).not.toMatch(/password|secret|token|credential/i);
    expect(result.body.account.provisioningRequired).toBe(false);
    expect(result.body.account).not.toHaveProperty('cognitoSub');
    expect(await prisma.auditEvent.count({ where: { actorId: superAdmin.id, action: 'ADMIN_ACCOUNT_CREATED' } })).toBe(1);
    await request(app.getHttpServer()).get(`/api/super-admin/accounts/${saved.id}`).set(headers(superAdmin)).expect(200);
    const list = await request(app.getHttpServer()).get('/api/super-admin/accounts?page=1&pageSize=1').set(headers(superAdmin)).expect(200);
    expect(list.body.total).toBe(2); expect(list.body.items).toHaveLength(1);
    await request(app.getHttpServer()).patch(`/api/super-admin/accounts/${saved.id}/state`).set(headers(superAdmin)).send({ state: 'INACTIVE' }).expect(200);
    expect((await prisma.erpUser.findUniqueOrThrow({ where: { id: saved.id } })).state).toBe('INACTIVE');
  });

  it('rejects case-insensitive username/email collisions and concurrent creates with database uniqueness', async () => {
    await create('ADMIN@EXAMPLE.TEST').expect(409); // Existing legacy username, no email.
    const results = await Promise.all([create(), create('NEW-ADMIN@EXAMPLE.TEST')]);
    expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    const existing = await prisma.erpUser.findUniqueOrThrow({ where: { username: 'new-admin@example.test' } });
    await prisma.erpUser.update({ where: { id: existing.id }, data: { username: 'different-username' } });
    await create('NEW-ADMIN@EXAMPLE.TEST').expect(409); // Email alone still conflicts.
    await expect(prisma.erpUser.create({ data: { username: 'ADMIN@EXAMPLE.TEST', displayName: 'Collision', role: 'ADMIN' } })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('denies unauthorized account creation/read/state changes and rejects credentials or role escalation', async () => {
    await request(app.getHttpServer()).post('/api/super-admin/accounts').send({ name: 'X', email: 'x@example.test' }).expect(401);
    for (const user of [admin, patient]) {
      await request(app.getHttpServer()).post('/api/super-admin/accounts').set(headers(user)).send({ name: 'New Admin', email: 'x@example.test' }).expect(403);
      await request(app.getHttpServer()).get('/api/super-admin/accounts').set(headers(user)).expect(403);
      await request(app.getHttpServer()).get(`/api/super-admin/accounts/${admin.id}`).set(headers(user)).expect(403);
      await request(app.getHttpServer()).patch(`/api/super-admin/accounts/${admin.id}/state`).set(headers(user)).send({ state: 'ACTIVE' }).expect(403);
    }
    for (const extra of [{ password: 'ShouldNeverPersist123!' }, { role: 'SUPER_ADMIN' }, { createdById: admin.id }]) {
      await request(app.getHttpServer()).post('/api/super-admin/accounts').set(headers(superAdmin)).send({ name: 'New Admin', email: 'x@example.test', ...extra }).expect(400);
    }
    expect(await prisma.erpUser.count()).toBe(3);
  });

  it('keeps provider failures inactive, retries the same account and refuses foreign identities', async () => {
    cognito.failNext = 'AdminSetUserPasswordCommand';
    await create('retry@example.test').expect(503);
    const saved = await prisma.erpUser.findUniqueOrThrow({where: {username: 'retry@example.test'}});
    expect(saved.state).toBe('INACTIVE');
    await create('retry@example.test').expect(409);
    await request(app.getHttpServer()).post('/api/super-admin/accounts/'+saved.id+'/password').set(headers(superAdmin)).send({password:'InitialPass123!'}).expect(201);
    await request(app.getHttpServer()).patch('/api/super-admin/accounts/'+saved.id+'/state').set(headers(superAdmin)).send({state:'ACTIVE'}).expect(200);
    expect(cognito.users.get('retry@example.test')?.enabled).toBe(true);
    cognito.seed('foreign@example.test', 'foreign-sub', 'ForeignPass123!');
    await create('foreign@example.test').expect(409);
    expect(cognito.users.get('foreign@example.test')?.password).toBe('ForeignPass123!');
  });
  async function seedRegistrations() {
    for (const kind of ['customer', 'company', 'patient'] as const) {
      for (const [index, status] of (['PENDING', 'APPROVED', 'REJECTED'] as const).entries()) {
        const id = `${kind}-${status}`;
        await prisma.registration.create({ data: { id, kind, status, mobile: `987654321${index}`, submittedAt: new Date('2026-10-23T12:00:00Z'), requestHash: 'fixture',
          ...(kind === 'patient' ? { patient: { create: { patientName: 'Test Patient', address: 'Test Address', paymentMethod: 'UPI' } } } : kind === 'company' ? { company: { create: { companyName: 'Test Company', division: 'Medical', headquarter: 'Bengaluru', adminFullName: 'Company Admin' } } } : { customer: { create: { customerName: 'Test Customer', businessName: 'Pharmacy', customerType: 'Retail', dlNumber1: 'DL1', dlNumber2: 'DL2', gstNumber: `GST${index}`, creditDays: '0', paymentMethod: 'UPI' } } }) } });
      }
    }
  }
  it('shares all types, filters, counts, details and analytics across both dashboard roles', async () => {
    await seedRegistrations();
    for (const kind of ['customer', 'company', 'patient']) {
      const responses = [];
      for (const user of [superAdmin, admin]) {
        const result = await request(app.getHttpServer()).get(`/api/admin/registrations?kind=${kind}`).set(headers(user)).expect(200);
        responses.push(result.body); expect(result.body.total).toBe(3);
        const summary = await request(app.getHttpServer()).get(`/api/admin/registrations/summary?kind=${kind}`).set(headers(user)).expect(200);
        expect(summary.body).toEqual({ pending: 1, approved: 1, rejected: 1 });
        const pending = await request(app.getHttpServer()).get(`/api/admin/registrations?kind=${kind}&status=PENDING`).set(headers(user)).expect(200);
        expect(pending.body.items.map((item: { id: string }) => item.id)).toEqual([`${kind}-PENDING`]);
        await request(app.getHttpServer()).get(`/api/admin/registrations/${kind}-PENDING`).set(headers(user)).expect(200);
      }
      expect(responses[0]).toEqual(responses[1]);
    }
    const path = '/api/admin/registrations/analytics?period=custom&start=2026-10-23&end=2026-10-23';
    const analytics = await request(app.getHttpServer()).get(path).set(headers(admin)).expect(200);
    expect(analytics.body.kpis.total).toEqual({ value: 9, change: 100 });
    expect(analytics.body.statusShare).toEqual({ pending_verification: 3, approved: 3, rejected: 3 });
    expect(analytics.body.categoryShare).toEqual({ customer: 3, company: 3, patient: 3 });
    expect(analytics.body.trend).toEqual([{ date: '2026-10-23', count: 9 }]);
    expect((await request(app.getHttpServer()).get(path).set(headers(superAdmin)).expect(200)).body).toEqual(analytics.body);
    expect(await prisma.registration.count()).toBe(9);
    for (const endpoint of [path, '/api/admin/registrations?kind=patient', '/api/admin/registrations/summary?kind=patient', '/api/admin/registrations/patient-PENDING']) {
      await request(app.getHttpServer()).get(endpoint).expect(401);
      await request(app.getHttpServer()).get(endpoint).set(headers(patient)).expect(403);
    }
    await request(app.getHttpServer()).get('/api/admin/registrations/analytics?period=custom&start=2026-02-30&end=2026-03-01').set(headers(admin)).expect(400);
  });

  it('records decisions atomically, rejects conflicting reviews and immediately updates shared status counts', async () => {
    await seedRegistrations();
    const path = '/api/admin/registrations/patient-PENDING/decision';
    await request(app.getHttpServer()).post(path).send({ action: 'approve' }).expect(401);
    await request(app.getHttpServer()).post(path).set(headers(patient)).send({ action: 'approve' }).expect(403);
    await request(app.getHttpServer()).post(path).set(headers(admin)).send({ action: 'reject', reason: 'short' }).expect(400);
    const decisions = await Promise.all([
      request(app.getHttpServer()).post(path).set(headers(admin)).send({ action: 'approve' }),
      request(app.getHttpServer()).post(path).set(headers(superAdmin)).send({ action: 'reject', reason: 'Documents require correction' }),
    ]);
    expect(decisions.map(r => r.status).sort()).toEqual([201, 409]);
    const saved = await prisma.registration.findUniqueOrThrow({ where: { id: 'patient-PENDING' } });
    expect(saved.decidedById).toBe(saved.status === 'APPROVED' ? admin.id : superAdmin.id);
    expect(await prisma.auditEvent.count({ where: { registrationId: saved.id } })).toBe(1);
    for (const user of [superAdmin, admin]) {
      const summary = await request(app.getHttpServer()).get('/api/admin/registrations/summary?kind=patient').set(headers(user)).expect(200);
      expect(summary.body).toEqual({ pending: 0, approved: saved.status === 'APPROVED' ? 2 : 1, rejected: saved.status === 'REJECTED' ? 2 : 1 });
    }
    await request(app.getHttpServer()).post('/api/admin/registrations/missing/decision').set(headers(admin)).send({ action: 'approve' }).expect(404);
    expect(await prisma.erpUser.count()).toBe(3);
    expect(await prisma.registration.count()).toBe(9);
  });
});
