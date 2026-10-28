// This isolated test harness is never included in production dist or Docker images.
import 'reflect-metadata';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { TestCognito } from '../fixtures/cognito';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ErpUser } from '@prisma/client';
import { createHash } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { AuthService } from '../../src/auth/auth.service';
import { PrismaService } from '../../src/database/prisma.service';
import { S3StorageService } from '../../src/documents/s3-storage.service';
import { startTestDatabase } from '../integration/database';

async function main() {
  process.env.NODE_ENV = 'test';
  process.env.IDEMPOTENCY_SECRET = 'browser-test-only-secret-at-least-32-characters';
  process.env.COGNITO_USER_POOL_ID = 'ap-southeast-2_testpool';
  process.env.COGNITO_CLIENT_ID = 'testclient';
  process.env.AWS_REGION = 'ap-southeast-2';
  process.env.FRONTEND_ORIGIN = process.env.E2E_FRONTEND_ORIGIN || 'http://127.0.0.1:3200';
  process.env.S3_BUCKET = 'zenex-international-mrpob-files';
  const database = await startTestDatabase();
  const cognito = new TestCognito();
  const send = async (command: any) => {
    const input = command.input;
    const name = command.constructor.name;
    if (name === 'InitiateAuthCommand' && ['browser-mfa', 'browser-setup'].includes(input.AuthParameters.USERNAME)) {
      if (input.AuthParameters.PASSWORD !== 'BrowserPass123') throw new Error('Invalid credentials');
      const setup = input.AuthParameters.USERNAME === 'browser-setup';
      return { ChallengeName: setup ? 'MFA_SETUP' : 'SOFTWARE_TOKEN_MFA', Session: setup ? 'setup-session' : 'mfa-session', ChallengeParameters: { USERNAME: input.AuthParameters.USERNAME } };
    }
    if (name === 'AssociateSoftwareTokenCommand' && input.Session === 'setup-session') return { Session: 'setup-association', SecretCode: 'JBSWY3DPEHPK3PXP' };
    if (name === 'VerifySoftwareTokenCommand' && input.Session === 'setup-association') {
      if (input.UserCode !== '123456') throw new Error('Invalid test code');
      return { Status: 'SUCCESS', Session: 'setup-complete' };
    }
    if (name === 'RespondToAuthChallengeCommand' && ['mfa-session', 'setup-complete'].includes(input.Session)) {
      const setup = input.ChallengeName === 'MFA_SETUP';
      if (setup ? input.Session !== 'setup-complete' : input.Session !== 'mfa-session' || input.ChallengeResponses.SOFTWARE_TOKEN_MFA_CODE !== '123456') throw new Error('Invalid test challenge');
      return { AuthenticationResult: { AccessToken: setup ? 'browser-setup-sub' : 'browser-mfa-sub', ExpiresIn: 3600 } };
    }
    return cognito.send(command);
  };
  Object.defineProperty(CognitoIdentityProviderClient.prototype, "send", { value: send, configurable: true });
  let administrator: ErpUser;
  let officer: ErpUser;
  let ordinary: ErpUser;
  let prisma: PrismaService;
  const session = (user = administrator) => ({username: user.username, displayName: user.displayName, userType: user.role === 'SUPER_ADMIN' ? 'super_admin' : user.role.toLowerCase()});
  const objects = new Map<string, Buffer>();
  const module = await Test.createTestingModule({imports: [AppModule]})
    // These browser journeys exercise permissions, not repeated-IP rate limits.
    // Real throttling is covered separately; never change production limits.
    .overrideProvider(ThrottlerGuard).useValue({ canActivate: () => true })
    .overrideProvider(S3StorageService).useValue({
      put: async (key: string, bytes: Buffer) => {objects.set(key, bytes); return {versionId: 'browser-test-version'};},
      remove: async (key: string) => {objects.delete(key);},
      signedDownload: async (key: string) => `https://private-s3.example.test/${encodeURIComponent(key)}?expires=60`,
      healthy: async () => true,
    }).compile();
  const app = module.createNestApplication();
  configureApp(app, true);
  await app.init();
  prisma = app.get(PrismaService);
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditEvent", "Document", "CustomerAddress", "CustomerRegistration", "CompanyRegistration", "PatientRegistration", "Registration", "UploadObject", "UploadBatch", "ErpUser" CASCADE');
  administrator = await prisma.erpUser.create({data: {cognitoSub: 'browser-admin-sub', username: 'browser-admin', displayName: 'Browser Administrator', role: 'SUPER_ADMIN', state: 'ACTIVE'}});
  officer = await prisma.erpUser.create({data: {cognitoSub: 'browser-officer-sub', username: 'browser-officer', displayName: 'Browser Officer', role: 'ADMIN', state: 'ACTIVE'}});
  ordinary = await prisma.erpUser.create({data: {cognitoSub: 'browser-patient-sub', username: 'browser-patient', displayName: 'Browser Patient User', role: 'PATIENT', state: 'ACTIVE'}});
  const passwordAccount = await prisma.erpUser.create({ data: { cognitoSub: 'browser-password-sub', username: 'browser-password', displayName: 'Password Test Administrator', role: 'SUPER_ADMIN', state: 'ACTIVE', email: 'password@example.test' } });
  cognito.seed(passwordAccount.username, passwordAccount.cognitoSub!, 'BrowserCurrent123!');
  cognito.mfaUsers.add(passwordAccount.username);
  for (const name of ['mfa', 'setup']) await prisma.erpUser.create({ data: { cognitoSub: `browser-${name}-sub`, username: `browser-${name}`, displayName: 'Browser MFA Administrator', role: 'SUPER_ADMIN', state: 'ACTIVE' } });
  for (const user of [administrator, officer, ordinary]) cognito.seed(user.username, user.cognitoSub!, 'BrowserPass123');
  await prisma.auditEvent.create({ data: { actorId: administrator.id, action: 'SUPER_ADMIN_LOGIN_MFA_VERIFIED', detail: { tokenHash: createHash('sha256').update(administrator.cognitoSub!).digest('hex') } } });
  // The fixture administrator token represents a pre-verified MFA session.
  // Keep the real authentication/role/enrollment logic. Replace only JWT
  // cryptography, because the test transport issues fixture subjects as tokens.
  Object.defineProperty(app.get(AuthService), 'verifier', { value: { verify: async (token: string) => ({ sub: token, auth_time: Math.floor(Date.now() / 1000) + 1 }) } });
  await app.listen(Number(process.env.E2E_BACKEND_PORT || 3201), '127.0.0.1');
  const shutdown = async () => {await app.close(); await database.stop(); process.exit(0);};
  process.once('SIGINT', () => {void shutdown();});
  process.once('SIGTERM', () => {void shutdown();});
}
void main().catch(error => {console.error(error); process.exit(1);});
