import { ForbiddenException, Injectable, UnauthorizedException, BadRequestException, Optional } from '@nestjs/common';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { CognitoIdentityProviderClient, InitiateAuthCommand, RespondToAuthChallengeCommand, AuthenticationResultType, GlobalSignOutCommand, AssociateSoftwareTokenCommand, VerifySoftwareTokenCommand, SetUserMFAPreferenceCommand } from '@aws-sdk/client-cognito-identity-provider';
import { createHmac, createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ErpUser } from '@prisma/client';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../database/prisma.service';
import { CognitoAccountsService } from '../accounts/cognito-accounts.service';
import { verifyRegistrationPassword } from './registration-password';

@Injectable()
export class AuthService {
  private tokenHash(token: string) { return createHash('sha256').update(token).digest('hex'); }
  private async verifiedMfa(userId: string, token: string) {
    return Boolean(await this.prisma.auditEvent.findFirst({ where: { actorId: userId, action: 'SUPER_ADMIN_LOGIN_MFA_VERIFIED', detail: { path: ['tokenHash'], equals: this.tokenHash(token) } }, select: { id: true } }));
  }
  private setupKey() { return createHash('sha256').update(this.config.get('IDEMPOTENCY_SECRET')).update(':super-admin-login-setup').digest(); }
  private sealSetup(value: unknown) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.setupKey(), iv);
    return 'erp-setup.' + Buffer.concat([iv, cipher.update(JSON.stringify(value)), cipher.final(), cipher.getAuthTag()]).toString('base64url');
  }
  private inactiveAdmin(): never {
    throw new ForbiddenException({ code: 'ACCOUNT_INACTIVE', message: 'Your account is currently inactive. Please contact the Super Admin to activate your account.' });
  }
  private readonly verifier;
  private readonly cognito;
  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService, @Optional() private readonly identities?: CognitoAccountsService) {
    this.verifier = CognitoJwtVerifier.create({ userPoolId: config.get('COGNITO_USER_POOL_ID'), clientId: config.get('COGNITO_CLIENT_ID'), tokenUse: 'access' });
    this.cognito = new CognitoIdentityProviderClient({ region: config.get('AWS_REGION'), maxAttempts: 2 });
  }
  async authenticate(token: string): Promise<ErpUser> {
    let sub: string;
    let issuedAt: number | undefined;
    try { const payload = await this.verifier.verify(token); sub = payload.sub; issuedAt = payload.auth_time ?? payload.iat; }
    catch { throw new UnauthorizedException('Invalid or expired access token'); }
    const user = await this.prisma.erpUser.findUnique({ where: { cognitoSub: sub } });
    if (user?.role === 'ADMIN' && user.state === 'INACTIVE' && !user.deletedAt) this.inactiveAdmin();
    if (!user || user.state !== 'ACTIVE' || user.deletedAt || user.mfaEnrollmentRequired || (user.tokensValidAfter && (!issuedAt || issuedAt * 1000 <= user.tokensValidAfter.getTime()))) throw new ForbiddenException('ERP account is not active or the session has been revoked');
    if (user.role === 'SUPER_ADMIN' && !await this.verifiedMfa(user.id, token)) throw new ForbiddenException('Super Admin MFA verification is required. Sign in again.');
    if (['CUSTOMER', 'COMPANY', 'PATIENT'].includes(user.role)) {
      const registration = await this.prisma.registration.findFirst({ where: { ownerId: user.id, kind: user.role.toLowerCase() as 'customer' | 'company' | 'patient', status: 'APPROVED' }, select: { id: true } });
      if (!registration) throw new ForbiddenException('An approved registration is required');
    }
    return user;
  }
  session(user: ErpUser) {
    const userType = user.role === 'SUPER_ADMIN' ? 'super_admin' : user.role.toLowerCase();
    return {
      username: user.username, userType, displayName: user.displayName,
      ...(user.email ? { email: user.email } : {}),
      ...(user.createdAt ? { createdAt: user.createdAt.toISOString() } : {}),
      ...(user.lastLoginAt ? { lastLoginAt: user.lastLoginAt.toISOString() } : {}),
    };
  }
  private secretHash(username: string) {
    const secret = this.config.optional('COGNITO_CLIENT_SECRET');
    return secret ? createHmac('sha256', secret).update(username + this.config.get('COGNITO_CLIENT_ID')).digest('base64') : undefined;
  }
  private async result(auth?: AuthenticationResultType, completedMfa = false) {
    if (!auth?.AccessToken || !auth.ExpiresIn) throw new UnauthorizedException('Authentication did not complete');
    {
      const payload = await this.verifier.verify(auth.AccessToken);
      const pending = await this.prisma.erpUser.findUnique({ where: { cognitoSub: payload.sub } });
      if (pending?.role === 'SUPER_ADMIN' && pending.state === 'ACTIVE' && !pending.deletedAt) {
        if (completedMfa) await this.prisma.auditEvent.create({ data: { actorId: pending.id, action: 'SUPER_ADMIN_LOGIN_MFA_VERIFIED', detail: { tokenHash: this.tokenHash(auth.AccessToken) } } });
        else if (!await this.verifiedMfa(pending.id, auth.AccessToken)) {
          const setup = await this.cognito.send(new AssociateSoftwareTokenCommand({ AccessToken: auth.AccessToken }));
          if (!setup.SecretCode) throw new ForbiddenException('Super Admin MFA setup is required');
          const expiresAt = new Date(Date.now() + 300000);
          const stored = await this.prisma.accountStepUp.create({ data: { actorId: pending.id, binding: 'SUPER_ADMIN_LOGIN_SETUP', username: pending.username, challengeName: 'MFA_SETUP', encryptedSession: this.sealSetup({ auth: { AccessToken: auth.AccessToken, ExpiresIn: auth.ExpiresIn }, providerSession: setup.Session, expires: expiresAt.getTime() }), expiresAt } });
          return { challengeName: 'MFA_SETUP', username: pending.username, secretCode: setup.SecretCode, session: 'erp-setup.' + stored.id };
        }
      }
      if (completedMfa && pending?.role === 'SUPER_ADMIN' && pending.mfaEnrollmentRequired && pending.state === 'ACTIVE' && !pending.deletedAt) {
        // Only a successful provider MFA challenge can clear the enrollment gate.
        await this.prisma.erpUser.update({ where: { id: pending.id }, data: { mfaEnrollmentRequired: false } });
      }
    }
    const user = await this.authenticate(auth.AccessToken);
    const updated = await this.prisma.erpUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { accessToken: auth.AccessToken, expiresIn: auth.ExpiresIn, user: this.session(updated) };
  }
  async login(username: string, password: string) {
    let account = await this.prisma.erpUser.findFirst({ where: { OR: [{ username: { equals: username, mode: 'insensitive' } }, { email: { equals: username, mode: 'insensitive' } }, { ownedRegistrations: { some: { masterCode: { equals: username, mode: 'insensitive' }, status: 'APPROVED' } } }] } });
    if (account?.role === 'ADMIN' && account.state === 'INACTIVE' && !account.deletedAt) this.inactiveAdmin();
    if (account?.state === 'ACTIVE' && !account.cognitoSub && ['COMPANY', 'CUSTOMER', 'PATIENT'].includes(account.role) && this.identities) {
      account = await this.provisionApprovedLogin(account, password);
    }
    if (!account?.cognitoSub || account.state !== 'ACTIVE' || account.deletedAt) throw new UnauthorizedException('Unable to sign in with these credentials');
    if (account.role === 'ADMIN' && this.identities) await this.identities.adminPasswordOnly(account);
    // A migrated owner can keep its existing login and also use its Master Code.
    const loginName = account.username;
    const hash = this.secretHash(loginName);
    let result;
    try {
      result = await this.cognito.send(new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH', ClientId: this.config.get('COGNITO_CLIENT_ID'),
        AuthParameters: { USERNAME: loginName, PASSWORD: password, ...(hash ? { SECRET_HASH: hash } : {}) },
      }));
    } catch { throw new UnauthorizedException('Unable to sign in with these credentials'); }
    return this.challengeResponse(result, loginName);
  }
  private async challengeResponse(result: { ChallengeName?: string; Session?: string; ChallengeParameters?: Record<string, string>; AuthenticationResult?: AuthenticationResultType }, loginName: string, completedMfa = false) {
    if (result.ChallengeName) {
      const canonicalUsername = result.ChallengeParameters?.USER_ID_FOR_SRP ?? result.ChallengeParameters?.USERNAME ?? loginName;
      if (result.ChallengeName === 'MFA_SETUP' && result.Session) {
        let setup;
        try { setup = await this.cognito.send(new AssociateSoftwareTokenCommand({ Session: result.Session })); }
        catch { throw new BadRequestException('Authenticator setup could not start. Check the Cognito MFA configuration.'); }
        if (!setup.Session || !setup.SecretCode) throw new BadRequestException('Authenticator setup did not complete. Please sign in again.');
        return { challengeName: 'MFA_SETUP', username: canonicalUsername, session: setup.Session, secretCode: setup.SecretCode };
      }
      if (!['SOFTWARE_TOKEN_MFA', 'SMS_MFA', 'NEW_PASSWORD_REQUIRED'].includes(result.ChallengeName) || !result.Session) {
        throw new BadRequestException('Complete account setup through Cognito before signing in');
      }
      // Cognito may canonicalize aliases; use its canonical username for challenge secret hashes.
      return { challengeName: result.ChallengeName, session: result.Session, username: canonicalUsername };
    }
    return this.result(result.AuthenticationResult, completedMfa);
  }
  private async provisionApprovedLogin(account: ErpUser, password: string): Promise<ErpUser> {
    // The registration password is a one-way verifier until first login. Only
    // the user's entered password is sent to Cognito; no reversible secret is saved.
    const profile = await this.prisma.registration.findFirst({ where: { ownerId: account.id, kind: account.role.toLowerCase() as 'company' | 'customer' | 'patient', status: 'APPROVED', passwordHash: { not: null } }, select: { id: true, passwordHash: true } });
    if (!profile?.passwordHash || !await verifyRegistrationPassword(password, profile.passwordHash)) throw new UnauthorizedException('Unable to sign in with these credentials');
    try {
      return await this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT 1::int FROM pg_advisory_xact_lock(hashtextextended(${account.id}, 1))`;
        const current = await tx.erpUser.findUniqueOrThrow({ where: { id: account.id } });
        if (current.state !== 'ACTIVE') throw new UnauthorizedException('Unable to sign in with these credentials');
        if (current.cognitoSub) return current;
        await this.identities!.password(current, password, async sub => {
          await tx.erpUser.update({ where: { id: current.id }, data: { cognitoSub: sub } });
        });
        await tx.registration.update({ where: { id: profile.id }, data: { passwordHash: null } });
        return tx.erpUser.findUniqueOrThrow({ where: { id: current.id } });
      }, { timeout: 30_000 });
    } catch {
      // Do not expose remote identity details or registration credentials.
      throw new UnauthorizedException('Unable to sign in with these credentials');
    }
  }
  async challenge(input: { username: string; session: string; challengeName: 'SOFTWARE_TOKEN_MFA' | 'SMS_MFA' | 'MFA_SETUP' | 'NEW_PASSWORD_REQUIRED'; code?: string; password?: string }) {
    if (input.challengeName === 'NEW_PASSWORD_REQUIRED' ? !input.password : !input.code) throw new BadRequestException('Complete the required authentication challenge');
    if (input.challengeName === 'MFA_SETUP' && input.session.startsWith('erp-setup.')) {
      try {
        const id = input.session.slice('erp-setup.'.length);
        if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid setup');
        const claimed = await this.prisma.accountStepUp.updateMany({ where: { id, binding: 'SUPER_ADMIN_LOGIN_SETUP', username: input.username, verifiedAt: null, consumedAt: null, attempts: { lt: 5 }, expiresAt: { gt: new Date() } }, data: { attempts: { increment: 1 } } });
        if (claimed.count !== 1) throw new Error('Expired setup');
        const stored = await this.prisma.accountStepUp.findUniqueOrThrow({ where: { id } });
        const bytes = Buffer.from(stored.encryptedSession.slice('erp-setup.'.length), 'base64url');
        const cipher = createDecipheriv('aes-256-gcm', this.setupKey(), bytes.subarray(0, 12)); cipher.setAuthTag(bytes.subarray(-16));
        const setup = JSON.parse(Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]).toString()) as { auth: { AccessToken: string; ExpiresIn: number }; providerSession?: string; expires: number };
        if (setup.expires <= Date.now()) throw new Error('Expired setup');
        const payload = await this.verifier.verify(setup.auth.AccessToken);
        const user = await this.prisma.erpUser.findUnique({ where: { cognitoSub: payload.sub } });
        if (user?.role !== 'SUPER_ADMIN' || user.state !== 'ACTIVE' || user.deletedAt || user.username !== input.username) throw new Error('Invalid setup actor');
        const verified = await this.cognito.send(new VerifySoftwareTokenCommand({ ...(setup.providerSession ? { Session: setup.providerSession } : { AccessToken: setup.auth.AccessToken }), UserCode: input.code }));
        if (verified.Status !== 'SUCCESS') throw new Error('Invalid code');
        await this.cognito.send(new SetUserMFAPreferenceCommand({ AccessToken: setup.auth.AccessToken, SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true } }));
        const consumed = await this.prisma.accountStepUp.updateMany({ where: { id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date(), verifiedAt: new Date(), encryptedSession: '' } });
        if (consumed.count !== 1) throw new Error('Setup already completed');
        return await this.result(setup.auth, true);
      } catch { throw new UnauthorizedException('Invalid or expired authentication challenge'); }
    }
    const hash = this.secretHash(input.username);
    let result;
    try {
      let session = input.session;
      if (input.challengeName === 'MFA_SETUP') {
        const verified = await this.cognito.send(new VerifySoftwareTokenCommand({ Session: session, UserCode: input.code }));
        if (verified.Status !== 'SUCCESS' || !verified.Session) throw new Error('Authenticator code not verified');
        session = verified.Session;
      }
      result = await this.cognito.send(new RespondToAuthChallengeCommand({
        ClientId: this.config.get('COGNITO_CLIENT_ID'), Session: session, ChallengeName: input.challengeName,
        ChallengeResponses: { USERNAME: input.username, ...(input.challengeName === 'NEW_PASSWORD_REQUIRED' ? { NEW_PASSWORD: input.password! } : input.challengeName === 'MFA_SETUP' ? {} : { [input.challengeName === 'SMS_MFA' ? 'SMS_MFA_CODE' : 'SOFTWARE_TOKEN_MFA_CODE']: input.code! }), ...(hash ? { SECRET_HASH: hash } : {}) },
      }));
    } catch { throw new UnauthorizedException('Invalid or expired authentication challenge'); }
    return this.challengeResponse(result, input.username, input.challengeName !== 'NEW_PASSWORD_REQUIRED');
  }
  async logout(token: string) {
    try { await this.cognito.send(new GlobalSignOutCommand({ AccessToken: token })); }
    catch { /* Local cookie is cleared even if Cognito session already expired. */ }
  }

  async startStepUp(actor: ErpUser, password: string) {
    const hash = this.secretHash(actor.username);
    let result;
    try {
      result = await this.cognito.send(new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH', ClientId: this.config.get('COGNITO_CLIENT_ID'),
        AuthParameters: { USERNAME: actor.username, PASSWORD: password, ...(hash ? { SECRET_HASH: hash } : {}) },
      }), { abortSignal: AbortSignal.timeout(8000) });
    } catch { throw new UnauthorizedException('Unable to reauthenticate. Check your password.'); }
    // A password-only result, enrollment or an existing login MFA flag is never proof.
    if (!result.Session || !['SOFTWARE_TOKEN_MFA', 'SMS_MFA'].includes(result.ChallengeName ?? '')) throw new ForbiddenException('Fresh Cognito MFA is required. Configure MFA for this Super Admin before continuing.');
    return { session: result.Session, challengeName: result.ChallengeName!, username: result.ChallengeParameters?.USER_ID_FOR_SRP ?? result.ChallengeParameters?.USERNAME ?? actor.username };
  }
  async verifyStepUp(actorId: string, input: { session: string; challengeName: string; username: string; code: string }) {
    const hash = this.secretHash(input.username);
    try {
      const result = await this.cognito.send(new RespondToAuthChallengeCommand({
        ClientId: this.config.get('COGNITO_CLIENT_ID'), Session: input.session, ChallengeName: input.challengeName as 'SOFTWARE_TOKEN_MFA' | 'SMS_MFA',
        ChallengeResponses: { USERNAME: input.username, [input.challengeName === 'SMS_MFA' ? 'SMS_MFA_CODE' : 'SOFTWARE_TOKEN_MFA_CODE']: input.code, ...(hash ? { SECRET_HASH: hash } : {}) },
      }), { abortSignal: AbortSignal.timeout(8000) });
        if (!result.AuthenticationResult?.AccessToken) throw new Error('Authentication incomplete');
        const token = result.AuthenticationResult.AccessToken;
        const payload = await this.verifier.verify(token);
        const user = await this.prisma.erpUser.findUnique({ where: { cognitoSub: payload.sub } });
        if (user?.id !== actorId || user.role !== 'SUPER_ADMIN' || user.state !== 'ACTIVE' || user.deletedAt || user.mfaEnrollmentRequired) throw new Error('Actor mismatch');
        await this.prisma.auditEvent.create({ data: { actorId, action: 'SUPER_ADMIN_LOGIN_MFA_VERIFIED', detail: { tokenHash: this.tokenHash(token) } } });
        await this.authenticate(token);
    } catch { throw new UnauthorizedException('Invalid or expired MFA challenge'); }
  }
}
