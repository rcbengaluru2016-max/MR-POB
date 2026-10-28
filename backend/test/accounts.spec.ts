import 'reflect-metadata';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AccountsController } from '../src/accounts/accounts.module';
import { AccountsService } from '../src/accounts/accounts.service';
import { AuthService } from '../src/auth/auth.service';
import { configureApp } from '../src/bootstrap';
import { analyticsRange } from '../src/registrations/analytics.service';

describe('Super Admin account HTTP policy and validation', () => {
  let app: INestApplication;
  const accounts = { create: jest.fn().mockResolvedValue({ account: { id: 'created', role: 'ADMIN' } }), list: jest.fn().mockResolvedValue({ items: [] }), detail: jest.fn(), setState: jest.fn(), setPassword: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [AccountsController], providers: [
      { provide: AccountsService, useValue: accounts },
      { provide: AuthService, useValue: { authenticate: async (token: string) => {
        if (token === 'invalid') throw new UnauthorizedException();
        return { id: 'verified-actor', role: token === 'super' ? 'SUPER_ADMIN' : token === 'inactive' ? 'SUPER_ADMIN' : token === 'admin' ? 'ADMIN' : 'PATIENT', state: token === 'inactive' ? 'INACTIVE' : 'ACTIVE' };
      } } },
    ] }).compile();
    app = module.createNestApplication(); configureApp(app); await app.init();
  });
  afterAll(async () => { await app?.close(); });
  it('passes normalized form fields and the verified creator, with a validated password and ADMIN role', async () => {
    await request(app.getHttpServer()).post('/api/super-admin/accounts').set('Authorization', 'Bearer super').send({ name: '  New Admin  ', email: ' ADMIN@EXAMPLE.TEST ', state: 'ACTIVE', role: 'ADMIN', password: 'InitialPass123!' }).expect(201);
    expect(accounts.create).toHaveBeenCalledWith({ name: 'New Admin', email: 'admin@example.test', state: 'ACTIVE', role: 'ADMIN', password: 'InitialPass123!' }, 'verified-actor');
  });
  it.each([{}, { name: 'x', email: 'a@example.test' }, { name: 'Name', email: 'invalid' }, { name: 'Name', email: 'a@example.test', state: 'LOCKED' }, { name: 'Name', email: 'a@example.test', password: 'DoNotStore123!' }, { name: 'Name', email: 'a@example.test', role: 'SUPER_ADMIN' }, { name: 'Name', email: 'a@example.test', createdById: 'forged' }, { name: 'Name', email: 'a@example.test', cognitoSub: 'forged' }])('rejects invalid input and identity injection or incomplete account fields: %j', async body => {
    await request(app.getHttpServer()).post('/api/super-admin/accounts').set('Authorization', 'Bearer super').send(body).expect(400);
    expect(accounts.create).not.toHaveBeenCalled();
  });
  it.each([['', 401], ['invalid', 401], ['admin', 403], ['patient', 403], ['inactive', 403]])('denies token %s across account endpoints', async (token, status) => {
    const id = 'e63226f3-6e3c-4112-84a3-f223c664711c';
    for (const [method, path] of [['get', '/api/super-admin/accounts'], ['get', `/api/super-admin/accounts/${id}`], ['post', '/api/super-admin/accounts'], ['patch', `/api/super-admin/accounts/${id}/state`]] as const) {
      const req = request(app.getHttpServer())[method](path);
      if (token) req.set('Authorization', `Bearer ${token}`);
      await req.send({ name: 'New Admin', email: 'new@example.test', state: 'ACTIVE' }).expect(Number(status));
    }
    expect(accounts.create).not.toHaveBeenCalled();
    expect(accounts.setState).not.toHaveBeenCalled();
  });
  it.each(['Short1!', 'lowercase123!@#', 'UPPERCASE123!@#', 'LettersOnly!!!', 'NoSymbolPass123', 'Has Space123!'])('rejects an initial password that violates account policy: %s', async password => {
    await request(app.getHttpServer()).post('/api/super-admin/accounts').set('Authorization', 'Bearer super').send({ name: 'Valid Admin', email: 'valid@example.test', role: 'ADMIN', state: 'ACTIVE', password }).expect(400);
    expect(accounts.create).not.toHaveBeenCalled();
  });
});

describe('dashboard UTC date ranges', () => {
  it('uses complete UTC days and an equally sized preceding range', () => {
    expect(analyticsRange({ period: 'weekly' }, new Date('2026-10-23T23:59:00Z'))).toEqual({ start: new Date('2026-10-17T00:00:00Z'), end: new Date('2026-10-24T00:00:00Z'), previousStart: new Date('2026-10-10T00:00:00Z') });
  });
  it.each([['2026-02-30', '2026-03-01'], ['2026-10-23', '2026-10-22'], ['2026-01-01', '2026-12-31'], [undefined, undefined]])('rejects invalid custom range %s–%s', (start, end) => {
    expect(() => analyticsRange({ period: 'custom', start, end })).toThrow();
  });
});
