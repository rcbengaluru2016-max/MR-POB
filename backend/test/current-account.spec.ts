import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { validate } from 'class-validator';
import { ErpUser } from '@prisma/client';
import { CurrentAccountService, CurrentPasswordChangeDto } from '../src/accounts/current-account.service';
import { ConfigService } from '../src/config/config.service';
import { PrismaService } from '../src/database/prisma.service';
import { StepUpService, tokenHash } from '../src/accounts/step-up.service';

describe('current account contracts and security', () => {
  const actor = { id: 'user', username: 'registered-name', cognitoSub: 'verified-sub', email: null, displayName: 'Saved Name', role: 'SUPER_ADMIN', state: 'ACTIVE', createdAt: new Date('2026-10-01T00:00:00Z'), lastLoginAt: null } as ErpUser;
  let service: CurrentAccountService, send: jest.SpyInstance, steps: { binding: jest.Mock; challengeBound: jest.Mock; verify: jest.Mock; consume: jest.Mock }, prisma: { auditEvent: { create: jest.Mock }; erpUser: { updateMany: jest.Mock }; $transaction: jest.Mock };
  beforeEach(() => {
    send = jest.spyOn(CognitoIdentityProviderClient.prototype, 'send');
    send.mockImplementation(async (command: unknown) => {
      switch ((command as object).constructor.name) {
        case 'AdminGetUserCommand': return { Enabled: true, UserAttributes: [{ Name: 'sub', Value: actor.cognitoSub }], UserMFASettingList: ['SOFTWARE_TOKEN_MFA'], SecretCode: 'must-never-leak' };
        case 'GetUserPoolMfaConfigCommand': return { MfaConfiguration: 'OPTIONAL', SoftwareTokenMfaConfiguration: { Enabled: true } };
        default: return {};
      }
    });
    steps = { binding: jest.fn().mockReturnValue('bound-session-operation'), challengeBound: jest.fn().mockResolvedValue({ challengeId: 'challenge' }), verify: jest.fn().mockResolvedValue({ stepUpProof: 'proof' }), consume: jest.fn().mockResolvedValue(undefined) };
    prisma = { auditEvent: { create: jest.fn().mockResolvedValue({}) }, erpUser: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, $transaction: jest.fn() };
    prisma.$transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback(prisma));
    const config = { get: (key: string) => ({ AWS_REGION: 'ap-southeast-2', COGNITO_USER_POOL_ID: 'pool' })[key as 'AWS_REGION' | 'COGNITO_USER_POOL_ID'] };
    service = new CurrentAccountService(prisma as unknown as PrismaService, config as ConfigService, steps as unknown as StepUpService);
  });
  afterEach(() => jest.restoreAllMocks());
  it('projects only safe database fields and obtains actual MFA status', async () => {
    const profile = await service.me(actor);
    expect(profile.accountHolder).toBe('Saved Name'); expect(profile.lastSuccessfulLogin).toBeNull(); expect(profile.email).toBeNull();
    expect(profile.createdAt).toBe('2026-10-01T00:00:00.000Z'); expect(profile.security?.mfaEnabled).toBe(true);
    expect(JSON.stringify(profile)).not.toContain('must-never-leak'); expect(profile).not.toHaveProperty('cognitoSub');
    expect(prisma.erpUser.updateMany).not.toHaveBeenCalled();
  });
  it('does not assume enrollment from role or return security to ordinary Admins', async () => {
    send.mockResolvedValueOnce({ Enabled: true, UserAttributes: [{ Name: 'sub', Value: actor.cognitoSub }], UserMFASettingList: ['SMS_MFA'] } as never);
    expect((await service.security(actor)).mfaEnabled).toBe(false);
    expect((await service.me({ ...actor, role: 'ADMIN' })).security).toBeUndefined();
    await expect(service.security({ ...actor, role: 'ADMIN' })).rejects.toThrow('Super administrator');
    await expect(service.me({ ...actor, state: 'INACTIVE' })).rejects.toThrow('not active');
  });
  it('binds fresh software-token challenge and verification to the current session and operation', async () => {
    await service.challenge(actor, 'session-token', { currentPassword: 'CurrentPassword123!' });
    expect(steps.binding).toHaveBeenCalledWith('SELF_PASSWORD_CHANGE', { session: tokenHash('session-token') });
    expect(steps.challengeBound).toHaveBeenCalledWith(actor, 'CurrentPassword123!', 'bound-session-operation', true);
    await service.verify(actor, 'session-token', { challengeId: 'challenge', code: '123456' });
    expect(steps.verify).toHaveBeenCalledWith({ challengeId: 'challenge', code: '123456' }, actor, 'bound-session-operation');
  });
  it('uses supported ChangePassword with current password and revokes locally before remote write', async () => {
    await service.change(actor, 'session-token', { currentPassword: 'CurrentPassword123!', password: 'ReplacementPass456!', confirmPassword: 'ReplacementPass456!', stepUpProof: 'proof' });
    const change = send.mock.calls.find(([command]) => command.constructor.name === 'ChangePasswordCommand')![0];
    expect(change.input).toEqual({ AccessToken: 'session-token', PreviousPassword: 'CurrentPassword123!', ProposedPassword: 'ReplacementPass456!' });
    expect(steps.consume).toHaveBeenCalledWith(prisma, 'proof', actor.id, 'SELF_PASSWORD_CHANGE', { session: tokenHash('session-token') });
    expect(prisma.erpUser.updateMany.mock.invocationCallOrder[0]).toBeLessThan(send.mock.invocationCallOrder[send.mock.calls.findIndex(([command]) => command.constructor.name === 'ChangePasswordCommand')]);
    expect(JSON.stringify(prisma.auditEvent.create.mock.calls)).not.toMatch(/CurrentPassword123|ReplacementPass456|123456/);
  });
  it.each(['short', 'alllowercase123!', 'ALLUPPERCASE123!', 'NoNumbersHere!', 'NoSpecialChars123'])('rejects insufficient password %s through DTO validation', async password => {
    const dto = Object.assign(new CurrentPasswordChangeDto(), { currentPassword: 'current', password, confirmPassword: password, stepUpProof: 'x'.repeat(43) });
    expect((await validate(dto)).some(error => error.property === 'password')).toBe(true);
  });
  it('rejects mismatched and unchanged passwords before consuming authorization', async () => {
    const input = { currentPassword: 'CurrentPassword123!', password: 'ReplacementPass456!', confirmPassword: 'different', stepUpProof: 'proof' };
    await expect(service.change(actor, 'token', input)).rejects.toThrow('do not match');
    await expect(service.change(actor, 'token', { ...input, password: input.currentPassword, confirmPassword: input.currentPassword })).rejects.toThrow('different');
    expect(steps.consume).not.toHaveBeenCalled();
  });
});
