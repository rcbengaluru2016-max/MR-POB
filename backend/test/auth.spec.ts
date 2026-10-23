import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { AuthService } from '../src/auth/auth.service';
import { ConfigService } from '../src/config/config.service';
import { PrismaService } from '../src/database/prisma.service';
import { AdminGuard, CognitoGuard } from '../src/auth/auth.guard';

describe('Cognito authentication and database authority', () => {
  let auth: AuthService;
  let verify: jest.Mock;
  let prisma: any;
  const user = { id: 'erp-user', cognitoSub: 'immutable-sub', username: 'admin', displayName: 'Administrator', state: 'ACTIVE', role: 'ADMIN' };
  beforeEach(() => {
    verify = jest.fn().mockResolvedValue({ sub: 'immutable-sub', 'cognito:groups': ['SUPER_ADMIN'] });
    jest.spyOn(CognitoJwtVerifier, 'create').mockReturnValue({ verify } as any);
    prisma = { erpUser: { findFirst: jest.fn().mockResolvedValue(user), findUnique: jest.fn().mockResolvedValue(user) }, registration: { findFirst: jest.fn() } };
    const config = { get: (key: string) => ({ AWS_REGION: 'ap-southeast-2', COGNITO_USER_POOL_ID: 'ap-southeast-2_pool', COGNITO_CLIENT_ID: 'client' } as Record<string, string>)[key], optional: () => undefined } as unknown as ConfigService;
    auth = new AuthService(config, prisma as PrismaService);
  });
  afterEach(() => jest.restoreAllMocks());
  it.each(['CUSTOMER', 'COMPANY', 'PATIENT'])('requires an owned approved profile for active %s authentication', async role => {
    prisma.erpUser.findUnique.mockResolvedValue({ ...user, role });
    prisma.registration.findFirst.mockResolvedValue(null);
    await expect(auth.authenticate('signed-token')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.registration.findFirst).toHaveBeenCalledWith({ where: { ownerId: user.id, kind: role.toLowerCase(), status: 'APPROVED' }, select: { id: true } });
    prisma.registration.findFirst.mockResolvedValue({ id: 'approved-owned-registration' });
    expect(await auth.authenticate('signed-token')).toMatchObject({ role });
  });
  it('configures signature, issuer/pool, expiry, access token use and app-client verification', async () => {
    expect(CognitoJwtVerifier.create).toHaveBeenCalledWith({ userPoolId: 'ap-southeast-2_pool', clientId: 'client', tokenUse: 'access' });
    expect(await auth.authenticate('signed-token')).toEqual(user);
    expect(prisma.erpUser.findUnique).toHaveBeenCalledWith({ where: { cognitoSub: 'immutable-sub' } });
    expect(auth.session(user as any).userType).toBe('admin');
  });
  it('denies invalid JWTs and unbound or inactive accounts regardless of token groups', async () => {
    verify.mockRejectedValueOnce(new Error('invalid signature'));
    await expect(auth.authenticate('invalid')).rejects.toBeInstanceOf(UnauthorizedException);
    prisma.erpUser.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...user, state: 'INACTIVE' });
    await expect(auth.authenticate('unbound')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(auth.authenticate('inactive')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('handles Cognito MFA without returning a usable ERP token before completion', async () => {
    jest.spyOn(CognitoIdentityProviderClient.prototype, 'send').mockResolvedValueOnce({ ChallengeName: 'SOFTWARE_TOKEN_MFA', Session: 'challenge', ChallengeParameters: { USER_ID_FOR_SRP: 'canonical' } } as never).mockResolvedValueOnce({ AuthenticationResult: { AccessToken: 'signed', ExpiresIn: 3600 } } as never);
    expect(await auth.login('alias', 'secret')).toEqual({ challengeName: 'SOFTWARE_TOKEN_MFA', session: 'challenge', username: 'canonical' });
    expect(verify).not.toHaveBeenCalled();
    expect(await auth.challenge({ challengeName: 'SOFTWARE_TOKEN_MFA', username: 'canonical', session: 'challenge', code: '123456' })).toEqual({ accessToken: 'signed', expiresIn: 3600, user: { username: 'admin', userType: 'admin', displayName: 'Administrator' } });
  });
  it('guards require Bearer token and active database admin role', async () => {
    const request: any = { headers: {} };
    const context: any = { switchToHttp: () => ({ getRequest: () => request }) };
    await expect(new CognitoGuard(auth).canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    request.headers.authorization = 'Bearer signed';
    await expect(new CognitoGuard(auth).canActivate(context)).resolves.toBe(true);
    expect(new AdminGuard().canActivate(context)).toBe(true);
    request.user = { ...user, role: 'PATIENT' };
    expect(() => new AdminGuard().canActivate(context)).toThrow(ForbiddenException);
    request.user = { ...user, state: 'INACTIVE' };
    expect(() => new AdminGuard().canActivate(context)).toThrow(ForbiddenException);
  });
  it('enrols first-login TOTP without issuing access until verification completes', async () => {
    const send = jest.spyOn(CognitoIdentityProviderClient.prototype, 'send')
      .mockResolvedValueOnce({ ChallengeName: 'MFA_SETUP', Session: 'initial' } as never)
      .mockResolvedValueOnce({ Session: 'associated', SecretCode: 'PRIVATESETUPKEY' } as never)
      .mockResolvedValueOnce({ Status: 'SUCCESS', Session: 'verified' } as never)
      .mockResolvedValueOnce({ AuthenticationResult: { AccessToken: 'signed', ExpiresIn: 3600 } } as never);
    expect(await auth.login('admin', 'secret')).toEqual({ challengeName: 'MFA_SETUP', username: 'admin', session: 'associated', secretCode: 'PRIVATESETUPKEY' });
    expect(verify).not.toHaveBeenCalled();
    await auth.challenge({ challengeName: 'MFA_SETUP', username: 'admin', session: 'associated', code: '123456' });
    expect((send.mock.calls[3][0] as any).input).toMatchObject({ Session: 'verified', ChallengeName: 'MFA_SETUP', ChallengeResponses: { USERNAME: 'admin' } });
    expect(verify).toHaveBeenCalledWith('signed');
  });
  it('rejects inactive and unlinked accounts before calling Cognito', async () => {
    const send = jest.spyOn(CognitoIdentityProviderClient.prototype, 'send');
    prisma.erpUser.findFirst.mockResolvedValueOnce({ ...user, state: 'INACTIVE' }).mockResolvedValueOnce({ ...user, cognitoSub: null });
    await expect(auth.login('admin', 'secret')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(auth.login('admin', 'secret')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(send).not.toHaveBeenCalled();
  });
});
