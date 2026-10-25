import 'reflect-metadata';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ErpUser, RegistrationKind } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { PrismaService } from '../../src/database/prisma.service';
import { AuthService } from '../../src/auth/auth.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { NotificationWorker } from '../../src/notifications/notification-worker.service';
import { NotificationQueue } from '../../src/notifications/sqs.service';
import { AtoZWhatsAppProvider, MockWhatsAppProvider, ProviderFailure, WhatsAppProvider } from '../../src/notifications/whatsapp.provider';
import { startTestDatabase } from './database';

describe('PostgreSQL registration decisions and durable WhatsApp delivery (mock transport)', () => {
  let database: Awaited<ReturnType<typeof startTestDatabase>>;
  let app: INestApplication;
  let prisma: PrismaService;
  let notifications: NotificationsService;
  let worker: NotificationWorker;
  let admin: ErpUser, superAdmin: ErpUser, patient: ErpUser;
  const queue = { publish: jest.fn(), deadLetter: jest.fn(), receive: jest.fn(), acknowledge: jest.fn() };
  const header = (user: ErpUser) => ({ Authorization: `Bearer ${user.id}` });
  const path = (id: string) => `/api/admin/registrations/${id}/decision`;
  const seed = async (kind: RegistrationKind = 'patient', status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING', mobile = '9876543210') => {
    const id = `${kind}-${mobile}`;
    return prisma.registration.create({ data: { id, kind, status, mobile, requestHash: 'fixture',
      ...(kind === 'customer' ? { customer: { create: { customerName: 'Customer', businessName: 'Pharmacy', customerType: 'Retail', dlNumber1: 'DL1', dlNumber2: 'DL2', gstNumber: `GST-${mobile}`, creditDays: '0', paymentMethod: 'UPI' } } } : kind === 'company' ? { company: { create: { companyName: 'Company', division: 'Medical', headquarter: 'Bengaluru', adminFullName: 'Company Admin' } } } : { patient: { create: { patientName: 'Patient', address: 'Bengaluru', paymentMethod: 'UPI' } } }),
    } });
  };
  const approve = async () => {
    const registration = await seed();
    await request(app.getHttpServer()).post(path(registration.id)).set(header(admin)).send({ action: 'approve' }).expect(201);
    return prisma.registrationNotification.findFirstOrThrow({ where: { registrationId: registration.id } });
  };
  const makeDue = (id: string) => prisma.registrationNotification.update({ where: { id }, data: { nextAttemptAt: new Date(0), enqueueAfter: new Date(0) } });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.IDEMPOTENCY_SECRET = 'integration-notifications-only-secret-32-characters';
    process.env.COGNITO_USER_POOL_ID = 'ap-southeast-2_testpool'; process.env.COGNITO_CLIENT_ID = 'testclient';
    process.env.AWS_REGION = 'ap-southeast-2'; process.env.S3_BUCKET = 'zenex-international-mrpob-files';
    process.env.NOTIFICATION_WORKER_ENABLED = 'false';
    database = await startTestDatabase();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerGuard).useValue({ canActivate: () => true })
      .overrideProvider(NotificationQueue).useValue(queue)
      .overrideProvider(AuthService).useValue({ authenticate: async (token: string) => {
        const user = /^[a-f0-9-]{36}$/.test(token) ? await prisma.erpUser.findUnique({ where: { id: token } }) : null;
        if (!user) throw new UnauthorizedException();
        return user;
      } }).compile();
    app = module.createNestApplication(); configureApp(app); await app.init();
    prisma = app.get(PrismaService); notifications = app.get(NotificationsService); worker = app.get(NotificationWorker);
  });
  beforeEach(async () => {
    jest.restoreAllMocks();
    queue.publish.mockReset().mockResolvedValue({}); queue.deadLetter.mockReset().mockResolvedValue({}); queue.receive.mockReset().mockResolvedValue([]); queue.acknowledge.mockReset().mockResolvedValue({});
    process.env.WHATSAPP_PROVIDER = 'mock'; process.env.WHATSAPP_LIVE_ENABLED = 'false';
    process.env.WHATSAPP_REJECTIONS_ENABLED = 'false'; process.env.WHATSAPP_TEMPLATES_APPROVED = 'false';
    await prisma.$executeRawUnsafe('TRUNCATE "ErpUser", "Registration", "AuditEvent", "UploadBatch" CASCADE');
    admin = await prisma.erpUser.create({ data: { username: 'admin', displayName: 'Admin', role: 'ADMIN', state: 'ACTIVE' } });
    superAdmin = await prisma.erpUser.create({ data: { username: 'super', displayName: 'Super', role: 'SUPER_ADMIN', state: 'ACTIVE' } });
    patient = await prisma.erpUser.create({ data: { username: 'patient', displayName: 'Patient', role: 'PATIENT', state: 'ACTIVE' } });
  });
  afterAll(async () => { await app?.close(); await database?.stop(); });

  it.each(['customer', 'company', 'patient'] as const)('approves %s for either admin role using original profiles, correct recipient and mock template', async kind => {
    const registration = await seed(kind);
    const user = kind === 'company' ? superAdmin : admin;
    const result = await request(app.getHttpServer()).post(path(registration.id)).set(header(user)).send({ action: 'approve' }).expect(201);
    expect(result.body).toMatchObject({ status: 'APPROVED', activationPending: true });
    expect(await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } })).toMatchObject({ status: 'APPROVED', decidedById: user.id, decidedAt: expect.any(Date) });
    for (const reviewer of [admin, superAdmin]) {
      const list = await request(app.getHttpServer()).get(`/api/admin/registrations/approved?kind=${kind}&status=PENDING`).set(header(reviewer)).expect(200);
      expect(list.body.items.map((item: { id: string }) => item.id)).toEqual([registration.id]);
      expect((await request(app.getHttpServer()).get(`/api/admin/registrations/summary?kind=${kind}`).set(header(reviewer)).expect(200)).body).toEqual({ pending: 0, approved: 1, rejected: 0 });
      const detail = await request(app.getHttpServer()).get(`/api/admin/registrations/${registration.id}`).set(header(reviewer)).expect(200);
      expect(detail.body.record.decidedById).toBe(user.id);
    }
    const event = await prisma.registrationNotification.findFirstOrThrow();
    expect(event).toMatchObject({ event: 'APPROVED', kind, recipient: '+919876543210', templateKey: `registration.${kind}.approved`, status: 'PENDING' });
    await notifications.process(event.id);
    const saved = await prisma.registrationNotification.findUniqueOrThrow({ where: { id: event.id } });
    expect(saved).toMatchObject({ status: 'MOCKED', templateId: `mock:registration.${kind}.approved`, attempts: 1 });
    expect(await prisma.registration.count()).toBe(1);
    expect(await prisma.erpUser.count()).toBe(3);
    const counts = await Promise.all([prisma.customerRegistration.count(), prisma.companyRegistration.count(), prisma.patientRegistration.count()]);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(1);
  });

  it('rejects with audit/reason, excludes rejected and pending records, and blocks rejection delivery by default', async () => {
    const registration = await seed(); await seed('patient', 'PENDING', '9876543211');
    await request(app.getHttpServer()).post(path(registration.id)).set(header(superAdmin)).send({ action: 'reject', reason: 'Documents need correction' }).expect(201);
    expect(await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } })).toMatchObject({ status: 'REJECTED', rejectionReason: 'Documents need correction', decidedById: superAdmin.id, decidedAt: expect.any(Date) });
    const event = await prisma.registrationNotification.findFirstOrThrow();
    expect(JSON.stringify(event.payload)).not.toContain('Documents need correction');
    await notifications.process(event.id);
    expect(await prisma.registrationNotification.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({ status: 'BLOCKED', lastError: 'REJECTION_NOTIFICATIONS_DISABLED' });
    const list = await request(app.getHttpServer()).get('/api/admin/registrations/approved?kind=patient').set(header(admin)).expect(200);
    expect(list.body.total).toBe(0);
    expect(await prisma.auditEvent.findFirstOrThrow()).toMatchObject({ action: 'REGISTRATION_REJECTED', actorId: superAdmin.id });
  });

  it('denies public, ordinary and inactive decision makers and rejects supplied recipients/statuses', async () => {
    const registration = await seed();
    await request(app.getHttpServer()).post(path(registration.id)).send({ action: 'approve' }).expect(401);
    await request(app.getHttpServer()).post(path(registration.id)).set(header(patient)).send({ action: 'approve' }).expect(403);
    for (const extra of [{ recipient: '+919999999999' }, { status: 'APPROVED' }, { decidedById: superAdmin.id }]) await request(app.getHttpServer()).post(path(registration.id)).set(header(admin)).send({ action: 'approve', ...extra }).expect(400);
    await prisma.erpUser.update({ where: { id: admin.id }, data: { state: 'INACTIVE' } });
    await request(app.getHttpServer()).post(path(registration.id)).set(header(admin)).send({ action: 'approve' }).expect(403);
    await request(app.getHttpServer()).get('/api/super-admin/accounts').set(header(patient)).expect(403);
    expect(await prisma.registrationNotification.count()).toBe(0);
  });

  it('serializes conflicting and repeated decisions into one audit and one notification', async () => {
    const registration = await seed();
    const results = await Promise.all([
      request(app.getHttpServer()).post(path(registration.id)).set(header(admin)).send({ action: 'approve' }),
      request(app.getHttpServer()).post(path(registration.id)).set(header(superAdmin)).send({ action: 'reject', reason: 'Documents need correction' }),
    ]);
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    await request(app.getHttpServer()).post(path(registration.id)).set(header(admin)).send({ action: 'approve' }).expect(409);
    expect(await prisma.auditEvent.count()).toBe(1); expect(await prisma.registrationNotification.count()).toBe(1);
    const saved = await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } });
    expect((await prisma.registrationNotification.findFirstOrThrow()).event).toBe(saved.status);
  });

  it('rolls status and audit back if outbox insertion fails', async () => {
    const registration = await seed();
    await prisma.$executeRawUnsafe(`CREATE FUNCTION reject_notification_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'induced outbox failure'; END; $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER reject_notification_test BEFORE INSERT ON "RegistrationNotification" FOR EACH ROW EXECUTE FUNCTION reject_notification_test()');
    try {
      await request(app.getHttpServer()).post(path(registration.id)).set(header(admin)).send({ action: 'approve' }).expect(500);
      expect(await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } })).toMatchObject({ status: 'PENDING', decidedAt: null, decidedById: null });
      expect(await prisma.auditEvent.count()).toBe(0); expect(await prisma.registrationNotification.count()).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER reject_notification_test ON "RegistrationNotification"');
      await prisma.$executeRawUnsafe('DROP FUNCTION reject_notification_test()');
    }
  });

  it('retains committed decisions during a queue outage and publishes after recovery without PII in SQS', async () => {
    const event = await approve(); queue.publish.mockRejectedValueOnce(new Error('offline'));
    await worker.dispatch();
    expect(await prisma.registrationNotification.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({ status: 'PENDING', lastError: 'QUEUE_PUBLISH_RETRY', publishAttempts: 1 });
    expect(await prisma.registration.findUniqueOrThrow({ where: { id: event.registrationId } })).toMatchObject({ status: 'APPROVED' });
    await makeDue(event.id); await worker.dispatch();
    expect(queue.publish).toHaveBeenLastCalledWith(event.id);
    queue.receive.mockResolvedValueOnce([{ Body: JSON.stringify({ notificationId: event.id, recipient: '+919999999999' }), ReceiptHandle: 'receipt' }]);
    const spy = jest.spyOn(app.get(WhatsAppProvider), 'send');
    await worker.tick();
    expect(spy.mock.calls[0][0].recipient).toBe('+919876543210');
    expect(queue.acknowledge).toHaveBeenCalledWith('receipt');
  });

  it('retries only definite non-acceptance with backoff, deduplicates concurrent jobs and records attempts', async () => {
    const event = await approve();
    const send = jest.spyOn(app.get(WhatsAppProvider), 'send').mockRejectedValueOnce(new ProviderFailure('retry', 'RATE_LIMITED', 120));
    await notifications.process(event.id);
    const retry = await prisma.registrationNotification.findUniqueOrThrow({ where: { id: event.id } });
    expect(retry).toMatchObject({ status: 'RETRY', attempts: 1, lastError: 'RATE_LIMITED' });
    expect(retry.nextAttemptAt.getTime() - Date.now()).toBeGreaterThan(110_000);
    await notifications.process(event.id); expect(send).toHaveBeenCalledTimes(1);
    await makeDue(event.id);
    await Promise.all([notifications.process(event.id), notifications.process(event.id), notifications.process(event.id)]);
    await notifications.process(event.id);
    expect(send).toHaveBeenCalledTimes(2);
    expect(await prisma.notificationAttempt.findMany({ orderBy: { number: 'asc' } })).toMatchObject([{ number: 1, outcome: 'RETRY' }, { number: 2, outcome: 'MOCKED' }]);
    expect(send.mock.calls[0][0].idempotencyKey).toBe(send.mock.calls[1][0].idempotencyKey);
  });

  it('quarantines ambiguous sends and crashes without resending; exports failure IDs to DLQ', async () => {
    const event = await approve();
    const send = jest.spyOn(app.get(WhatsAppProvider), 'send').mockRejectedValue(new Error('socket reset after acceptance'));
    await notifications.process(event.id); await notifications.process(event.id);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await prisma.registrationNotification.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({ status: 'UNKNOWN', lastError: 'PROVIDER_RESPONSE_UNCERTAIN' });
    await worker.dispatch(); expect(queue.deadLetter).toHaveBeenCalledWith(event.id);
    await prisma.registrationNotification.update({ where: { id: event.id }, data: { status: 'PROCESSING', leaseUntil: new Date(0) } });
    await notifications.recoverExpired(); await notifications.process(event.id);
    expect(send).toHaveBeenCalledTimes(1);
    expect((await prisma.registrationNotification.findUniqueOrThrow({ where: { id: event.id } })).lastError).toBe('WORKER_LEASE_EXPIRED');
    const report = await request(app.getHttpServer()).get(`/api/admin/notifications/${event.id}`).set(header(admin)).expect(200);
    expect(report.body.notification.status).toBe('UNKNOWN');
    await request(app.getHttpServer()).get(`/api/admin/notifications/${event.id}`).set(header(patient)).expect(403);
  });

  it('stops after five safe failures, keeps approval intact and retries DLQ publication failures', async () => {
    const event = await approve();
    jest.spyOn(app.get(WhatsAppProvider), 'send').mockRejectedValue(new ProviderFailure('retry', 'TEMPORARILY_UNAVAILABLE'));
    for (let i = 0; i < 5; i++) { await makeDue(event.id); await notifications.process(event.id); }
    expect(await prisma.registrationNotification.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({ status: 'FAILED', attempts: 5 });
    queue.deadLetter.mockRejectedValueOnce(new Error('DLQ unavailable'));
    await worker.dispatch();
    expect((await prisma.registrationNotification.findUniqueOrThrow({ where: { id: event.id } })).deadLetteredAt).toBeNull();
    await makeDue(event.id); await worker.dispatch();
    expect((await prisma.registrationNotification.findUniqueOrThrow({ where: { id: event.id } })).deadLetteredAt).toBeInstanceOf(Date);
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: event.registrationId } })).status).toBe('APPROVED');
  });

  it('blocks live configuration with missing approvals/templates and never invokes the mock as a live fallback', async () => {
    const event = await approve();
    process.env.WHATSAPP_PROVIDER = 'atoz'; process.env.WHATSAPP_LIVE_ENABLED = 'true';
    const mock = jest.spyOn(app.get(MockWhatsAppProvider), 'send'); const atoz = jest.spyOn(app.get(AtoZWhatsAppProvider), 'send');
    await notifications.process(event.id);
    expect((await prisma.registrationNotification.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('BLOCKED');
    expect(mock).not.toHaveBeenCalled(); expect(atoz).not.toHaveBeenCalled();
    process.env.WHATSAPP_TEMPLATE_REGISTRATION_PATIENT_APPROVED = 'test-only-not-an-approved-id';
    process.env.WHATSAPP_TEMPLATES_APPROVED = 'true';
    try {
      await prisma.registrationNotification.update({ where: { id: event.id }, data: { status: 'PENDING', nextAttemptAt: new Date(0) } });
      await notifications.process(event.id);
      expect((await prisma.registrationNotification.findUniqueOrThrow({ where: { id: event.id } })).lastError).toBe('ATOZ_DOCUMENTATION_REQUIRED');
      expect(mock).not.toHaveBeenCalled();
    } finally { delete process.env.WHATSAPP_TEMPLATE_REGISTRATION_PATIENT_APPROVED; }
  });

  it.each(['customer', 'company', 'patient'] as const)('scopes %s owner dashboard data to approved matching-role registrations and denies cross-account access', async kind => {
    const role = ({ customer: 'CUSTOMER', company: 'COMPANY', patient: 'PATIENT' } as const)[kind];
    await prisma.erpUser.update({ where: { id: patient.id }, data: { role } });
    const own = await seed(kind); const foreign = await seed(kind, 'APPROVED', '9876543211');
    await prisma.registration.update({ where: { id: own.id }, data: { ownerId: patient.id } });
    await request(app.getHttpServer()).get('/api/registrations/me').set(header(patient)).expect(403);
    await request(app.getHttpServer()).post(path(own.id)).set(header(admin)).send({ action: 'approve' }).expect(201);
    const dashboard = await request(app.getHttpServer()).get('/api/registrations/me').set(header(patient)).expect(200);
    expect(dashboard.body.items.map((item: { id: string }) => item.id)).toEqual([own.id]);
    expect(JSON.stringify(dashboard.body)).not.toContain(foreign.id);
    expect(dashboard.body.items[0]).toMatchObject({ status: 'APPROVED', readOnly: true, activationPending: false });
    await request(app.getHttpServer()).get('/api/registrations/me').expect(401);
    await request(app.getHttpServer()).get('/api/registrations/me').set(header(admin)).expect(403);
    await prisma.erpUser.update({ where: { id: patient.id }, data: { role: kind === 'company' ? 'PATIENT' : 'COMPANY' } });
    await request(app.getHttpServer()).get('/api/registrations/me').set(header(patient)).expect(403);
  });

  it('times out uncertain provider calls, aborts the transport and never retries them', async () => {
    const event = await approve();
    const send = jest.spyOn(app.get(WhatsAppProvider), 'send').mockImplementation(() => new Promise(() => {}));
    await notifications.process(event.id);
    expect(send.mock.calls[0][1].aborted).toBe(true);
    expect(await prisma.registrationNotification.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({ status: 'UNKNOWN', lastError: 'PROVIDER_TIMEOUT' });
    await notifications.process(event.id); expect(send).toHaveBeenCalledTimes(1);
  });

  it('can simulate rejection notifications without disclosing the rejection reason', async () => {
    process.env.WHATSAPP_REJECTIONS_ENABLED = 'true';
    const registration = await seed('company');
    await request(app.getHttpServer()).post(path(registration.id)).set(header(admin)).send({ action: 'reject', reason: 'Private review explanation' }).expect(201);
    const event = await prisma.registrationNotification.findFirstOrThrow();
    const send = jest.spyOn(app.get(WhatsAppProvider), 'send');
    await notifications.process(event.id);
    expect(send.mock.calls[0][0]).toMatchObject({ recipient: '+919876543210', template: 'mock:registration.company.rejected', payload: { decision: 'REJECTED' } });
    expect(JSON.stringify(send.mock.calls)).not.toContain('Private review explanation');
  });

  it('deduplicates delivery after SQS delete fails following successful processing', async () => {
    const event = await approve();
    const send = jest.spyOn(app.get(WhatsAppProvider), 'send');
    queue.receive.mockResolvedValue([{ Body: JSON.stringify({ notificationId: event.id }), ReceiptHandle: 'same-receipt' }]);
    queue.acknowledge.mockRejectedValueOnce(new Error('uncertain delete'));
    await worker.tick(); await worker.tick();
    expect(send).toHaveBeenCalledTimes(1);
    expect(queue.acknowledge).toHaveBeenCalledTimes(2);
  });
});
