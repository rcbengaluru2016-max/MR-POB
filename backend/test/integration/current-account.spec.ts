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

describe('current account with PostgreSQL and mocked Cognito transport', () => {
  let app: INestApplication, prisma: PrismaService, actor: ErpUser, admin: ErpUser;
  let database: Awaited<ReturnType<typeof startTestDatabase>>;
  const cognito = new TestCognito();
  const password = 'InitialPass123!', replacement = 'ReplacementPass456!';
  const headers = (user: ErpUser = actor, suffix = '') => ({ Authorization: `Bearer ${user.cognitoSub}${suffix}` });
  const endpoint = '/api/account/me/change-password';
  beforeAll(async () => {
    process.env.NODE_ENV = 'test'; process.env.IDEMPOTENCY_SECRET = 'current-account-test-secret-at-least-32-characters';
    process.env.COGNITO_USER_POOL_ID = 'ap-southeast-2_testpool'; process.env.COGNITO_CLIENT_ID = 'testclient';
    process.env.FRONTEND_ORIGIN = 'http://localhost:3000';
    database = await startTestDatabase();
    jest.spyOn(CognitoIdentityProviderClient.prototype, 'send').mockImplementation(cognito.send);
    jest.spyOn(CognitoJwtVerifier, 'create').mockReturnValue({ verify: async (token: string) => {
      if (token === 'invalid') throw new Error('Invalid signature');
      return { sub: token.replace(/:other$/, ''), auth_time: Math.floor(Date.now() / 1000) - 10 };
    } } as never);
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ThrottlerGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication(); configureApp(app); await app.init(); prisma = app.get(PrismaService);
  });
  beforeEach(async () => {
    cognito.users.clear(); cognito.mfaUsers.clear(); cognito.challenges.clear(); cognito.phases.clear(); cognito.failNext = ''; cognito.mfaPolicy = 'OPTIONAL';
    await prisma.accountStepUp.deleteMany();
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "ErpUser", "Registration", "UploadBatch" CASCADE');
    actor = await prisma.erpUser.create({ data: { username: 'self-super', email: 'self@example.test', cognitoSub: 'self-super-sub', displayName: 'Account Holder', role: 'SUPER_ADMIN', state: 'ACTIVE', createdAt: new Date('2026-10-01T09:00:00Z'), lastLoginAt: new Date('2026-10-20T09:00:00Z') } });
    admin = await prisma.erpUser.create({ data: { username: 'self-admin', cognitoSub: 'self-admin-sub', displayName: 'Ordinary Admin', role: 'ADMIN', state: 'ACTIVE' } });
    for (const token of [actor.cognitoSub!, `${actor.cognitoSub}:other`]) await prisma.auditEvent.create({ data: { actorId: actor.id, action: 'SUPER_ADMIN_LOGIN_MFA_VERIFIED', detail: { tokenHash: tokenHash(token) } } });
    cognito.seed(actor.username, actor.cognitoSub!, password); cognito.seed(admin.username, admin.cognitoSub!, password); cognito.mfaUsers.add(actor.username);
  });
  afterAll(async () => { await app?.close(); await database?.stop(); jest.restoreAllMocks(); });
  const start = () => request(app.getHttpServer()).post(`${endpoint}/challenge`).set(headers()).send({ currentPassword: password });
  const verify = (challengeId: string, code = '123456', suffix = '') => request(app.getHttpServer()).post(`${endpoint}/verify`).set(headers(actor, suffix)).send({ challengeId, code });
  const update = (stepUpProof: string, extra = {}) => request(app.getHttpServer()).post(endpoint).set(headers()).send({ currentPassword: password, password: replacement, confirmPassword: replacement, stepUpProof, ...extra });
  async function proof() { const challenge = await start().expect(201); return (await verify(challenge.body.challengeId).expect(201)).body.stepUpProof as string; }

  it('returns only current database profile, original creation and last login without mutating either', async () => {
    const result = await request(app.getHttpServer()).get(`/api/account/me?id=${admin.id}`).set(headers()).expect(200);
    expect(result.body).toEqual({ id: actor.id, accountHolder: 'Account Holder', username: actor.username, email: actor.email, role: 'SUPER_ADMIN', status: 'ACTIVE', createdAt: '2026-10-01T09:00:00.000Z', lastSuccessfulLogin: '2026-10-20T09:00:00.000Z', security: { mfaEnabled: true, mfaMethod: 'SOFTWARE_TOKEN_MFA', mfaStatus: 'VERIFIED' } });
    const stored = await prisma.erpUser.findUniqueOrThrow({ where: { id: actor.id } });
    expect(stored.createdAt).toEqual(actor.createdAt); expect(stored.lastLoginAt).toEqual(actor.lastLoginAt);
    expect(JSON.stringify(result.body)).not.toMatch(/"(?:secret|password|accessToken|refreshToken|cognitoSub)"\s*:/i);
  });
  it('handles missing email and login and hides security from ordinary Admins', async () => {
    const profile = await request(app.getHttpServer()).get('/api/account/me').set(headers(admin)).expect(200);
    expect(profile.body.email).toBeNull(); expect(profile.body.lastSuccessfulLogin).toBeNull(); expect(profile.body.security).toBeUndefined();
    await request(app.getHttpServer()).get('/api/account/me/security').set(headers(admin)).expect(403);
    await request(app.getHttpServer()).post(`${endpoint}/challenge`).set(headers(admin)).send({ currentPassword: password }).expect(403);
  });
  it('rejects missing, invalid, unbound, inactive and deleted identities', async () => {
    await request(app.getHttpServer()).get('/api/account/me').expect(401);
    await request(app.getHttpServer()).get('/api/account/me').set('Authorization', 'Bearer invalid').expect(401);
    await request(app.getHttpServer()).get('/api/account/me').set('Authorization', 'Bearer missing').expect(403);
    await prisma.erpUser.update({ where: { id: actor.id }, data: { state: 'INACTIVE' } });
    await request(app.getHttpServer()).get('/api/account/me').set(headers()).expect(403);
    await prisma.erpUser.update({ where: { id: actor.id }, data: { state: 'ACTIVE', deletedAt: new Date() } });
    await request(app.getHttpServer()).get('/api/account/me').set(headers()).expect(403);
  });
  it('reports actual enrollment and pool policy; blocks password operations when either is disabled', async () => {
    cognito.mfaUsers.clear();
    const result = await request(app.getHttpServer()).get('/api/account/me/security').set(headers()).expect(200);
    expect(result.body).toEqual({ mfaEnabled: false, mfaMethod: null, mfaStatus: 'SETUP_REQUIRED' });
    await start().expect(403);
    cognito.mfaUsers.add(actor.username); cognito.mfaPolicy = 'OFF'; await start().expect(403);
  });
  it('fails closed for disabled or mismatched provider identities and provider outages', async () => {
    cognito.users.get(actor.username)!.enabled = false; await start().expect(403);
    cognito.users.get(actor.username)!.enabled = true;
    cognito.users.get(actor.username)!.attributes = [{ Name: 'sub', Value: 'another-sub' }]; await start().expect(403);
    cognito.failNext = 'AdminGetUserCommand'; await request(app.getHttpServer()).get('/api/account/me').set(headers()).expect(503);
  });
  it('rejects bad codes, expired challenges, exhausted attempts and cross-session verification', async () => {
    const first = await start().expect(201);
    await verify(first.body.challengeId, '123456', ':other').expect(401);
    for (let i = 0; i < 5; i++) await verify(first.body.challengeId, '000000').expect(401);
    await verify(first.body.challengeId).expect(401);
    const second = await start().expect(201);
    await prisma.accountStepUp.update({ where: { id: second.body.challengeId }, data: { expiresAt: new Date(0) } });
    await verify(second.body.challengeId).expect(401);
  });
  it('validates complexity, confirmation, same password and missing authorization', async () => {
    const authorization = await proof();
    await update(authorization, { password: 'weak', confirmPassword: 'weak' }).expect(400);
    await update(authorization, { confirmPassword: 'Mismatch123!' }).expect(400);
    await update(authorization, { password, confirmPassword: password }).expect(400);
    await update('x'.repeat(43)).expect(401);
  });
  it('changes Cognito password once, audits, revokes old JWTs, preserves last login and consumes proof', async () => {
    const authorization = await proof();
    const result = await update(authorization).expect(201);
    expect(result.body.message).toBe('Your password has been changed successfully. Please sign in again using your new password.');
    expect(cognito.users.get(actor.username)!.password).toBe(replacement);
    await request(app.getHttpServer()).get('/api/account/me').set(headers()).expect(403);
    await update(authorization).expect(403);
    const stored = await prisma.erpUser.findUniqueOrThrow({ where: { id: actor.id } }); expect(stored.lastLoginAt).toEqual(actor.lastLoginAt);
    expect(await prisma.accountStepUp.count({ where: { consumedAt: { not: null }, actorId: actor.id } })).toBe(1);
    const audit = await prisma.auditEvent.findMany({ where: { actorId: actor.id } });
    expect(audit.map(event => event.action)).toEqual(expect.arrayContaining(['SELF_PASSWORD_CHANGED', 'SELF_PASSWORD_CHANGE_SESSIONS_REVOKED']));
    expect(JSON.stringify(audit)).not.toContain(password); expect(JSON.stringify(audit)).not.toContain('123456');
  });
  it('rejects expired proofs and repeated verification without updating the password', async () => {
    const started = await start().expect(201); const verified = await verify(started.body.challengeId).expect(201);
    await verify(started.body.challengeId).expect(401);
    await prisma.accountStepUp.update({ where: { id: started.body.challengeId }, data: { expiresAt: new Date(0) } });
    await update(verified.body.stepUpProof).expect(401);
    expect(cognito.users.get(actor.username)!.password).toBe(password);
  });
  it('consumes authorization and revokes locally even on an uncertain remote write', async () => {
    const authorization = await proof(); cognito.failNext = 'ChangePasswordCommand';
    await update(authorization).expect(503);
    await request(app.getHttpServer()).get('/api/account/me').set(headers()).expect(403);
    expect(await prisma.auditEvent.count({ where: { actorId: actor.id, action: 'SELF_PASSWORD_CHANGE_FAILED' } })).toBe(1);
    expect(await prisma.accountStepUp.count({ where: { actorId: actor.id, consumedAt: { not: null } } })).toBe(1);
  });
  it('keeps local revocation and reports success if remote global sign-out fails', async () => {
    const authorization = await proof(); cognito.failNext = 'GlobalSignOutCommand'; await update(authorization).expect(201);
    await request(app.getHttpServer()).get('/api/account/me').set(headers()).expect(403);
    expect(await prisma.auditEvent.count({ where: { actorId: actor.id, action: 'SELF_PASSWORD_CHANGE_REMOTE_SIGNOUT_FAILED' } })).toBe(1);
  });
});
