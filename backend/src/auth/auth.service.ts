import { ForbiddenException, Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { CognitoIdentityProviderClient, InitiateAuthCommand, RespondToAuthChallengeCommand, AuthenticationResultType, GlobalSignOutCommand, AssociateSoftwareTokenCommand, VerifySoftwareTokenCommand } from '@aws-sdk/client-cognito-identity-provider';
import { createHmac } from 'node:crypto';
import { ErpUser } from '@prisma/client';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AuthService {
  private readonly verifier;
  private readonly cognito;
  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {
    this.verifier = CognitoJwtVerifier.create({ userPoolId: config.get('COGNITO_USER_POOL_ID'), clientId: config.get('COGNITO_CLIENT_ID'), tokenUse: 'access' });
    this.cognito = new CognitoIdentityProviderClient({ region: config.get('AWS_REGION'), maxAttempts: 2 });
  }
  async authenticate(token: string): Promise<ErpUser> {
    let sub: string;
    try { sub = (await this.verifier.verify(token)).sub; }
    catch { throw new UnauthorizedException('Invalid or expired access token'); }
    const user = await this.prisma.erpUser.findUnique({ where: { cognitoSub: sub } });
    if (!user || user.state !== 'ACTIVE') throw new ForbiddenException('ERP account is not active');
    if (['CUSTOMER', 'COMPANY', 'PATIENT'].includes(user.role)) {
      const registration = await this.prisma.registration.findFirst({ where: { ownerId: user.id, kind: user.role.toLowerCase() as 'customer' | 'company' | 'patient', status: 'APPROVED' }, select: { id: true } });
      if (!registration) throw new ForbiddenException('An approved registration is required');
    }
    return user;
  }
  session(user: ErpUser) {
    const userType = user.role === 'SUPER_ADMIN' ? 'super_admin' : user.role.toLowerCase();
    return { username: user.username, userType, displayName: user.displayName };
  }
  private secretHash(username: string) {
    const secret = this.config.optional('COGNITO_CLIENT_SECRET');
    return secret ? createHmac('sha256', secret).update(username + this.config.get('COGNITO_CLIENT_ID')).digest('base64') : undefined;
  }
  private async result(auth?: AuthenticationResultType) {
    if (!auth?.AccessToken || !auth.ExpiresIn) throw new UnauthorizedException('Authentication did not complete');
    const user = await this.authenticate(auth.AccessToken);
    return { accessToken: auth.AccessToken, expiresIn: auth.ExpiresIn, user: this.session(user) };
  }
  async login(username: string, password: string) {
    const account = await this.prisma.erpUser.findFirst({ where: { OR: [{ username: { equals: username, mode: 'insensitive' } }, { email: { equals: username, mode: 'insensitive' } }] } });
    if (!account?.cognitoSub || account.state !== 'ACTIVE') throw new UnauthorizedException('Unable to sign in with these credentials');
    const hash = this.secretHash(username);
    let result;
    try {
      result = await this.cognito.send(new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH', ClientId: this.config.get('COGNITO_CLIENT_ID'),
        AuthParameters: { USERNAME: username, PASSWORD: password, ...(hash ? { SECRET_HASH: hash } : {}) },
      }));
    } catch { throw new UnauthorizedException('Unable to sign in with these credentials'); }
    if (result.ChallengeName) {
      const canonicalUsername = result.ChallengeParameters?.USER_ID_FOR_SRP ?? result.ChallengeParameters?.USERNAME ?? username;
      if (result.ChallengeName === 'MFA_SETUP' && result.Session) {
        let setup;
        try { setup = await this.cognito.send(new AssociateSoftwareTokenCommand({ Session: result.Session })); }
        catch { throw new BadRequestException('Authenticator setup could not start. Check the Cognito MFA configuration.'); }
        if (!setup.Session || !setup.SecretCode) throw new BadRequestException('Authenticator setup did not complete. Please sign in again.');
        return { challengeName: 'MFA_SETUP', username: canonicalUsername, session: setup.Session, secretCode: setup.SecretCode };
      }
      if (!['SOFTWARE_TOKEN_MFA', 'SMS_MFA'].includes(result.ChallengeName) || !result.Session) {
        throw new BadRequestException('Complete account setup through Cognito before signing in');
      }
      // Cognito may canonicalize aliases; use its canonical username for challenge secret hashes.
      return { challengeName: result.ChallengeName, session: result.Session, username: canonicalUsername };
    }
    return this.result(result.AuthenticationResult);
  }
  async challenge(input: { username: string; session: string; challengeName: 'SOFTWARE_TOKEN_MFA' | 'SMS_MFA' | 'MFA_SETUP'; code: string }) {
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
        ChallengeResponses: { USERNAME: input.username, ...(input.challengeName === 'MFA_SETUP' ? {} : { [input.challengeName === 'SMS_MFA' ? 'SMS_MFA_CODE' : 'SOFTWARE_TOKEN_MFA_CODE']: input.code }), ...(hash ? { SECRET_HASH: hash } : {}) },
      }));
    } catch { throw new UnauthorizedException('Invalid or expired authentication challenge'); }
    return this.result(result.AuthenticationResult);
  }
  async logout(token: string) {
    try { await this.cognito.send(new GlobalSignOutCommand({ AccessToken: token })); }
    catch { /* Local cookie is cleared even if Cognito session already expired. */ }
  }
}
