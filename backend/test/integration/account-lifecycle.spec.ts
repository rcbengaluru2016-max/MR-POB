import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { ErpUser } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { PrismaService } from '../../src/database/prisma.service';
import { tokenHash } from '../../src/accounts/step-up.service';
import { startTestDatabase } from './database';
import { TestCognito } from '../fixtures/cognito';

describe('account lifecycle against PostgreSQL, with test-only Cognito/JWT transports', () => {
  let app: INestApplication, prisma: PrismaService;
  let database: Awaited<ReturnType<typeof startTestDatabase>>;
  let actor: ErpUser, admin: ErpUser;
  const cognito = new TestCognito();
  const headers = (user: ErpUser) => ({ Authorization: `Bearer ${user.cognitoSub}` });
  const password = 'InitialPass123!';
  const replacement = 'ReplacementPass456!';
  beforeAll(async () => {
    process.env.NODE_ENV = 'test'; process.env.IDEMPOTENCY_SECRET = 'lifecycle-test-secret-with-at-least-32-characters';
    process.env.COGNITO_USER_POOL_ID = 'ap-southeast-2_testpool'; process.env.COGNITO_CLIENT_ID = 'testclient';
    process.env.FRONTEND_ORIGIN = 'http://localhost:3000';
    database = await startTestDatabase();
    jest.spyOn(CognitoIdentityProviderClient.prototype, 'send').mockImplementation(cognito.send);
    jest.spyOn(CognitoJwtVerifier, 'create').mockReturnValue({ verify: async (token: string) => ({ sub: token, auth_time: Math.floor(Date.now() / 1000) + 1 }) } as never);
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ThrottlerGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication(); configureApp(app); await app.init(); prisma = app.get(PrismaService);
  });
  beforeEach(async () => {
    cognito.users.clear(); cognito.mfaUsers.clear(); cognito.challenges.clear(); cognito.phases.clear(); cognito.failNext = ''; cognito.mfaPolicy = 'OPTIONAL';
    await prisma.accountStepUp.deleteMany();
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "ErpUser", "Registration", "UploadBatch" CASCADE');
    actor = await prisma.erpUser.create({ data: { username: 'super@example.test', cognitoSub: 'super-sub', displayName: 'Super Admin', role: 'SUPER_ADMIN', state: 'ACTIVE' } });
    await prisma.auditEvent.create({ data: { actorId: actor.id, action: 'SUPER_ADMIN_LOGIN_MFA_VERIFIED', detail: { tokenHash: tokenHash(actor.cognitoSub!) } } });
    admin = await prisma.erpUser.create({ data: { username: 'admin@example.test', email: 'admin@example.test', cognitoSub: 'admin-sub', displayName: 'Test Admin', role: 'ADMIN', state: 'ACTIVE' } });
    cognito.seed(actor.username, actor.cognitoSub!, password); cognito.seed(admin.username, admin.cognitoSub!, password);
    cognito.mfaUsers.add(actor.username);
  });
  afterAll(async () => { await app?.close(); await database?.stop(); jest.restoreAllMocks(); });
  const challenge = (targetId = admin.id) => request(app.getHttpServer()).post('/api/auth/step-up/challenge').set(headers(actor)).send({ operation: 'PASSWORD_RESET', targetId, password });
  async function proof(targetId = admin.id) {
    const start = await challenge(targetId).expect(201);
    const verified = await request(app.getHttpServer()).post('/api/auth/step-up/verify').set(headers(actor)).send({ challengeId: start.body.challengeId, code: '123456' }).expect(201);
    return verified.body.stepUpProof as string;
  }
  const generate = (stepUpProof: string, id = admin.id) => request(app.getHttpServer()).post(`/api/super-admin/accounts/${id}/password-reset-link`).set(headers(actor)).send({ stepUpProof });
  const complete = (token: string, value = replacement) => request(app.getHttpServer()).post('/api/auth/password-reset/complete').send({ token, password: value, confirmPassword: value });
  const tokenFrom = (body: { resetUrl: string }) => new URLSearchParams(new URL(body.resetUrl).hash.slice(1)).get('token')!;

  it('creates an active Admin without step-up, authenticates its provider credentials and tracks last login', async () => {
    const created = await request(app.getHttpServer()).post('/api/super-admin/accounts').set(headers(actor)).send({ name: '  New Admin  ', email: ' NEW@EXAMPLE.TEST ', role: 'ADMIN', state: 'ACTIVE', password }).expect(201);
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'NEW@EXAMPLE.TEST', password }).expect(201);
    expect(login.body.user).toMatchObject({ userType: 'admin', username: 'new@example.test' });
    expect((await prisma.erpUser.findUniqueOrThrow({ where: { id: created.body.account.id } })).lastLoginAt).toBeInstanceOf(Date);
    expect(created.body.account).not.toHaveProperty('cognitoSub');
  });
  it('reports expired AWS credentials safely before reserving a login and succeeds after renewal', async () => {
    (CognitoIdentityProviderClient.prototype.send as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('private provider details'), { name: 'CredentialsProviderError' }));
    const input = { name: 'Renewed Admin', email: 'renewed@example.test', role: 'ADMIN', state: 'ACTIVE', password };
    const failed = await request(app.getHttpServer()).post('/api/super-admin/accounts').set(headers(actor)).send(input).expect(503);
    expect(failed.body.code).toBe('ACCOUNT_AWS_CREDENTIALS_UNAVAILABLE');
    expect(JSON.stringify(failed.body)).not.toContain('private provider details');
    expect(await prisma.erpUser.count({ where: { email: input.email } })).toBe(0);
    await request(app.getHttpServer()).post('/api/super-admin/accounts').set(headers(actor)).send(input).expect(201);
    await request(app.getHttpServer()).post('/api/auth/login').send({ username: input.email, password }).expect(201);
  });
  it('retries only the same creators unbound inactive Admin reservation after a provisioning failure', async () => {
    const input = { name: 'Retry Admin', email: 'retry@example.test', role: 'ADMIN', state: 'ACTIVE', password };
    cognito.failNext = 'AdminCreateUserCommand';
    await request(app.getHttpServer()).post('/api/super-admin/accounts').set(headers(actor)).send(input).expect(503);
    const reserved = await prisma.erpUser.findUniqueOrThrow({ where: { username: input.email } });
    expect(reserved.cognitoSub).toBeNull(); expect(reserved.state).toBe('INACTIVE');
    await request(app.getHttpServer()).post('/api/super-admin/accounts').set(headers(actor)).send({ ...input, name: 'Changed Name' }).expect(409);
    const other = await prisma.erpUser.create({ data: { username: 'other-super', role: 'SUPER_ADMIN', state: 'ACTIVE', cognitoSub: 'other-super-sub', displayName: 'Other' } });
    await prisma.auditEvent.create({ data: { actorId: other.id, action: 'SUPER_ADMIN_LOGIN_MFA_VERIFIED', detail: { tokenHash: tokenHash(other.cognitoSub!) } } });
    await request(app.getHttpServer()).post('/api/super-admin/accounts').set(headers(other)).send(input).expect(409);
    const retried = await request(app.getHttpServer()).post('/api/super-admin/accounts').set(headers(actor)).send(input).expect(201);
    expect(retried.body.account.id).toBe(reserved.id);
    expect(retried.body.account.state).toBe('ACTIVE');
    await request(app.getHttpServer()).post('/api/auth/login').send({ username: input.email, password }).expect(201);
    await request(app.getHttpServer()).post('/api/super-admin/accounts').set(headers(actor)).send({ ...input, password: replacement }).expect(409);
    expect(cognito.users.get(input.email)?.password).toBe(password);
  });
  it('creates inactive credentials, activates, deactivates and persists provider and database state', async () => {
    const created = await request(app.getHttpServer()).post('/api/super-admin/accounts').set(headers(actor)).send({ name: 'Inactive Admin', email: 'inactive-new@example.test', role: 'ADMIN', state: 'INACTIVE', password }).expect(201);
    const id = created.body.account.id;
    expect(created.body.account.state).toBe('INACTIVE');
    expect(cognito.users.get('inactive-new@example.test')?.enabled).toBe(false);
    await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'inactive-new@example.test', password }).expect(403);
    await request(app.getHttpServer()).patch(`/api/super-admin/accounts/${id}/state`).set(headers(actor)).send({ state: 'ACTIVE' }).expect(200);
    expect(cognito.users.get('inactive-new@example.test')?.enabled).toBe(true);
    await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'inactive-new@example.test', password }).expect(201);
    await request(app.getHttpServer()).patch(`/api/super-admin/accounts/${id}/state`).set(headers(actor)).send({ state: 'INACTIVE' }).expect(200);
    expect((await prisma.erpUser.findUniqueOrThrow({ where: { id } })).state).toBe('INACTIVE');
    expect(cognito.users.get('inactive-new@example.test')?.enabled).toBe(false);
    await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'inactive-new@example.test', password }).expect(403);
  });
  it('sets an Admin password without extra MFA, preserves status, invalidates links and rejects old credentials', async () => {
    const resetToken = tokenFrom((await generate(await proof()).expect(201)).body);
    const reset = await request(app.getHttpServer()).post(`/api/super-admin/accounts/${admin.id}/password-reset`).set(headers(actor)).send({ password: replacement, confirmPassword: replacement }).expect(201);
    expect(reset.body).toEqual({ success: true });
    expect((await prisma.erpUser.findUniqueOrThrow({ where: { id: admin.id } })).state).toBe('ACTIVE');
    expect(cognito.users.get(admin.username)?.enabled).toBe(true);
    await complete(resetToken).expect(400);
    await request(app.getHttpServer()).post('/api/auth/login').send({ username: admin.username, password }).expect(401);
    await request(app.getHttpServer()).post('/api/auth/login').send({ username: admin.username, password: replacement }).expect(201);
    await request(app.getHttpServer()).patch(`/api/super-admin/accounts/${admin.id}/state`).set(headers(actor)).send({ state: 'INACTIVE' }).expect(200);
    await request(app.getHttpServer()).post(`/api/super-admin/accounts/${admin.id}/password-reset`).set(headers(actor)).send({ password, confirmPassword: password }).expect(201);
    expect(cognito.users.get(admin.username)?.enabled).toBe(false);
    await request(app.getHttpServer()).post('/api/auth/login').send({ username: admin.username, password }).expect(403);
  });
  it('restricts direct resets to authenticated Super Admins and Admin targets, validates inputs and fails closed', async () => {
    const path = `/api/super-admin/accounts/${admin.id}/password-reset`;
    const body = { password: replacement, confirmPassword: replacement };
    await request(app.getHttpServer()).post(path).send(body).expect(401);
    await request(app.getHttpServer()).post(path).set(headers(admin)).send(body).expect(403);
    await request(app.getHttpServer()).post(`/api/super-admin/accounts/${actor.id}/password-reset`).set(headers(actor)).send(body).expect(403);
    await request(app.getHttpServer()).post(path).set(headers(actor)).send({ ...body, confirmPassword: password }).expect(400);
    await request(app.getHttpServer()).post(path).set(headers(actor)).send({ password: 'weak', confirmPassword: 'weak' }).expect(400);
    cognito.failNext = 'AdminSetUserPasswordCommand';
    await request(app.getHttpServer()).post(path).set(headers(actor)).send(body).expect(503);
    expect((await prisma.erpUser.findUniqueOrThrow({ where: { id: admin.id } })).state).toBe('INACTIVE');
    await request(app.getHttpServer()).get('/api/admin/registrations').set(headers(admin)).expect(403);
  });
  it('refuses a changed subject even when the username matches', async () => {
    cognito.seed(admin.username, 'unrelated-subject', password);
    await request(app.getHttpServer()).patch(`/api/super-admin/accounts/${admin.id}/state`).set(headers(actor)).send({ state: 'ACTIVE' }).expect(409);
    await request(app.getHttpServer()).post(`/api/super-admin/accounts/${admin.id}/password-reset`).set(headers(actor)).send({ password: replacement, confirmPassword: replacement }).expect(409);
    expect(cognito.users.get(admin.username)?.password).toBe(password);
  });
  it('filters independently and together, paginates deterministically and excludes secrets', async () => {
    await prisma.erpUser.create({ data: { username: 'inactive@example.test', displayName: 'Other Admin', role: 'ADMIN', state: 'INACTIVE' } });
    for (const [query, total] of [['search=TEST%20ADMIN', 1], ['role=SUPER_ADMIN', 1], ['state=INACTIVE', 1], ['search=admin&role=ADMIN&state=ACTIVE', 1], ['search=absent&role=ADMIN', 0]] as const) {
      const result = await request(app.getHttpServer()).get(`/api/super-admin/accounts?${query}&pageSize=1&sort=name&direction=asc`).set(headers(actor)).expect(200);
      expect(result.body.total).toBe(total);
      expect(JSON.stringify(result.body)).not.toMatch(/cognitoSub|password|encryptedSession|tokenHash/);
    }
    const first = await request(app.getHttpServer()).get('/api/super-admin/accounts?pageSize=1&page=1').set(headers(actor)).expect(200);
    const second = await request(app.getHttpServer()).get('/api/super-admin/accounts?pageSize=1&page=2').set(headers(actor)).expect(200);
    expect(first.body.items[0].id).not.toBe(second.body.items[0].id);
    const sorted = await request(app.getHttpServer()).get('/api/super-admin/accounts?pageSize=100&sort=name&direction=asc').set(headers(actor)).expect(200);
    expect(sorted.body.items.map((item: { name: string }) => item.name)).toEqual(['Other Admin', 'Super Admin', 'Test Admin']);
    const reversed = await request(app.getHttpServer()).get('/api/super-admin/accounts?pageSize=100&sort=name&direction=desc').set(headers(actor)).expect(200);
    expect(reversed.body.items.map((item: { name: string }) => item.name)).toEqual(['Test Admin', 'Super Admin', 'Other Admin']);
    await request(app.getHttpServer()).get('/api/super-admin/accounts?pageSize=101').set(headers(actor)).expect(400);
  });
  const superInput = () => ({ name: 'New Super Admin', email: 'new-super@example.test', role: 'SUPER_ADMIN', state: 'ACTIVE', password });
  async function creationProof() {
    const start = await request(app.getHttpServer()).post('/api/auth/step-up/challenge').set(headers(actor)).send({ operation: 'CREATE_SUPER_ADMIN', account: superInput(), password }).expect(201);
    return (await request(app.getHttpServer()).post('/api/auth/step-up/verify').set(headers(actor)).send({ challengeId: start.body.challengeId, code: '123456' }).expect(201)).body.stepUpProof as string;
  }
  it('creates a Super Admin only after fresh MFA, then requires a private password and MFA enrollment before access', async () => {
    await request(app.getHttpServer()).post('/api/super-admin/accounts').set(headers(actor)).send(superInput()).expect(401);
    const grant = await creationProof();
    await request(app.getHttpServer()).post('/api/super-admin/accounts').set(headers(actor)).send({ ...superInput(), name: 'Changed Target', stepUpProof: grant }).expect(401);
    const created = await request(app.getHttpServer()).post('/api/super-admin/accounts').set(headers(actor)).send({ ...superInput(), stepUpProof: grant }).expect(201);
    await request(app.getHttpServer()).post('/api/super-admin/accounts').set(headers(actor)).send({ ...superInput(), stepUpProof: grant }).expect(401);
    const saved = await prisma.erpUser.findUniqueOrThrow({ where: { id: created.body.account.id } });
    expect(saved.mfaEnrollmentRequired).toBe(true);
    await request(app.getHttpServer()).get('/api/auth/me').set(headers(saved)).expect(403);
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ username: saved.username, password }).expect(201);
    expect(login.body.challengeName).toBe('NEW_PASSWORD_REQUIRED'); expect(login.body.accessToken).toBeUndefined();
    const changed = await request(app.getHttpServer()).post('/api/auth/challenge').send({ username: login.body.username, session: login.body.session, challengeName: 'NEW_PASSWORD_REQUIRED', password: replacement }).expect(201);
    expect(changed.body.challengeName).toBe('MFA_SETUP'); expect(changed.body.accessToken).toBeUndefined();
    await request(app.getHttpServer()).get('/api/auth/me').set(headers(saved)).expect(403);
    const verified = await request(app.getHttpServer()).post('/api/auth/challenge').send({ username: changed.body.username, session: changed.body.session, challengeName: 'MFA_SETUP', code: '123456' }).expect(201);
    expect(verified.body.user.userType).toBe('super_admin');
    expect((await prisma.erpUser.findUniqueOrThrow({ where: { id: saved.id } })).mfaEnrollmentRequired).toBe(false);
    expect(cognito.users.get(saved.username)?.password).toBe(replacement);
    await request(app.getHttpServer()).get('/api/auth/me').set(headers(saved)).expect(200);
  });
  it('fails closed before reserving a Super Admin if the provider mandatory-MFA policy is unavailable', async () => {
    const grant = await creationProof(); cognito.mfaPolicy = 'OFF';
    await request(app.getHttpServer()).post('/api/super-admin/accounts').set(headers(actor)).send({ ...superInput(), stepUpProof: grant }).expect(409);
    expect(await prisma.erpUser.count({ where: { username: superInput().email } })).toBe(0);
    expect(cognito.users.has(superInput().email)).toBe(false);
  });
  it('requires password and fresh provider MFA, never returns a Cognito session', async () => {
    const result = await challenge().expect(201);
    expect(result.body).not.toHaveProperty('session');
    const saved = await prisma.accountStepUp.findUniqueOrThrow({ where: { id: result.body.challengeId } });
    expect(saved.encryptedSession).not.toContain([...cognito.challenges.keys()][0]);
    await request(app.getHttpServer()).post('/api/auth/step-up/challenge').set(headers(actor)).send({ operation: 'PASSWORD_RESET', targetId: admin.id, password: 'wrong' }).expect(401);
    cognito.mfaUsers.clear();
    await challenge().expect(403);
  });
  it('rejects wrong, expired, replayed and actor-mismatched challenges', async () => {
    const start = await challenge().expect(201);
    const body = { challengeId: start.body.challengeId, code: '000000' };
    await request(app.getHttpServer()).post('/api/auth/step-up/verify').set(headers(actor)).send(body).expect(401);
    await prisma.accountStepUp.update({ where: { id: body.challengeId }, data: { expiresAt: new Date(Date.now() - 1) } });
    await request(app.getHttpServer()).post('/api/auth/step-up/verify').set(headers(actor)).send({ ...body, code: '123456' }).expect(401);
    const another = await challenge().expect(201);
    const verify = () => request(app.getHttpServer()).post('/api/auth/step-up/verify').set(headers(actor)).send({ challengeId: another.body.challengeId, code: '123456' });
    await verify().expect(201); await verify().expect(401);
    const other = await prisma.erpUser.create({ data: { username: 'other-super', displayName: 'Other Super', cognitoSub: 'other-super-sub', role: 'SUPER_ADMIN', state: 'ACTIVE' } });
    await prisma.auditEvent.create({ data: { actorId: other.id, action: 'SUPER_ADMIN_LOGIN_MFA_VERIFIED', detail: { tokenHash: tokenHash(other.cognitoSub!) } } });
    const mismatch = await challenge().expect(201);
    await request(app.getHttpServer()).post('/api/auth/step-up/verify').set(headers(other)).send({ challengeId: mismatch.body.challengeId, code: '123456' }).expect(401);
  });
  it('binds the grant to actor, operation and target and consumes it once', async () => {
    const grant = await proof();
    await generate(grant, actor.id).expect(401);
    await generate(grant).expect(201); await generate(grant).expect(401);
    await generate('x'.repeat(43)).expect(401);
    const expired = await proof();
    await prisma.accountStepUp.updateMany({ where: { proofHash: tokenHash(expired) }, data: { expiresAt: new Date(0) } });
    await generate(expired).expect(401);
  });
  it.each(['ADMIN', 'SUPER_ADMIN'] as const)('requires fresh MFA to reset %s and issues a hashed token with exactly 30 minutes lifetime', async role => {
    const target = role === 'ADMIN' ? admin : actor;
    const link = await generate(await proof(target.id), target.id).expect(201);
    const token = tokenFrom(link.body), saved = await prisma.accountResetToken.findUniqueOrThrow({ where: { tokenHash: tokenHash(token) } });
    expect(saved.expiresAt.getTime() - saved.createdAt.getTime()).toBe(30 * 60_000);
    expect(saved.tokenHash).not.toBe(token);
    expect(JSON.stringify(await prisma.auditEvent.findMany())).not.toContain(token);
    await request(app.getHttpServer()).post('/api/auth/password-reset/validate').send({ token }).expect(201);
  });
  it('invalidates older links and rejects expired tokens', async () => {
    const old = tokenFrom((await generate(await proof()).expect(201)).body);
    const latest = tokenFrom((await generate(await proof()).expect(201)).body);
    await complete(old).expect(400);
    await prisma.accountResetToken.update({ where: { tokenHash: tokenHash(latest) }, data: { expiresAt: new Date(0) } });
    await complete(latest).expect(400);
    expect(cognito.users.get(admin.username)?.password).toBe(password);
  });
  it('allows one concurrent redemption, updates provider credentials and revokes old sessions', async () => {
    const token = tokenFrom((await generate(await proof()).expect(201)).body);
    const results = await Promise.all([complete(token), complete(token)]);
    expect(results.map(result => result.status).sort()).toEqual([201, 400]);
    expect(cognito.users.get(admin.username)?.password).toBe(replacement);
    const account = await prisma.erpUser.findUniqueOrThrow({ where: { id: admin.id } });
    expect(account.tokensValidAfter).toBeInstanceOf(Date); expect(account.state).toBe('ACTIVE');
    await complete(token).expect(400);
    await request(app.getHttpServer()).post('/api/auth/login').send({ username: admin.username, password }).expect(401);
    await request(app.getHttpServer()).post('/api/auth/login').send({ username: admin.username, password: replacement }).expect(201);
  });
  it('fails closed on provider uncertainty and recovers with a new MFA-protected link', async () => {
    const token = tokenFrom((await generate(await proof()).expect(201)).body);
    cognito.failNext = 'AdminSetUserPasswordCommand'; await complete(token).expect(503);
    await complete(token).expect(400);
    expect((await prisma.erpUser.findUniqueOrThrow({ where: { id: admin.id } })).state).toBe('INACTIVE');
    await request(app.getHttpServer()).get('/api/admin/registrations').set(headers(admin)).expect(403);
    const next = tokenFrom((await generate(await proof()).expect(201)).body);
    await complete(next).expect(201);
    await request(app.getHttpServer()).patch(`/api/super-admin/accounts/${admin.id}/state`).set(headers(actor)).send({ state: 'ACTIVE' }).expect(200);
    expect(cognito.users.get(admin.username)?.password).toBe(replacement);
  });
  it('never reactivates an account deactivated after its reset link was issued', async () => {
    const token = tokenFrom((await generate(await proof()).expect(201)).body);
    await request(app.getHttpServer()).patch(`/api/super-admin/accounts/${admin.id}/state`).set(headers(actor)).send({ state: 'INACTIVE' }).expect(200);
    await complete(token).expect(201);
    expect((await prisma.erpUser.findUniqueOrThrow({ where: { id: admin.id } })).state).toBe('INACTIVE');
    expect(cognito.users.get(admin.username)?.enabled).toBe(false);
    await request(app.getHttpServer()).post('/api/auth/login').send({ username: admin.username, password: replacement }).expect(403);
  });
  it('keeps access inactive when the final database commit fails after Cognito provisioning', async () => {
    await prisma.$executeRawUnsafe(`CREATE FUNCTION fail_account_completion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'ADMIN_ACCOUNT_CREATED' THEN RAISE EXCEPTION 'test completion failure'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER account_completion_failure BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION fail_account_completion()');
    try {
      await request(app.getHttpServer()).post('/api/super-admin/accounts').set(headers(actor)).send({ name: 'Commit Failure Admin', email: 'commit-failure@example.test', role: 'ADMIN', state: 'ACTIVE', password }).expect(503);
      const account = await prisma.erpUser.findUniqueOrThrow({ where: { username: 'commit-failure@example.test' } });
      expect(account.state).toBe('INACTIVE'); expect(account.cognitoSub).toBeTruthy();
      expect(cognito.users.get(account.username)?.enabled).toBe(true);
      await request(app.getHttpServer()).post('/api/auth/login').send({ username: account.username, password }).expect(403);
      expect(await prisma.auditEvent.count({ where: { actorId: actor.id } })).toBeGreaterThan(0);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER account_completion_failure ON "AuditEvent"');
      await prisma.$executeRawUnsafe('DROP FUNCTION fail_account_completion()');
    }
  });
  it('deletes only the Admin identity, retains historical relationships, and preserves Super Admin state and MFA', async () => {
    const before = await prisma.erpUser.findUniqueOrThrow({ where: { id: actor.id } });
    await prisma.registration.create({ data: { id: 'historical', kind: 'patient', mobile: '9876543210', status: 'APPROVED', requestHash: 'fixture', decidedById: admin.id, patient: { create: { patientName: 'Retained Patient', address: 'Retained Address', paymentMethod: 'UPI' } } } });
    await request(app.getHttpServer()).delete(`/api/super-admin/accounts/${admin.id}`).set(headers(actor)).expect(200);
    const deleted = await prisma.erpUser.findUniqueOrThrow({ where: { id: admin.id } });
    expect(deleted.deletedAt).toBeInstanceOf(Date); expect(deleted.state).toBe('INACTIVE');
    expect(cognito.users.has(admin.username)).toBe(false);
    expect(await prisma.registration.count()).toBe(1);
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: 'historical' } })).decidedById).toBe(admin.id);
    expect(await prisma.erpUser.findUniqueOrThrow({ where: { id: actor.id } })).toEqual(before);
    expect(cognito.mfaUsers.has(actor.username)).toBe(true);
    await request(app.getHttpServer()).post('/api/auth/login').send({ username: admin.username, password }).expect(401);
    await request(app.getHttpServer()).get('/api/admin/registrations').set(headers(admin)).expect(403);
    const list = await request(app.getHttpServer()).get('/api/super-admin/accounts').set(headers(actor)).expect(200);
    expect(list.body.items.map((item: { id: string }) => item.id)).toEqual([actor.id]);
    expect(await prisma.auditEvent.count({ where: { action: 'ADMIN_ACCOUNT_DELETED' } })).toBe(1);
  });
  it('rejects Super Admin deletion and self-deactivation, and serializes last-Super-Admin checks', async () => {
    await request(app.getHttpServer()).delete(`/api/super-admin/accounts/${actor.id}`).set(headers(actor)).expect(403);
    await request(app.getHttpServer()).patch(`/api/super-admin/accounts/${actor.id}/state`).set(headers(actor)).send({ state: 'INACTIVE' }).expect(403);
    const other = await prisma.erpUser.create({ data: { username: 'second-super', cognitoSub: 'second-sub', displayName: 'Second Super', role: 'SUPER_ADMIN', state: 'ACTIVE' } });
    await prisma.auditEvent.create({ data: { actorId: other.id, action: 'SUPER_ADMIN_LOGIN_MFA_VERIFIED', detail: { tokenHash: tokenHash(other.cognitoSub!) } } });
    cognito.seed(other.username, other.cognitoSub!, password);
    const changes = await Promise.all([
      request(app.getHttpServer()).patch(`/api/super-admin/accounts/${other.id}/state`).set(headers(actor)).send({ state: 'INACTIVE' }),
      request(app.getHttpServer()).patch(`/api/super-admin/accounts/${actor.id}/state`).set(headers(other)).send({ state: 'INACTIVE' }),
    ]);
    expect(changes.map(result => result.status).sort()).toEqual([200, 403]);
    expect(await prisma.erpUser.count({ where: { role: 'SUPER_ADMIN', state: 'ACTIVE' } })).toBe(1);
  });
  it('blocks every sensitive endpoint for Admin and unauthenticated callers, including the old direct password endpoint', async () => {
    for (const auth of [false, true]) for (const [method, path, body] of [
      ['get', '/api/super-admin/accounts', {}], ['get', `/api/super-admin/accounts/${admin.id}`, {}],
      ['post', '/api/super-admin/accounts', {}], ['delete', `/api/super-admin/accounts/${admin.id}`, {}],
      ['patch', `/api/super-admin/accounts/${admin.id}/state`, { state: 'ACTIVE' }],
      ['post', `/api/super-admin/accounts/${admin.id}/password-reset-link`, { stepUpProof: 'x'.repeat(43) }],
      ['post', '/api/auth/step-up/challenge', { operation: 'PASSWORD_RESET', targetId: admin.id, password }],
      ['post', '/api/auth/step-up/verify', { challengeId: actor.id, code: '123456' }],
    ] as const) {
      const req = request(app.getHttpServer())[method](path); if (auth) req.set(headers(admin));
      await req.send(body).expect(auth ? 403 : 401);
    }
    await request(app.getHttpServer()).post(`/api/super-admin/accounts/${admin.id}/password`).set(headers(actor)).send({ password: replacement }).expect(404);
    expect(cognito.users.get(admin.username)?.password).toBe(password);
  });
});
